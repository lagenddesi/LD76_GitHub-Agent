const GITHUB_API =
  "https://api.github.com";

const GITHUB_API_VERSION =
  "2022-11-28";

const ACCESS_TOKEN_COOKIE =
  "ld76_github_access_token";

const PERMISSION_COOKIE =
  "ld76_agent_permission";

const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta";

const MAX_CHANGES = 100;
const MAX_FILE_SIZE = 500000;
const MAX_CONTEXT_FILES = 30;

export async function handleAgentRoute(
  request,
  response,
  route = []
) {
  const path = route.join("/");

  try {
    if (path === "plan") {
      return handlePlan(request, response);
    }

    if (path === "changes") {
      return handleChanges(request, response);
    }

    if (path === "permission") {
      return handlePermission(request, response);
    }

    if (path === "apply") {
      return handleApply(request, response);
    }

    if (path === "verify") {
      return handleVerify(request, response);
    }

    if (path === "chat") {
      return handleChat(request, response);
    }

    return response.status(404).json({
      ok: false,
      error: "Agent API route not found."
    });
  } catch (error) {
    console.error("Agent route error:", error);

    return response.status(
      Number.isInteger(error?.status) &&
      error.status >= 400 &&
      error.status < 600
        ? error.status
        : 500
    ).json({
      ok: false,
      error:
        error?.message ||
        "Agent request failed."
    });
  }
}

/* =========================================================
   PLAN
========================================================= */

async function handlePlan(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const body = parseBody(request);

  if (!body) {
    return badRequest(
      response,
      "Request body must be valid JSON."
    );
  }

  const context =
    validateRepositoryContext(body);

  if (!context.ok) {
    return badRequest(
      response,
      context.error
    );
  }

  const message =
    cleanString(body.message);

  if (
    !message ||
    message.length > 5000
  ) {
    return badRequest(
      response,
      "A valid user request is required."
    );
  }

  const accessToken =
    getAccessToken(request);

  if (!accessToken) {
    return unauthorized(
      response,
      "GitHub is not connected."
    );
  }

  const tree =
    await loadRepositoryTree(
      accessToken,
      context.owner,
      context.repo,
      context.branch
    );

  if (
    isReadOnlyInspectionRequest(
      message
    )
  ) {
    const files =
      await loadRelevantFiles(
        accessToken,
        context.owner,
        context.repo,
        context.branch,
        tree,
        MAX_CONTEXT_FILES
      );

    const answer =
      await generateInspectionAnswer({
        message,
        context,
        tree,
        files
      });

    return response.status(200).json({
      ok: true,
      operation: "inspect",
      requiresWrite: false,
      changes: [],
      plan: {
        summary:
          "Repository inspection completed.",
        analysis: answer,
        changes: [],
        verification: [
          "No repository changes were requested.",
          "No GitHub write operation was performed."
        ],
        risk: "none"
      }
    });
  }

  const files =
    await loadRelevantFiles(
      accessToken,
      context.owner,
      context.repo,
      context.branch,
      tree,
      25
    );

  const apiKey =
    process.env.LD76_GEMINI_API_KEY;

  if (!apiKey) {
    return response.status(503).json({
      ok: false,
      error:
        "Gemini API key is not configured."
    });
  }

  const model =
    await chooseGeminiModel(
      apiKey,
      body.model
    );

  const generated =
    await generateGeminiJson({
      apiKey,
      model,
      prompt:
        buildPlanPrompt({
          message,
          context,
          tree,
          files
        })
    });

  const plan =
    normalizePlan(generated);

  const validatedPlan =
    validatePlanAgainstTree(
      plan,
      tree
    );

  return response.status(200).json({
    ok: true,
    operation: "plan",
    requiresWrite:
      validatedPlan.changes.length > 0,
    changes:
      validatedPlan.changes,
    plan: validatedPlan
  });
}

/* =========================================================
   CHANGES
========================================================= */

async function handleChanges(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const body = parseBody(request);

  if (!body) {
    return badRequest(
      response,
      "Request body must be valid JSON."
    );
  }

  const context =
    validateRepositoryContext(body);

  if (!context.ok) {
    return badRequest(
      response,
      context.error
    );
  }

  const message =
    cleanString(body.message);

  if (!message || message.length > 5000) {
    return badRequest(
      response,
      "A valid user request is required."
    );
  }

  if (
    !body.plan ||
    typeof body.plan !== "object"
  ) {
    return badRequest(
      response,
      "A valid agent plan is required."
    );
  }

  const accessToken =
    getAccessToken(request);

  if (!accessToken) {
    return unauthorized(
      response,
      "GitHub is not connected."
    );
  }

  const tree =
    await loadRepositoryTree(
      accessToken,
      context.owner,
      context.repo,
      context.branch
    );

  const plan =
    validatePlanAgainstTree(
      normalizePlan(body.plan),
      tree
    );

  if (plan.changes.length === 0) {
    return response.status(200).json({
      ok: true,
      operation: "changes",
      model: null,
      summary:
        plan.summary ||
        "No repository changes are required.",
      changes: [],
      verification:
        plan.verification
    });
  }

  /*
   * Critical safety rule:
   * Read every existing file explicitly named by the plan.
   * Do not rely only on the top-N relevant files.
   */
  const exactFiles =
    await loadPlannedFiles(
      accessToken,
      context.owner,
      context.repo,
      context.branch,
      tree,
      plan.changes
    );

  const relevantFiles =
    await loadRelevantFiles(
      accessToken,
      context.owner,
      context.repo,
      context.branch,
      tree,
      30
    );

  const files =
    mergeFiles(
      exactFiles,
      relevantFiles
    );

  const apiKey =
    process.env.LD76_GEMINI_API_KEY;

  if (!apiKey) {
    return response.status(503).json({
      ok: false,
      error:
        "Gemini API key is not configured."
    });
  }

  const model =
    await chooseGeminiModel(
      apiKey,
      body.model
    );

  const generated =
    await generateGeminiJson({
      apiKey,
      model,
      prompt:
        buildChangesPrompt({
          message,
          context,
          plan,
          tree,
          files
        })
    });

  const changes =
    validateChanges(
      generated?.changes,
      tree,
      plan.changes
    );

  return response.status(200).json({
    ok: true,
    operation: "changes",
    model,
    summary:
      typeof generated?.summary === "string"
        ? generated.summary
        : "Changes generated.",
    changes,
    verification:
      Array.isArray(
        generated?.verification
      )
        ? generated.verification
        : []
  });
}

