const ACCESS_TOKEN_COOKIE =
  "ld76_github_access_token";

const OAUTH_STATE_COOKIE =
  "ld76_github_oauth_state";

const GITHUB_API =
  "https://api.github.com";

const GITHUB_API_VERSION =
  "2022-11-28";

const MAX_FILE_SIZE =
  10 * 1024 * 1024;

const MAX_COMMIT_MESSAGE_LENGTH =
  500;

export async function handleGitHubRoute(
  request,
  response,
  route = []
) {
  const path = route.join("/");

  try {
    if (path === "login") {
      return handleLogin(request, response);
    }

    if (path === "callback") {
      return handleCallback(request, response);
    }

    if (path === "logout") {
      return handleLogout(request, response);
    }

    if (path === "status") {
      return handleStatus(request, response);
    }

    if (path === "repos") {
      return handleRepos(request, response);
    }

    if (path === "branches") {
      return handleBranches(request, response);
    }

    if (path === "file") {
      return handleFile(request, response);
    }

    if (path === "tree") {
      return handleTree(request, response);
    }

    if (path === "commit") {
      return handleCommit(request, response);
    }

    if (path === "create-file") {
      return handleCreateFile(request, response);
    }

    if (path === "update-file") {
      return handleUpdateFile(request, response);
    }

    if (path === "delete-file") {
      return handleDeleteFile(request, response);
    }

    if (path === "create-branch") {
      return handleCreateBranch(request, response);
    }

    if (path === "delete-branch") {
      return handleDeleteBranch(request, response);
    }

    return response.status(404).json({
      ok: false,
      error: "GitHub API route not found."
    });
  } catch (error) {
    console.error(
      "GitHub route error:",
      error
    );

    return response.status(
      error.status >= 400 &&
      error.status < 600
        ? error.status
        : 500
    ).json({
      ok: false,
      error:
        error.message ||
        "GitHub request failed."
    });
  }
}

function handleLogin(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(response);
  }

  const clientId =
    process.env.LD76_GITHUB_CLIENT_ID;

  const redirectUri =
    process.env.LD76_GITHUB_REDIRECT_URI;

  if (!clientId) {
    return response.status(503).json({
      ok: false,
      error:
        "GitHub OAuth client ID is not configured. Add LD76_GITHUB_CLIENT_ID to the Vercel environment variables."
    });
  }

  if (!redirectUri) {
    return response.status(503).json({
      ok: false,
      error:
        "GitHub OAuth redirect URI is not configured. Add LD76_GITHUB_REDIRECT_URI to the Vercel environment variables."
    });
  }

  const state =
    createRandomState();

  const url =
    new URL(
      "https://github.com/login/oauth/authorize"
    );

  url.searchParams.set(
    "client_id",
    clientId
  );

  url.searchParams.set(
    "redirect_uri",
    redirectUri
  );

  url.searchParams.set(
    "scope",
    "repo"
  );

  url.searchParams.set(
    "state",
    state
  );

  response.setHeader(
    "Set-Cookie",
    serializeCookie(
      OAUTH_STATE_COOKIE,
      state,
      {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: 600
      }
    )
  );

  return response.redirect(
    302,
    url.toString()
  );
}

