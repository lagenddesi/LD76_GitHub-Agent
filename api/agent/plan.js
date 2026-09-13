function getAccessToken(request) {
  const cookieHeader = request.headers?.cookie || "";
  const cookies = {};

  cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return;
      }

      const name = part.slice(0, separatorIndex).trim();
      const value = part
        .slice(separatorIndex + 1)
        .trim();

      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    });

  return cookies.ld76_github_access_token || "";
}

function parseBody(request) {
  if (
    typeof request.body === "object" &&
    request.body !== null
  ) {
    return request.body;
  }

  try {
    return JSON.parse(request.body || "{}");
  } catch {
    return null;
  }
}

function isValidRepositoryName(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_.-]+$/.test(value) &&
    value.length <= 100
  );
}

function isValidBranchName(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    !value.includes("..") &&
    !value.includes("~") &&
    !value.includes("^") &&
    !value.includes(":") &&
    !value.includes("?") &&
    !value.includes("*") &&
    !value.includes("[") &&
    !value.includes("\\") &&
    !value.includes("@{")
  );
}

async function githubRequest(accessToken, url) {
  const githubResponse = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  const text = await githubResponse.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!githubResponse.ok) {
    const error = new Error(
      data?.message || "GitHub API request failed."
    );

    error.status = githubResponse.status;

    throw error;
  }

  return data;
}

async function loadRepositoryTree(
  accessToken,
  owner,
  repo,
  branch
) {
  const url =
    `https://api.github.com/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repo
    )}/git/trees/${encodeURIComponent(
      branch
    )}?recursive=1`;

  const data = await githubRequest(
    accessToken,
    url
  );

  if (!Array.isArray(data?.tree)) {
    throw new Error(
      "GitHub returned an invalid repository tree."
    );
  }

  return {
    files: data.tree
      .filter(
        (entry) =>
          entry?.type === "blob" &&
          typeof entry.path === "string"
      )
      .map((entry) => ({
        path: entry.path,
        sha: entry.sha,
        size: Number.isInteger(entry.size)
          ? entry.size
          : null
      })),
    truncated: Boolean(data.truncated)
  };
}

async function loadFile(
  accessToken,
  owner,
  repo,
  path,
  branch
) {
  const encodedPath = path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const url =
    `https://api.github.com/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repo
    )}/contents/${encodedPath}?ref=${encodeURIComponent(
      branch
    )}`;

  const data = await githubRequest(
    accessToken,
    url
  );

  if (data?.type !== "file") {
    throw new Error(
      `GitHub path is not a file: ${path}`
    );
  }

  if (
    data.encoding !== "base64" ||
    typeof data.content !== "string"
  ) {
    throw new Error(
      `GitHub did not return readable content for: ${path}`
    );
  }

  const normalized = data.content.replace(/\s/g, "");

  let binary;

  try {
    binary = atob(normalized);
  } catch {
    throw new Error(
      `Could not decode GitHub file: ${path}`
    );
  }

  const bytes = Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0)
  );

  const content = new TextDecoder(
    "utf-8",
    { fatal: false }
  ).decode(bytes);

  return {
    path,
    sha: data.sha,
    size: Number.isInteger(data.size)
      ? data.size
      : bytes.length,
    content
  };
}

function scoreFile(file, message) {
  const path = file.path.toLowerCase();
  const lowerMessage = message.toLowerCase();

  let score = 0;

  if (path === "package.json") {
    score += 100;
  }

  if (path === "readme.md") {
    score += 90;
  }

  if (
    path === "index.html" ||
    path === "index.js" ||
    path === "index.ts"
  ) {
    score += 60;
  }

  if (
    path.includes("src/") ||
    path.includes("app/") ||
    path.includes("api/")
  ) {
    score += 30;
  }

  if (
    path.includes("config") ||
    path.includes("route") ||
    path.includes("server") ||
    path.includes("main")
  ) {
    score += 20;
  }

  const parts = path
    .split(/[/_.-]+/)
    .filter((part) => part.length >= 3);

  for (const part of parts) {
    if (lowerMessage.includes(part)) {
      score += 15;
    }
  }

  return score;
}

function selectRelevantFiles(files, message) {
  return files
    .map((file) => ({
      ...file,
      score: scoreFile(file, message)
    }))
    .sort(
      (first, second) =>
        second.score - first.score
    )
    .slice(0, 10);
}

async function loadRelevantContext(
  accessToken,
  owner,
  repo,
  branch,
  message
) {
  const tree = await loadRepositoryTree(
    accessToken,
    owner,
    repo,
    branch
  );

  const selectedFiles = selectRelevantFiles(
    tree.files,
    message
  );

  const files = [];

  for (const file of selectedFiles) {
    if (
      !Number.isInteger(file.size) ||
      file.size > 100000
    ) {
      continue;
    }

    try {
      const loaded = await loadFile(
        accessToken,
        owner,
        repo,
        file.path,
        branch
      );

      files.push(loaded);
    } catch (error) {
      console.warn(
        `Could not load ${file.path}:`,
        error?.message || error
      );
    }
  }

  return {
    tree,
    files
  };
}