/* =========================================================
   PERMISSION
========================================================= */

async function handlePermission(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const body = parseBody(request);

  if (!body) {
    return badRequest(
      response,
      "Request body must be valid JSON."
    );
  }

  const context =
    validateRepositoryContext(body);

  if (!context.ok) {
    return badRequest(
      response,
      context.error
    );
  }

  const mode =
    normalizePermissionMode(body.mode);

  if (!mode) {
    return badRequest(
      response,
      "Invalid permission mode."
    );
  }

  const changes =
    normalizeChanges(body.changes);

  if (!changes) {
    return badRequest(
      response,
      "Invalid change set."
    );
  }

  if (
    mode !== "deny" &&
    changes.length === 0
  ) {
    return badRequest(
      response,
      "Permission cannot be granted for an empty change set."
    );
  }

  const accessToken =
    getAccessToken(request);

  if (!accessToken) {
    return unauthorized(
      response,
      "GitHub is not connected."
    );
  }

  const secret =
    process.env.LD76_AGENT_PERMISSION_SECRET;

  if (!secret) {
    return response.status(503).json({
      ok: false,
      error:
        "Agent permission secret is not configured. Add LD76_AGENT_PERMISSION_SECRET to the Vercel environment variables."
    });
  }

  const changesHash =
    await hashChanges(changes);

  if (mode === "deny") {
    response.setHeader(
      "Set-Cookie",
      createExpiredPermissionCookie()
    );

    return response.status(200).json({
      ok: true,
      operation: "permission",
      mode,
      granted: false,
      repository: {
        owner: context.owner,
        repo: context.repo,
        branch: context.branch
      },
      changesHash
    });
  }

  const id =
    createPermissionId();

  const expiresAt =
    getPermissionExpiration(mode);

  const payload =
    buildPermissionPayload({
      id,
      mode,
      owner: context.owner,
      repo: context.repo,
      branch: context.branch,
      changesHash,
      expiresAt
    });

  const signature =
    await createSignature(
      secret,
      payload
    );

  const token =
    `${id}.${signature}`;

  response.setHeader(
    "Set-Cookie",
    createPermissionCookie({
      token,
      mode,
      owner: context.owner,
      repo: context.repo,
      branch: context.branch,
      changesHash,
      expiresAt
    })
  );

  return response.status(200).json({
    ok: true,
    operation: "permission",
    mode,
    granted: true,
    permissionId: id,
    repository: {
      owner: context.owner,
      repo: context.repo,
      branch: context.branch
    },
    changesHash,
    expiresAt
  });
}

/* =========================================================
   APPLY
========================================================= */

async function handleApply(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const body = parseBody(request);

  if (!body) {
    return badRequest(
      response,
      "Request body must be valid JSON."
    );
  }

  const context =
    validateRepositoryContext(body);

  if (!context.ok) {
    return badRequest(
      response,
      context.error
    );
  }

  const message =
    cleanString(body.message);

  if (
    !message ||
    message.length > 500
  ) {
    return badRequest(
      response,
      "A valid commit message is required."
    );
  }

  const changes =
    normalizeChanges(body.changes);

  if (
    !changes ||
    changes.length === 0
  ) {
    return badRequest(
      response,
      "Invalid or empty change set."
    );
  }

  const accessToken =
    getAccessToken(request);

  if (!accessToken) {
    return unauthorized(
      response,
      "GitHub is not connected."
    );
  }

  const permission =
    await validatePermission(
      request,
      context,
      changes
    );

  if (!permission.ok) {
    if (permission.expired) {
      clearPermissionCookie(response);
    }

    return response.status(
      permission.status
    ).json({
      ok: false,
      error: permission.error
    });
  }

  /*
   * Critical preflight:
   * Permission approval is based on a specific repository state.
   * Re-read the branch immediately before writing.
   */
  const preflight =
    await preflightChanges({
      accessToken,
      owner: context.owner,
      repo: context.repo,
      branch: context.branch,
      changes
    });

  const commit =
    await applyGitDataCommit({
      accessToken,
      owner: context.owner,
      repo: context.repo,
      branch: context.branch,
      headSha: preflight.headSha,
      baseTreeSha:
        preflight.baseTreeSha,
      message,
      changes,
      treeEntries:
        preflight.treeEntries
    });

  if (
    permission.mode === "allow_once"
  ) {
    clearPermissionCookie(response);
  }

  return response.status(200).json({
    ok: true,
    operation: "apply",
    commit: {
      sha: commit.sha,
      message:
        commit.message || message,
      url:
        `https://github.com/${context.owner}/${context.repo}/commit/${commit.sha}`
    },
    repository: {
      owner: context.owner,
      repo: context.repo,
      branch: context.branch
    },
    changes
  });
}

/* =========================================================
   VERIFY
========================================================= */

