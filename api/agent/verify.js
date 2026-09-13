function getCookie(request, name) {
  const cookieHeader =
    request.headers?.cookie || "";

  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      part.slice(0, index).trim();

    if (key !== name) {
      continue;
    }

    return part
      .slice(index + 1)
      .trim();
  }

  return "";
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

function getAccessToken(request) {
  return getCookie(
    request,
    "ld76_github_access_token"
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
    !value.includes("//") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.includes("~") &&
    !value.includes("^") &&
    !value.includes(":") &&
    !value.includes("?") &&
    !value.includes("*") &&
    !value.includes("[") &&
    !value.endsWith(".") &&
    !value.includes("@{")
  );
}

function isValidSha(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{40}$/i.test(value)
  );
}

function isValidPath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 500 &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !value.split("/").includes("..")
  );
}

function normalizeChanges(changes) {
  if (!Array.isArray(changes)) {
    return null;
  }

  if (
    changes.length === 0 ||
    changes.length > 100
  ) {
    return null;
  }

  const normalized = [];
  const seen = new Set();

  for (const change of changes) {
    if (
      !change ||
      typeof change !== "object"
    ) {
      return null;
    }

    if (
      change.operation !== "create" &&
      change.operation !== "update" &&
      change.operation !== "delete"
    ) {
      return null;
    }

    const path =
      typeof change.path === "string"
        ? change.path.trim()
        : "";

    if (
      !isValidPath(path) ||
      seen.has(path)
    ) {
      return null;
    }

    seen.add(path);

    if (
      change.operation === "delete"
    ) {
      normalized.push({
        operation: "delete",
        path
      });

      continue;
    }

    if (
      typeof change.content !==
      "string"
    ) {
      return null;
    }

    if (
      change.content.length >
      500000
    ) {
      return null;
    }

    normalized.push({
      operation:
        change.operation,
      path,
      content:
        change.content
    });
  }

  return normalized;
}

async function githubFetch(
  path,
  accessToken
) {
  return fetch(
    `https://api.github.com${path}`,
    {
      method: "GET",
      headers: {
        Accept:
          "application/vnd.github+json",
        Authorization:
          `Bearer ${accessToken}`,
        "X-GitHub-Api-Version":
          "2022-11-28"
      }
    }
  );
}

async function githubError(
  response,
  fallbackMessage
) {
  let message =
    fallbackMessage;

  try {
    const data =
      await response.json();

    if (
      typeof data?.message ===
        "string" &&
      data.message
    ) {
      message =
        data.message;
    }
  } catch {
    // Keep fallback.
  }

  const error =
    new Error(message);

  error.status =
    response.status;

  return error;
}

function createError(
  status,
  message
) {
  const error =
    new Error(message);

  error.status =
    status;

  return error;
}

function decodeBase64Utf8(
  value
) {
  try {
    return Buffer.from(
      value,
      "base64"
    ).toString("utf8");
  } catch {
    return null;
  }
}

async function getBranchHead(
  owner,
  repo,
  branch,
  accessToken
) {
  const response =
    await githubFetch(
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/git/ref/heads/${encodeURIComponent(
        branch
      )}`,
      accessToken
    );

  if (!response.ok) {
    throw await githubError(
      response,
      "Could not read the GitHub branch."
    );
  }

  const data =
    await response.json();

  if (
    !isValidSha(
      data?.object?.sha
    )
  ) {
    throw createError(
      502,
      "GitHub returned an invalid branch commit SHA."
    );
  }

  return data.object.sha;
}

async function getCommit(
  owner,
  repo,
  commitSha,
  accessToken
) {
  const response =
    await githubFetch(
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/git/commits/${encodeURIComponent(
        commitSha
      )}`,
      accessToken
    );

  if (!response.ok) {
    throw await githubError(
      response,
      "Could not read the GitHub commit."
    );
  }

  return response.json();
}

