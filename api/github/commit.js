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

  const message = String(
    body.message || ""
  ).trim();

  const expectedHeadSha = String(
    body.expectedHeadSha || ""
  ).trim();

  const tree = Array.isArray(body.tree)
    ? body.tree
    : [];

  if (
    !owner ||
    !repo ||
    !branch ||
    !message ||
    !expectedHeadSha ||
    tree.length === 0
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "owner, repo, branch, message, expectedHeadSha, and tree are required."
    });
  }

  if (
    !isValidGitHubName(owner) ||
    !isValidGitHubName(repo) ||
    !isValidBranchName(branch) ||
    !isValidSha(expectedHeadSha)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid repository, branch, or commit SHA."
    });
  }

  if (message.length > 500) {
    return response.status(400).json({
      ok: false,
      error: "Commit message is too long."
    });
  }

  if (tree.length > 1000) {
    return response.status(400).json({
      ok: false,
      error:
        "A single commit cannot contain more than 1000 tree entries."
    });
  }

  const validationError =
    validateTree(tree);

  if (validationError) {
    return response.status(400).json({
      ok: false,
      error: validationError
    });
  }

  try {
    const refResponse =
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

    if (!refResponse.ok) {
      throw await githubError(
        refResponse,
        "Could not read the GitHub branch reference."
      );
    }

    const refData =
      await refResponse.json();

    const currentHeadSha =
      refData?.object?.sha;

    if (
      typeof currentHeadSha !== "string"
    ) {
      throw createError(
        502,
        "GitHub did not return the current branch commit."
      );
    }

    if (
      currentHeadSha !== expectedHeadSha
    ) {
      return response.status(409).json({
        ok: false,
        error:
          "The branch changed on GitHub since it was read. Refresh the branch and retry.",
        expectedHeadSha,
        currentHeadSha
      });
    }

    const commitResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/git/commits/${encodeURIComponent(
          currentHeadSha
        )}`,
        accessToken
      );

    if (!commitResponse.ok) {
      throw await githubError(
        commitResponse,
        "Could not read the current GitHub commit."
      );
    }

    const commitData =
      await commitResponse.json();

    const baseTreeSha =
      commitData?.tree?.sha;

    if (
      typeof baseTreeSha !== "string" ||
      !isValidSha(baseTreeSha)
    ) {
      throw createError(
        502,
        "GitHub did not return a valid base tree."
      );
    }

    const treeResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/git/trees`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            base_tree: baseTreeSha,
            tree
          })
        }
      );

    if (!treeResponse.ok) {
      throw await githubError(
        treeResponse,
        "Could not create the GitHub tree."
      );
    }

    const treeData =
      await treeResponse.json();

    const newTreeSha =
      treeData?.sha;

    if (
      typeof newTreeSha !== "string" ||
      !isValidSha(newTreeSha)
    ) {
      throw createError(
        502,
        "GitHub did not return a valid tree SHA."
      );
    }

    const createCommitResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/git/commits`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            message,
            tree: newTreeSha,
            parents: [currentHeadSha]
          })
        }
      );

    if (!createCommitResponse.ok) {
      throw await githubError(
        createCommitResponse,
        "Could not create the GitHub commit."
      );
    }

    const createdCommit =
      await createCommitResponse.json();

    const newCommitSha =
      createdCommit?.sha;

    if (
      typeof newCommitSha !== "string" ||
      !isValidSha(newCommitSha)
    ) {
      throw createError(
        502,
        "GitHub did not return a valid commit SHA."
      );
    }

    const updateRefResponse =
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
          method: "PATCH",
          body: JSON.stringify({
            sha: newCommitSha,
            force: false
          })
        }
      );

    if (!updateRefResponse.ok) {
      throw await githubError(
        updateRefResponse,
        "The commit was created, but GitHub could not move the branch reference."
      );
    }

    return response.status(200).json({
      ok: true,
      operation: "commit",
      owner,
      repo,
      branch,
      commit: {
        sha: newCommitSha,
        message,
        parentSha: currentHeadSha,
        treeSha: newTreeSha
      }
    });
  } catch (error) {
    console.error(
      "GitHub commit operation failed:",
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
          "Repository, branch, commit, or Git object was not found."
      });
    }

    if (error.status === 409) {
      return response.status(409).json({
        ok: false,
        error:
          error.message ||
          "The repository changed before the commit could be applied."
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
        "Could not create the GitHub commit."
    });
  }
}

function validateTree(tree) {
  for (const entry of tree) {
    if (!entry || typeof entry !== "object") {
      return "Every tree entry must be an object.";
    }

    const path =
      typeof entry.path === "string"
        ? entry.path.trim()
        : "";

    const mode =
      typeof entry.mode === "string"
        ? entry.mode
        : "";

    const type =
      typeof entry.type === "string"
        ? entry.type
        : "";

    const sha =
      entry.sha === null
        ? null
        : typeof entry.sha === "string"
          ? entry.sha.trim()
          : "";

    if (!path) {
      return "Every tree entry requires a path.";
    }

    if (!isValidPath(path)) {
      return `Invalid tree path: ${path}`;
    }

    if (
      mode !== "100644" &&
      mode !== "100755" &&
      mode !== "040000" &&
      mode !== "160000" &&
      mode !== "120000"
    ) {
      return `Invalid tree mode for ${path}.`;
    }

    if (
      type !== "blob" &&
      type !== "tree" &&
      type !== "commit"
    ) {
      return `Invalid tree type for ${path}.`;
    }

    if (
      sha !== null &&
      !isValidSha(sha)
    ) {
      return `Invalid tree SHA for ${path}.`;
    }

    if (
      sha === null &&
      type !== "blob"
    ) {
      return `A null SHA is only valid for blob entries: ${path}`;
    }
  }

  return "";
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