async function handleVerify(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const body = parseBody(request);

  if (!body) {
    return badRequest(
      response,
      "Request body must be valid JSON."
    );
  }

  const context =
    validateRepositoryContext(body);

  if (!context.ok) {
    return badRequest(
      response,
      context.error
    );
  }

  const commitSha =
    cleanString(body.commitSha);

  if (!isValidSha(commitSha)) {
    return badRequest(
      response,
      "Invalid commit SHA."
    );
  }

  const changes =
    normalizeChangesForVerification(
      body.changes
    );

  if (!changes) {
    return badRequest(
      response,
      "Invalid or empty change set."
    );
  }

  const accessToken =
    getAccessToken(request);

  if (!accessToken) {
    return unauthorized(
      response,
      "GitHub is not connected."
    );
  }

  const branchHead =
    await getBranchHead(
      accessToken,
      context.owner,
      context.repo,
      context.branch
    );

  if (branchHead !== commitSha) {
    return response.status(409).json({
      ok: false,
      verified: false,
      error:
        "The verified commit is no longer the current branch head."
    });
  }

  const commit =
    await getCommit(
      accessToken,
      context.owner,
      context.repo,
      commitSha
    );

  const verifiedFiles = [];
  const failedFiles = [];

  for (const change of changes) {
    const file =
      await getFileAtRef({
        accessToken,
        owner: context.owner,
        repo: context.repo,
        path: change.path,
        ref: commitSha
      });

    if (change.operation === "delete") {
      if (file) {
        failedFiles.push({
          path: change.path,
          operation: change.operation,
          reason:
            "File still exists after delete."
        });
      } else {
        verifiedFiles.push({
          path: change.path,
          operation: change.operation,
          verified: true
        });
      }

      continue;
    }

    if (!file) {
      failedFiles.push({
        path: change.path,
        operation: change.operation,
        reason:
          "File does not exist after apply."
      });

      continue;
    }

    if (file.content !== change.content) {
      failedFiles.push({
        path: change.path,
        operation: change.operation,
        reason:
          "Actual GitHub file content does not match the generated content."
      });

      continue;
    }

    verifiedFiles.push({
      path: change.path,
      operation: change.operation,
      verified: true
    });
  }

  if (failedFiles.length) {
    return response.status(409).json({
      ok: false,
      verified: false,
      commit: {
        sha: commitSha,
        message: commit?.message || ""
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
      message: commit?.message || "",
      url:
        `https://github.com/${context.owner}/${context.repo}/commit/${commitSha}`
    },
    branch: context.branch,
    verifiedFiles,
    failedFiles: []
  });
}

/* =========================================================
   CHAT
========================================================= */

async function handleChat(
  request,
  response
) {
  if (request.method !== "POST") {
    return methodNotAllowed(response);
  }

  const body = parseBody(request);

  if (!body) {
    return badRequest(
      response,
      "Request body must be valid JSON."
    );
  }

  const message =
    cleanString(body.message);

  if (!message) {
    return badRequest(
      response,
      "Message is required."
    );
  }

  const apiKey =
    process.env.LD76_GEMINI_API_KEY;

  if (!apiKey) {
    return response.status(503).json({
      ok: false,
      error:
        "Gemini API key is not configured."
    });
  }

  const model =
    await chooseGeminiModel(
      apiKey,
      body.model
    );

  const result =
    await generateGeminiText({
      apiKey,
      model,
      prompt: message
    });

  return response.status(200).json({
    ok: true,
    model,
    response: result
  });
}

/* =========================================================
   GITHUB
========================================================= */

async function githubRequest(
  accessToken,
  path,
  options = {}
) {
  const result =
    await fetch(
      `${GITHUB_API}${path}`,
      {
        method:
          options.method || "GET",
        headers: {
          Accept:
            "application/vnd.github+json",
          Authorization:
            `Bearer ${accessToken}`,
          "User-Agent":
            "LD76-GitHub-Agent",
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

  const text =
    await result.text();

  let data = null;

  try {
    data =
      text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!result.ok) {
    const error =
      new Error(
        data?.message ||
        "GitHub API request failed."
      );

    error.status =
      result.status;

    throw error;
  }

  return data;
}

async function githubGet(
  accessToken,
  path
) {
  return githubRequest(
    accessToken,
    path
  );
}

async function loadRepositoryTree(
  accessToken,
  owner,
  repo,
  branch
) {
  const data =
    await githubGet(
      accessToken,
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/git/trees/${encodeURIComponent(
        branch
      )}?recursive=1`
    );

  if (!Array.isArray(data?.tree)) {
    throw new Error(
      "GitHub returned an invalid repository tree."
    );
  }

  return data.tree
    .filter(
      (entry) =>
        typeof entry?.path === "string" &&
        (
          entry.type === "blob" ||
          entry.type === "tree"
        )
    )
    .map((entry) => ({
      path: entry.path,
      type: entry.type,
      sha: entry.sha,
      size:
        Number.isInteger(entry.size)
          ? entry.size
          : null,
      mode:
        typeof entry.mode === "string"
          ? entry.mode
          : null
    }));
}

async function getFileAtRef({
  accessToken,
  owner,
  repo,
  path,
  ref
}) {
  try {
    const encoded =
      path
        .split("/")
        .map(encodeURIComponent)
        .join("/");

    const data =
      await githubGet(
        accessToken,
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/contents/${encoded}?ref=${encodeURIComponent(
          ref
        )}`
      );

    if (
      data?.type !== "file" ||
      typeof data.content !== "string"
    ) {
      throw new Error(
        `GitHub path is not a readable file: ${path}`
      );
    }

    const content =
      Buffer.from(
        data.content.replace(/\s/g, ""),
        "base64"
      ).toString("utf8");

    return {
      path,
      sha: data.sha,
      content,
      size:
        Number.isInteger(data.size)
          ? data.size
          : content.length
    };
  } catch (error) {
    if (error.status === 404) {
      return null;
    }

    throw error;
  }
}

async function loadRelevantFiles(
  accessToken,
  owner,
  repo,
  branch,
  tree,
  limit
) {
  const preferred =
    tree
      .filter(
        (entry) =>
          entry.type === "blob"
      )
      .sort(
        (a, b) =>
          filePriority(b.path) -
          filePriority(a.path)
      )
      .slice(0, limit);

  const files = [];

  for (const entry of preferred) {
    if (
      Number(entry.size) >
      MAX_FILE_SIZE
    ) {
      continue;
    }

    const file =
      await getFileAtRef({
        accessToken,
        owner,
        repo,
        path: entry.path,
        ref: branch
      });

    if (file) {
      files.push(file);
    }
  }

  return files;
}

async function loadPlannedFiles(
  accessToken,
  owner,
  repo,
  branch,
  tree,
  changes
) {
  const entries =
    new Map(
      tree.map(
        (entry) => [
          entry.path,
          entry
        ]
      )
    );

  const files = [];

  for (const change of changes) {
    if (
      change.operation === "create"
    ) {
      continue;
    }

    const entry =
      entries.get(change.path);

    if (!entry) {
      throw new Error(
        `Planned file does not exist in the current repository tree: ${change.path}`
      );
    }

    if (entry.type !== "blob") {
      throw new Error(
        `Planned path is not a regular file: ${change.path}`
      );
    }

    if (
      Number(entry.size) >
      MAX_FILE_SIZE
    ) {
      throw new Error(
        `Planned file is too large to inspect safely: ${change.path}`
      );
    }

    const file =
      await getFileAtRef({
        accessToken,
        owner,
        repo,
        path: change.path,
        ref: branch
      });

    if (!file) {
      throw new Error(
        `Could not read planned file: ${change.path}`
      );
    }

    if (
      change.sha &&
      change.sha !== file.sha
    ) {
      throw new Error(
        `Planned file SHA is stale: ${change.path}`
      );
    }

    files.push(file);
  }

  return files;
}

function mergeFiles(
  primary,
  secondary
) {
  const map = new Map();

  for (const file of [
    ...primary,
    ...secondary
  ]) {
    if (
      file &&
      typeof file.path === "string"
    ) {
      map.set(file.path, file);
    }
  }

  return Array.from(map.values());
}

function filePriority(path) {
  const lower =
    path.toLowerCase();

  if (
    lower === "package.json" ||
    lower === "vercel.json"
  ) {
    return 100;
  }

  if (
    lower === "readme.md" ||
    lower === "plan.md"
  ) {
    return 90;
  }

  if (lower.includes("config")) {
    return 70;
  }

  if (
    lower.includes("api/") ||
    lower.includes("server/")
  ) {
    return 65;
  }

  if (
    lower.endsWith(".js") ||
    lower.endsWith(".ts")
  ) {
    return 55;
  }

  if (lower.endsWith(".json")) {
    return 50;
  }

  if (
    lower.endsWith(".html") ||
    lower.endsWith(".css")
  ) {
    return 45;
  }

  return 10;
}

/* =========================================================
   APPLY PREFLIGHT
========================================================= */

async function preflightChanges({
  accessToken,
  owner,
  repo,
  branch,
  changes
}) {
  const headSha =
    await getBranchHead(
      accessToken,
      owner,
      repo,
      branch
    );

  const commit =
    await getCommit(
      accessToken,
      owner,
      repo,
      headSha
    );

  const baseTreeSha =
    commit?.tree?.sha;

  if (!isValidSha(baseTreeSha)) {
    throw new Error(
      "Could not determine the current Git tree."
    );
  }

  const treeEntries =
    await loadRepositoryTree(
      accessToken,
      owner,
      repo,
      branch
    );

  validateChanges(
    changes,
    treeEntries
  );

  return {
    headSha,
    baseTreeSha,
    treeEntries
  };
}

/* =========================================================
   GITHUB COMMIT
========================================================= */

async function applyGitDataCommit({
  accessToken,
  owner,
  repo,
  branch,
  headSha,
  baseTreeSha,
  message,
  changes,
  treeEntries
}) {
  const currentHead =
    await getBranchHead(
      accessToken,
      owner,
      repo,
      branch
    );

  if (currentHead !== headSha) {
    const error =
      new Error(
        "The selected branch changed before the GitHub write could be completed. Re-plan and request permission again."
      );

    error.status = 409;

    throw error;
  }

  const entryMap =
    new Map(
      treeEntries.map(
        (entry) => [
          entry.path,
          entry
        ]
      )
    );

  const tree = [];

  for (const change of changes) {
    const current =
      entryMap.get(change.path);

    if (
      change.operation === "delete"
    ) {
      tree.push({
        path: change.path,
        mode:
          current?.mode || "100644",
        type: "blob",
        sha: null
      });

      continue;
    }

    const blob =
      await githubRequest(
        accessToken,
        `/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/git/blobs`,
        {
          method: "POST",
          body: JSON.stringify({
            content: change.content,
            encoding: "utf-8"
          })
        }
      );

    if (!isValidSha(blob?.sha)) {
      throw new Error(
        `GitHub did not return a valid blob SHA for ${change.path}.`
      );
    }

    tree.push({
      path: change.path,
      mode:
        current?.mode || "100644",
      type: "blob",
      sha: blob.sha
    });
  }

  const newTree =
    await githubRequest(
      accessToken,
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/git/trees`,
      {
        method: "POST",
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree
        })
      }
    );

  if (!isValidSha(newTree?.sha)) {
    throw new Error(
      "GitHub did not return a valid new tree."
    );
  }

  const newCommit =
    await githubRequest(
      accessToken,
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/git/commits`,
      {
        method: "POST",
        body: JSON.stringify({
          message,
          tree: newTree.sha,
          parents: [headSha]
        })
      }
    );

  if (!isValidSha(newCommit?.sha)) {
    throw new Error(
      "GitHub did not return a valid new commit."
    );
  }

  const updated =
    await githubRequest(
      accessToken,
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/git/refs/heads/${encodeURIComponent(
        branch
      )}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          sha: newCommit.sha,
          force: false
        })
      }
    );

  if (
    updated?.object?.sha !==
    newCommit.sha
  ) {
    throw new Error(
      "GitHub branch update could not be confirmed."
    );
  }

  return {
    sha: newCommit.sha,
    message
  };
}

