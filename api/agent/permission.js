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

function isValidSha(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{40}$/i.test(value)
  );
}

function normalizeOperation(value) {
  if (
    value === "update" ||
    value === "create" ||
    value === "delete"
  ) {
    return value;
  }

  return "";
}

function normalizeChanges(changes) {
  if (!Array.isArray(changes)) {
    return null;
  }

  if (changes.length > 100) {
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

    const operation =
      normalizeOperation(
        change.operation
      );

    const path =
      typeof change.path === "string"
        ? change.path.trim()
        : "";

    if (
      !operation ||
      !isValidPath(path) ||
      seen.has(path)
    ) {
      return null;
    }

    seen.add(path);

    const sha =
      change.sha === null ||
      typeof change.sha === "undefined"
        ? null
        : change.sha;

    if (
      sha !== null &&
      !isValidSha(sha)
    ) {
      return null;
    }

    if (
      operation === "update" &&
      !sha
    ) {
      return null;
    }

    if (
      operation === "delete" &&
      !sha
    ) {
      return null;
    }

    if (
      operation === "create" &&
      sha !== null
    ) {
      return null;
    }

    let content = null;

    if (
      operation === "update" ||
      operation === "create"
    ) {
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

      content = change.content;
    }

    if (
      operation === "delete" &&
      change.content !== null &&
      typeof change.content !==
        "undefined"
    ) {
      return null;
    }

    normalized.push({
      operation,
      path,
      sha,
      content
    });
  }

  return normalized;
}

function normalizePermissionMode(value) {
  if (
    value === "allow_once" ||
    value === "allow_for_task" ||
    value === "deny"
  ) {
    return value;
  }

  return "";
}

function createPermissionId() {
  const bytes =
    new Uint8Array(32);

  globalThis.crypto.getRandomValues(
    bytes
  );

  return Array.from(bytes)
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

async function createSignature(
  secret,
  value
) {
  const encoder =
    new TextEncoder();

  const keyData =
    encoder.encode(secret);

  const messageData =
    encoder.encode(value);

  const key =
    await crypto.subtle.importKey(
      "raw",
      keyData,
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      messageData
    );

  return Array.from(
    new Uint8Array(signature)
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

function buildPermissionPayload({
  id,
  mode,
  owner,
  repo,
  branch,
  changesHash,
  expiresAt
}) {
  return [
    id,
    mode,
    owner,
    repo,
    branch,
    changesHash,
    String(expiresAt)
  ].join("|");
}

async function hashChanges(changes) {
  const canonical =
    JSON.stringify(
      changes
        .map((change) => ({
          operation:
            change.operation,
          path:
            change.path,
          sha:
            change.sha,
          content:
            change.content
        }))
        .sort((a, b) =>
          a.path.localeCompare(
            b.path
          )
        )
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        canonical
      )
    );

  return Array.from(
    new Uint8Array(digest)
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

function getExpiration(mode) {
  const now =
    Date.now();

  if (
    mode === "allow_once"
  ) {
    return now + 5 * 60 * 1000;
  }

  if (
    mode === "allow_for_task"
  ) {
    return now + 60 * 60 * 1000;
  }

  return now;
}

function createPermissionCookie({
  token,
  mode,
  owner,
  repo,
  branch,
  changesHash,
  expiresAt
}) {
  const payload = Buffer.from(
    JSON.stringify({
      token,
      mode,
      owner,
      repo,
      branch,
      changesHash,
      expiresAt
    }),
    "utf8"
  ).toString("base64url");

  return [
    "ld76_agent_permission=" +
      encodeURIComponent(payload),
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${Math.max(
      0,
      Math.floor(
        (expiresAt - Date.now()) /
          1000
      )
    )}`
  ].join("; ");
}

function createDeniedCookie() {
  return [
    "ld76_agent_permission=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
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
      error: "Method not allowed."
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

  const owner = body.owner;
  const repo = body.repo;
  const branch = body.branch;
  const mode =
    normalizePermissionMode(
      body.mode
    );

  if (
    !isValidRepositoryName(owner) ||
    !isValidRepositoryName(repo)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid GitHub repository name."
    });
  }

  if (
    !isValidBranchName(branch)
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid GitHub branch name."
    });
  }

  if (!mode) {
    return response.status(400).json({
      ok: false,
      error:
        "Invalid permission mode. Use allow_once, allow_for_task, or deny."
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
        "Invalid change set."
    });
  }

  const permissionSecret =
    process.env.LD76_AGENT_PERMISSION_SECRET;

  if (!permissionSecret) {
    return response.status(503).json({
      ok: false,
      error:
        "Agent permission secret is not configured. Add LD76_AGENT_PERMISSION_SECRET to the Vercel environment variables."
    });
  }

  const changesHash =
    await hashChanges(changes);

  const permissionId =
    createPermissionId();

  const expiresAt =
    getExpiration(mode);

  const payload =
    buildPermissionPayload({
      id: permissionId,
      mode,
      owner,
      repo,
      branch,
      changesHash,
      expiresAt
    });

  const signature =
    await createSignature(
      permissionSecret,
      payload
    );

  const token =
    `${permissionId}.${signature}`;

  if (mode === "deny") {
    response.setHeader(
      "Set-Cookie",
      createDeniedCookie()
    );

    return response.status(200).json({
      ok: true,
      operation: "permission",
      mode: "deny",
      granted: false,
      repository: {
        owner,
        repo,
        branch
      },
      changesHash
    });
  }

  response.setHeader(
    "Set-Cookie",
    createPermissionCookie({
      token,
      mode,
      owner,
      repo,
      branch,
      changesHash,
      expiresAt
    })
  );

  return response.status(200).json({
    ok: true,
    operation: "permission",
    mode,
    granted: true,
    permissionId,
    repository: {
      owner,
      repo,
      branch
    },
    changesHash,
    expiresAt
  });
      }