async function handleCallback(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(response);
  }

  const clientId =
    process.env.LD76_GITHUB_CLIENT_ID;

  const clientSecret =
    process.env.LD76_GITHUB_CLIENT_SECRET;

  const redirectUri =
    process.env.LD76_GITHUB_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    return response.status(503).json({
      ok: false,
      error:
        "GitHub OAuth credentials are not configured."
    });
  }

  if (!redirectUri) {
    return response.status(503).json({
      ok: false,
      error:
        "GitHub OAuth redirect URI is not configured."
    });
  }

  const errorParam =
    String(
      request.query?.error || ""
    ).trim();

  if (errorParam) {
    clearCookie(
      response,
      OAUTH_STATE_COOKIE
    );

    return response.redirect(
      302,
      `/?github=error&reason=${encodeURIComponent(
        errorParam
      )}`
    );
  }

  const code =
    String(
      request.query?.code || ""
    ).trim();

  const returnedState =
    String(
      request.query?.state || ""
    ).trim();

  const storedState =
    getCookie(
      request.headers.cookie || "",
      OAUTH_STATE_COOKIE
    );

  if (!code || !returnedState) {
    return response.status(400).json({
      ok: false,
      error:
        "GitHub OAuth code and state are required."
    });
  }

  if (
    !storedState ||
    !timingSafeEqual(
      storedState,
      returnedState
    )
  ) {
    clearCookie(
      response,
      OAUTH_STATE_COOKIE
    );

    return response.status(400).json({
      ok: false,
      error:
        "Invalid or expired GitHub OAuth state."
    });
  }

  const tokenResponse =
    await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept:
            "application/json",
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri
        })
      }
    );

  if (!tokenResponse.ok) {
    clearCookie(
      response,
      OAUTH_STATE_COOKIE
    );

    return response.status(502).json({
      ok: false,
      error:
        "GitHub OAuth token exchange failed."
    });
  }

  const tokenData =
    await tokenResponse.json();

  if (
    typeof tokenData.access_token !==
      "string" ||
    !tokenData.access_token
  ) {
    clearCookie(
      response,
      OAUTH_STATE_COOKIE
    );

    return response.status(502).json({
      ok: false,
      error:
        tokenData.error_description ||
        "GitHub did not return an access token."
    });
  }

  response.setHeader(
    "Set-Cookie",
    [
      serializeCookie(
        ACCESS_TOKEN_COOKIE,
        tokenData.access_token,
        {
          httpOnly: true,
          secure: true,
          sameSite: "Lax"
        }
      ),
      serializeCookie(
        OAUTH_STATE_COOKIE,
        "",
        {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          maxAge: 0
        }
      )
    ]
  );

  return response.redirect(
    302,
    "/?github=connected"
  );
}

function handleLogout(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  response.setHeader(
    "Set-Cookie",
    [
      serializeCookie(
        ACCESS_TOKEN_COOKIE,
        "",
        {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          maxAge: 0
        }
      ),
      serializeCookie(
        OAUTH_STATE_COOKIE,
        "",
        {
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          maxAge: 0
        }
      )
    ]
  );

  return response.status(200).json({
    ok: true,
    connected: false
  });
}

async function handleStatus(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(response);
  }

  const token =
    getAccessToken(request);

  if (!token) {
    return response.status(200).json({
      ok: true,
      connected: false
    });
  }

  try {
    const githubResponse =
      await githubFetch(
        "/user",
        token
      );

    if (
      githubResponse.status === 401
    ) {
      clearAccessTokenCookie(
        response
      );

      return response.status(200).json({
        ok: true,
        connected: false
      });
    }

    if (!githubResponse.ok) {
      throw await githubError(
        githubResponse,
        "Could not verify the GitHub connection."
      );
    }

    const user =
      await githubResponse.json();

    return response.status(200).json({
      ok: true,
      connected: true,
      user: {
        login:
          typeof user.login === "string"
            ? user.login
            : "",
        name:
          typeof user.name === "string"
            ? user.name
            : null,
        avatarUrl:
          typeof user.avatar_url === "string"
            ? user.avatar_url
            : null
      }
    });
  } catch (error) {
    console.error(
      "GitHub status check failed:",
      error
    );

    return response.status(502).json({
      ok: false,
      error:
        "Could not reach GitHub to verify the connection."
    });
  }
}

async function handleRepos(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(response);
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  try {
    const repositories = [];
    let page = 1;

    while (page <= 10) {
      const githubResponse =
        await githubFetch(
          `/user/repos?per_page=100&page=${page}&sort=updated`,
          token
        );

      if (
        githubResponse.status === 401
      ) {
        clearAccessTokenCookie(
          response
        );

        return response.status(401).json({
          ok: false,
          error:
            "GitHub authentication has expired. Please connect GitHub again."
        });
      }

      if (!githubResponse.ok) {
        throw await githubError(
          githubResponse,
          "Could not load your GitHub repositories."
        );
      }

      const pageData =
        await githubResponse.json();

      if (!Array.isArray(pageData)) {
        throw createError(
          502,
          "GitHub returned an unexpected repository response."
        );
      }

      repositories.push(
        ...pageData
          .filter(
            (repository) =>
              repository &&
              typeof repository.id ===
                "number" &&
              typeof repository.full_name ===
                "string"
          )
          .map(
            (repository) => ({
              id: repository.id,
              name:
                typeof repository.name ===
                "string"
                  ? repository.name
                  : "",
              fullName:
                repository.full_name,
              private:
                Boolean(
                  repository.private
                ),
              defaultBranch:
                typeof repository.default_branch ===
                "string"
                  ? repository.default_branch
                  : "main",
              description:
                typeof repository.description ===
                "string"
                  ? repository.description
                  : null,
              htmlUrl:
                typeof repository.html_url ===
                "string"
                  ? repository.html_url
                  : null,
              language:
                typeof repository.language ===
                "string"
                  ? repository.language
                  : null,
              updatedAt:
                typeof repository.updated_at ===
                "string"
                  ? repository.updated_at
                  : null
            })
          )
      );

      if (pageData.length < 100) {
        break;
      }

      page += 1;
    }

    return response.status(200).json({
      ok: true,
      repositories
    });
  } catch (error) {
    console.error(
      "GitHub repository loading failed:",
      error
    );

    return response.status(
      error.status || 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not reach GitHub to load repositories."
    });
  }
}

