const ACCESS_TOKEN_COOKIE =
  "ld76_github_access_token";

const OAUTH_STATE_COOKIE =
  "ld76_github_oauth_state";

const GITHUB_API =
  "https://api.github.com";

const GITHUB_API_VERSION =
  "2022-11-28";

export async function handleGitHubRoute(
  request,
  response,
  route = []
) {
  const path =
    Array.isArray(route)
      ? route.filter(Boolean)
      : [];

  const action =
    path.join("/");

  try {
    switch (action) {
      case "login":
        return handleLogin(
          request,
          response
        );

      case "callback":
        return handleCallback(
          request,
          response
        );

      case "logout":
        return handleLogout(
          request,
          response
        );

      case "status":
        return handleStatus(
          request,
          response
        );

      case "repos":
        return handleRepositories(
          request,
          response
        );

      case "branches":
        return handleBranches(
          request,
          response
        );

      case "file":
        return handleFile(
          request,
          response
        );

      case "tree":
        return handleTree(
          request,
          response
        );

      case "commit":
        return handleCommit(
          request,
          response
        );

      case "create-file":
        return handleCreateFile(
          request,
          response
        );

      case "update-file":
        return handleUpdateFile(
          request,
          response
        );

      case "delete-file":
        return handleDeleteFile(
          request,
          response
        );

      case "create-branch":
        return handleCreateBranch(
          request,
          response
        );

      case "delete-branch":
        return handleDeleteBranch(
          request,
          response
        );

      default:
        return sendJson(
          response,
          404,
          {
            ok: false,
            error:
              "GitHub route not found."
          }
        );
    }
  } catch (error) {
    console.error(
      "GitHub route failed:",
      error
    );

    return sendJson(
      response,
      500,
      {
        ok: false,
        error:
          "GitHub operation failed."
      }
    );
  }
}