/* =========================================================
   PERMISSION VALIDATION
========================================================= */

async function validatePermission(
  request,
  context,
  changes
) {
  const permission =
    parsePermissionCookie(request);

  if (!permission) {
    return {
      ok: false,
      status: 403,
      error:
        "No valid agent permission is available."
    };
  }

  if (
    !permission.token ||
    !permission.mode
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "Agent permission token is incomplete."
    };
  }

  if (
    !Number.isFinite(
      permission.expiresAt
    ) ||
    permission.expiresAt <= Date.now()
  ) {
    return {
      ok: false,
      status: 403,
      expired: true,
      error:
        "Agent permission has expired."
    };
  }

  if (
    permission.owner !== context.owner ||
    permission.repo !== context.repo ||
    permission.branch !== context.branch
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "Agent permission does not match the selected repository or branch."
    };
  }

  if (
    permission.mode !== "allow_once" &&
    permission.mode !== "allow_for_task"
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "Agent permission does not allow writing."
    };
  }

  const normalized =
    normalizeChanges(changes);

  if (
    !normalized ||
    normalized.length === 0
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "The requested change set is invalid."
    };
  }

  const changesHash =
    await hashChanges(normalized);

  if (
    changesHash !==
    permission.changesHash
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "The approved change set does not match the requested change set."
    };
  }

  const parsed =
    parsePermissionToken(
      permission.token
    );

  if (!parsed) {
    return {
      ok: false,
      status: 403,
      error:
        "Agent permission token is invalid."
    };
  }

  const secret =
    process.env.LD76_AGENT_PERMISSION_SECRET;

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error:
        "Agent permission secret is not configured."
    };
  }

  const payload =
    buildPermissionPayload({
      id: parsed.id,
      mode: permission.mode,
      owner: context.owner,
      repo: context.repo,
      branch: context.branch,
      changesHash,
      expiresAt: permission.expiresAt
    });

  const valid =
    await verifySignature(
      secret,
      payload,
      parsed.signature
    );

  if (!valid) {
    return {
      ok: false,
      status: 403,
      error:
        "Agent permission signature is invalid."
    };
  }

  return {
    ok: true,
    mode: permission.mode
  };
}