async function handleBranches(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(response);
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const owner =
    String(
      request.query?.owner || ""
    ).trim();

  const repo =
    String(
      request.query?.repo || ""
    ).trim();

  if (
    !isValidGitHubName(owner) ||
    !isValidGitHubName(repo)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "A valid GitHub repository owner and name are required."
    });
  }

  try {
    const branches = [];
    let page = 1;

    while (page <= 10) {
      const githubResponse =
        await githubFetch(
          `/repos/${encodeURIComponent(
            owner
          )}/${encodeURIComponent(
            repo
          )}/branches?per_page=100&page=${page}`,
          token
        );

      if (
        githubResponse.status === 401
      ) {
        clearAccessTokenCookie(
          response
        );

        return response.status(401).json({
          ok: false,
          error:
            "GitHub authentication has expired. Please connect GitHub again."
        });
      }

      if (
        githubResponse.status === 404
      ) {
        return response.status(404).json({
          ok: false,
          error:
            "Repository was not found or you do not have access to it."
        });
      }

      if (!githubResponse.ok) {
        throw await githubError(
          githubResponse,
          "Could not load repository branches."
        );
      }

      const pageData =
        await githubResponse.json();

      if (!Array.isArray(pageData)) {
        throw createError(
          502,
          "GitHub returned an unexpected branch response."
        );
      }

      branches.push(
        ...pageData
          .filter(
            (branch) =>
              branch &&
              typeof branch.name ===
                "string"
          )
          .map(
            (branch) => ({
              name: branch.name,
              protected:
                Boolean(
                  branch.protected
                )
            })
          )
      );

      if (pageData.length < 100) {
        break;
      }

      page += 1;
    }

    return response.status(200).json({
      ok: true,
      owner,
      repo,
      branches
    });
  } catch (error) {
    return response.status(
      error.status || 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not reach GitHub to load repository branches."
    });
  }
}