function buildTreeContext(tree) {
  return tree.files
    .slice(0, 500)
    .map(
      (file) =>
        `${file.path} (${file.size ?? "unknown"} bytes)`
    )
    .join("\n");
}

function buildFileContext(files) {
  return files
    .map(
      (file) =>
        [
          `--- FILE: ${file.path} ---`,
          file.content,
          "--- END FILE ---"
        ].join("\n")
    )
    .join("\n\n");
}

function buildPrompt({
  message,
  owner,
  repo,
  branch,
  context
}) {
  return [
    "You are the planning engine of LD76 Code Agent.",
    "",
    "You are working against a real GitHub repository.",
    "Do not invent files, repository state, APIs, test results, or changes.",
    "Do not claim that any file has been modified.",
    "You are creating a proposed implementation plan only.",
    "",
    `Repository: ${owner}/${repo}`,
    `Branch: ${branch}`,
    "",
    "Repository tree:",
    buildTreeContext(context.tree) || "(empty)",
    "",
    "Relevant files:",
    buildFileContext(context.files) ||
      "(no readable relevant files)",
    "",
    "User request:",
    message,
    "",
    "Return ONLY valid JSON.",
    "The JSON must have this exact top-level structure:",
    "{",
    '  "summary": "short explanation",',
    '  "analysis": "technical analysis",',
    '  "changes": [',
    "    {",
    '      "operation": "update|create|delete",',
    '      "path": "repository/path",',
    '      "reason": "why this file changes",',
    '      "details": "what must change"',
    "    }",
    "  ],",
    '  "verification": [',
    '    "specific verification step"',
    "  ],",
    '  "risk": "low|medium|high"',
    '  "requiresWrite": true',
    "}",
    "",
    "Rules:",
    "1. Use update only for files that already exist in the supplied tree.",
    "2. Use create only for paths that do not already exist.",
    "3. Use delete only when the user explicitly requests deletion or it is strictly required.",
    "4. Never invent a path when the repository context provides enough information.",
    "5. If the request needs no code changes, set changes to an empty array and requiresWrite to false.",
    "6. Do not include source code in this planning response.",
    "7. Do not perform GitHub write operations.",
    "8. Verification steps must be concrete and relevant to the proposed changes."
  ].join("\n");
}

async function getAvailableModels(apiKey) {
  const modelsUrl =
    new URL(
      "https://generativelanguage.googleapis.com/v1beta/models"
    );

  modelsUrl.searchParams.set(
    "key",
    apiKey
  );

  modelsUrl.searchParams.set(
    "pageSize",
    "1000"
  );

  const modelsResponse = await fetch(
    modelsUrl
  );

  const text = await modelsResponse.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!modelsResponse.ok) {
    throw new Error(
      data?.error?.message ||
        "Could not load Gemini models."
    );
  }

  return Array.isArray(data?.models)
    ? data.models.filter(
        (item) =>
          typeof item?.name === "string" &&
          Array.isArray(
            item.supportedGenerationMethods
          ) &&
          item.supportedGenerationMethods.includes(
            "generateContent"
          )
      )
    : [];
}

function chooseModel(models, requestedModel) {
  if (!models.length) {
    throw new Error(
      "No Gemini model supporting generateContent is available."
    );
  }

  if (
    requestedModel &&
    requestedModel !== "auto"
  ) {
    const exact = models.find(
      (model) =>
        model.name === requestedModel
    );

    if (!exact) {
      throw new Error(
        "The selected Gemini model is not available for this API key."
      );
    }

    return exact.name;
  }

  return [...models]
    .sort((first, second) => {
      const firstOutput =
        Number(first.outputTokenLimit) || 0;
      const secondOutput =
        Number(second.outputTokenLimit) || 0;

      if (
        secondOutput !== firstOutput
      ) {
        return secondOutput - firstOutput;
      }

      const firstInput =
        Number(first.inputTokenLimit) || 0;
      const secondInput =
        Number(second.inputTokenLimit) || 0;

      if (
        secondInput !== firstInput
      ) {
        return secondInput - firstInput;
      }

      return first.name.localeCompare(
        second.name
      );
    })[0].name;
}

