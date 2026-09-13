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

  const fromBranch = String(
    body.fromBranch || ""
  ).trim();

  const fromSha = String(
    body.fromSha || ""
  ).trim();

  if (
    !owner ||
    !repo ||
    !branch ||
    (!fromBranch && !fromSha)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "owner, repo, branch, and either fromBranch or fromSha are required."
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
    fromSha &&
    !isValidSha(fromSha)
  ) {
    return response.status(400).json({
      ok: false,
      error: "Invalid source commit SHA."
    });
  }

  try {
    let sourceSha = fromSha;

    if (!sourceSha) {
      if (!isValidBranchName(fromBranch)) {
        return response.status(400).json({
          ok: false,
          error: "Invalid source branch name."
        });
      }

      const sourceResponse =
        await githubFetch(
          `/repos/${encodeURIComponent(
            owner
          )}/${encodeURIComponent(
            repo
          )}/git/ref/heads/${encodeURIComponent(
            fromBranch
          )}`,
          accessToken
        );

      if (!sourceResponse.ok) {
        throw await githubError(
          sourceResponse,
          "Could not read the source branch."
        );
      }

      const sourceData =
        await sourceResponse.json();

      sourceSha =
        sourceData?.object?.sha;

      if (
        typeof sourceSha !== "string" ||
        !isValidSha(sourceSha)
      ) {
        throw createError(
          502,
          "GitHub did not return a valid source commit."
        );
      }
    }

    const existingResponse =
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

    if (
      existingResponse.ok
    ) {
      return response.status(409).json({
        ok: false,
        error:
          "That branch already exists.",
        branch
      });
    }

    if (
      existingResponse.status !== 404
    ) {
      throw await githubError(
        existingResponse,
        "Could not check whether the branch already exists."
      );
    }

    const createResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/git/refs`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            ref: `refs/heads/${branch}`,
            sha: sourceSha
          })
        }
      );

    if (!createResponse.ok) {
      throw await githubError(
        createResponse,
        "Could not create the GitHub branch."
      );
    }

    const createdData =
      await createResponse.json();

    const createdSha =
      createdData?.object?.sha;

    if (
      typeof createdSha !== "string" ||
      !isValidSha(createdSha)
    ) {
      throw createError(
        502,
        "GitHub did not return a valid created branch SHA."
      );
    }

    return response.status(201).json({
      ok: true,
      operation: "create-branch",
      owner,
      repo,
      branch,
      sourceSha,
      sha: createdSha
    });
  } catch (error) {
    console.error(
      "GitHub branch creation failed:",
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
          "Repository or source branch/commit was not found."
      });
    }

    if (error.status === 409) {
      return response.status(409).json({
        ok: false,
        error:
          error.message ||
          "The branch could not be created because it already exists or conflicts with another GitHub operation."
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
        "Could not create the GitHub branch."
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

function isValidSha(
  value
) {
  return /^[a-fA-F0-9]{40}$/.test(
    value
  );
}
