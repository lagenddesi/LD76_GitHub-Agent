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
const MAX_CHAT_HISTORY = 20;
const MAX_CHAT_MESSAGE = 5000;

/* =========================================================
   ROUTER
========================================================= */

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
   CHAT / SEMANTIC ROUTING
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

  if (
    !message ||
    message.length > MAX_CHAT_MESSAGE
  ) {
    return badRequest(
      response,
      "A valid user message is required."
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

  const history =
    normalizeChatHistory(
      body.history
    );

  const repository =
    normalizeOptionalRepositoryContext(
      body
    );

  const selection =
    await chooseGeminiModel(
      apiKey,
      body.model
    );

  const generated =
    await generateGeminiJson({
      apiKey,
      selection,
      prompt:
        buildChatPrompt({
          message,
          history,
          repository
        })
    });

  const result =
    normalizeChatResult(
      generated?.value,
      message
    );

  return response.status(200).json({
    ok: true,
    model: generated.model,
    intent: result.intent,
    response: result.response,
    answer: result.response,
    message: result.response,
    requiresRepository:
      result.requiresRepository,
    execute:
      result.execute
  });
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
    message.length > MAX_CHAT_MESSAGE
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

  const requestedIntent =
    normalizeChatIntent(
      body.intent
    );

  const readOnly =
    requestedIntent === "review" ||
    requestedIntent === "inspection" ||
    requestedIntent === "analyze" ||
    body.readOnly === true ||
    isReadOnlyInspectionRequest(message);

  if (readOnly) {
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
        files,
        history:
          normalizeChatHistory(
            body.history
          )
      });

    return response.status(200).json({
      ok: true,
      operation: "inspect",
      model: null,
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

  const selection =
    await chooseGeminiModel(
      apiKey,
      body.model
    );

  const generated =
    await generateGeminiJson({
      apiKey,
      selection,
      prompt:
        buildPlanPrompt({
          message,
          context,
          tree,
          files,
          history:
            normalizeChatHistory(
              body.history
            )
        })
    });

  const plan =
    normalizePlan(
      generated.value
    );

  const validatedPlan =
    validatePlanAgainstTree(
      plan,
      tree
    );

  return response.status(200).json({
    ok: true,
    operation: "plan",
    model: generated.model,
    requiresWrite:
      validatedPlan.changes.length > 0,
    changes:
      validatedPlan.changes,
    plan:
      validatedPlan
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

  if (
    !message ||
    message.length > MAX_CHAT_MESSAGE
  ) {
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

  const selection =
    await chooseGeminiModel(
      apiKey,
      body.model
    );

  const generated =
    await generateGeminiJson({
      apiKey,
      selection,
      prompt:
        buildChangesPrompt({
          message,
          context,
          plan,
          tree,
          files,
          history:
            normalizeChatHistory(
              body.history
            )
        })
    });

  const changes =
    validateChanges(
      generated?.value?.changes,
      tree,
      plan.changes
    );

  return response.status(200).json({
    ok: true,
    operation: "changes",
    model: generated.model,
    summary:
      typeof generated?.value?.summary === "string"
        ? generated.value.summary
        : "Changes generated.",
    changes,
    verification:
      Array.isArray(
        generated?.value?.verification
      )
        ? generated.value.verification
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

  const verified =
    await verifyChangesAgainstCommit({
      accessToken,
      owner: context.owner,
      repo: context.repo,
      commit,
      changes
    });

  return response.status(200).json({
    ok: true,
    verified,
    commit: {
      sha: commitSha
    },
    repository: {
      owner: context.owner,
      repo: context.repo,
      branch: context.branch
    }
  });
}

/* =========================================================
   CHAT HELPERS
========================================================= */

function normalizeChatHistory(
  history
) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const role =
        item.role === "assistant" ||
        item.role === "model"
          ? "model"
          : "user";

      const text =
        cleanString(
          item.text ??
          item.message ??
          item.content
        );

      if (!text) {
        return null;
      }

      return {
        role,
        text: text.slice(0, 4000)
      };
    })
    .filter(Boolean)
    .slice(-MAX_CHAT_HISTORY);
}

function normalizeOptionalRepositoryContext(
  body
) {
  const owner =
    cleanString(body?.owner);

  const repo =
    cleanString(body?.repo);

  const branch =
    cleanString(body?.branch);

  if (!owner || !repo) {
    return null;
  }

  return {
    owner,
    repo,
    branch:
      branch || "main"
  };
}

function normalizeChatIntent(
  value
) {
  const intent =
    cleanString(value)
      .toLowerCase()
      .replace(/[\s_-]+/g, "");

  if (
    intent === "conversation" ||
    intent === "chat" ||
    intent === "casual"
  ) {
    return "conversation";
  }

  if (
    intent === "discussion" ||
    intent === "discuss"
  ) {
    return "discussion";
  }

  if (
    intent === "planning" ||
    intent === "plan"
  ) {
    return "planning";
  }

  if (
    intent === "review" ||
    intent === "codereview"
  ) {
    return "review";
  }

  if (
    intent === "inspection" ||
    intent === "inspect"
  ) {
    return "inspection";
  }

  if (
    intent === "analyze" ||
    intent === "analysis"
  ) {
    return "analyze";
  }

  if (
    intent === "coding" ||
    intent === "code"
  ) {
    return "coding";
  }

  if (
    intent === "execution" ||
    intent === "execute"
  ) {
    return "execution";
  }

  return "conversation";
}

function normalizeChatResult(
  value,
  fallbackMessage
) {
  const object =
    value &&
    typeof value === "object"
      ? value
      : {};

  const intent =
    normalizeChatIntent(
      object.intent
    );

  const response =
    cleanString(
      object.response ??
      object.answer ??
      object.message ??
      object.text
    ) ||
    buildFallbackChatResponse(
      intent,
      fallbackMessage
    );

  return {
    intent,
    response,
    requiresRepository:
      object.requiresRepository === true ||
      intent === "review" ||
      intent === "inspection" ||
      intent === "analyze" ||
      intent === "coding" ||
      intent === "execution",
    execute:
      object.execute === true ||
      intent === "execution" ||
      intent === "coding"
  };
}

function buildFallbackChatResponse(
  intent,
  message
) {
  if (
    intent === "review" ||
    intent === "inspection" ||
    intent === "analyze"
  ) {
    return "Theek hai. Main repository inspect karke issue aur improvements identify karunga.";
  }

  if (
    intent === "coding" ||
    intent === "execution"
  ) {
    return "Theek hai. Main is task ko coding workflow mein le ja raha hoon.";
  }

  if (intent === "planning") {
    return "Theek hai. Pehle approach aur architecture discuss karte hain.";
  }

  return "Theek hai. Batao kis cheez par baat karni hai.";
}

function buildChatPrompt({
  message,
  history,
  repository
}) {
  const historyText =
    history.length > 0
      ? history
          .map(
            (item) =>
              `${item.role === "model" ? "ASSISTANT" : "USER"}: ${item.text}`
          )
          .join("\n")
      : "(no previous conversation)";

  const repositoryText =
    repository
      ? [
          `Repository: ${repository.owner}/${repository.repo}`,
          `Branch: ${repository.branch}`
        ].join("\n")
      : "(no repository context selected)";

  return `
You are LD76 Code Agent.

Your job is to behave like a natural AI assistant first and a coding agent only when the user clearly asks for coding work.

Current conversation:
${historyText}

Repository context:
${repositoryText}

Current user message:
${message}

Classify the user's CURRENT intent semantically.

Allowed intents:
- conversation
- discussion
- planning
- review
- inspection
- analyze
- coding
- execution

Routing rules:

1. conversation
Use for greetings, casual conversation, general questions, explanations, or normal chat.

2. discussion
Use when the user is discussing an idea, asking whether something is possible, comparing approaches, or exploring a concept.
Do NOT start coding.

3. planning
Use when the user wants architecture, roadmap, implementation strategy, phases, file structure, or recommendations.
Do NOT modify code merely because a plan is being discussed.

4. review
Use when the user asks to inspect/review existing code and report bugs, weaknesses, quality problems, or improvements.
Review is READ-ONLY unless the user explicitly asks to fix or implement something.

5. inspection
Use for requests to look at repository files/code and explain what exists or how it works.
READ-ONLY.

6. analyze
Use for repository/code analysis where the user wants findings rather than modifications.
READ-ONLY.

7. coding
Use ONLY when the user clearly instructs the agent to make a code change.
Examples include:
- fix this
- implement this
- add this feature
- change this code
- create this file
- update this file
- remove this
- apply the changes
- make the discussed plan
- do the task
A coding request can depend on previous planning messages.

8. execution
Use when the user clearly confirms or explicitly asks to execute/apply/finalize an already discussed coding task.

IMPORTANT:
- Do not classify a question about coding as coding.
- Do not classify a plan as coding.
- Do not classify "can we build X?" as coding.
- Do not classify "what do you think about X?" as coding.
- Do not classify "look at this code and tell me what's wrong" as coding.
- "Fix it", "implement it", "do it", "apply it", "make the changes" are explicit execution instructions when the conversation establishes what needs to be done.
- Use conversation history to understand references such as "yes do it", "make that", "the above", or "implement this".
- If intent is ambiguous, prefer discussion or planning rather than coding.
- Never invent repository facts.
- Normal conversation should work without GitHub.

The response must be natural and directly useful to the user.
Do not respond with a coding plan unless the user asked for one.
Do not mention this routing system.

Return ONLY valid JSON:
{
  "intent": "conversation|discussion|planning|review|inspection|analyze|coding|execution",
  "response": "natural assistant response",
  "requiresRepository": true,
  "execute": false
}

Set requiresRepository=true for review, inspection, analyze, coding and execution.
Set execute=true ONLY for coding or execution when the user has actually requested implementation/execution.
`;
}

/* =========================================================
   PROMPTS
========================================================= */

function buildPlanPrompt({
  message,
  context,
  tree,
  files,
  history = []
}) {
  return `
You are the planning engine of LD76 Code Agent.

The user has explicitly requested a repository coding task.

Conversation history:
${buildHistoryText(history)}

Current request:
${message}

Repository:
${context.owner}/${context.repo}
Branch:
${context.branch}

Repository tree:
${JSON.stringify(tree, null, 2)}

Relevant files:
${formatFiles(files)}

Create a precise implementation plan.

Rules:
- Only plan actual changes required by the request.
- Do not invent files or APIs.
- Existing files must be inspected before editing.
- Preserve existing architecture unless the requested task requires otherwise.
- Never expose or modify secrets.
- Do not generate changes for ordinary discussion.
- Paths must be repository-relative.
- For an existing file, operation must be "update".
- For a new file, operation must be "create".
- For removal, operation must be "delete".
- Keep the change set minimal.
- Include verification steps.

Return ONLY valid JSON:
{
  "summary": "short summary",
  "analysis": "technical analysis",
  "changes": [
    {
      "path": "path/to/file",
      "operation": "update|create|delete",
      "reason": "why this file changes"
    }
  ],
  "verification": [
    "verification step"
  ],
  "risk": "low|medium|high"
}
`;
}

function buildChangesPrompt({
  message,
  context,
  plan,
  tree,
  files,
  history = []
}) {
  return `
You are the implementation engine of LD76 Code Agent.

The user has explicitly authorized implementation.

Conversation history:
${buildHistoryText(history)}

Original request:
${message}

Repository:
${context.owner}/${context.repo}
Branch:
${context.branch}

Approved implementation plan:
${JSON.stringify(plan, null, 2)}

Repository tree:
${JSON.stringify(tree, null, 2)}

Files:
${formatFiles(files)}

Generate the exact repository changes.

Rules:
- Return complete file contents for every create/update operation.
- Never return partial file contents.
- Never use placeholders.
- Never use mock implementations.
- Never use "...", "TODO", or omitted sections in code.
- Preserve unrelated existing code.
- Do not modify files outside the approved plan.
- Do not expose secrets.
- Existing files were supplied as context; update them accurately.
- Delete operations must not include content.
- Keep changes production-ready.
- Ensure imports and function references remain valid.
- Respect the existing JavaScript architecture.
- Do not create unnecessary files.

Return ONLY valid JSON:
{
  "summary": "short implementation summary",
  "changes": [
    {
      "path": "path/to/file",
      "operation": "update|create|delete",
      "content": "complete UTF-8 file content for create/update"
    }
  ],
  "verification": [
    "verification step"
  ]
}
`;
}

function buildHistoryText(
  history
) {
  if (!Array.isArray(history) || history.length === 0) {
    return "(no previous conversation)";
  }

  return history
    .slice(-MAX_CHAT_HISTORY)
    .map(
      (item) =>
        `${item.role === "model" ? "ASSISTANT" : "USER"}: ${item.text}`
    )
    .join("\n");
}

/* =========================================================
   INSPECTION
========================================================= */

async function generateInspectionAnswer({
  message,
  context,
  tree,
  files,
  history = []
}) {
  const apiKey =
    process.env.LD76_GEMINI_API_KEY;

  if (!apiKey) {
    throw createHttpError(
      503,
      "Gemini API key is not configured."
    );
  }

  const selection =
    await chooseGeminiModel(
      apiKey,
      null
    );

  const generated =
    await generateGeminiText({
      apiKey,
      selection,
      prompt: `
You are reviewing a GitHub repository for the user.

Conversation:
${buildHistoryText(history)}

User request:
${message}

Repository:
${context.owner}/${context.repo}
Branch:
${context.branch}

Tree:
${JSON.stringify(tree, null, 2)}

Relevant files:
${formatFiles(files)}

Perform a READ-ONLY technical inspection.

Do not propose automatic edits as if they were already made.
Do not claim that anything was changed.
Clearly distinguish:
- confirmed problems
- likely problems
- improvements
- strengths

Give a concise but useful technical answer in natural language.
`
    });

  return generated.text;
}

function isReadOnlyInspectionRequest(
  message
) {
  const text =
    cleanString(message)
      .toLowerCase();

  if (!text) {
    return false;
  }

  const modificationPatterns = [
    /\bfix\b/,
    /\bimplement\b/,
    /\bcreate\b/,
    /\badd\b/,
    /\bremove\b/,
    /\bdelete\b/,
    /\bupdate\b/,
    /\bchange\b/,
    /\bmodify\b/,
    /\bapply\b/,
    /\bexecute\b/,
    /\bfinalize\b/,
    /\bwrite\b/
  ];

  if (
    modificationPatterns.some(
      (pattern) =>
        pattern.test(text)
    )
  ) {
    return false;
  }

  const inspectionPatterns = [
    /\breview\b/,
    /\binspect\b/,
    /\banaly[sz]e\b/,
    /\banalysis\b/,
    /\blook at\b/,
    /\blook into\b/,
    /\bcheck\b/,
    /\bsee\b/,
    /\bdekho\b/,
    /\bdekh\b/,
    /\bbatao issue\b/,
    /\bissues\b/,
    /\bproblems\b/,
    /\bimprovements\b/,
    /\bbug(s)?\b/,
    /\bquality\b/
  ];

  return inspectionPatterns.some(
    (pattern) =>
      pattern.test(text)
  );
}

/* =========================================================
   GEMINI MODEL DISCOVERY
========================================================= */

async function chooseGeminiModel(
  apiKey,
  requestedModel
) {
  const models =
    await listGeminiModels(
      apiKey
    );

  const usable =
    models.filter(
      isUsableGeminiModel
    );

  if (usable.length === 0) {
    throw createHttpError(
      503,
      "No usable Gemini models are available for this API key."
    );
  }

  const requested =
    cleanString(requestedModel);

  if (requested) {
    const found =
      usable.find(
        (model) =>
          normalizeGeminiModelName(
            model.name
          ) ===
          normalizeGeminiModelName(
            requested
          )
      );

    if (found) {
      return {
        model: normalizeGeminiModelName(
          found.name
        ),
        source: "requested"
      };
    }
  }

  const ranked =
    [...usable].sort(
      compareGeminiModels
    );

  return {
    model:
      normalizeGeminiModelName(
        ranked[0].name
      ),
    source: "auto"
  };
}

async function listGeminiModels(
  apiKey
) {
  const models = [];
  let pageToken = "";

  for (let page = 0; page < 10; page += 1) {
    const url =
      `${GEMINI_API}/models?pageSize=100` +
      (
        pageToken
          ? `&pageToken=${encodeURIComponent(pageToken)}`
          : ""
      );

    const data =
      await callGeminiApi({
        apiKey,
        url,
        method: "GET"
      });

    if (
      Array.isArray(data?.models)
    ) {
      models.push(
        ...data.models
      );
    }

    pageToken =
      cleanString(
        data?.nextPageToken
      );

    if (!pageToken) {
      break;
    }
  }

  return models;
}

function isUsableGeminiModel(
  model
) {
  if (
    !model ||
    typeof model !== "object"
  ) {
    return false;
  }

  const name =
    normalizeGeminiModelName(
      model.name
    );

  if (!name) {
    return false;
  }

  const lowerName =
    name.toLowerCase();

  const methods =
    Array.isArray(
      model.supportedGenerationMethods
    )
      ? model.supportedGenerationMethods
      : [];

  if (
    !methods.includes(
      "generateContent"
    )
  ) {
    return false;
  }

  const excludedPatterns = [
    "embedding",
    "aqa",
    "image",
    "nano-banana",
    "banana",
    "veo",
    "video",
    "audio",
    "tts",
    "transcribe",
    "speech"
  ];

  if (
    excludedPatterns.some(
      (pattern) =>
        lowerName.includes(pattern)
    )
  ) {
    return false;
  }

  return true;
}

function compareGeminiModels(
  a,
  b
) {
  return (
    geminiModelScore(b) -
    geminiModelScore(a)
  );
}

function geminiModelScore(
  model
) {
  const name =
    normalizeGeminiModelName(
      model?.name
    ).toLowerCase();

  let score = 0;

  if (
    name.includes("gemini-3")
  ) {
    score += 1000;
  }

  if (
    name.includes("pro")
  ) {
    score += 300;
  }

  if (
    name.includes("flash")
  ) {
    score += 200;
  }

  if (
    name.includes("2.5")
  ) {
    score += 100;
  }

  if (
    name.includes("2.0")
  ) {
    score += 50;
  }

  if (
    name.includes("exp")
  ) {
    score -= 20;
  }

  if (
    name.includes("preview")
  ) {
    score -= 10;
  }

  return score;
}

function normalizeGeminiModelName(
  name
) {
  const value =
    cleanString(name);

  if (!value) {
    return "";
  }

  return value.startsWith("models/")
    ? value.slice(7)
    : value;
}

/* =========================================================
   GEMINI GENERATION
========================================================= */

async function generateGeminiJson({
  apiKey,
  selection,
  prompt
}) {
  const generated =
    await callGemini({
      apiKey,
      selection,
      prompt,
      responseMimeType:
        "application/json"
    });

  const parsed =
    parseJsonFromText(
      generated.text
    );

  return {
    model: generated.model,
    text: generated.text,
    value: parsed
  };
}

async function generateGeminiText({
  apiKey,
  selection,
  prompt
}) {
  return callGemini({
    apiKey,
    selection,
    prompt
  });
}

async function callGemini({
  apiKey,
  selection,
  prompt,
  responseMimeType
}) {
  const model =
    normalizeGeminiModelName(
      selection?.model
    );

  if (!model) {
    throw createHttpError(
      503,
      "No Gemini model was selected."
    );
  }

  const url =
    `${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const generationConfig = {};

  if (responseMimeType) {
    generationConfig.responseMimeType =
      responseMimeType;
  }

  const data =
    await callGeminiApi({
      apiKey,
      url,
      method: "POST",
      body: {
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
      }
    });

  const text =
    extractGeminiText(data);

  if (!text) {
    throw createHttpError(
      502,
      "Gemini returned an empty response."
    );
  }

  return {
    model,
    text
  };
}

async function callGeminiApi({
  apiKey,
  url,
  method = "GET",
  body
}) {
  const headers = {
    "Content-Type":
      "application/json",
    "x-goog-api-key":
      apiKey
  };

  const options = {
    method,
    headers
  };

  if (body !== undefined) {
    options.body =
      JSON.stringify(body);
  }

  const result =
    await fetch(
      url,
      options
    );

  const text =
    await result.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch {
    data = null;
  }

  if (!result.ok) {
    const message =
      cleanString(
        data?.error?.message
      ) ||
      text ||
      `Gemini API request failed with status ${result.status}.`;

    throw createHttpError(
      result.status >= 400 &&
      result.status < 600
        ? result.status
        : 502,
      message
    );
  }

  return data;
}

function extractGeminiText(
  data
) {
  const candidates =
    Array.isArray(
      data?.candidates
    )
      ? data.candidates
      : [];

  return candidates
    .flatMap(
      (candidate) =>
        Array.isArray(
          candidate?.content?.parts
        )
          ? candidate.content.parts
          : []
    )
    .map(
      (part) =>
        typeof part?.text === "string"
          ? part.text
          : ""
    )
    .join("")
    .trim();
}

function parseJsonFromText(
  text
) {
  const raw =
    cleanString(text);

  if (!raw) {
    throw createHttpError(
      502,
      "Gemini returned an empty JSON response."
    );
  }

  try {
    return JSON.parse(raw);
  } catch {}

  const fenced =
    raw
      .replace(
        /^```(?:json)?/i,
        ""
      )
      .replace(
        /```$/i,
        ""
      )
      .trim();

  try {
    return JSON.parse(fenced);
  } catch {}

  const first =
    Math.min(
      ...[
        fenced.indexOf("{"),
        fenced.indexOf("[")
      ].filter(
        (value) => value >= 0
      )
    );

  if (
    Number.isFinite(first)
  ) {
    const lastObject =
      fenced.lastIndexOf("}");

    const lastArray =
      fenced.lastIndexOf("]");

    const last =
      Math.max(
        lastObject,
        lastArray
      );

    if (last > first) {
      const candidate =
        fenced.slice(
          first,
          last + 1
        );

      try {
        return JSON.parse(
          candidate
        );
      } catch {}
    }
  }

  throw createHttpError(
    502,
    "Gemini returned invalid JSON."
  );
}

/* =========================================================
   GITHUB TREE / FILES
========================================================= */

async function loadRepositoryTree(
  accessToken,
  owner,
  repo,
  branch
) {
  const branchData =
    await githubRequest(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`
    );

  const sha =
    cleanString(
      branchData?.commit?.sha
    );

  if (!sha) {
    throw createHttpError(
      502,
      "Unable to resolve repository branch."
    );
  }

  const treeData =
    await githubRequest(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(sha)}?recursive=1`
    );

  const tree =
    Array.isArray(
      treeData?.tree
    )
      ? treeData.tree
      : [];

  return {
    sha,
    truncated:
      treeData?.truncated === true,
    entries:
      tree
        .filter(
          (entry) =>
            entry &&
            entry.type === "blob" &&
            typeof entry.path === "string"
        )
        .slice(
          0,
          5000
        )
        .map(
          (entry) => ({
            path: entry.path,
            sha: entry.sha,
            size:
              Number.isFinite(entry.size)
                ? entry.size
                : 0,
            mode:
              entry.mode || null
          })
        )
  };
}

async function loadRelevantFiles(
  accessToken,
  owner,
  repo,
  branch,
  tree,
  limit
) {
  const entries =
    Array.isArray(tree?.entries)
      ? tree.entries
      : [];

  const ranked =
    entries
      .filter(
        (entry) =>
          entry.size <= MAX_FILE_SIZE &&
          isRelevantTextFile(
            entry.path
          )
      )
      .sort(
        compareFileRelevance
      )
      .slice(
        0,
        Math.max(
          1,
          limit || MAX_CONTEXT_FILES
        )
      );

  const files = [];

  for (
    const entry of ranked
  ) {
    try {
      const file =
        await loadRepositoryFile(
          accessToken,
          owner,
          repo,
          branch,
          entry.path
        );

      if (file) {
        files.push(file);
      }
    } catch (error) {
      console.warn(
        "Unable to load relevant file:",
        entry.path,
        error?.message
      );
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
  const paths =
    Array.isArray(changes)
      ? changes
          .map(
            (change) =>
              cleanString(
                change?.path
              )
          )
          .filter(Boolean)
      : [];

  const unique =
    [...new Set(paths)];

  const files = [];

  for (
    const path of unique
  ) {
    const entry =
      tree.entries.find(
        (item) =>
          item.path === path
      );

    if (!entry) {
      continue;
    }

    if (
      entry.size > MAX_FILE_SIZE
    ) {
      throw createHttpError(
        413,
        `File is too large to inspect: ${path}`
      );
    }

    const file =
      await loadRepositoryFile(
        accessToken,
        owner,
        repo,
        branch,
        path
      );

    if (file) {
      files.push(file);
    }
  }

  return files;
}

async function loadRepositoryFile(
  accessToken,
  owner,
  repo,
  branch,
  path
) {
  const encodedPath =
    path
      .split("/")
      .map(
        encodeURIComponent
      )
      .join("/");

  const data =
    await githubRequest(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`
    );

  if (
    Array.isArray(data)
  ) {
    return null;
  }

  const content =
    decodeBase64Utf8(
      data?.content
    );

  if (
    content.length >
    MAX_FILE_SIZE
  ) {
    throw createHttpError(
      413,
      `File is too large to inspect: ${path}`
    );
  }

  return {
    path,
    sha:
      cleanString(
        data?.sha
      ),
    size:
      content.length,
    content
  };
}

function mergeFiles(
  first,
  second
) {
  const map =
    new Map();

  for (
    const file of [
      ...(Array.isArray(first)
        ? first
        : []),
      ...(Array.isArray(second)
        ? second
        : [])
    ]
  ) {
    if (
      file &&
      typeof file.path === "string"
    ) {
      map.set(
        file.path,
        file
      );
    }
  }

  return [
    ...map.values()
  ];
}

function formatFiles(
  files
) {
  if (
    !Array.isArray(files) ||
    files.length === 0
  ) {
    return "(no file contents loaded)";
  }

  return files
    .map(
      (file) =>
        `===== ${file.path} =====\n${file.content}`
    )
    .join("\n\n");
}

function isRelevantTextFile(
  path
) {
  const value =
    path.toLowerCase();

  const blocked =
    [
      "node_modules/",
      ".git/",
      "dist/",
      "build/",
      ".next/",
      "coverage/",
      ".vercel/"
    ];

  if (
    blocked.some(
      (prefix) =>
        value.includes(prefix)
    )
  ) {
    return false;
  }

  const allowed =
    [
      ".js",
      ".mjs",
      ".cjs",
      ".ts",
      ".tsx",
      ".jsx",
      ".html",
      ".css",
      ".json",
      ".md",
      ".txt",
      ".yml",
      ".yaml",
      ".env.example"
    ];

  return allowed.some(
    (extension) =>
      value.endsWith(extension)
  );
}

function compareFileRelevance(
  a,
  b
) {
  return (
    fileRelevanceScore(b.path) -
    fileRelevanceScore(a.path)
  );
}

function fileRelevanceScore(
  path
) {
  const value =
    path.toLowerCase();

  let score = 0;

  if (
    value === "package.json"
  ) {
    score += 1000;
  }

  if (
    value.includes("server/")
  ) {
    score += 300;
  }

  if (
    value.includes("api/")
  ) {
    score += 250;
  }

  if (
    value.includes("app.")
  ) {
    score += 200;
  }

  if (
    value.includes("index.")
  ) {
    score += 150;
  }

  if (
    value.includes("config")
  ) {
    score += 100;
  }

  if (
    value.endsWith(".md")
  ) {
    score += 20;
  }

  score -=
    path.split("/").length * 2;

  return score;
}

/* =========================================================
   GITHUB API
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
          "X-GitHub-Api-Version":
            GITHUB_API_VERSION,
          "Content-Type":
            "application/json"
        },
        body:
          options.body !== undefined
            ? JSON.stringify(
                options.body
              )
            : undefined
      }
    );

  const text =
    await result.text();

  let data = null;

  try {
    data =
      text
        ? JSON.parse(text)
        : null;
  } catch {
    data = null;
  }

  if (!result.ok) {
    throw createHttpError(
      result.status,
      cleanString(
        data?.message
      ) ||
        text ||
        "GitHub API request failed."
    );
  }

  return data;
}

async function getBranchHead(
  accessToken,
  owner,
  repo,
  branch
) {
  const data =
    await githubRequest(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`
    );

  return cleanString(
    data?.commit?.sha
  );
}

async function getCommit(
  accessToken,
  owner,
  repo,
  sha
) {
  return githubRequest(
    accessToken,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`
  );
}

/* =========================================================
   PLAN NORMALIZATION
========================================================= */

function normalizePlan(
  value
) {
  const object =
    value &&
    typeof value === "object"
      ? value
      : {};

  const changes =
    Array.isArray(
      object.changes
    )
      ? object.changes
          .slice(
            0,
            MAX_CHANGES
          )
          .map(
            normalizePlanChange
          )
          .filter(Boolean)
      : [];

  return {
    summary:
      cleanString(
        object.summary
      ) ||
      "Implementation plan generated.",
    analysis:
      cleanString(
        object.analysis
      ),
    changes,
    verification:
      Array.isArray(
        object.verification
      )
        ? object.verification
            .map(
              cleanString
            )
            .filter(Boolean)
            .slice(0, 30)
        : [],
    risk:
      normalizeRisk(
        object.risk
      )
  };
}

function normalizePlanChange(
  change
) {
  if (
    !change ||
    typeof change !== "object"
  ) {
    return null;
  }

  const path =
    normalizePath(
      change.path
    );

  const operation =
    normalizeOperation(
      change.operation
    );

  if (
    !path ||
    !operation
  ) {
    return null;
  }

  return {
    path,
    operation,
    reason:
      cleanString(
        change.reason
      ) ||
      "Required by the requested task."
  };
}

function validatePlanAgainstTree(
  plan,
  tree
) {
  const entries =
    Array.isArray(tree?.entries)
      ? tree.entries
      : [];

  const paths =
    new Set(
      entries.map(
        (entry) =>
          entry.path
      )
    );

  const changes =
    Array.isArray(plan?.changes)
      ? plan.changes
          .filter(
            (change) => {
              if (
                !change ||
                !change.path
              ) {
                return false;
              }

              if (
                change.operation ===
                "create"
              ) {
                return !paths.has(
                  change.path
                );
              }

              if (
                change.operation ===
                "update"
              ) {
                return paths.has(
                  change.path
                );
              }

              if (
                change.operation ===
                "delete"
              ) {
                return paths.has(
                  change.path
                );
              }

              return false;
            }
          )
          .slice(
            0,
            MAX_CHANGES
          )
      : [];

  return {
    summary:
      plan?.summary ||
      "Implementation plan generated.",
    analysis:
      plan?.analysis || "",
    changes,
    verification:
      Array.isArray(
        plan?.verification
      )
        ? plan.verification
        : [],
    risk:
      normalizeRisk(
        plan?.risk
      )
  };
}

/* =========================================================
   CHANGE NORMALIZATION
========================================================= */

function validateChanges(
  generatedChanges,
  tree,
  plannedChanges
) {
  if (
    !Array.isArray(
      generatedChanges
    )
  ) {
    return [];
  }

  const planned =
    new Map(
      (
        Array.isArray(
          plannedChanges
        )
          ? plannedChanges
          : []
      ).map(
        (change) => [
          change.path,
          change.operation
        ]
      )
    );

  const treePaths =
    new Set(
      (
        Array.isArray(
          tree?.entries
        )
          ? tree.entries
          : []
      ).map(
        (entry) =>
          entry.path
      )
    );

  const changes = [];

  for (
    const raw of generatedChanges
  ) {
    if (
      !raw ||
      typeof raw !== "object"
    ) {
      continue;
    }

    const path =
      normalizePath(
        raw.path
      );

    const operation =
      normalizeOperation(
        raw.operation
      );

    if (
      !path ||
      !operation
    ) {
      continue;
    }

    if (
      !planned.has(path) ||
      planned.get(path) !== operation
    ) {
      continue;
    }

    if (
      operation === "create" &&
      treePaths.has(path)
    ) {
      continue;
    }

    if (
      operation !== "create" &&
      !treePaths.has(path)
    ) {
      continue;
    }

    if (
      operation !== "delete"
    ) {
      const content =
        typeof raw.content === "string"
          ? raw.content
          : null;

      if (
        content === null
      ) {
        continue;
      }

      if (
        content.length >
        MAX_FILE_SIZE
      ) {
        continue;
      }

      changes.push({
        path,
        operation,
        content
      });

      continue;
    }

    changes.push({
      path,
      operation
    });
  }

  return changes.slice(
    0,
    MAX_CHANGES
  );
}

function normalizeChanges(
  changes
) {
  if (
    !Array.isArray(changes)
  ) {
    return null;
  }

  if (
    changes.length >
    MAX_CHANGES
  ) {
    return null;
  }

  const result = [];

  for (
    const raw of changes
  ) {
    if (
      !raw ||
      typeof raw !== "object"
    ) {
      return null;
    }

    const path =
      normalizePath(
        raw.path
      );

    const operation =
      normalizeOperation(
        raw.operation
      );

    if (
      !path ||
      !operation
    ) {
      return null;
    }

    if (
      operation !== "delete" &&
      typeof raw.content !== "string"
    ) {
      return null;
    }

    if (
      typeof raw.content === "string" &&
      raw.content.length >
        MAX_FILE_SIZE
    ) {
      return null;
    }

    result.push({
      path,
      operation,
      ...(operation !== "delete"
        ? {
            content:
              raw.content
          }
        : {})
    });
  }

  return result;
}

function normalizeChangesForVerification(
  changes
) {
  if (
    !Array.isArray(changes)
  ) {
    return null;
  }

  return changes
    .map(
      (change) => {
        if (
          !change ||
          typeof change !== "object"
        ) {
          return null;
        }

        const path =
          normalizePath(
            change.path
          );

        const operation =
          normalizeOperation(
            change.operation
          );

        if (
          !path ||
          !operation
        ) {
          return null;
        }

        return {
          path,
          operation,
          ...(typeof change.content === "string"
            ? {
                content:
                  change.content
              }
            : {})
        };
      }
    )
    .filter(Boolean);
}

/* =========================================================
   GIT DATA COMMIT
========================================================= */

async function preflightChanges({
  accessToken,
  owner,
  repo,
  branch,
  changes
}) {
  const branchData =
    await githubRequest(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`
    );

  const headSha =
    cleanString(
      branchData?.commit?.sha
    );

  if (!headSha) {
    throw createHttpError(
      502,
      "Unable to resolve current branch head."
    );
  }

  const commit =
    await getCommit(
      accessToken,
      owner,
      repo,
      headSha
    );

  const baseTreeSha =
    cleanString(
      commit?.commit?.tree?.sha
    );

  if (!baseTreeSha) {
    throw createHttpError(
      502,
      "Unable to resolve current Git tree."
    );
  }

  const currentTree =
    await githubRequest(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(baseTreeSha)}?recursive=1`
    );

  const treeEntries =
    Array.isArray(
      currentTree?.tree
    )
      ? currentTree.tree
      : [];

  const currentMap =
    new Map(
      treeEntries
        .filter(
          (entry) =>
            entry &&
            entry.type === "blob" &&
            typeof entry.path === "string"
        )
        .map(
          (entry) => [
            entry.path,
            entry
          ]
        )
    );

  for (
    const change of changes
  ) {
    const current =
      currentMap.get(
        change.path
      );

    if (
      change.operation === "create" &&
      current
    ) {
      throw createHttpError(
        409,
        `File already exists: ${change.path}`
      );
    }

    if (
      (
        change.operation === "update" ||
        change.operation === "delete"
      ) &&
      !current
    ) {
      throw createHttpError(
        409,
        `File no longer exists: ${change.path}`
      );
    }
  }

  return {
    headSha,
    baseTreeSha,
    treeEntries
  };
}


async function applyGitDataCommit({
  accessToken,
  owner,
  repo,
  branch,
  changes,
  commitMessage,
  preflight
}) {
  const headSha = preflight.headSha;
  const baseTreeSha = preflight.baseTreeSha;
  const currentEntries = preflight.treeEntries || [];

  const changedPaths = new Set(
    changes.map((change) => change.path)
  );

  const treeEntries = [];

  for (const entry of currentEntries) {
    if (changedPaths.has(entry.path)) {
      continue;
    }

    if (!entry.sha || !entry.path) {
      continue;
    }

    treeEntries.push({
      path: entry.path,
      mode: entry.mode || "100644",
      type: entry.type || "blob",
      sha: entry.sha
    });
  }

  for (const change of changes) {
    if (change.operation === "delete") {
      continue;
    }

    const blob = await githubRequest(
      accessToken,
      `/repos/${owner}/${repo}/git/blobs`,
      {
        method: "POST",
        body: {
          content: change.content,
          encoding: "utf-8"
        }
      }
    );

    treeEntries.push({
      path: change.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha
    });
  }

  const tree = await githubRequest(
    accessToken,
    `/repos/${owner}/${repo}/git/trees`,
    {
      method: "POST",
      body: {
        base_tree: baseTreeSha,
        tree: treeEntries
      }
    }
  );

  const commit = await githubRequest(
    accessToken,
    `/repos/${owner}/${repo}/git/commits`,
    {
      method: "POST",
      body: {
        message: commitMessage,
        tree: tree.sha,
        parents: [headSha]
      }
    }
  );

  await githubRequest(
    accessToken,
    `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
    {
      method: "PATCH",
      body: {
        sha: commit.sha,
        force: false
      }
    }
  );

  return {
    commitSha: commit.sha,
    treeSha: tree.sha,
    branch
  };
}





      
            

/* =========================================================
   VERIFY CHANGES
========================================================= */

async function verifyChangesAgainstCommit({
  accessToken,
  owner,
  repo,
  commit,
  changes
}) {
  const treeSha =
    cleanString(
      commit?.commit?.tree?.sha
    );

  if (!treeSha) {
    return false;
  }

  const tree =
    await githubRequest(
      accessToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`
    );

  const entries =
    Array.isArray(
      tree?.tree
    )
      ? tree.tree
      : [];

  const map =
    new Map(
      entries
        .filter(
          (entry) =>
            entry &&
            entry.type === "blob"
        )
        .map(
          (entry) => [
            entry.path,
            entry
          ]
        )
    );

  for (
    const change of changes
  ) {
    const entry =
      map.get(
        change.path
      );

    if (
      change.operation ===
      "delete"
    ) {
      if (entry) {
        return false;
      }

      continue;
    }

    if (!entry) {
      return false;
    }

    if (
      typeof change.content ===
      "string"
    ) {
      const file =
        await loadRepositoryFile(
          accessToken,
          owner,
          repo,
          "main",
          change.path
        );

      if (
        !file ||
        file.content !==
          change.content
      ) {
        return false;
      }
    }
  }

  return true;
}

/* =========================================================
   PERMISSION HELPERS
========================================================= */

function normalizePermissionMode(
  mode
) {
  const value =
    cleanString(mode)
      .toLowerCase();

  if (
    value === "allow_once" ||
    value === "allow-once"
  ) {
    return "allow_once";
  }

  if (
    value === "allow_task" ||
    value === "allow-task"
  ) {
    return "allow_task";
  }

  if (
    value === "deny"
  ) {
    return "deny";
  }

  return null;
}

function getPermissionExpiration(
  mode
) {
  const now =
    Date.now();

  if (
    mode === "allow_once"
  ) {
    return new Date(
      now + 10 * 60 * 1000
    ).toISOString();
  }

  if (
    mode === "allow_task"
  ) {
    return new Date(
      now + 60 * 60 * 1000
    ).toISOString();
  }

  return null;
}

function createPermissionId() {
  if (
    typeof crypto !==
      "undefined" &&
    typeof crypto.randomUUID ===
      "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
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
    expiresAt || ""
  ].join("|");
}

async function createSignature(
  secret,
  payload
) {
  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name:
          "HMAC",
        hash:
          "SHA-256"
      },
      false,
      [
        "sign"
      ]
    );

  const signature =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );

  return arrayBufferToHex(
    signature
  );
}

