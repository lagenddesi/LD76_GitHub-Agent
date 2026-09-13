function getAccessToken(request) {
  const cookieHeader = request.headers?.cookie || "";
  const cookies = {};

  cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const index = part.indexOf("=");

      if (index === -1) {
        return;
      }

      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();

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

function isValidPath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 500 &&
    !value.startsWith("/") &&
    !value.includes("\0") &&
    !value.split("/").includes("..")
  );
}

async function githubRequest(
  accessToken,
  url
) {
  const githubResponse = await fetch(url, {
    method: "GET",
    headers: {
      Accept:
        "application/vnd.github+json",
      Authorization:
        `Bearer ${accessToken}`,
      "X-GitHub-Api-Version":
        "2022-11-28"
    }
  });

  const text =
    await githubResponse.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!githubResponse.ok) {
    const error = new Error(
      data?.message ||
        "GitHub API request failed."
    );

    error.status =
      githubResponse.status;

    throw error;
  }

  return data;
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

  const data =
    await githubRequest(
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

  const normalized =
    data.content.replace(/\s/g, "");

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
    (character) =>
      character.charCodeAt(0)
  );

  const content =
    new TextDecoder(
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

  const data =
    await githubRequest(
      accessToken,
      url
    );

  if (!Array.isArray(data?.tree)) {
    throw new Error(
      "GitHub returned an invalid repository tree."
    );
  }

  return data.tree
    .filter(
      (entry) =>
        typeof entry?.path ===
          "string" &&
        (
          entry.type === "blob" ||
          entry.type === "tree"
        )
    )
    .map((entry) => ({
      path: entry.path,
      type: entry.type,
      sha: entry.sha,
      size:
        Number.isInteger(entry.size)
          ? entry.size
          : null
    }));
}

function buildContext(
  files
) {
  return files
    .map((file) =>
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
  plan,
  files
}) {
  return [
    "You are the code-change engine of LD76 Code Agent.",
    "",
    "You are working with a real GitHub repository.",
    "Create proposed file changes only.",
    "Do not perform GitHub write operations.",
    "Do not claim that changes were applied.",
    "Do not invent repository files or existing code.",
    "",
    `Repository: ${owner}/${repo}`,
    `Branch: ${branch}`,
    "",
    "User request:",
    message,
    "",
    "Approved planning context:",
    JSON.stringify(plan, null, 2),
    "",
    "Current relevant files:",
    buildContext(files) ||
      "(no readable files)",
    "",
    "Return ONLY valid JSON with this structure:",
    "{",
    '  "summary": "short summary",',
    '  "changes": [',
    "    {",
    '      "operation": "update|create|delete",',
    '      "path": "repository/path",',
    '      "sha": "current file sha or null",',
    '      "content": "complete new file content or null",',
    '      "reason": "why this change is required"',
    "    }",
    "  ],",
    '  "verification": [',
    '    "specific verification step"',
    "  ]",
    "}",
    "",
    "Strict rules:",
    "1. For update, content must be the COMPLETE replacement file.",
    "2. For create, content must be the COMPLETE new file.",
    "3. For delete, content must be null.",
    "4. Never return partial snippets.",
    "5. Never return markdown fences.",
    "6. Use the exact existing SHA for every update operation.",
    "7. Existing files must not be changed unless their actual contents are provided.",
    "8. Do not delete files unless the plan explicitly requires deletion.",
    "9. Do not modify package dependencies unless required by the request.",
    "10. Do not include secrets, API keys, access tokens, or credentials.",
    "11. If no code change is required, return an empty changes array.",
    "12. Verification must describe how the resulting repository should be checked."
  ].join("\n");
}

async function getAvailableModels(
  apiKey
) {
  const url =
    new URL(
      "https://generativelanguage.googleapis.com/v1beta/models"
    );

  url.searchParams.set(
    "key",
    apiKey
  );

  url.searchParams.set(
    "pageSize",
    "1000"
  );

  const modelResponse =
    await fetch(url);

  const text =
    await modelResponse.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!modelResponse.ok) {
    throw new Error(
      data?.error?.message ||
        "Could not load Gemini models."
    );
  }

  return Array.isArray(data?.models)
    ? data.models.filter(
        (model) =>
          typeof model?.name ===
            "string" &&
          Array.isArray(
            model.supportedGenerationMethods
          ) &&
          model.supportedGenerationMethods.includes(
            "generateContent"
          )
      )
    : [];
}