async function handleFile(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(response);
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const owner =
    String(
      request.query?.owner || ""
    ).trim();

  const repo =
    String(
      request.query?.repo || ""
    ).trim();

  const path =
    String(
      request.query?.path || ""
    ).trim();

  const ref =
    String(
      request.query?.ref || ""
    ).trim();

  if (
    !owner ||
    !repo ||
    !path
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "owner, repo, and path are required."
    });
  }

  if (
    !isValidGitHubName(owner) ||
    !isValidGitHubName(repo) ||
    !isValidPath(path)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid repository or file path."
    });
  }

  if (
    ref &&
    !isValidRef(ref)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid Git reference."
    });
  }

  try {
    const query =
      ref
        ? `?ref=${encodeURIComponent(ref)}`
        : "";

    const githubResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/contents/${path}${query}`,
        token
      );

    if (!githubResponse.ok) {
      throw await githubError(
        githubResponse,
        "Could not read the GitHub file."
      );
    }

    const data =
      await githubResponse.json();

    if (
      !data ||
      Array.isArray(data) ||
      data.type !== "file"
    ) {
      throw createError(
        400,
        "The requested path is not a file."
      );
    }

    if (
      data.encoding !== "base64" ||
      typeof data.content !==
        "string"
    ) {
      throw createError(
        502,
        "GitHub did not return supported file content."
      );
    }

    return response.status(200).json({
      ok: true,
      owner,
      repo,
      path:
        typeof data.path === "string"
          ? data.path
          : path,
      sha:
        typeof data.sha === "string"
          ? data.sha
          : "",
      size:
        Number.isFinite(data.size)
          ? data.size
          : null,
      encoding: "utf-8",
      content:
        decodeBase64(
          data.content
        ),
      url:
        typeof data.html_url ===
        "string"
          ? data.html_url
          : null
    });
  } catch (error) {
    if (error.status === 401) {
      clearAccessTokenCookie(
        response
      );

      return response.status(401).json({
        ok: false,
        error:
          "GitHub authorization has expired or is invalid. Please reconnect GitHub."
      });
    }

    return response.status(
      error.status || 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not read the GitHub file."
    });
  }
}

async function handleTree(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(response);
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const owner =
    String(
      request.query?.owner || ""
    ).trim();

  const repo =
    String(
      request.query?.repo || ""
    ).trim();

  const branch =
    String(
      request.query?.branch || ""
    ).trim();

  if (
    !owner ||
    !repo ||
    !branch
  ) {
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
        "Invalid repository or branch."
    });
  }

  try {
    const githubResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/git/trees/${encodeURIComponent(
          branch
        )}?recursive=1`,
        token
      );

    if (!githubResponse.ok) {
      throw await githubError(
        githubResponse,
        "Could not load the repository tree."
      );
    }

    const data =
      await githubResponse.json();

    if (!Array.isArray(data.tree)) {
      throw createError(
        502,
        "GitHub returned an invalid repository tree."
      );
    }

    const entries =
      data.tree
        .filter(
          (entry) =>
            entry &&
            (
              entry.type === "blob" ||
              entry.type === "tree"
            )
        )
        .map(
          (entry) => ({
            path:
              typeof entry.path ===
              "string"
                ? entry.path
                : "",
            type:
              entry.type === "blob"
                ? "file"
                : "directory",
            sha:
              typeof entry.sha ===
              "string"
                ? entry.sha
                : "",
            size:
              Number.isFinite(
                entry.size
              )
                ? entry.size
                : null,
            url:
              typeof entry.url ===
              "string"
                ? entry.url
                : null
          })
        )
        .filter(
          (entry) => entry.path
        );

    return response.status(200).json({
      ok: true,
      owner,
      repo,
      branch,
      entries
    });
  } catch (error) {
    if (error.status === 401) {
      clearAccessTokenCookie(
        response
      );

      return response.status(401).json({
        ok: false,
        error:
          "GitHub authorization has expired or is invalid. Please reconnect GitHub."
      });
    }

    return response.status(
      error.status || 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not load the GitHub repository tree."
    });
  }
}

