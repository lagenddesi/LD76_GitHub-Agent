function getCookie(request, name) {
  const cookieHeader =
    request.headers?.cookie || "";

  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = part.slice(0, index).trim();

    if (key !== name) {
      continue;
    }

    const value =
      part.slice(index + 1).trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
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

function parsePermissionCookie(request) {
  const raw =
    getCookie(
      request,
      "ld76_agent_permission"
    );

  if (!raw) {
    return null;
  }

  try {
    const decoded =
      Buffer.from(
        raw,
        "base64url"
      ).toString("utf8");

    const data =
      JSON.parse(decoded);

    if (
      !data ||
      typeof data !== "object"
    ) {
      return null;
    }

    return data;
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

function isValidSha(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{40}$/i.test(value)
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

    const operation =
      change.operation;

    if (
      operation !== "update" &&
      operation !== "create" &&
      operation !== "delete"
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

    let sha = null;

    if (
      change.sha !== null &&
      typeof change.sha !== "undefined"
    ) {
      sha = change.sha;

      if (!isValidSha(sha)) {
        return null;
      }
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

async function createSignature(
  secret,
  value
) {
  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
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
      encoder.encode(value)
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

async function verifySignature(
  secret,
  value,
  expectedSignature
) {
  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

  const bytes =
    new Uint8Array(
      expectedSignature.length / 2
    );

  for (
    let index = 0;
    index < bytes.length;
    index++
  ) {
    bytes[index] =
      parseInt(
        expectedSignature.slice(
          index * 2,
          index * 2 + 2
        ),
        16
      );
  }

  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    encoder.encode(value)
  );
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

function parsePermissionToken(
  token
) {
  if (
    typeof token !== "string"
  ) {
    return null;
  }

  const separator =
    token.indexOf(".");

  if (
    separator <= 0 ||
    separator ===
      token.length - 1
  ) {
    return null;
  }

  const id =
    token.slice(
      0,
      separator
    );

  const signature =
    token.slice(
      separator + 1
    );

  if (
    !/^[a-f0-9]{64}$/i.test(id) ||
    !/^[a-f0-9]{64}$/i.test(
      signature
    )
  ) {
    return null;
  }

  return {
    id,
    signature
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

  error.status = status;

  return error;
}

function clearPermissionCookie(
  response
) {
  response.setHeader(
    "Set-Cookie",
    "ld76_agent_permission=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );
}

function clearAccessTokenCookie(
  response
) {
  response.setHeader(
    "Set-Cookie",
    "ld76_github_access_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );
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

  const owner =
    typeof body.owner === "string"
      ? body.owner.trim()
      : "";

  const repo =
    typeof body.repo === "string"
      ? body.repo.trim()
      : "";

  const branch =
    typeof body.branch === "string"
      ? body.branch.trim()
      : "";

  const message =
    typeof body.message === "string"
      ? body.message.trim()
      : "";

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

  if (
    !message ||
    message.length > 500
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "A valid commit message is required."
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

  const permissionSecret =
    process.env
      .LD76_AGENT_PERMISSION_SECRET;

  if (!permissionSecret) {
    return response.status(503).json({
      ok: false,
      error:
        "Agent permission secret is not configured."
    });
  }

  const permission =
    parsePermissionCookie(
      request
    );

  const permissionToken =
    parsePermissionToken(
      permission?.token
    );

  if (
    !permission ||
    !permissionToken
  ) {
    return response.status(403).json({
      ok: false,
      error:
        "No valid agent permission is available."
    });
  }

  if (
    permission.expiresAt <=
    Date.now()
  ) {
    clearPermissionCookie(
      response
    );

    return response.status(403).json({
      ok: false,
      error:
        "Agent permission has expired."
    });
  }

  if (
    permission.owner !== owner ||
    permission.repo !== repo ||
    permission.branch !== branch
  ) {
    return response.status(403).json({
      ok: false,
      error:
        "Agent permission does not match the selected repository or branch."
    });
  }

  if (
    permission.mode !==
      "allow_once" &&
    permission.mode !==
      "allow_for_task"
  ) {
    return response.status(403).json({
      ok: false,
      error:
        "Agent permission does not allow writing."
    });
  }

  const changesHash =
    await hashChanges(changes);

  if (
    changesHash !==
    permission.changesHash
  ) {
    return response.status(403).json({
      ok: false,
      error:
        "The approved change set does not match the requested change set."
    });
  }

  const permissionPayload =
    buildPermissionPayload({
      id:
        permissionToken.id,
      mode:
        permission.mode,
      owner,
      repo,
      branch,
      changesHash,
      expiresAt:
        permission.expiresAt
    });

  const expectedSignature =
    await createSignature(
      permissionSecret,
      permissionPayload
    );

  const validSignature =
    await verifySignature(
      permissionSecret,
      permissionPayload,
      permissionToken.signature
    );

  if (
    !validSignature ||
    expectedSignature !==
      permissionToken.signature
  ) {
    clearPermissionCookie(
      response
    );

    return response.status(403).json({
      ok: false,
      error:
        "Agent permission signature is invalid."
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
        "Could not read the GitHub branch."
      );
    }

    const refData =
      await refResponse.json();

    const currentHeadSha =
      refData?.object?.sha;

    if (
      !isValidSha(
        currentHeadSha
      )
    ) {
      throw createError(
        502,
        "GitHub did not return a valid branch commit."
      );
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
        "Could not read the current commit."
      );
    }

    const commitData =
      await commitResponse.json();

    const baseTreeSha =
      commitData?.tree?.sha;

    if (
      !isValidSha(
        baseTreeSha
      )
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
        )}/git/trees/${encodeURIComponent(
          baseTreeSha
        )}?recursive=1`,
        accessToken
      );

    if (!treeResponse.ok) {
      throw await githubError(
        treeResponse,
        "Could not read the current repository tree."
      );
    }

    const treeData =
      await treeResponse.json();

    const currentFiles =
      new Map();

    if (
      Array.isArray(
        treeData?.tree
      )
    ) {
      for (
        const entry of treeData.tree
      ) {
        if (
          entry?.type === "blob" &&
          typeof entry.path ===
            "string" &&
          isValidSha(entry.sha)
        ) {
          currentFiles.set(
            entry.path,
            entry.sha
          );
        }
      }
    }

    for (
      const change of changes
    ) {
      const currentSha =
        currentFiles.get(
          change.path
        ) || null;

      if (
        change.operation ===
          "create"
      ) {
        if (currentSha) {
          return response.status(409).json({
            ok: false,
            error:
              `Cannot create ${change.path}: file already exists.`
          });
        }

        continue;
      }

      if (
        !currentSha ||
        currentSha !== change.sha
      ) {
        return response.status(409).json({
          ok: false,
          error:
            `File changed since the agent inspected it: ${change.path}. Refresh and generate the changes again.`
        });
      }
    }

    const treeEntries = [];

    for (
      const change of changes
    ) {
      if (
        change.operation ===
          "delete"
      ) {
        treeEntries.push({
          path:
            change.path,
          mode: "100644",
          type: "blob",
          sha: null
        });

        continue;
      }

      const blobResponse =
        await githubFetch(
          `/repos/${encodeURIComponent(
            owner
          )}/${encodeURIComponent(
            repo
          )}/git/blobs`,
          accessToken,
          {
            method: "POST",
            body: JSON.stringify({
              content:
                change.content,
              encoding: "utf-8"
            })
          }
        );

      if (!blobResponse.ok) {
        throw await githubError(
          blobResponse,
          `Could not create Git blob for ${change.path}.`
        );
      }

      const blobData =
        await blobResponse.json();

      if (
        !isValidSha(
          blobData?.sha
        )
      ) {
        throw createError(
          502,
          `GitHub did not return a valid blob SHA for ${change.path}.`
        );
      }

      treeEntries.push({
        path:
          change.path,
        mode: "100644",
        type: "blob",
        sha:
          blobData.sha
      });
    }

    const treeCreateResponse =
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
            base_tree:
              baseTreeSha,
            tree:
              treeEntries
          })
        }
      );

    if (
      !treeCreateResponse.ok
    ) {
      throw await githubError(
        treeCreateResponse,
        "Could not create the GitHub tree."
      );
    }

    const newTree =
      await treeCreateResponse.json();

    if (
      !isValidSha(
        newTree?.sha
      )
    ) {
      throw createError(
        502,
        "GitHub did not return a valid new tree SHA."
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
            tree:
              newTree.sha,
            parents: [
              currentHeadSha
            ]
          })
        }
      );

    if (
      !createCommitResponse.ok
    ) {
      throw await githubError(
        createCommitResponse,
        "Could not create the GitHub commit."
      );
    }

    const createdCommit =
      await createCommitResponse.json();

    if (
      !isValidSha(
        createdCommit?.sha
      )
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
            sha:
              createdCommit.sha,
            force: false
          })
        }
      );

    if (
      !updateRefResponse.ok
    ) {
      throw await githubError(
        updateRefResponse,
        "The commit was created, but GitHub could not move the branch reference."
      );
    }

    if (
      permission.mode ===
      "allow_once"
    ) {
      clearPermissionCookie(
        response
      );
    }

    return response.status(200).json({
      ok: true,
      operation: "agent-apply",
      owner,
      repo,
      branch,
      commit: {
        sha:
          createdCommit.sha,
        parentSha:
          currentHeadSha,
        treeSha:
          newTree.sha,
        message,
        changedFiles:
          changes.map(
            (change) => ({
              operation:
                change.operation,
              path:
                change.path
            })
          )
      }
    });
  } catch (error) {
    console.error(
      "Agent apply failed:",
      error
    );

    if (
      error.status === 401
    ) {
      clearAccessTokenCookie(
        response
      );

      return response.status(401).json({
        ok: false,
        error:
          "GitHub authorization has expired or is invalid. Please reconnect GitHub."
      });
    }

    if (
      error.status === 404
    ) {
      return response.status(404).json({
        ok: false,
        error:
          "Repository, branch, commit, or Git object was not found."
      });
    }

    if (
      error.status === 409
    ) {
      return response.status(409).json({
        ok: false,
        error:
          error.message ||
          "Repository changed before the agent could apply the changes."
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
        "Could not apply the agent changes."
    });
  }
            }