function chooseModel(
  models,
  requestedModel
) {
  if (!models.length) {
    throw new Error(
      "No Gemini model supporting generateContent is available."
    );
  }

  if (
    requestedModel &&
    requestedModel !== "auto"
  ) {
    const selected =
      models.find(
        (model) =>
          model.name ===
          requestedModel
      );

    if (!selected) {
      throw new Error(
        "The selected Gemini model is not available for this API key."
      );
    }

    return selected.name;
  }

  return [...models]
    .sort((a, b) => {
      const aOutput =
        Number(a.outputTokenLimit) || 0;
      const bOutput =
        Number(b.outputTokenLimit) || 0;

      if (aOutput !== bOutput) {
        return bOutput - aOutput;
      }

      const aInput =
        Number(a.inputTokenLimit) || 0;
      const bInput =
        Number(b.inputTokenLimit) || 0;

      if (aInput !== bInput) {
        return bInput - aInput;
      }

      return a.name.localeCompare(
        b.name
      );
    })[0].name;
}

async function generateChanges(
  apiKey,
  prompt,
  requestedModel
) {
  const models =
    await getAvailableModels(
      apiKey
    );

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
    data = JSON.parse(
      responseText
    );
  } catch {
    data = null;
  }

  if (!geminiResponse.ok) {
    throw new Error(
      data?.error?.message ||
        "Gemini change generation failed."
    );
  }

  const parts =
    Array.isArray(
      data?.candidates?.[0]
        ?.content?.parts
    )
      ? data.candidates[0]
          .content.parts
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
      "Gemini returned an empty change set."
    );
  }

  let result;

  try {
    result = JSON.parse(
      output
    );
  } catch {
    throw new Error(
      "Gemini returned invalid change JSON."
    );
  }

  if (
    !result ||
    typeof result !== "object" ||
    !Array.isArray(result.changes) ||
    !Array.isArray(result.verification) ||
    typeof result.summary !==
      "string"
  ) {
    throw new Error(
      "Gemini returned an invalid change structure."
    );
  }

  return {
    model: selectedModel,
    result
  };
}