function handleLogin(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(
      response
    );
  }

  const clientId =
    process.env.LD76_GITHUB_CLIENT_ID;

  const redirectUri =
    process.env.LD76_GITHUB_REDIRECT_URI;

  if (!clientId) {
    return sendJson(
      response,
      503,
      {
        ok: false,
        error:
          "GitHub OAuth client ID is not configured."
      }
    );
  }

  if (!redirectUri) {
    return sendJson(
      response,
      503,
      {
        ok: false,
        error:
          "GitHub OAuth redirect URI is not configured."
      }
    );
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
    `${OAUTH_STATE_COOKIE}=${encodeURIComponent(
      state
    )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
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
    return methodNotAllowed(
      response
    );
  }

  const clientId =
    process.env.LD76_GITHUB_CLIENT_ID;

  const clientSecret =
    process.env.LD76_GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return sendJson(
      response,
      503,
      {
        ok: false,
        error:
          "GitHub OAuth credentials are not configured."
      }
    );
  }

  const code =
    typeof request.query?.code ===
    "string"
      ? request.query.code
      : "";

  const returnedState =
    typeof request.query?.state ===
    "string"
      ? request.query.state
      : "";

  const oauthError =
    typeof request.query?.error ===
    "string"
      ? request.query.error
      : "";

  if (oauthError) {
    return sendJson(
      response,
      400,
      {
        ok: false,
        error:
          "GitHub authorization was cancelled or denied."
      }
    );
  }

  if (!code || !returnedState) {
    return sendJson(
      response,
      400,
      {
        ok: false,
        error:
          "GitHub OAuth callback is missing the authorization code or state."
      }
    );
  }

  const cookies =
    parseCookies(
      request.headers.cookie || ""
    );

  const expectedState =
    cookies[OAUTH_STATE_COOKIE] ||
    "";

  if (
    !expectedState ||
    !timingSafeEqual(
      expectedState,
      returnedState
    )
  ) {
    return sendJson(
      response,
      400,
      {
        ok: false,
        error:
          "GitHub OAuth state validation failed."
      }
    );
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
          client_secret:
            clientSecret,
          code
        })
      }
    );

  const tokenData =
    await tokenResponse.json();

  if (
    !tokenResponse.ok ||
    !tokenData?.access_token
  ) {
    console.error(
      "GitHub OAuth token exchange failed:",
      tokenData
    );

    return sendJson(
      response,
      502,
      {
        ok: false,
        error:
          "GitHub access token could not be obtained."
      }
    );
  }

  response.setHeader(
    "Set-Cookie",
    [
      `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(
        tokenData.access_token
      )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
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
    return methodNotAllowed(
      response
    );
  }

  response.setHeader(
    "Set-Cookie",
    [
      `${ACCESS_TOKEN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
    ]
  );

  return sendJson(
    response,
    200,
    {
      ok: true,
      connected: false
    }
  );
}

async function handleStatus(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(
      response
    );
  }

  const token =
    getAccessToken(request);

  if (!token) {
    return sendJson(
      response,
      200,
      {
        ok: true,
        connected: false
      }
    );
  }

  const result =
    await githubRequest(
      "/user",
      {
        method: "GET",
        token
      }
    );

  if (result.status === 401) {
    return sendJson(
      response,
      200,
      {
        ok: true,
        connected: false
      }
    );
  }

  if (!result.ok) {
    return sendJson(
      response,
      502,
      {
        ok: false,
        error:
          "Could not verify the GitHub connection."
      }
    );
  }

  const user =
    result.data;

  return sendJson(
    response,
    200,
    {
      ok: true,
      connected: true,
      user: {
        login:
          typeof user.login ===
          "string"
            ? user.login
            : "",
        name:
          typeof user.name ===
          "string"
            ? user.name
            : null,
        avatarUrl:
          typeof user.avatar_url ===
          "string"
            ? user.avatar_url
            : null
      }
    }
  );
}

async function handleRepositories(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(
      response
    );
  }

  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const repositories = [];

  for (
    let page = 1;
    page <= 10;
    page += 1
  ) {
    const result =
      await githubRequest(
        `/user/repos?per_page=100&page=${page}&sort=updated`,
        {
          method: "GET",
          token
        }
      );

    if (!result.ok) {
      return sendGitHubError(
        response,
        result
      );
    }

    if (
      !Array.isArray(
        result.data
      )
    ) {
      return sendJson(
        response,
        502,
        {
          ok: false,
          error:
            "GitHub returned an unexpected repository response."
        }
      );
    }

    repositories.push(
      ...result.data
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
              repository.name,
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

    if (
      result.data.length < 100
    ) {
      break;
    }
  }

  return sendJson(
    response,
    200,
    {
      ok: true,
      repositories
    }
  );
}

async function handleBranches(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(
      response
    );
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
      request.query?.owner ||
        ""
    ).trim();

  const repo =
    String(
      request.query?.repo ||
        ""
    ).trim();

  if (
    !isValidName(owner) ||
    !isValidName(repo)
  ) {
    return sendJson(
      response,
      400,
      {
        ok: false,
        error:
          "A valid GitHub repository owner and name are required."
      }
    );
  }

  const branches = [];

  for (
    let page = 1;
    page <= 10;
    page += 1
  ) {
    const result =
      await githubRequest(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/branches?per_page=100&page=${page}`,
        {
          method: "GET",
          token
        }
      );

    if (!result.ok) {
      return sendGitHubError(
        response,
        result
      );
    }

    if (
      !Array.isArray(
        result.data
      )
    ) {
      return sendJson(
        response,
        502,
        {
          ok: false,
          error:
            "GitHub returned an unexpected branch response."
        }
      );
    }

    branches.push(
      ...result.data
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

    if (
      result.data.length < 100
    ) {
      break;
    }
  }

  return sendJson(
    response,
    200,
    {
      ok: true,
      owner,
      repo,
      branches
    }
  );
}

async function handleFile(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(
      response
    );
  }

  return proxyRepositoryRead(
    request,
    response,
    "file"
  );
}

async function handleTree(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(
      response
    );
  }

  return proxyRepositoryRead(
    request,
    response,
    "tree"
  );
}

async function handleCommit(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(
      response
    );
  }

  return proxyRepositoryWrite(
    request,
    response,
    "commit"
  );
}

async function handleCreateFile(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(
      response
    );
  }

  return proxyRepositoryWrite(
    request,
    response,
    "create-file"
  );
}

async function handleUpdateFile(
  request,
  response
) {
  if (
    request.method !== "PUT" &&
    request.method !== "PATCH" &&
    request.method !== "POST"
  ) {
    return methodNotAllowed(
      response
    );
  }

  return proxyRepositoryWrite(
    request,
    response,
    "update-file"
  );
}

async function handleDeleteFile(
  request,
  response
) {
  if (request.method !== "DELETE") {
    return methodNotAllowed(
      response
    );
  }

  return proxyRepositoryWrite(
    request,
    response,
    "delete-file"
  );
}

async function handleCreateBranch(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(
      response
    );
  }

  return proxyRepositoryWrite(
    request,
    response,
    "create-branch"
  );
}

async function handleDeleteBranch(
  request,
  response
) {
  if (request.method !== "DELETE") {
    return methodNotAllowed(
      response
    );
  }

  return proxyRepositoryWrite(
    request,
    response,
    "delete-branch"
  );
}

