export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  const accessToken = getCookie(
    request.headers.cookie,
    "ld76_github_access_token"
  );

  if (!accessToken) {
    return response.status(401).json({
      ok: false,
      error: "GitHub is not connected."
    });
  }

  const body = request.body || {};

  const owner = String(
    body.owner || ""
  ).trim();

  const repo = String(
    body.repo || ""
  ).trim();

  const path = String(
    body.path || ""
  ).trim();

  const content =
    typeof body.content === "string"
      ? body.content
      : "";

  const message = String(
    body.message || ""
  ).trim();

  const branch = String(
    body.branch || ""
  ).trim();

  const expectedSha = String(
    body.sha || ""
  ).trim();

  if (
    !owner ||
    !repo ||
    !path ||
    !message ||
    !branch ||
    !expectedSha
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "owner, repo, path, message, branch, and sha are required."
    });
  }

  if (
    !isValidGitHubName(owner) ||
    !isValidGitHubName(repo) ||
    !isValidPath(path) ||
    !isValidBranchName(branch) ||
    !isValidSha(expectedSha)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid repository, branch, file path, or file SHA."
    });
  }

  if (message.length > 500) {
    return response.status(400).json({
      ok: false,
      error:
        "Commit message is too long."
    });
  }

  try {
    const currentFile =
      await getCurrentFile(
        accessToken,
        owner,
        repo,
        path,
        branch
      );

    if (!currentFile.exists) {
      return response.status(404).json({
        ok: false,
        error:
          "The file does not exist. Use the create-file operation instead."
      });
    }

    if (currentFile.type !== "file") {
      return response.status(400).json({
        ok: false,
        error:
          "The requested path is not a file."
      });
    }

    if (currentFile.sha !== expectedSha) {
      return response.status(409).json({
        ok: false,
        error:
          "File changed on GitHub since it was read. Refresh the file and retry.",
        expectedSha,
        currentSha: currentFile.sha
      });
    }

    const githubResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/contents/${path}`,
        accessToken,
        {
          method: "PUT",
          body: JSON.stringify({
            message,
            content: encodeBase64(content),
            sha: expectedSha,
            branch
          })
        }
      );

    if (!githubResponse.ok) {
      throw await githubError(
        githubResponse,
        "Could not update the GitHub file."
      );
    }

    const data =
      await githubResponse.json();

    return response.status(200).json({
      ok: true,
      operation: "update",
      owner,
      repo,
      branch,
      path,
      commit: {
        sha:
          typeof data.commit?.sha === "string"
            ? data.commit.sha
            : null,
        message:
          typeof data.commit?.message === "string"
            ? data.commit.message
            : message
      },
      file: {
        path:
          typeof data.content?.path === "string"
            ? data.content.path
            : path,
        sha:
          typeof data.content?.sha === "string"
            ? data.content.sha
            : null
      }
    });
  } catch (error) {
    console.error(
      "GitHub file update failed:",
      error
    );

    if (error.status === 401) {
      clearAccessTokenCookie(response);

      return response.status(401).json({
        ok: false,
        error:
          "GitHub authorization has expired or is invalid. Please reconnect GitHub."
      });
    }

    if (error.status === 404) {
      return response.status(404).json({
        ok: false,
        error:
          "Repository, branch, or file was not found."
      });
    }

    if (error.status === 409) {
      return response.status(409).json({
        ok: false,
        error:
          error.message ||
          "The file could not be updated because the repository changed."
      });
    }

    return response.status(
      error.status >= 400 &&
        error.status < 600
        ? error.status
        : 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not update the GitHub file."
    });
  }
}

async function getCurrentFile(
  accessToken,
  owner,
  repo,
  path,
  branch
) {
  const githubResponse =
    await githubFetch(
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/contents/${path}?ref=${encodeURIComponent(
        branch
      )}`,
      accessToken,
      {
        method: "GET"
      }
    );

  if (
    githubResponse.status === 404
  ) {
    return {
      exists: false,
      type: null,
      sha: null
    };
  }

  if (!githubResponse.ok) {
    throw await githubError(
      githubResponse,
      "Could not check the current GitHub file."
    );
  }

  const data =
    await githubResponse.json();

  if (Array.isArray(data)) {
    return {
      exists: true,
      type: "directory",
      sha: null
    };
  }

  return {
    exists: true,
    type:
      typeof data?.type === "string"
        ? data.type
        : null,
    sha:
      typeof data?.sha === "string"
        ? data.sha
        : null
  };
}

async function githubFetch(
  path,
  accessToken,
  options = {}
) {
  return fetch(
    `https://api.github.com${path}`,
    {
      method:
        options.method || "GET",
      headers: {
        Accept:
          "application/vnd.github+json",
        Authorization:
          `Bearer ${accessToken}`,
        "X-GitHub-Api-Version":
          "2022-11-28",
        ...(options.body
          ? {
              "Content-Type":
                "application/json"
            }
          : {})
      },
      ...(options.body
        ? {
            body: options.body
          }
        : {})
    }
  );
}

async function githubError(
  response,
  fallbackMessage
) {
  let message = fallbackMessage;

  try {
    const data =
      await response.json();

    if (
      data?.message &&
      typeof data.message === "string"
    ) {
      message = data.message;
    }
  } catch {
    // Keep fallback message.
  }

  const error =
    new Error(message);

  error.status =
    response.status;

  return error;
}

function encodeBase64(
  value
) {
  const bytes =
    new TextEncoder().encode(
      value
    );

  let binary = "";

  const chunkSize = 0x8000;

  for (
    let index = 0;
    index < bytes.length;
    index += chunkSize
  ) {
    const chunk =
      bytes.subarray(
        index,
        Math.min(
          index + chunkSize,
          bytes.length
        )
      );

    binary += String.fromCharCode(
      ...chunk
    );
  }

  return globalThis.btoa(
    binary
  );
}

function getCookie(
  cookieHeader,
  name
) {
  if (!cookieHeader) {
    return "";
  }

  const cookies =
    cookieHeader.split(";");

  for (const cookie of cookies) {
    const separator =
      cookie.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key =
      cookie
        .slice(0, separator)
        .trim();

    if (key !== name) {
      continue;
    }

    return decodeURIComponent(
      cookie
        .slice(separator + 1)
        .trim()
    );
  }

  return "";
}

function clearAccessTokenCookie(
  response
) {
  response.setHeader(
    "Set-Cookie",
    "ld76_github_access_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );
}

function isValidGitHubName(
  value
) {
  return /^[A-Za-z0-9_.-]+$/.test(
    value
  );
}

function isValidPath(
  value
) {
  if (
    value.length < 1 ||
    value.length > 1000
  ) {
    return false;
  }

  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.includes("..")
  ) {
    return false;
  }

  return true;
}

function isValidBranchName(
  value
) {
  if (
    value.length < 1 ||
    value.length > 255
  ) {
    return false;
  }

  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("..") ||
    value.includes("//") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.includes("~") ||
    value.includes("^") ||
    value.includes(":") ||
    value.includes("?") ||
    value.includes("*") ||
    value.includes("[") ||
    value.endsWith(".") ||
    value.includes("@{")
  ) {
    return false;
  }

  return true;
}

function isValidSha(
  value
) {
  return /^[a-fA-F0-9]{40}$/.test(
    value
  );
}