function validateChanges(
  changes,
  tree
) {
  const existing = new Map(
    tree
      .filter(
        (entry) =>
          entry.type === "blob"
      )
      .map((entry) => [
        entry.path,
        entry.sha
      ])
  );

  const seen = new Set();
  const validated = [];

  for (const change of changes) {
    if (
      !change ||
      typeof change !==
        "object"
    ) {
      throw new Error(
        "Gemini returned an invalid change entry."
      );
    }

    const operation =
      change.operation;

    const path =
      typeof change.path ===
      "string"
        ? change.path.trim()
        : "";

    if (
      !["update", "create", "delete"].includes(
        operation
      )
    ) {
      throw new Error(
        `Invalid change operation for ${path || "unknown path"}.`
      );
    }

    if (!isValidPath(path)) {
      throw new Error(
        `Invalid repository path: ${path}`
      );
    }

    if (seen.has(path)) {
      throw new Error(
        `Duplicate change path: ${path}`
      );
    }

    seen.add(path);

    const currentSha =
      existing.get(path);

    if (
      operation === "update"
    ) {
      if (!currentSha) {
        throw new Error(
          `Cannot update non-existing file: ${path}`
        );
      }

      if (
        typeof change.sha !==
        "string" ||
        change.sha !==
          currentSha
      ) {
        throw new Error(
          `File SHA mismatch in proposed update: ${path}`
        );
      }

      if (
        typeof change.content !==
          "string" ||
        change.content.length >
          500000
      ) {
        throw new Error(
          `Invalid or oversized content for: ${path}`
        );
      }
    }

    if (
      operation === "create"
    ) {
      if (currentSha) {
        throw new Error(
          `Cannot create existing file: ${path}`
        );
      }

      if (
        typeof change.content !==
          "string" ||
        change.content.length >
          500000
      ) {
        throw new Error(
          `Invalid or oversized content for: ${path}`
        );
      }
    }

    if (
      operation === "delete"
    ) {
      if (!currentSha) {
        throw new Error(
          `Cannot delete non-existing file: ${path}`
        );
      }

      if (
        typeof change.sha !==
          "string" ||
        change.sha !==
          currentSha
      ) {
        throw new Error(
          `File SHA mismatch in proposed deletion: ${path}`
        );
      }

      if (
        change.content !==
          null &&
        typeof change.content !==
          "undefined"
      ) {
        throw new Error(
          `Delete operation must not contain file content: ${path}`
        );
      }
    }

    validated.push({
      operation,
      path,
      sha:
        operation === "create"
          ? null
          : currentSha,
      content:
        operation === "delete"
          ? null
          : change.content,
      reason:
        typeof change.reason ===
        "string"
          ? change.reason
          : ""
    });
  }

  return validated;
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
        "GitHub is not connected."
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
    typeof body.message ===
    "string"
      ? body.message.trim()
      : "";

  const owner =
    typeof body.owner ===
    "string"
      ? body.owner.trim()
      : "";

  const repo =
    typeof body.repo ===
    "string"
      ? body.repo.trim()
      : "";

  const branch =
    typeof body.branch ===
    "string"
      ? body.branch.trim()
      : "";

  const model =
    typeof body.model ===
    "string"
      ? body.model.trim() ||
        "auto"
      : "auto";

  const plan =
    body.plan;

  if (!message) {
    return response.status(400).json({
      ok: false,
      error:
        "Message is required."
    });
  }

  if (
    !isValidRepositoryName(
      owner
    ) ||
    !isValidRepositoryName(
      repo
    )
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid GitHub repository owner or repository name."
    });
  }

  if (
    !isValidBranchName(
      branch
    )
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid GitHub branch name."
    });
  }

  if (
    !plan ||
    typeof plan !==
      "object" ||
    !Array.isArray(
      plan.changes
    )
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "A valid coding plan is required."
    });
  }

  try {
    const tree =
      await loadRepositoryTree(
        accessToken,
        owner,
        repo,
        branch
      );

    const paths =
      new Set(
        tree.map(
          (entry) =>
            entry.path
        )
      );

    const candidatePaths =
      Array.isArray(
        plan.changes
      )
        ? plan.changes
            .map(
              (change) =>
                typeof change?.path ===
                "string"
                  ? change.path
                  : ""
            )
            .filter(
              (path) =>
                isValidPath(path)
            )
        : [];

    const files = [];

    for (
      const path of candidatePaths
    ) {
      if (
        !paths.has(path)
      ) {
        continue;
      }

      const entry =
        tree.find(
          (item) =>
            item.path ===
            path
        );

      if (
        entry?.type !==
        "blob"
      ) {
        continue;
      }

      if (
        Number.isInteger(
          entry.size
        ) &&
        entry.size >
          100000
      ) {
        continue;
      }

      try {
        const file =
          await loadFile(
            accessToken,
            owner,
            repo,
            path,
            branch
          );

        files.push(file);
      } catch (error) {
        console.warn(
          `Could not load ${path}:`,
          error?.message ||
            error
        );
      }
    }

    const prompt =
      buildPrompt({
        message,
        owner,
        repo,
        branch,
        plan,
        files
      });

    const generated =
      await generateChanges(
        apiKey,
        prompt,
        model
      );

    const changes =
      validateChanges(
        generated.result.changes,
        tree
      );

    return response.status(200).json({
      ok: true,
      service:
        "LD76 Code Agent",
      operation:
        "changes",
      model:
        generated.model,
      repository: {
        owner,
        repo,
        branch
      },
      changes: {
        summary:
          generated.result
            .summary,
        files: changes,
        verification:
          generated.result.verification.filter(
            (item) =>
              typeof item ===
              "string"
          )
      },
      requiresPermission:
        changes.length > 0
    });
  } catch (error) {
    console.error(
      "Agent change generation failed:",
      error
    );

    if (
      error?.status ===
      401
    ) {
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

    if (
      error?.status ===
      404
    ) {
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
        "Could not generate the proposed code changes."
    });
  }
}
