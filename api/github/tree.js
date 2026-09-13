export default async function handler(request, response) {
  if (request.method !== "GET") {
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

  const owner = String(
    request.query?.owner || ""
  ).trim();

  const repo = String(
    request.query?.repo || ""
  ).trim();

  const branch = String(
    request.query?.branch || ""
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
      error: "Invalid repository or branch."
    });
  }

  try {
    const tree = await fetchRepositoryTree(
      accessToken,
      owner,
      repo,
      branch
    );

    return response.status(200).json({
      ok: true,
      owner,
      repo,
      branch,
      entries: tree
    });
  } catch (error) {
    console.error(
      "GitHub repository tree request failed:",
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

    return response.status(
      error.status >= 400 &&
        error.status < 600
        ? error.status
        : 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not load the GitHub repository tree."
    });
  }
}

async function fetchRepositoryTree(
  accessToken,
  owner,
  repo,
  branch
) {
  const repositoryResponse =
    await githubFetch(
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(
        branch
      )}?recursive=1`,
      accessToken
    );

  if (!repositoryResponse.ok) {
    throw githubError(
      repositoryResponse,
      "Could not load the repository tree."
    );
  }

  const data =
    await repositoryResponse.json();

  if (!Array.isArray(data.tree)) {
    throw new Error(
      "GitHub returned an invalid repository tree."
    );
  }

  return data.tree
    .filter(
      (entry) =>
        entry &&
        (entry.type === "blob" ||
          entry.type === "tree")
    )
    .map((entry) => ({
      path:
        typeof entry.path === "string"
          ? entry.path
          : "",
      type:
        entry.type === "blob"
          ? "file"
          : "directory",
      sha:
        typeof entry.sha === "string"
          ? entry.sha
          : "",
      size:
        Number.isFinite(entry.size)
          ? entry.size
          : null,
      url:
        typeof entry.url === "string"
          ? entry.url
          : null
    }))
    .filter((entry) => entry.path);
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
        Authorization: `Bearer ${accessToken}`,
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
      data?.message &&
      typeof data.message === "string"
    ) {
      message = data.message;
    }
  } catch {
    // Keep the fallback message.
  }

  const error = new Error(message);
  error.status = response.status;

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
    value.includes(" ") ||
    value.includes("~") ||
    value.includes("^") ||
    value.includes(":") ||
    value.includes("?") ||
    value.includes("*") ||
    value.includes("[")
  ) {
    return false;
  }

  return true;
}
