function getAccessToken(request) {
  const cookieHeader =
    request.headers?.cookie || "";

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

      const name =
        part.slice(0, separatorIndex).trim();

      const value =
        part
          .slice(separatorIndex + 1)
          .trim();

      cookies[name] = decodeURIComponent(value);
    });

  return (
    cookies.ld76_github_access_token ||
    ""
  );
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
    !value.includes("\0")
  );
}

function parseBody(request) {
  if (
    typeof request.body === "object" &&
    request.body !== null
  ) {
    return request.body;
  }

  try {
    return JSON.parse(
      request.body || "{}"
    );
  } catch {
    return null;
  }
}

async function githubRequest(
  accessToken,
  url
) {
  const response = await fetch(url, {
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
    await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error =
      new Error(
        data?.message ||
          "GitHub API request failed."
      );

    error.status =
      response.status;

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

  const files =
    data.tree
      .filter(
        (entry) =>
          entry?.type === "blob" &&
          typeof entry.path === "string"
      )
      .map((entry) => ({
        path: entry.path,
        sha: entry.sha,
        size:
          Number.isInteger(entry.size)
            ? entry.size
            : null
      }));

  return {
    files,
    truncated:
      Boolean(data.truncated)
  };
}

async function loadFile(
  accessToken,
  owner,
  repo,
  path,
  branch
) {
  const url =
    `https://api.github.com/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repo
    )}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join(
        "/"
      )}?ref=${encodeURIComponent(
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
    data.content.replace(
      /\s/g,
      ""
    );

  let bytes;

  try {
    const binary =
      atob(normalized);

    bytes =
      Uint8Array.from(
        binary,
        (character) =>
          character.charCodeAt(0)
      );
  } catch {
    throw new Error(
      `Could not decode GitHub file: ${path}`
    );
  }

  const content =
    new TextDecoder(
      "utf-8",
      {
        fatal: false
      }
    ).decode(bytes);

  return {
    path,
    sha: data.sha,
    size:
      Number.isInteger(data.size)
        ? data.size
        : bytes.length,
    content
  };
}

function selectRelevantFiles(
  files,
  message
) {
  const lowerMessage =
    message.toLowerCase();

  const scored =
    files.map((file) => {
      const lowerPath =
        file.path.toLowerCase();

      let score = 0;

      if (
        lowerPath ===
        "package.json"
      ) {
        score += 100;
      }

      if (
        lowerPath ===
        "readme.md"
      ) {
        score += 90;
      }

      if (
        lowerPath.includes(
          "src/"
        )
      ) {
        score += 30;
      }

      if (
        lowerPath.includes(
          "app."
        )
      ) {
        score += 25;
      }

      if (
        lowerPath.includes(
          "index."
        )
      ) {
        score += 20;
      }

      if (
        lowerPath.includes(
          "api/"
        )
      ) {
        score += 20;
      }

      const pathParts =
        lowerPath
          .split(/[/_.-]+/)
          .filter(Boolean);

      for (const part of pathParts) {
        if (
          part.length >= 3 &&
          lowerMessage.includes(part)
        ) {
          score += 15;
        }
      }

      return {
        ...file,
        score
      };
    });

  return scored
    .sort(
      (first, second) =>
        second.score -
        first.score
    )
    .slice(0, 8);
}

async function loadRelevantContext(
  accessToken,
  owner,
  repo,
  branch,
  message
) {
  const tree =
    await loadRepositoryTree(
      accessToken,
      owner,
      repo,
      branch
    );

  const selectedFiles =
    selectRelevantFiles(
      tree.files,
      message
    );

  const contextFiles = [];

  for (const file of selectedFiles) {
    if (
      !Number.isInteger(file.size) ||
      file.size > 100000
    ) {
      continue;
    }

    try {
      const loaded =
        await loadFile(
          accessToken,
          owner,
          repo,
          file.path,
          branch
        );

      contextFiles.push(
        loaded
      );
    } catch (error) {
      console.warn(
        `Could not load ${file.path}:`,
        error?.message ||
          error
      );
    }
  }

  return {
    tree,
    files:
      contextFiles
  };
}

function buildPrompt({
  message,
  owner,
  repo,
  branch,
  context
}) {
  const fileContext =
    context.files
      .map(
        (file) =>
          `--- FILE: ${file.path} ---\n${file.content}\n--- END FILE ---`
      )
      .join("\n\n");

  const treeContext =
    context.tree.files
      .slice(0, 500)
      .map(
        (file) =>
          `${file.path} (${file.size ?? "unknown"} bytes)`
      )
      .join("\n");

  return [
    "You are LD76 Code Agent.",
    "",
    "You are assisting with a real GitHub repository.",
    "Do not claim that files were changed, committed, created, deleted, or tested unless an actual tool/API operation performed that action.",
    "Do not invent repository files, code, test results, GitHub responses, or implementation details.",
    "Use the supplied repository context as the source of truth.",
    "",
    `Repository: ${owner}/${repo}`,
    `Branch: ${branch}`,
    "",
    "Repository tree:",
    treeContext || "(empty)",
    "",
    "Relevant file contents:",
    fileContext || "(no readable relevant files)",
    "",
    "User request:",
    message,
    "",
    "Analyze the request against the real repository context.",
    "If the request requires code changes, explain which existing files are relevant and what must change.",
    "Do not output fake GitHub operations.",
    "Keep the response concise but technically precise."
  ].join("\n");
}

async function generateGeminiResponse(
  apiKey,
  message,
  model
) {
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

  const modelsResponse =
    await fetch(modelsUrl);

  const modelsText =
    await modelsResponse.text();

  let modelsData;

  try {
    modelsData =
      JSON.parse(modelsText);
  } catch {
    modelsData = null;
  }

  if (!modelsResponse.ok) {
    throw new Error(
      modelsData?.error?.message ||
        "Could not load Gemini models."
    );
  }

  const availableModels =
    Array.isArray(
      modelsData?.models
    )
      ? modelsData.models.filter(
          (item) =>
            typeof item?.name ===
              "string" &&
            Array.isArray(
              item.supportedGenerationMethods
            ) &&
            item.supportedGenerationMethods.includes(
              "generateContent"
            )
        )
      : [];

  if (!availableModels.length) {
    throw new Error(
      "No Gemini model supporting generateContent is available."
    );
  }

  let selectedModel =
    model === "auto"
      ? availableModels[0].name
      : model;

  if (
    !availableModels.some(
      (item) =>
        item.name === selectedModel
    )
  ) {
    throw new Error(
      "The selected Gemini model is not available for this API key."
    );
  }

  const modelId =
    selectedModel.replace(
      /^models\//,
      ""
    );

  const generateUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      modelId
    )}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

  const response =
    await fetch(
      generateUrl,
      {
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
                  text: message
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2
          }
        })
      }
    );

  const text =
    await response.text();

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        "Gemini generation failed."
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
      "Gemini returned no text response."
    );
  }

  return {
    model: selectedModel,
    text: output
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
        "A valid GitHub owner and repository are required."
    });
  }

  if (!isValidBranchName(branch)) {
    return response.status(400).json({
      ok: false,
      error:
        "A valid GitHub branch is required."
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

    const generated =
      await generateGeminiResponse(
        apiKey,
        prompt,
        model
      );

    return response.status(200).json({
      ok: true,
      service: "LD76 Code Agent",
      repository: {
        owner,
        repo,
        branch
      },
      context: {
        repositoryFiles:
          context.tree.files.length,
        relevantFiles:
          context.files.map(
            (file) => file.path
          ),
        treeTruncated:
          context.tree.truncated
      },
      model:
        generated.model,
      text:
        generated.text
    });
  } catch (error) {
    console.error(
      "Agent request failed:",
      error
    );

    const status =
      Number.isInteger(
        error?.status
      ) &&
      error.status >= 400 &&
      error.status < 600
        ? error.status
        : 502;

    if (status === 401) {
      response.setHeader(
        "Set-Cookie",
        "ld76_github_access_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
      );
    }

    return response.status(status).json({
      ok: false,
      error:
        error?.message ||
        "The coding agent could not complete the request."
    });
  }
    }
