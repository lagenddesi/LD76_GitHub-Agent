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

  const branch = String(
    body.branch || ""
  ).trim();

  if (!owner || !repo || !branch) {
    return response.status(400).json({
      ok: false,
      error:
        "owner, repo, and branch are required."
    });
  }

  if (
    !isValidGitHubName(owner) ||
    !isValidGitHubName(repo) ||
    !isValidBranchName(branch)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid repository or branch name."
    });
  }

  if (
    branch === "main" ||
    branch === "master"
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "The default branch cannot be deleted through this endpoint."
    });
  }

  try {
    const repoResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(repo)}`,
        accessToken
      );

    if (!repoResponse.ok) {
      throw await githubError(
        repoResponse,
        "Could not read the repository."
      );
    }

    const repoData =
      await repoResponse.json();

    const defaultBranch =
      typeof repoData?.default_branch ===
      "string"
        ? repoData.default_branch
        : "";

    if (defaultBranch === branch) {
      return response.status(400).json({
        ok: false,
        error:
          "The repository default branch cannot be deleted."
      });
    }

    const branchResponse =
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

    if (!branchResponse.ok) {
      throw await githubError(
        branchResponse,
        "Could not find the branch."
      );
    }

    const deleteResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/git/refs/heads/${encodeURIComponent(
          branch
        )}`,
        accessToken,
        {
          method: "DELETE"
        }
      );

    if (!deleteResponse.ok) {
      throw await githubError(
        deleteResponse,
        "Could not delete the GitHub branch."
      );
    }

    return response.status(200).json({
      ok: true,
      operation: "delete-branch",
      owner,
      repo,
      branch,
      deleted: true
    });
  } catch (error) {
    console.error(
      "GitHub branch deletion failed:",
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
          "Repository or branch was not found."
      });
    }

    if (error.status === 409) {
      return response.status(409).json({
        ok: false,
        error:
          error.message ||
          "GitHub could not delete the branch because of a conflict."
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
        "Could not delete the GitHub branch."
    });
  }
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
          "2022-11-28"
      }
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
      typeof data?.message === "string" &&
      data.message
    ) {
      message = data.message;
    }
  } catch {
    // Keep fallback message.
  }

  return createError(
    response.status,
    message
  );
}

function createError(
  status,
  message
) {
  const error =
    new Error(message);

  error.status = status;

  return error;
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
      cookie.slice(0, separator).trim();

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