async function handleCommit(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const body =
    request.body || {};

  const owner =
    String(
      body.owner || ""
    ).trim();

  const repo =
    String(
      body.repo || ""
    ).trim();

  const branch =
    String(
      body.branch || ""
    ).trim();

  const message =
    String(
      body.message || ""
    ).trim();

  const expectedHeadSha =
    String(
      body.expectedHeadSha || ""
    ).trim();

  const tree =
    Array.isArray(body.tree)
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

  if (
    message.length >
    MAX_COMMIT_MESSAGE_LENGTH
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Commit message is too long."
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
        token
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
      typeof currentHeadSha !==
      "string"
    ) {
      throw createError(
        502,
        "GitHub did not return the current branch commit."
      );
    }

    if (
      currentHeadSha !==
      expectedHeadSha
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
        token
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
      typeof baseTreeSha !==
        "string" ||
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
        token,
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
      typeof newTreeSha !==
        "string" ||
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
        token,
        {
          method: "POST",
          body: JSON.stringify({
            message,
            tree: newTreeSha,
            parents: [
              currentHeadSha
            ]
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
      typeof newCommitSha !==
        "string" ||
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
        token,
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
    if (error.status === 401) {
      clearAccessTokenCookie(
        response
      );

      return response.status(401).json({
        ok: false,
        error:
          "GitHub authorization has expired or is invalid. Please reconnect GitHub."
      });
    }

    return response.status(
      error.status || 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not create the GitHub commit."
    });
  }
}

async function handleCreateFile(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const body =
    request.body || {};

  const owner =
    String(body.owner || "").trim();

  const repo =
    String(body.repo || "").trim();

  const path =
    String(body.path || "").trim();

  const content =
    typeof body.content === "string"
      ? body.content
      : "";

  const message =
    String(body.message || "").trim();

  const branch =
    String(body.branch || "").trim();

  if (
    !owner ||
    !repo ||
    !path ||
    !message ||
    !branch
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "owner, repo, path, message, and branch are required."
    });
  }

  if (
    !isValidGitHubName(owner) ||
    !isValidGitHubName(repo) ||
    !isValidPath(path) ||
    !isValidBranchName(branch)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid repository, branch, or file path."
    });
  }

  if (
    message.length >
    MAX_COMMIT_MESSAGE_LENGTH
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Commit message is too long."
    });
  }

  const contentSize =
    new TextEncoder().encode(
      content
    ).byteLength;

  if (
    contentSize >
    MAX_FILE_SIZE
  ) {
    return response.status(413).json({
      ok: false,
      error:
        "File content is too large. Maximum supported file size is 10 MB."
    });
  }

  try {
    const existing =
      await getCurrentFile(
        token,
        owner,
        repo,
        path,
        branch
      );

    if (existing.exists) {
      return response.status(409).json({
        ok: false,
        error:
          "A file already exists at this path. Use the update-file operation instead.",
        sha: existing.sha
      });
    }

    const githubResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/contents/${path}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            message,
            content:
              encodeBase64(content),
            branch
          })
        }
      );

    if (!githubResponse.ok) {
      throw await githubError(
        githubResponse,
        "Could not create the GitHub file."
      );
    }

    const data =
      await githubResponse.json();

    return response.status(201).json({
      ok: true,
      operation: "create",
      owner,
      repo,
      branch,
      path,
      commit: {
        sha:
          typeof data.commit?.sha ===
          "string"
            ? data.commit.sha
            : null,
        message:
          typeof data.commit?.message ===
          "string"
            ? data.commit.message
            : message
      },
      file: {
        path:
          typeof data.content?.path ===
          "string"
            ? data.content.path
            : path,
        sha:
          typeof data.content?.sha ===
          "string"
            ? data.content.sha
            : null
      }
    });
  } catch (error) {
    return response.status(
      error.status || 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not create the GitHub file."
    });
  }
}

async function handleUpdateFile(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const body =
    request.body || {};

  const owner =
    String(body.owner || "").trim();

  const repo =
    String(body.repo || "").trim();

  const path =
    String(body.path || "").trim();

  const content =
    typeof body.content === "string"
      ? body.content
      : "";

  const message =
    String(body.message || "").trim();

  const branch =
    String(body.branch || "").trim();

  const expectedSha =
    String(body.sha || "").trim();

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

  if (
    message.length >
    MAX_COMMIT_MESSAGE_LENGTH
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Commit message is too long."
    });
  }

  const contentSize =
    new TextEncoder().encode(
      content
    ).byteLength;

  if (
    contentSize >
    MAX_FILE_SIZE
  ) {
    return response.status(413).json({
      ok: false,
      error:
        "File content is too large. Maximum supported file size is 10 MB."
    });
  }

  try {
    const current =
      await getCurrentFile(
        token,
        owner,
        repo,
        path,
        branch
      );

    if (!current.exists) {
      return response.status(404).json({
        ok: false,
        error:
          "The file does not exist. Use the create-file operation instead."
      });
    }

    if (current.type !== "file") {
      return response.status(400).json({
        ok: false,
        error:
          "The requested path is not a file."
      });
    }

    if (
      current.sha !== expectedSha
    ) {
      return response.status(409).json({
        ok: false,
        error:
          "File changed on GitHub since it was read. Refresh the file and retry.",
        expectedSha,
        currentSha: current.sha
      });
    }

    const githubResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/contents/${path}`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            message,
            content:
              encodeBase64(content),
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
          typeof data.commit?.sha ===
          "string"
            ? data.commit.sha
            : null,
        message:
          typeof data.commit?.message ===
          "string"
            ? data.commit.message
            : message
      },
      file: {
        path:
          typeof data.content?.path ===
          "string"
            ? data.content.path
            : path,
        sha:
          typeof data.content?.sha ===
          "string"
            ? data.content.sha
            : null
      }
    });
  } catch (error) {
    return response.status(
      error.status || 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not update the GitHub file."
    });
  }
    }
async function handleDeleteFile(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const body =
    request.body || {};

  const owner =
    String(body.owner || "").trim();

  const repo =
    String(body.repo || "").trim();

  const path =
    String(body.path || "").trim();

  const message =
    String(body.message || "").trim();

  const branch =
    String(body.branch || "").trim();

  const expectedSha =
    String(body.sha || "").trim();

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

  if (
    message.length >
    MAX_COMMIT_MESSAGE_LENGTH
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Commit message is too long."
    });
  }

  try {
    const current =
      await getCurrentFile(
        token,
        owner,
        repo,
        path,
        branch
      );

    if (!current.exists) {
      return response.status(404).json({
        ok: false,
        error:
          "The file does not exist or has already been deleted."
      });
    }

    if (current.type !== "file") {
      return response.status(400).json({
        ok: false,
        error:
          "The requested path is not a file."
      });
    }

    if (
      current.sha !== expectedSha
    ) {
      return response.status(409).json({
        ok: false,
        error:
          "File changed on GitHub since it was read. Refresh the file and retry.",
        expectedSha,
        currentSha: current.sha
      });
    }

    const githubResponse =
      await githubFetch(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/contents/${path}`,
        token,
        {
          method: "DELETE",
          body: JSON.stringify({
            message,
            sha: expectedSha,
            branch
          })
        }
      );

    if (!githubResponse.ok) {
      throw await githubError(
        githubResponse,
        "Could not delete the GitHub file."
      );
    }

    const data =
      await githubResponse.json();

    return response.status(200).json({
      ok: true,
      operation: "delete",
      owner,
      repo,
      branch,
      path,
      commit: {
        sha:
          typeof data.commit?.sha ===
          "string"
            ? data.commit.sha
            : null,
        message:
          typeof data.commit?.message ===
          "string"
            ? data.commit.message
            : message
      },
      file: {
        path:
          typeof data.content?.path ===
          "string"
            ? data.content.path
            : path,
        deleted: true
      }
    });
  } catch (error) {
    return response.status(
      error.status || 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not delete the GitHub file."
    });
  }
}