async function generatePlan(
  apiKey,
  prompt,
  requestedModel
) {
  const models =
    await getAvailableModels(apiKey);

  const selectedModel =
    chooseModel(
      models,
      requestedModel
    );

  const modelId =
    selectedModel.replace(
      /^models\//,
      ""
    );

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelId
    )}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

  const geminiResponse =
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType:
            "application/json"
        }
      })
    });

  const responseText =
    await geminiResponse.text();

  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  if (!geminiResponse.ok) {
    throw new Error(
      data?.error?.message ||
        "Gemini planning request failed."
    );
  }

  const candidates =
    Array.isArray(
      data?.candidates
    )
      ? data.candidates
      : [];

  const parts =
    Array.isArray(
      candidates[0]?.content?.parts
    )
      ? candidates[0].content.parts
      : [];

  const output =
    parts
      .filter(
        (part) =>
          typeof part?.text ===
          "string"
      )
      .map(
        (part) => part.text
      )
      .join("");

  if (!output.trim()) {
    throw new Error(
      "Gemini returned an empty planning response."
    );
  }

  let plan;

  try {
    plan = JSON.parse(output);
  } catch {
    throw new Error(
      "Gemini returned invalid planning JSON."
    );
  }

  if (
    !plan ||
    typeof plan !== "object" ||
    !Array.isArray(plan.changes) ||
    !Array.isArray(plan.verification) ||
    typeof plan.summary !== "string" ||
    typeof plan.analysis !== "string"
  ) {
    throw new Error(
      "Gemini returned an invalid coding plan structure."
    );
  }

  const safeChanges =
    plan.changes.map(
      (change) => ({
        operation:
          typeof change?.operation ===
          "string"
            ? change.operation
            : "",
        path:
          typeof change?.path ===
          "string"
            ? change.path
            : "",
        reason:
          typeof change?.reason ===
          "string"
            ? change.reason
            : "",
        details:
          typeof change?.details ===
          "string"
            ? change.details
            : ""
      })
    );

  return {
    model: selectedModel,
    plan: {
      summary: plan.summary,
      analysis: plan.analysis,
      changes: safeChanges,
      verification:
        plan.verification.filter(
          (item) =>
            typeof item ===
            "string"
        ),
      risk:
        ["low", "medium", "high"].includes(
          plan.risk
        )
          ? plan.risk
          : "medium",
      requiresWrite:
        safeChanges.length > 0
    }
  };
}

export default async function handler(
  request,
  response
) {
  if (request.method !== "POST") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  const apiKey =
    process.env.LD76_GEMINI_API_KEY;

  if (!apiKey) {
    return response.status(503).json({
      ok: false,
      error:
        "Gemini API key is not configured."
    });
  }

  const accessToken =
    getAccessToken(request);

  if (!accessToken) {
    return response.status(401).json({
      ok: false,
      error:
        "GitHub is not connected. Connect GitHub before using the coding agent."
    });
  }

  const body =
    parseBody(request);

  if (!body) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid JSON request body."
    });
  }

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";

  const owner =
    typeof body.owner === "string"
      ? body.owner.trim()
      : "";

  const repo =
    typeof body.repo === "string"
      ? body.repo.trim()
      : "";

  const branch =
    typeof body.branch === "string"
      ? body.branch.trim()
      : "";

  const model =
    typeof body.model === "string"
      ? body.model.trim() || "auto"
      : "auto";

  if (!message) {
    return response.status(400).json({
      ok: false,
      error: "Message is required."
    });
  }

  if (message.length > 20000) {
    return response.status(400).json({
      ok: false,
      error:
        "Message is too long. Maximum length is 20000 characters."
    });
  }

  if (
    !isValidRepositoryName(owner) ||
    !isValidRepositoryName(repo)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid GitHub repository owner or repository name."
    });
  }

  if (!isValidBranchName(branch)) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid GitHub branch name."
    });
  }

  try {
    const context =
      await loadRelevantContext(
        accessToken,
        owner,
        repo,
        branch,
        message
      );

    const prompt =
      buildPrompt({
        message,
        owner,
        repo,
        branch,
        context
      });

    const result =
      await generatePlan(
        apiKey,
        prompt,
        model
      );

    return response.status(200).json({
      ok: true,
      service: "LD76 Code Agent",
      operation: "plan",
      model: result.model,
      repository: {
        owner,
        repo,
        branch
      },
      context: {
        treeFiles:
          context.tree.files.length,
        treeTruncated:
          context.tree.truncated,
        relevantFiles:
          context.files.map(
            (file) => ({
              path: file.path,
              sha: file.sha,
              size: file.size
            })
          )
      },
      plan: result.plan
    });
  } catch (error) {
    console.error(
      "Agent planning failed:",
      error
    );

    if (error?.status === 401) {
      response.setHeader(
        "Set-Cookie",
        "ld76_github_access_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
      );

      return response.status(401).json({
        ok: false,
        error:
          "GitHub authorization expired. Please reconnect GitHub."
      });
    }

    if (error?.status === 404) {
      return response.status(404).json({
        ok: false,
        error:
          "The selected GitHub repository or branch was not found."
      });
    }

    return response.status(502).json({
      ok: false,
      error:
        error?.message ||
        "Could not create a coding plan."
    });
  }
}