/* =========================================================
   GEMINI
========================================================= */

async function listGeminiModels(
  apiKey
) {
  const models = [];
  let pageToken = "";

  do {
    const url =
      new URL(
        `${GEMINI_API}/models`
      );

    url.searchParams.set(
      "key",
      apiKey
    );

    url.searchParams.set(
      "pageSize",
      "1000"
    );

    if (pageToken) {
      url.searchParams.set(
        "pageToken",
        pageToken
      );
    }

    const result =
      await fetch(url);

    const text =
      await result.text();

    let data = null;

    try {
      data =
        text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!result.ok) {
      throw new Error(
        data?.error?.message ||
        "Could not load Gemini models."
      );
    }

    if (Array.isArray(data?.models)) {
      for (const model of data.models) {
        if (
          typeof model?.name !== "string" ||
          !Array.isArray(
            model.supportedGenerationMethods
          ) ||
          !model.supportedGenerationMethods.includes(
            "generateContent"
          )
        ) {
          continue;
        }

        models.push(model);
      }
    }

    pageToken =
      typeof data?.nextPageToken ===
      "string"
        ? data.nextPageToken
        : "";
  } while (pageToken);

  return Array.from(
    new Map(
      models.map(
        (model) => [
          model.name,
          model
        ]
      )
    ).values()
  );
}

async function chooseGeminiModel(
  apiKey,
  requestedModel
) {
  const models =
    await listGeminiModels(apiKey);

  if (!models.length) {
    throw new Error(
      "No Gemini model supporting generateContent is available."
    );
  }

  if (
    requestedModel &&
    requestedModel !== "auto"
  ) {
    const selected =
      models.find(
        (model) =>
          model.name === requestedModel
      );

    if (!selected) {
      throw new Error(
        "The selected Gemini model is not available for this API key."
      );
    }

    return selected.name;
  }

  return [...models].sort(
    (a, b) => {
      const outputA =
        Number(a.outputTokenLimit) || 0;

      const outputB =
        Number(b.outputTokenLimit) || 0;

      if (outputA !== outputB) {
        return outputB - outputA;
      }

      return a.name.localeCompare(
        b.name
      );
    }
  )[0].name;
}

async function generateGeminiJson({
  apiKey,
  model,
  prompt
}) {
  const output =
    await callGemini({
      apiKey,
      model,
      prompt,
      json: true
    });

  try {
    return parseGeminiJson(output);
  } catch {
    throw new Error(
      "Gemini returned invalid JSON."
    );
  }
}

function parseGeminiJson(
  output
) {
  const text =
    String(output || "").trim();

  try {
    return JSON.parse(text);
  } catch {}

  const fenced =
    text.match(
      /```(?:json)?\s*([\s\S]*?)\s*```/i
    );

  if (fenced) {
    return JSON.parse(
      fenced[1]
    );
  }

  const first =
    text.indexOf("{");

  const last =
    text.lastIndexOf("}");

  if (
    first >= 0 &&
    last > first
  ) {
    return JSON.parse(
      text.slice(
        first,
        last + 1
      )
    );
  }

  throw new Error(
    "No valid JSON object was found."
  );
}

async function generateGeminiText({
  apiKey,
  model,
  prompt
}) {
  return callGemini({
    apiKey,
    model,
    prompt,
    json: false
  });
}