async function handleCreateBranch(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const body =
    request.body || {};

  const owner =
    String(body.owner || "").trim();

  const repo =
    String(body.repo || "").trim();

  const branch =
    String(body.branch || "").trim();

  const fromBranch =
    String(
      body.fromBranch || ""
    ).trim();

  const fromSha =
    String(
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
      error:
        "Invalid source commit SHA."
    });
  }

  if (
    fromBranch &&
    !isValidBranchName(fromBranch)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid source branch name."
    });
  }

  try {
    let sourceSha = fromSha;

    if (!sourceSha) {
      const sourceResponse =
        await githubFetch(
          `/repos/${encodeURIComponent(
            owner
          )}/${encodeURIComponent(
            repo
          )}/git/ref/heads/${encodeURIComponent(
            fromBranch
          )}`,
          token
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
        typeof sourceSha !==
          "string" ||
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
        token
      );

    if (existingResponse.ok) {
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
        token,
        {
          method: "POST",
          body: JSON.stringify({
            ref:
              `refs/heads/${branch}`,
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
      typeof createdSha !==
        "string" ||
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
    return response.status(
      error.status || 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not create the GitHub branch."
    });
  }
}

async function handleDeleteBranch(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const body =
    request.body || {};

  const owner =
    String(body.owner || "").trim();

  const repo =
    String(body.repo || "").trim();

  const branch =
    String(body.branch || "").trim();

  if (
    !owner ||
    !repo ||
    !branch
  ) {
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
        )}/${encodeURIComponent(
          repo
        )}`,
        token
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

    if (
      defaultBranch === branch
    ) {
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
        token
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
        token,
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
    return response.status(
      error.status || 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not delete the GitHub branch."
    });
  }
}

async function getCurrentFile(
  token,
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
      token
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

function requireAccessToken(
  request,
  response
) {
  const token =
    getAccessToken(request);

  if (!token) {
    response.status(401).json({
      ok: false,
      error:
        "GitHub is not connected."
    });

    return "";
  }

  return token;
}

function getAccessToken(
  request
) {
  return getCookie(
    request.headers?.cookie || "",
    ACCESS_TOKEN_COOKIE
  );
}

async function githubFetch(
  path,
  accessToken,
  options = {}
) {
  return fetch(
    `${GITHUB_API}${path}`,
    {
      method:
        options.method || "GET",
      headers: {
        Accept:
          "application/vnd.github+json",
        Authorization:
          `Bearer ${accessToken}`,
        "X-GitHub-Api-Version":
          GITHUB_API_VERSION,
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
      message = data.message;
    }
  } catch {
    // Keep fallback.
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

function methodNotAllowed(
  response
) {
  return response.status(405).json({
    ok: false,
    error: "Method not allowed."
  });
}

function getCookie(
  cookieHeader,
  name
) {
  if (!cookieHeader) {
    return "";
  }

  for (
    const part of
      cookieHeader.split(";")
  ) {
    const separator =
      part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key =
      part
        .slice(0, separator)
        .trim();

    if (key !== name) {
      continue;
    }

    const value =
      part
        .slice(separator + 1)
        .trim();

    try {
      return decodeURIComponent(
        value
      );
    } catch {
      return value;
    }
  }

  return "";
}

function serializeCookie(
  name,
  value,
  options = {}
) {
  let cookie =
    `${name}=${encodeURIComponent(
      value
    )}; Path=/`;

  if (options.httpOnly) {
    cookie += "; HttpOnly";
  }

  if (options.secure) {
    cookie += "; Secure";
  }

  if (options.sameSite) {
    cookie +=
      `; SameSite=${options.sameSite}`;
  }

  if (
    Number.isFinite(
      options.maxAge
    )
  ) {
    cookie +=
      `; Max-Age=${Math.floor(
        options.maxAge
      )}`;
  }

  return cookie;
}

function clearCookie(
  response,
  name
) {
  response.setHeader(
    "Set-Cookie",
    serializeCookie(
      name,
      "",
      {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: 0
      }
    )
  );
}

function clearAccessTokenCookie(
  response
) {
  clearCookie(
    response,
    ACCESS_TOKEN_COOKIE
  );
}

function createRandomState() {
  const bytes =
    new Uint8Array(32);

  globalThis.crypto.getRandomValues(
    bytes
  );

  return Array.from(bytes)
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

function timingSafeEqual(
  a,
  b
) {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    a.length !== b.length
  ) {
    return false;
  }

  let result = 0;

  for (
    let index = 0;
    index < a.length;
    index += 1
  ) {
    result |=
      a.charCodeAt(index) ^
      b.charCodeAt(index);
  }

  return result === 0;
}

function isValidGitHubName(
  value
) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 100 &&
    /^[A-Za-z0-9_.-]+$/.test(value)
  );
}

function isValidPath(
  value
) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 1000
  ) {
    return false;
  }

  return !(
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.includes("..")
  );
}

function isValidRef(
  value
) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 255
  ) {
    return false;
  }

  return !(
    value.includes("\0") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes("//") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.includes(" ") ||
    value.includes("~") ||
    value.includes("^") ||
    value.includes(":") ||
    value.includes("?") ||
    value.includes("*") ||
    value.includes("[")
  );
}

function isValidBranchName(
  value
) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 255
  ) {
    return false;
  }

  return !(
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
  );
}

function isValidSha(
  value
) {
  return (
    typeof value === "string" &&
    /^[a-fA-F0-9]{40}$/.test(value)
  );
}

function validateTree(
  tree
) {
  for (const entry of tree) {
    if (
      !entry ||
      typeof entry !== "object"
    ) {
      return (
        "Every tree entry must be an object."
      );
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
        : typeof entry.sha ===
          "string"
          ? entry.sha.trim()
          : "";

    if (!path) {
      return (
        "Every tree entry requires a path."
      );
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
      return (
        `Invalid tree mode for ${path}.`
      );
    }

    if (
      type !== "blob" &&
      type !== "tree" &&
      type !== "commit"
    ) {
      return (
        `Invalid tree type for ${path}.`
      );
    }

    if (
      sha !== null &&
      !isValidSha(sha)
    ) {
      return (
        `Invalid tree SHA for ${path}.`
      );
    }

    if (
      sha === null &&
      type !== "blob"
    ) {
      return (
        `A null SHA is only valid for blob entries: ${path}`
      );
    }
  }

  return "";
}

function encodeBase64(
  value
) {
  const bytes =
    new TextEncoder().encode(
      value
    );

  let binary = "";

  const chunkSize =
    0x8000;

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

function decodeBase64(
  value
) {
  const normalized =
    value.replace(
      /\s+/g,
      ""
    );

  const binary =
    globalThis.atob(
      normalized
    );

  const bytes =
    Uint8Array.from(
      binary,
      (character) =>
        character.charCodeAt(0)
    );

  return new TextDecoder(
    "utf-8",
    {
      fatal: false
    }
  ).decode(bytes);
        }