async function proxyRepositoryRead(
  request,
  response,
  operation
) {
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
      request.query?.owner ||
        ""
    ).trim();

  const repo =
    String(
      request.query?.repo ||
        ""
    ).trim();

  if (
    !isValidName(owner) ||
    !isValidName(repo)
  ) {
    return sendJson(
      response,
      400,
      {
        ok: false,
        error:
          "A valid repository owner and name are required."
      }
    );
  }

  let endpoint =
    `/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repo
    )}`;

  if (operation === "tree") {
    endpoint += "/git/trees/";

    endpoint += encodeURIComponent(
      String(
        request.query?.sha ||
          request.query?.branch ||
          "HEAD"
      )
    );

    endpoint += "?recursive=1";
  }

  if (operation === "file") {
    const path =
      String(
        request.query?.path ||
          ""
      ).trim();

    const ref =
      String(
        request.query?.ref ||
          request.query?.branch ||
          ""
      ).trim();

    if (!path) {
      return sendJson(
        response,
        400,
        {
          ok: false,
          error:
            "A repository file path is required."
        }
      );
    }

    endpoint +=
      `/contents/${path
        .split("/")
        .map(
          encodeURIComponent
        )
        .join("/")}`;

    if (ref) {
      endpoint +=
        `?ref=${encodeURIComponent(
          ref
        )}`;
    }
  }

  const result =
    await githubRequest(
      endpoint,
      {
        method: "GET",
        token
      }
    );

  if (!result.ok) {
    return sendGitHubError(
      response,
      result
    );
  }

  return sendJson(
    response,
    200,
    {
      ok: true,
      operation,
      data: result.data
    }
  );
}

async function proxyRepositoryWrite(
  request,
  response,
  operation
) {
  const token =
    requireAccessToken(
      request,
      response
    );

  if (!token) {
    return;
  }

  const body =
    await readRequestBody(
      request
    );

  if (!body) {
    return sendJson(
      response,
      400,
      {
        ok: false,
        error:
          "A JSON request body is required."
      }
    );
  }

  const owner =
    String(
      body.owner ||
        request.query?.owner ||
        ""
    ).trim();

  const repo =
    String(
      body.repo ||
        request.query?.repo ||
        ""
    ).trim();

  if (
    !isValidName(owner) ||
    !isValidName(repo)
  ) {
    return sendJson(
      response,
      400,
      {
        ok: false,
        error:
          "A valid repository owner and name are required."
      }
    );
  }

  const result =
    await performRepositoryWrite(
      operation,
      owner,
      repo,
      body,
      token
    );

  if (!result.ok) {
    return sendGitHubError(
      response,
      result
    );
  }

  return sendJson(
    response,
    200,
    {
      ok: true,
      operation,
      data: result.data
    }
  );
}