async function callGemini({
  apiKey,
  model,
  prompt,
  json
}) {
  const modelId =
    model.replace(
      /^models\//,
      ""
    );

  const generationConfig = {
    temperature:
      json ? 0.1 : 0.2
  };

  if (json) {
    generationConfig.responseMimeType =
      "application/json";
  }

  const result =
    await fetch(
      `${GEMINI_API}/models/${encodeURIComponent(
        modelId
      )}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig
        })
      }
    );

  const text =
    await result.text();

  let data = null;

  try {
    data =
      text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!result.ok) {
    const error =
      new Error(
        data?.error?.message ||
        "Gemini request failed."
      );

    error.status =
      result.status;

    throw error;
  }

  const output =
    Array.isArray(
      data?.candidates?.[0]
        ?.content?.parts
    )
      ? data.candidates[0]
          .content.parts
          .filter(
            (part) =>
              typeof part?.text ===
              "string"
          )
          .map(
            (part) =>
              part.text
          )
          .join("")
      : "";

  if (!output.trim()) {
    throw new Error(
      "Gemini returned an empty response."
    );
  }

  return output.trim();
}

/* =========================================================
   INSPECTION
========================================================= */

function isReadOnlyInspectionRequest(
  message
) {
  const text =
    message.toLowerCase();

  const inspectionWords = [
    "inspect",
    "inspection",
    "structure",
    "project structure",
    "repo structure",
    "repository structure",
    "files batao",
    "files dekho",
    "files read",
    "analyze repository",
    "analyse repository",
    "repository analyze",
    "repository analyse"
  ];

  const writeWords = [
    "create",
    "add",
    "update",
    "edit",
    "modify",
    "change",
    "delete",
    "remove",
    "fix",
    "replace",
    "rename",
    "implement",
    "build",
    "write",
    "apply"
  ];

  const hasInspection =
    inspectionWords.some(
      (word) =>
        text.includes(word)
    );

  const hasWrite =
    writeWords.some(
      (word) =>
        text.includes(word)
    );

  return (
    hasInspection &&
    !hasWrite
  );
}

async function generateInspectionAnswer({
  message,
  context,
  tree,
  files
}) {
  const apiKey =
    process.env.LD76_GEMINI_API_KEY;

  if (!apiKey) {
    return buildLocalInspection(
      context,
      tree,
      files
    );
  }

  try {
    const model =
      await chooseGeminiModel(
        apiKey,
        "auto"
      );

    const prompt = [
      "You are the read-only repository inspector for LD76 Code Agent.",
      "Do not propose or perform code changes.",
      "Do not invent files.",
      "Use only facts visible in the supplied repository tree and files.",
      "",
      `Repository: ${context.owner}/${context.repo}`,
      `Branch: ${context.branch}`,
      "",
      "User request:",
      message,
      "",
      "Repository tree:",
      tree
        .map(
          (entry) =>
            `${entry.type}: ${entry.path}`
        )
        .join("\n"),
      "",
      "Readable files:",
      buildFileContext(files),
      "",
      "Return concise plain text.",
      "Explain the project structure, important files, major responsibilities and deployment/configuration files.",
      "Clearly state that no files were modified."
    ].join("\n");

    const answer =
      await generateGeminiText({
        apiKey,
        model,
        prompt
      });

    if (answer.trim()) {
      return answer.trim();
    }
  } catch (error) {
    console.error(
      "Inspection Gemini request failed:",
      error
    );
  }

  return buildLocalInspection(
    context,
    tree,
    files
  );
}

function buildLocalInspection(
  context,
  tree,
  files
) {
  const directories =
    new Set();

  const fileEntries =
    tree.filter(
      (entry) =>
        entry.type === "blob"
    );

  for (const entry of fileEntries) {
    const parts =
      entry.path.split("/");

    if (parts.length > 1) {
      directories.add(parts[0]);
    }
  }

  const lines = [
    `Repository: ${context.owner}/${context.repo}`,
    `Branch: ${context.branch}`,
    "",
    `Files: ${fileEntries.length}`,
    `Top-level directories: ${
      directories.size
        ? Array.from(
            directories
          ).sort().join(", ")
        : "none"
    }`,
    "",
    "Important files:"
  ];

  fileEntries
    .sort(
      (a, b) =>
        filePriority(b.path) -
        filePriority(a.path)
    )
    .slice(0, 20)
    .forEach(
      (entry) =>
        lines.push(
          `- ${entry.path}`
        )
    );

  lines.push(
    "",
    `Readable files inspected: ${files.length}`,
    "",
    "No files were modified."
  );

  return lines.join("\n");
}

/* =========================================================
   PROMPTS
========================================================= */

function buildPlanPrompt({
  message,
  context,
  tree,
  files
}) {
  return [
    "You are the planning engine of LD76 Code Agent.",
    "Work only from the supplied real GitHub repository context.",
    "Do not invent files.",
    "Do not claim that anything was written.",
    "",
    `Repository: ${context.owner}/${context.repo}`,
    `Branch: ${context.branch}`,
    "",
    "User request:",
    message,
    "",
    "Repository tree:",
    tree
      .map(
        (entry) =>
          `${entry.type}: ${entry.path}`
      )
      .join("\n"),
    "",
    "Relevant readable files:",
    buildFileContext(files),
    "",
    "Return ONLY JSON:",
    "{",
    '  "summary": "short summary",',
    '  "analysis": "what was inspected and why",',
    '  "changes": [',
    "    {",
    '      "operation": "update|create|delete",',
    '      "path": "exact repository path",',
    '      "reason": "why"',
    "    }",
    "  ],",
    '  "verification": ["specific verification step"],',
    '  "risk": "short risk assessment"',
    "}",
    "",
    "Rules:",
    "1. Use only paths present in the tree for update/delete.",
    "2. A create path must not already exist.",
    "3. If no code change is needed, changes must be empty.",
    "4. Do not include code in the plan.",
    "5. Do not invent dependencies."
  ].join("\n");
}

function buildChangesPrompt({
  message,
  context,
  plan,
  tree,
  files
}) {
  return [
    "You are the exact code-change engine of LD76 Code Agent.",
    "The repository is real.",
    "Generate complete file replacements only.",
    "Do not perform GitHub writes.",
    "Do not claim that changes were applied.",
    "Do not invent repository files.",
    "",
    `Repository: ${context.owner}/${context.repo}`,
    `Branch: ${context.branch}`,
    "",
    "User request:",
    message,
    "",
    "Approved plan:",
    JSON.stringify(
      plan,
      null,
      2
    ),
    "",
    "Repository tree:",
    tree
      .map(
        (entry) =>
          `${entry.type}: ${entry.path} ${entry.sha || ""}`
      )
      .join("\n"),
    "",
    "Current readable files:",
    buildFileContext(files),
    "",
    "Return ONLY JSON:",
    "{",
    '  "summary": "short summary",',
    '  "changes": [',
    "    {",
    '      "operation": "update|create|delete",',
    '      "path": "exact path",',
    '      "sha": "current SHA for update/delete, null for create",',
    '      "content": "complete file content or null",',
    '      "reason": "reason"',
    "    }",
    "  ],",
    '  "verification": ["specific verification step"]',
    "}",
    "",
    "Strict rules:",
    "1. update content must be the COMPLETE replacement file.",
    "2. create content must be the COMPLETE new file.",
    "3. delete content must be null.",
    "4. Never return partial snippets.",
    "5. Never return markdown fences.",
    "6. Update/delete SHA must exactly match the current tree.",
    "7. Existing files must only be changed when their actual contents are supplied.",
    "8. Never include secrets or credentials.",
    "9. Keep unrelated files unchanged.",
    "10. Return exactly the planned change paths and operations.",
    "11. If the plan says no change, return an empty changes array."
  ].join("\n");
}

function buildFileContext(files) {
  return files
    .map(
      (file) =>
        [
          `--- FILE: ${file.path} ---`,
          file.content,
          "--- END FILE ---"
        ].join("\n")
    )
    .join("\n\n");
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizePlan(value) {
  const plan =
    value &&
    typeof value === "object"
      ? value
      : {};

  return {
    summary:
      typeof plan.summary === "string"
        ? plan.summary
        : "No summary provided.",
    analysis:
      typeof plan.analysis === "string"
        ? plan.analysis
        : "",
    changes:
      Array.isArray(plan.changes)
        ? plan.changes
        : [],
    verification:
      Array.isArray(plan.verification)
        ? plan.verification
        : [],
    risk:
      typeof plan.risk === "string"
        ? plan.risk
        : "unknown"
  };
}

function validatePlanAgainstTree(
  plan,
  tree
) {
  const normalized =
    normalizePlan(plan);

  const changes =
    normalizePlanChanges(
      normalized.changes
    );

  const entries =
    new Map(
      tree.map(
        (entry) => [
          entry.path,
          entry
        ]
      )
    );

  for (const change of changes) {
    const entry =
      entries.get(change.path);

    if (
      change.operation ===
      "update"
    ) {
      if (!entry) {
        throw new Error(
          `Plan tries to update a missing path: ${change.path}`
        );
      }

      if (entry.type !== "blob") {
        throw new Error(
          `Plan tries to update a non-file path: ${change.path}`
        );
      }
    }

    if (
      change.operation ===
      "delete"
    ) {
      if (!entry) {
        throw new Error(
          `Plan tries to delete a missing path: ${change.path}`
        );
      }

      if (entry.type !== "blob") {
        throw new Error(
          `Plan tries to delete a non-file path: ${change.path}`
        );
      }
    }

    if (
      change.operation ===
      "create"
    ) {
      if (entry) {
        throw new Error(
          `Plan tries to create an existing path: ${change.path}`
        );
      }
    }
  }

  return {
    ...normalized,
    changes
  };
}

function normalizePlanChanges(
  changes
) {
  if (!Array.isArray(changes)) {
    throw new Error(
      "Gemini returned an invalid plan change list."
    );
  }

  if (
    changes.length >
    MAX_CHANGES
  ) {
    throw new Error(
      "The plan contains too many changes."
    );
  }

  const result = [];
  const seen = new Set();

  for (const change of changes) {
    if (
      !change ||
      typeof change !== "object"
    ) {
      throw new Error(
        "The plan contains an invalid change."
      );
    }

    const operation =
      change.operation;

    const path =
      cleanString(change.path);

    if (
      ![
        "update",
        "create",
        "delete"
      ].includes(operation) ||
      !isValidPath(path) ||
      seen.has(path)
    ) {
      throw new Error(
        `Invalid plan change: ${path || "unknown path"}`
      );
    }

    seen.add(path);

    result.push({
      operation,
      path,
      reason:
        typeof change.reason === "string"
          ? change.reason
          : ""
    });
  }

  return result;
}

function normalizeChanges(changes) {
  if (!Array.isArray(changes)) {
    return null;
  }

  if (
    changes.length >
    MAX_CHANGES
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

    const path =
      cleanString(change.path);

    if (
      ![
        "update",
        "create",
        "delete"
      ].includes(operation) ||
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
      (
        operation === "update" ||
        operation === "delete"
      ) &&
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
        typeof change.content !== "string" ||
        change.content.length >
          MAX_FILE_SIZE
      ) {
        return null;
      }

      content =
        change.content;
    }

    if (
      operation === "delete" &&
      change.content !== null &&
      typeof change.content !== "undefined"
    ) {
      return null;
    }

    normalized.push({
      operation,
      path,
      sha,
      content,
      reason:
        typeof change.reason === "string"
          ? change.reason
          : ""
    });
  }

  return normalized;
}

function validateChanges(
  changes,
  tree,
  plannedChanges = null
) {
  const normalized =
    normalizeChanges(changes);

  if (!normalized) {
    throw new Error(
      "Gemini returned an invalid change set."
    );
  }

  const existing =
    new Map(
      tree.map(
        (entry) => [
          entry.path,
          entry
        ]
      )
    );

  if (plannedChanges) {
    const planned =
      normalizePlanChanges(
        plannedChanges
      );

    if (
      normalized.length !==
      planned.length
    ) {
      throw new Error(
        "Generated changes do not exactly match the approved plan."
      );
    }

    const plannedMap =
      new Map(
        planned.map(
          (change) => [
            change.path,
            change.operation
          ]
        )
      );

    for (const change of normalized) {
      if (
        plannedMap.get(
          change.path
        ) !== change.operation
      ) {
        throw new Error(
          `Generated change is not allowed by the plan: ${change.path}`
        );
      }
    }
  }

  for (const change of normalized) {
    const current =
      existing.get(change.path);

    if (
      change.operation ===
      "update"
    ) {
      if (!current) {
        throw new Error(
          `Cannot update non-existing path: ${change.path}`
        );
      }

      if (current.type !== "blob") {
        throw new Error(
          `Cannot update non-file path: ${change.path}`
        );
      }

      if (
        change.sha !==
        current.sha
      ) {
        throw new Error(
          `File SHA mismatch in proposed update: ${change.path}`
        );
      }
    }

    if (
      change.operation ===
      "create"
    ) {
      if (current) {
        throw new Error(
          `Cannot create existing path: ${change.path}`
        );
      }
    }

    if (
      change.operation ===
      "delete"
    ) {
      if (!current) {
        throw new Error(
          `Cannot delete non-existing path: ${change.path}`
        );
      }

      if (current.type !== "blob") {
        throw new Error(
          `Cannot delete non-file path: ${change.path}`
        );
      }

      if (
        change.sha !==
        current.sha
      ) {
        throw new Error(
          `File SHA mismatch in proposed delete: ${change.path}`
        );
      }
    }
  }

  return normalized;
}

function normalizeChangesForVerification(
  changes
) {
  if (!Array.isArray(changes)) {
    return null;
  }

  if (
    changes.length === 0 ||
    changes.length > MAX_CHANGES
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

    const path =
      cleanString(change.path);

    if (
      ![
        "create",
        "update",
        "delete"
      ].includes(operation) ||
      !isValidPath(path) ||
      seen.has(path)
    ) {
      return null;
    }

    seen.add(path);

    if (
      operation !== "delete" &&
      (
        typeof change.content !== "string" ||
        change.content.length >
          MAX_FILE_SIZE
      )
    ) {
      return null;
    }

    normalized.push({
      operation,
      path,
      content:
        operation === "delete"
          ? null
          : change.content
    });
  }

  return normalized;
}

/* =========================================================
   PERMISSION CRYPTO
========================================================= */

async function hashChanges(
  changes
) {
  const canonical =
    JSON.stringify(
      changes
        .map(
          (change) => ({
            operation:
              change.operation,
            path:
              change.path,
            sha:
              change.sha || null,
            content:
              change.content ?? null
          })
        )
        .sort(
          (a, b) =>
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
    .map(
      (byte) =>
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
  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
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
      new TextEncoder().encode(value)
    );

  return Array.from(
    new Uint8Array(signature)
  )
    .map(
      (byte) =>
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
  if (
    !/^[a-f0-9]{64}$/i.test(
      expectedSignature
    )
  ) {
    return false;
  }

  const key =
    await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

  const bytes =
    new Uint8Array(32);

  for (let i = 0; i < 32; i++) {
    bytes[i] =
      parseInt(
        expectedSignature.slice(
          i * 2,
          i * 2 + 2
        ),
        16
      );
  }

  return crypto.subtle.verify(
    "HMAC",
    key,
    bytes,
    new TextEncoder().encode(value)
  );
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

  if (separator <= 0) {
    return null;
  }

  const id =
    token.slice(0, separator);

  const signature =
    token.slice(separator + 1);

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

function createPermissionId() {
  const bytes =
    new Uint8Array(32);

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

function getPermissionExpiration(
  mode
) {
  return mode === "allow_once"
    ? Date.now() + 5 * 60 * 1000
    : Date.now() + 60 * 60 * 1000;
}

function normalizePermissionMode(
  mode
) {
  return [
    "allow_once",
    "allow_for_task",
    "deny"
  ].includes(mode)
    ? mode
    : null;
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
  const payload =
    Buffer.from(
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

  const maxAge =
    Math.max(
      0,
      Math.floor(
        (expiresAt - Date.now()) /
        1000
      )
    );

  return [
    `${PERMISSION_COOKIE}=${encodeURIComponent(
      payload
    )}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ].join("; ");
}