async function hashChanges(
  changes
) {
  const normalized =
    JSON.stringify(
      changes
        .map(
          (change) => ({
            path:
              change.path,
            operation:
              change.operation,
            content:
              change.operation ===
              "delete"
                ? undefined
                : change.content
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
        normalized
      )
    );

  return arrayBufferToHex(
    digest
  );
}

function arrayBufferToHex(
  buffer
) {
  return [
    ...new Uint8Array(
      buffer
    )
  ]
    .map(
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}

async function validatePermission(
  request,
  context,
  changes
) {
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

  const cookie =
    parseCookies(
      request.headers?.cookie
    );

  const token =
    cookie[
      PERMISSION_COOKIE
    ];

  if (!token) {
    return {
      ok: false,
      status: 403,
      error:
        "Permission is required before repository changes can be applied."
    };
  }

  const separator =
    token.indexOf(".");

  if (separator <= 0) {
    return {
      ok: false,
      status: 403,
      error:
        "Invalid agent permission token."
    };
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

  const changesHash =
    await hashChanges(
      changes
    );

  const rawPayload =
    await findPermissionPayload(
      request,
      id,
      context,
      changesHash
    );

  if (!rawPayload) {
    return {
      ok: false,
      status: 403,
      error:
        "Agent permission does not match this repository or change set."
    };
  }

  const expected =
    await createSignature(
      secret,
      rawPayload.payload
    );

  if (
    !safeEqual(
      signature,
      expected
    )
  ) {
    return {
      ok: false,
      status: 403,
      error:
        "Invalid agent permission signature."
    };
  }

  if (
    rawPayload.expiresAt &&
    Date.parse(
      rawPayload.expiresAt
    ) <= Date.now()
  ) {
    return {
      ok: false,
      status: 403,
      expired: true,
      error:
        "Agent permission has expired."
    };
  }

  return {
    ok: true,
    mode:
      rawPayload.mode
  };
}

async function findPermissionPayload(
  request,
  id,
  context,
  changesHash
) {
  const cookie =
    parseCookies(
      request.headers?.cookie
    );

  const token =
    cookie[
      PERMISSION_COOKIE
    ];

  const parts =
    cleanString(token)
      .split(".");

  if (
    parts.length !== 2 ||
    parts[0] !== id
  ) {
    return null;
  }

  const mode =
    cookieValue(
      cookie,
      "ld76_permission_mode"
    );

  const owner =
    cookieValue(
      cookie,
      "ld76_permission_owner"
    );

  const repo =
    cookieValue(
      cookie,
      "ld76_permission_repo"
    );

  const branch =
    cookieValue(
      cookie,
      "ld76_permission_branch"
    );

  const storedHash =
    cookieValue(
      cookie,
      "ld76_permission_changes"
    );

  const expiresAt =
    cookieValue(
      cookie,
      "ld76_permission_expires"
    );

  if (
    owner !== context.owner ||
    repo !== context.repo ||
    branch !== context.branch ||
    storedHash !== changesHash
  ) {
    return null;
  }

  const payload =
    buildPermissionPayload({
      id,
      mode,
      owner,
      repo,
      branch,
      changesHash,
      expiresAt:
        expiresAt || null
    });

  return {
    mode,
    expiresAt:
      expiresAt || null,
    payload
  };
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
  const maxAge =
    expiresAt
      ? Math.max(
          1,
          Math.floor(
            (
              Date.parse(
                expiresAt
              ) -
              Date.now()
            ) /
              1000
          )
        )
      : 0;

  const secure =
    "ld76_permission=" +
    encodeURIComponent(token) +
    "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" +
    maxAge;

  const metadata = [
    `ld76_permission_mode=${encodeURIComponent(mode)}`,
    `ld76_permission_owner=${encodeURIComponent(owner)}`,
    `ld76_permission_repo=${encodeURIComponent(repo)}`,
    `ld76_permission_branch=${encodeURIComponent(branch)}`,
    `ld76_permission_changes=${encodeURIComponent(changesHash)}`,
    `ld76_permission_expires=${encodeURIComponent(expiresAt || "")}`
  ].join("; ");

  return [
    secure,
    metadata
  ].join(", ");
}

function createExpiredPermissionCookie() {
  return [
    `${PERMISSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    "ld76_permission_mode=; Path=/; Max-Age=0",
    "ld76_permission_owner=; Path=/; Max-Age=0",
    "ld76_permission_repo=; Path=/; Max-Age=0",
    "ld76_permission_branch=; Path=/; Max-Age=0",
    "ld76_permission_changes=; Path=/; Max-Age=0",
    "ld76_permission_expires=; Path=/; Max-Age=0"
  ].join(", ");
}

function clearPermissionCookie(
  response
) {
  response.setHeader(
    "Set-Cookie",
    createExpiredPermissionCookie()
  );
}

/* =========================================================
   REPOSITORY CONTEXT
========================================================= */

function validateRepositoryContext(
  body
) {
  const owner =
    cleanString(
      body?.owner
    );

  const repo =
    cleanString(
      body?.repo
    );

  const branch =
    cleanString(
      body?.branch
    );

  if (!owner) {
    return {
      ok: false,
      error:
        "Repository owner is required."
    };
  }

  if (!repo) {
    return {
      ok: false,
      error:
        "Repository name is required."
    };
  }

  if (!branch) {
    return {
      ok: false,
      error:
        "Repository branch is required."
    };
  }

  if (
    !isValidGitHubName(
      owner
    ) ||
    !isValidGitHubName(
      repo
    )
  ) {
    return {
      ok: false,
      error:
        "Invalid GitHub repository."
    };
  }

  if (
    !isValidBranch(
      branch
    )
  ) {
    return {
      ok: false,
      error:
        "Invalid GitHub branch."
    };
  }

  return {
    ok: true,
    owner,
    repo,
    branch
  };
}

/* =========================================================
   ACCESS TOKEN
========================================================= */

function getAccessToken(
  request
) {
  const cookies =
    parseCookies(
      request.headers?.cookie
    );

  return cleanString(
    cookies[
      ACCESS_TOKEN_COOKIE
    ]
  );
}

/* =========================================================
   UTILITIES
========================================================= */

function parseBody(
  request
) {
  try {
    const body = request?.body;

    if (
      body &&
      typeof body === "object"
    ) {
      return body;
    }

    if (
      typeof body === "string"
    ) {
      const text = body.trim();

      if (!text) {
        return null;
      }

      return JSON.parse(text);
    }

    return null;
  } catch (error) {
    console.error(
      "Request body parsing failed:",
      error
    );

    return null;
  }
}

function cleanString(
  value
) {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function normalizePath(
  value
) {
  const path =
    cleanString(value)
      .replace(
        /\\/g,
        "/"
      );

  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\0") ||
    path.includes("..")
  ) {
    return "";
  }

  return path;
}

function normalizeOperation(
  value
) {
  const operation =
    cleanString(value)
      .toLowerCase();

  if (
    operation === "create" ||
    operation === "update" ||
    operation === "delete"
  ) {
    return operation;
  }

  return null;
}

function normalizeRisk(
  value
) {
  const risk =
    cleanString(value)
      .toLowerCase();

  if (
    risk === "high" ||
    risk === "medium" ||
    risk === "low"
  ) {
    return risk;
  }

  return "medium";
}

function isValidGitHubName(
  value
) {
  return /^[A-Za-z0-9_.-]+$/.test(
    value
  );
}

function isValidBranch(
  value
) {
  return (
    value.length <= 250 &&
    !value.includes("..") &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    !value.includes("//") &&
    !/[~^:?*\[\]\\]/.test(
      value
    )
  );
}

function isValidSha(
  value
) {
  return /^[a-f0-9]{40}$/i.test(
    value
  );
}

function decodeBase64Utf8(
  value
) {
  if (
    typeof value !==
    "string"
  ) {
    return "";
  }

  const normalized =
    value.replace(
      /\s/g,
      ""
    );

  const binary =
    atob(normalized);

  const bytes =
    Uint8Array.from(
      binary,
      (char) =>
        char.charCodeAt(0)
    );

  return new TextDecoder(
    "utf-8"
  ).decode(bytes);
}

function parseCookies(
  header
) {
  const result = {};

  if (
    typeof header !==
      "string" ||
    !header
  ) {
    return result;
  }

  for (
    const part of header.split(";")
  ) {
    const index =
      part.indexOf("=");

    if (index <= 0) {
      continue;
    }

    const key =
      part
        .slice(
          0,
          index
        )
        .trim();

    const value =
      part
        .slice(
          index + 1
        )
        .trim();

    try {
      result[key] =
        decodeURIComponent(
          value
        );
    } catch {
      result[key] =
        value;
    }
  }

  return result;
}

function cookieValue(
  cookies,
  name
) {
  return cleanString(
    cookies?.[name]
  );
}

function safeEqual(
  a,
  b
) {
  if (
    typeof a !== "string" ||
    typeof b !== "string"
  ) {
    return false;
  }

  if (
    a.length !==
    b.length
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

function createHttpError(
  status,
  message
) {
  const error =
    new Error(message);

  error.status =
    status;

  return error;
}

function methodNotAllowed(
  response
) {
  response.setHeader(
    "Allow",
    "POST"
  );

  return response.status(405).json({
    ok: false,
    error:
      "Method not allowed."
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