async function getFile(
  owner,
  repo,
  path,
  ref,
  accessToken
) {
  const response =
    await githubFetch(
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/contents/${path
        .split("/")
        .map(encodeURIComponent)
        .join(
          "/"
        )}?ref=${encodeURIComponent(
        ref
      )}`,
      accessToken
    );

  if (
    response.status === 404
  ) {
    return null;
  }

  if (!response.ok) {
    throw await githubError(
      response,
      `Could not read ${path}.`
    );
  }

  const data =
    await response.json();

  if (
    !data ||
    Array.isArray(data)
  ) {
    throw createError(
      502,
      `GitHub returned an invalid file response for ${path}.`
    );
  }

  if (
    data.type !== "file" ||
    typeof data.content !==
      "string"
  ) {
    throw createError(
      502,
      `GitHub did not return file content for ${path}.`
    );
  }

  const content =
    decodeBase64Utf8(
      data.content.replace(
        /\s/g,
        ""
      )
    );

  if (content === null) {
    throw createError(
      502,
      `Could not decode ${path}.`
    );
  }

  return {
    sha:
      data.sha || null,
    content
  };
}

export default async function handler(
  request,
  response
) {
  if (
    request.method !== "POST"
  ) {
    return response.status(405).json({
      ok: false,
      error:
        "Method not allowed."
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
        "Request body must be valid JSON."
    });
  }

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

  const commitSha =
    typeof body.commitSha ===
      "string"
      ? body.commitSha.trim()
      : "";

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
        "Invalid GitHub repository name."
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
    !isValidSha(commitSha)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid commit SHA."
    });
  }

  const changes =
    normalizeChanges(
      body.changes
    );

  if (!changes) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid or empty change set."
    });
  }

  try {
    const branchHead =
      await getBranchHead(
        owner,
        repo,
        branch,
        accessToken
      );

    if (
      branchHead !==
      commitSha
    ) {
      return response.status(409).json({
        ok: false,
        verified: false,
        error:
          "The verified commit is no longer the current branch head."
      });
    }

    const commit =
      await getCommit(
        owner,
        repo,
        commitSha,
        accessToken
      );

    const verifiedFiles = [];
    const failedFiles = [];

    for (
      const change of changes
    ) {
      const file =
        await getFile(
          owner,
          repo,
          change.path,
          commitSha,
          accessToken
        );

      if (
        change.operation ===
        "delete"
      ) {
        if (file !== null) {
          failedFiles.push({
            path:
              change.path,
            operation:
              change.operation,
            reason:
              "File still exists after delete."
          });
        } else {
          verifiedFiles.push({
            path:
              change.path,
            operation:
              change.operation,
            verified: true
          });
        }

        continue;
      }

      if (file === null) {
        failedFiles.push({
          path:
            change.path,
          operation:
            change.operation,
          reason:
            "File does not exist after apply."
        });

        continue;
      }

      if (
        file.content !==
        change.content
      ) {
        failedFiles.push({
          path:
            change.path,
          operation:
            change.operation,
          reason:
            "Actual GitHub file content does not match the generated content."
        });

        continue;
      }

      verifiedFiles.push({
        path:
          change.path,
        operation:
          change.operation,
        verified: true
      });
    }

    const verified =
      failedFiles.length === 0;

    if (!verified) {
      return response.status(409).json({
        ok: false,
        verified: false,
        commit: {
          sha: commitSha,
          message:
            commit?.message || ""
        },
        verifiedFiles,
        failedFiles,
        error:
          "GitHub commit exists, but post-apply verification failed."
      });
    }

    return response.status(200).json({
      ok: true,
      verified: true,
      commit: {
        sha: commitSha,
        message:
          commit?.message || "",
        url:
          `https://github.com/${owner}/${repo}/commit/${commitSha}`
      },
      branch,
      verifiedFiles,
      failedFiles: []
    });
  } catch (error) {
    console.error(
      "Agent verification failed:",
      error
    );

    if (
      error.status === 401
    ) {
      return response.status(401).json({
        ok: false,
        verified: false,
        error:
          "GitHub authorization has expired or is invalid. Please reconnect GitHub."
      });
    }

    return response.status(
      error.status >= 400 &&
        error.status < 600
        ? error.status
        : 502
    ).json({
      ok: false,
      verified: false,
      error:
        error.message ||
        "Could not verify the GitHub changes."
    });
  }
}