function createExpiredPermissionCookie() {
  return [
    `${PERMISSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0"
  ].join("; ");
}

/* =========================================================
   COMMON
========================================================= */

function getCookie(
  request,
  name
) {
  const header =
    request.headers?.cookie || "";

  for (
    const part of header.split(";")
  ) {
    const index =
      part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      part.slice(0, index).trim();

    if (key !== name) {
      continue;
    }

    const value =
      part.slice(index + 1).trim();

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

function getAccessToken(
  request
) {
  return getCookie(
    request,
    ACCESS_TOKEN_COOKIE
  );
}

function parseBody(
  request
) {
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

function cleanString(
  value
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function validateRepositoryContext(
  body
) {
  const owner =
    cleanString(body.owner);

  const repo =
    cleanString(body.repo);

  const branch =
    cleanString(body.branch);

  if (
    !isValidRepositoryName(owner) ||
    !isValidRepositoryName(repo)
  ) {
    return {
      ok: false,
      error:
        "Invalid GitHub repository name."
    };
  }

  if (!isValidBranchName(branch)) {
    return {
      ok: false,
      error:
        "Invalid GitHub branch name."
    };
  }

  return {
    ok: true,
    owner,
    repo,
    branch
  };
}

function isValidRepositoryName(
  value
) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_.-]+$/.test(value) &&
    value.length <= 100
  );
}

function isValidBranchName(
  value
) {
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

function isValidPath(
  value
) {
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

function isValidSha(
  value
) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{40}$/i.test(value)
  );
}

function methodNotAllowed(
  response
) {
  return response.status(405).json({
    ok: false,
    error: "Method not allowed."
  });
}

function badRequest(
  response,
  message
) {
  return response.status(400).json({
    ok: false,
    error: message
  });
}

function unauthorized(
  response,
  message
) {
  return response.status(401).json({
    ok: false,
    error: message
  });
}

function clearPermissionCookie(
  response
) {
  response.setHeader(
    "Set-Cookie",
    createExpiredPermissionCookie()
  );
}

function parsePermissionCookie(
  request
) {
  const raw =
    getCookie(
      request,
      PERMISSION_COOKIE
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(
      Buffer.from(
        raw,
        "base64url"
      ).toString("utf8")
    );
  } catch {
    return null;
  }
}

async function getBranchHead(
  accessToken,
  owner,
  repo,
  branch
) {
  const data =
    await githubGet(
      accessToken,
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/git/ref/heads/${encodeURIComponent(
        branch
      )}`
    );

  if (
    !isValidSha(
      data?.object?.sha
    )
  ) {
    throw new Error(
      "GitHub returned an invalid branch commit SHA."
    );
  }

  return data.object.sha;
}

async function getCommit(
  accessToken,
  owner,
  repo,
  sha
) {
  return githubGet(
    accessToken,
    `/repos/${encodeURIComponent(
      owner
    )}/${encodeURIComponent(
      repo
    )}/git/commits/${encodeURIComponent(
      sha
    )}`
  );
                      }