async function performRepositoryWrite(
  operation,
  owner,
  repo,
  body,
  token
) {
  let endpoint =
    `/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repo
    )}`;

  let method = "POST";
  let payload = body;

  if (
    operation === "create-file"
  ) {
    endpoint +=
      `/contents/${encodePath(
        body.path
      )}`;

    method = "PUT";

    payload = {
      message:
        body.message,
      content:
        body.content,
      branch:
        body.branch,
      committer:
        body.committer,
      author:
        body.author
    };
  }

  if (
    operation === "update-file"
  ) {
    endpoint +=
      `/contents/${encodePath(
        body.path
      )}`;

    method = "PUT";

    payload = {
      message:
        body.message,
      content:
        body.content,
      sha:
        body.sha,
      branch:
        body.branch,
      committer:
        body.committer,
      author:
        body.author
    };
  }

  if (
    operation === "delete-file"
  ) {
    endpoint +=
      `/contents/${encodePath(
        body.path
      )}`;

    method = "DELETE";

    payload = {
      message:
        body.message,
      sha:
        body.sha,
      branch:
        body.branch
    };
  }

  if (
    operation === "create-branch"
  ) {
    const branch =
      String(
        body.branch ||
          body.name ||
          ""
      ).trim();

    const from =
      String(
        body.from ||
          body.sha ||
          ""
      ).trim();

    if (!branch || !from) {
      return {
        ok: false,
        status: 400,
        data: {
          error:
            "Branch name and source SHA are required."
        }
      };
    }

    const refResult =
      await githubRequest(
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/git/ref/heads/${encodeURIComponent(
          from
        )}`,
        {
          method: "GET",
          token
        }
      );

    if (!refResult.ok) {
      return refResult;
    }

    endpoint =
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/git/refs`;

    method = "POST";

    payload = {
      ref:
        `refs/heads/${branch}`,
      sha:
        refResult.data?.object?.sha ||
        from
    };
  }

  if (
    operation === "delete-branch"
  ) {
    const branch =
      String(
        body.branch ||
          body.name ||
          ""
      ).trim();

    if (!branch) {
      return {
        ok: false,
        status: 400,
        data: {
          error:
            "Branch name is required."
        }
      };
    }

    endpoint =
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/git/refs/heads/${encodeURIComponent(
        branch
      )}`;

    method = "DELETE";

    payload = undefined;
  }

  if (
    operation === "commit"
  ) {
    endpoint +=
      "/git/commits";

    method = "POST";
  }

  return githubRequest(
    endpoint,
    {
      method,
      token,
      body: payload
    }
  );
}

async function githubRequest(
  endpoint,
  options = {}
) {
  const headers = {
    Accept:
      "application/vnd.github+json",
    "X-GitHub-Api-Version":
      GITHUB_API_VERSION
  };

  if (options.token) {
    headers.Authorization =
      `Bearer ${options.token}`;
  }

  if (
    options.body !== undefined
  ) {
    headers["Content-Type"] =
      "application/json";
  }

  const response =
    await fetch(
      endpoint.startsWith("http")
        ? endpoint
        : `${GITHUB_API}${endpoint}`,
      {
        method:
          options.method || "GET",
        headers,
        body:
          options.body !== undefined
            ? JSON.stringify(
                cleanObject(
                  options.body
                )
              )
            : undefined
      }
    );

  const data =
    await readResponseJson(
      response
    );

  return {
    ok:
      response.ok,
    status:
      response.status,
    data
  };
}

function requireAccessToken(
  request,
  response
) {
  const token =
    getAccessToken(request);

  if (!token) {
    sendJson(
      response,
      401,
      {
        ok: false,
        error:
          "GitHub is not connected."
      }
    );

    return "";
  }

  return token;
}

function getAccessToken(
  request
) {
  const cookies =
    parseCookies(
      request.headers.cookie || ""
    );

  return (
    cookies[ACCESS_TOKEN_COOKIE] ||
    ""
  );
}

function parseCookies(
  cookieHeader
) {
  const cookies = {};

  for (
    const part of cookieHeader.split(
      ";"
    )
  ) {
    const separator =
      part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const name =
      part
        .slice(0, separator)
        .trim();

    const value =
      part
        .slice(separator + 1)
        .trim();

    if (!name) {
      continue;
    }

    try {
      cookies[name] =
        decodeURIComponent(
          value
        );
    } catch {
      cookies[name] =
        value;
    }
  }

  return cookies;
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
  left,
  right
) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    left.length !== right.length
  ) {
    return false;
  }

  let result = 0;

  for (
    let index = 0;
    index < left.length;
    index += 1
  ) {
    result |=
      left.charCodeAt(index) ^
      right.charCodeAt(index);
  }

  return result === 0;
}

function isValidName(
  value
) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 100 &&
    /^[A-Za-z0-9_.-]+$/.test(
      value
    )
  );
}

function encodePath(
  value
) {
  return String(
    value || ""
  )
    .split("/")
    .map(
      encodeURIComponent
    )
    .join("/");
}

async function readRequestBody(
  request
) {
  if (
    request.body &&
    typeof request.body ===
      "object"
  ) {
    return request.body;
  }

  if (
    typeof request.body ===
      "string"
  ) {
    try {
      return JSON.parse(
        request.body
      );
    } catch {
      return null;
    }
  }

  return {};
}

async function readResponseJson(
  response
) {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(
      text
    );
  } catch {
    return {
      raw:
        text
    };
  }
}

function cleanObject(
  value
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(value)
  ) {
    return value;
  }

  const result = {};

  for (
    const [
      key,
      item
    ] of Object.entries(value)
  ) {
    if (
      item === undefined ||
      item === null
    ) {
      continue;
    }

    result[key] =
      typeof item ===
        "object" &&
      !Array.isArray(item)
        ? cleanObject(item)
        : item;
  }

  return result;
}

function sendGitHubError(
  response,
  result
) {
  let status =
    result.status || 502;

  if (
    status >= 400 &&
    status < 500
  ) {
    return sendJson(
      response,
      status,
      {
        ok: false,
        error:
          getGitHubErrorMessage(
            result
          )
      }
    );
  }

  return sendJson(
    response,
    502,
    {
      ok: false,
      error:
        "GitHub request failed."
    }
  );
}

function getGitHubErrorMessage(
  result
) {
  if (
    typeof result.data?.message ===
    "string"
  ) {
    return result.data.message;
  }

  if (
    result.status === 401
  ) {
    return "GitHub authentication has expired. Please connect GitHub again.";
  }

  if (
    result.status === 404
  ) {
    return "Repository or requested GitHub resource was not found.";
  }

  return "GitHub request failed.";
}

function methodNotAllowed(
  response
) {
  return sendJson(
    response,
    405,
    {
      ok: false,
      error:
        "Method not allowed."
    }
  );
}

function sendJson(
  response,
  status,
  data
) {
  return response
    .status(status)
    .json(data);
}
