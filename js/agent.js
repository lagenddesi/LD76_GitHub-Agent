import { state } from "./state.js";

import {
  appendMessage,
  setBusy,
  appendProgress,
  updateProgress,
  removeProgress,
  showGlobalMessage
} from "./ui.js";

import {
  saveMessage,
  getRecentMessages,
  messagesToGeminiHistory
} from "./history.js";


export async function runAgent(message) {
  if (state.busy) {
    return;
  }

  const cleanMessage =
    String(message || "").trim();

  if (!cleanMessage) {
    return;
  }

  resetAgent();

  await saveChatMessage(
    "user",
    cleanMessage
  );

  appendMessage(
    "user",
    cleanMessage
  );

  setBusy(true);

  try {
    appendProgress(
      "Request samajh raha hoon..."
    );

    const history =
      await getChatHistory();

    const chatResult =
      await routeChat(
        cleanMessage,
        history
      );

    const intent =
      normalizeIntent(
        chatResult?.intent
      );

    /*
     * Normal conversation / discussion.
     * GitHub ki zaroorat nahi.
     */
    if (
      intent === "conversation" ||
      intent === "discussion" ||
      intent === "planning" ||
      intent === "general" ||
      !intent
    ) {
      const answer =
        getChatResponse(
          chatResult
        );

      state.agent.phase =
        "completed";

      appendMessage(
        "assistant",
        answer
      );

      await saveChatMessage(
        "assistant",
        answer,
        {
          intent:
            intent || "conversation"
        }
      );

      removeProgress();

      return {
        intent:
          intent || "conversation",
        response: answer
      };
    }

    /*
     * Repository review / inspection.
     * Ismein write operation nahi hoti.
     */
    if (
      intent === "review" ||
      intent === "inspection" ||
      intent === "analyze"
    ) {
      if (!state.githubConnected) {
        const answer =
          getChatResponse(
            chatResult
          ) ||
          "Code review ke liye pehle GitHub connect aur repository select karni hogi.";

        state.agent.phase =
          "completed";

        appendMessage(
          "assistant",
          answer
        );

        await saveChatMessage(
          "assistant",
          answer,
          {
            intent
          }
        );

        removeProgress();

        return {
          intent,
          response: answer
        };
      }

      validateRepositorySelection();

      updateProgress(
        "Repository inspect kar raha hoon..."
      );

      const plan =
        await createPlan(
          cleanMessage,
          history
        );

      state.agent.plan =
        plan;

      state.agent.phase =
        "planned";

      const reviewAnswer =
        formatPlan(plan);

      appendMessage(
        "assistant",
        reviewAnswer
      );

      await saveChatMessage(
        "assistant",
        reviewAnswer,
        {
          intent,
          operation:
            "inspect"
        }
      );

      state.agent.phase =
        "completed";

      updateProgress(
        "Review complete. Koi GitHub write nahi hui."
      );

      showGlobalMessage(
        "Code review complete. Koi file change nahi ki gayi.",
        "success"
      );

      return {
        intent,
        plan
      };
    }

    /*
     * Actual coding / execution.
     * Sirf explicit execution intent par.
     */
    if (
      intent === "coding" ||
      intent === "execution" ||
      intent === "execute" ||
      intent === "implementation" ||
      intent === "fix"
    ) {
      validateRepositorySelection();

      updateProgress(
        "Repository inspect kar raha hoon..."
      );

      const plan =
        await createPlan(
          cleanMessage,
          history
        );

      state.agent.plan =
        plan;

      state.agent.phase =
        "planned";

      const planText =
        formatPlan(plan);

      appendMessage(
        "assistant",
        planText
      );

      await saveChatMessage(
        "assistant",
        planText,
        {
          intent,
          operation:
            "plan"
        }
      );

      if (
        !plan.requiresWrite ||
        !Array.isArray(plan.changes) ||
        plan.changes.length === 0
      ) {
        state.agent.phase =
          "completed";

        updateProgress(
          "No GitHub changes required."
        );

        showGlobalMessage(
          "Request ke liye koi file change required nahi.",
          "success"
        );

        return {
          intent,
          plan
        };
      }

      updateProgress(
        "Required files aur exact changes generate kar raha hoon..."
      );

      const changes =
        await createChanges(
          cleanMessage,
          plan,
          history
        );

      state.agent.changes =
        changes.changes;

      state.agent.phase =
        "changes-ready";

      const changesText =
        formatChanges(changes);

      appendMessage(
        "assistant",
        changesText
      );

      await saveChatMessage(
        "assistant",
        changesText,
        {
          intent,
          operation:
            "changes"
        }
      );

      state.agent.permission =
        buildPermissionRequest(
          changes.changes
        );

      state.agent.phase =
        "permission-required";

      const permissionText =
        formatPermissionRequest(
          state.agent.permission
        );

      appendMessage(
        "system",
        permissionText
      );

      await saveChatMessage(
        "system",
        permissionText,
        {
          intent,
          operation:
            "permission"
        }
      );

      updateProgress(
        "Changes ready. Write se pehle permission required hai."
      );

      showGlobalMessage(
        "Changes ready hain. GitHub write se pehle permission required hai.",
        "info"
      );

      return {
        intent,
        plan,
        changes,
        permission:
          state.agent.permission
      };
    }

    /*
     * Unknown intent ko safe side par normal
     * conversation treat karo.
     */
    const answer =
      getChatResponse(
        chatResult
      ) ||
      "Main is request ko discussion ke taur par handle kar raha hoon. Agar aap actual code change chahte hain to clearly bata dein ke kaam implement/fix karna hai.";

    state.agent.phase =
      "completed";

    appendMessage(
      "assistant",
      answer
    );

    await saveChatMessage(
      "assistant",
      answer,
      {
        intent:
          "conversation"
      }
    );

    removeProgress();

    return {
      intent:
        "conversation",
      response: answer
    };
  } catch (error) {
    state.agent.phase =
      "error";

    console.error(
      "Agent workflow failed:",
      error
    );

    removeProgress();

    const readableError =
      getReadableError(error);

    appendMessage(
      "error",
      readableError
    );

    await saveChatMessage(
      "error",
      readableError
    );

    showGlobalMessage(
      readableError,
      "error"
    );

    throw new Error(
      readableError
    );
  } finally {
    if (
      state.agent.phase !==
      "permission-required"
    ) {
      removeProgress();
    }

    setBusy(false);
  }
}


async function routeChat(
  message,
  history
) {
  const response =
    await fetch(
      "/api/agent/chat",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json"
        },
        body: JSON.stringify({
          message,
          history,
          model:
            state.selectedModel,
          repository:
            state.selectedRepository || "",
          branch:
            state.selectedBranch || ""
        })
      }
    );

  const data =
    await readJson(response);

  if (
    !response.ok ||
    !data?.ok
  ) {
    throw new Error(
      getReadableError(
        data?.error
      ) ||
        "Chat request failed."
    );
  }

  return data;
}


async function getChatHistory() {
  if (!state.conversationId) {
    return [];
  }

  const messages =
    await getRecentMessages(
      state.conversationId,
      30
    );

  return messagesToGeminiHistory(
    messages
  );
}


async function saveChatMessage(
  role,
  content,
  metadata = null
) {
  if (!state.conversationId) {
    return null;
  }

  try {
    return await saveMessage({
      conversationId:
        state.conversationId,
      role,
      content,
      metadata
    });
  } catch (error) {
    console.error(
      "Failed to save chat message:",
      error
    );

    return null;
  }
}


function normalizeIntent(
  value
) {
  const intent =
    String(value || "")
      .trim()
      .toLowerCase();

  if (!intent) {
    return "";
  }

  return intent
    .replace(/[\s-]+/g, "_");
}


function getChatResponse(
  result
) {
  const candidates = [
    result?.response,
    result?.answer,
    result?.message,
    result?.text
  ];

  for (const value of candidates) {
    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return "";
}


export async function createPlan(
  message,
  history = []
) {
  const response =
    await fetch(
      "/api/agent/plan",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json"
        },
        body: JSON.stringify({
          owner:
            getOwner(),
          repo:
            getRepo(),
          branch:
            state.selectedBranch,
          message,
          history,
          model:
            state.selectedModel
        })
      }
    );

  const data =
    await readJson(response);

  if (
    !response.ok ||
    !data?.ok
  ) {
    throw new Error(
      getReadableError(
        data?.error
      ) ||
        "Agent planning failed."
    );
  }

  if (
    !data.plan ||
    typeof data.plan !==
      "object"
  ) {
    throw new Error(
      "Agent returned an invalid plan."
    );
  }

  return normalizePlan({
  ...data.plan,
  requiresWrite:
    data.requiresWrite ??
    data.plan.requiresWrite
});
}


export async function createChanges(
  message,
  plan,
  history = []
) {
  const response =
    await fetch(
      "/api/agent/changes",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json"
        },
        body: JSON.stringify({
          owner:
            getOwner(),
          repo:
            getRepo(),
          branch:
            state.selectedBranch,
          message,
          history,
          plan,
          model:
            state.selectedModel
        })
      }
    );

  const data =
    await readJson(response);

  if (
    !response.ok ||
    !data?.ok
  ) {
    throw new Error(
      getReadableError(
        data?.error
      ) ||
        "Agent change generation failed."
    );
  }

  if (
    !data.changes ||
    !Array.isArray(
      data.changes
    )
  ) {
    throw new Error(
      "Agent returned an invalid change set."
    );
  }

  return {
    ...data,
    changes:
      normalizeChanges(
        data.changes
      ),
    verification:
      normalizeStringArray(
        data.verification
      )
  };
}


export async function requestPermission(
  mode
) {
  if (
    state.agent.phase !==
      "permission-required"
  ) {
    throw new Error(
      "There is no pending change set requiring permission."
    );
  }

  const changes =
    state.agent.changes;

  if (
    !Array.isArray(changes) ||
    changes.length === 0
  ) {
    throw new Error(
      "No valid changes are available."
    );
  }

  if (
    mode !== "allow_once" &&
    mode !== "allow_for_task" &&
    mode !== "deny"
  ) {
    throw new Error(
      "Invalid permission mode."
    );
  }

  updateProgress(
    "Permission request server ko bhej raha hoon..."
  );

  const response =
    await fetch(
      "/api/agent/permission",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json"
        },
        body: JSON.stringify({
          owner:
            getOwner(),
          repo:
            getRepo(),
          branch:
            state.selectedBranch,
          changes,
          mode
        })
      }
    );

  const data =
    await readJson(response);

  if (
    !response.ok ||
    !data?.ok
  ) {
    throw new Error(
      getReadableError(
        data?.error
      ) ||
        "Permission request failed."
    );
  }

  if (
    mode === "deny"
  ) {
    state.agent.permission =
      null;

    state.agent.phase =
      "denied";

    removeProgress();

    const text =
      "GitHub changes denied. Koi file write nahi ki gayi.";

    appendMessage(
      "system",
      text
    );

    await saveChatMessage(
      "system",
      text,
      {
        operation:
          "permission-denied"
      }
    );

    return data;
  }

  state.agent.permission = {
    ...state.agent.permission,
    ...data
  };

  state.agent.phase =
    "permission-granted";

  updateProgress(
    "Permission granted. Apply step start kar raha hoon..."
  );

  const text =
    permissionGrantedMessage(
      mode,
      data
    );

  appendMessage(
    "system",
    text
  );

  await saveChatMessage(
    "system",
    text,
    {
      operation:
        "permission-granted"
    }
  );

  return data;
}


export async function applyChanges(
  mode = "allow_once"
) {
  if (
    state.agent.phase !==
    "permission-required"
  ) {
    throw new Error(
      "Apply karne ke liye pending changes aur permission required hai."
    );
  }

  const changes =
    getPendingChanges();

  if (
    changes.length === 0
  ) {
    throw new Error(
      "Apply karne ke liye koi changes nahi hain."
    );
  }

  setBusy(true);

  try {
    if (
      mode !== "allow_once" &&
      mode !== "allow_for_task"
    ) {
      throw new Error(
        "Invalid apply permission mode."
      );
    }

    updateProgress(
      "GitHub write permission verify kar raha hoon..."
    );

    await requestPermission(
      mode
    );

    if (
      state.agent.phase !==
      "permission-granted"
    ) {
      throw new Error(
        "GitHub write permission grant nahi hui."
      );
    }

    updateProgress(
      "Approved changes GitHub par apply kar raha hoon..."
    );

    const response =
      await fetch(
        "/api/agent/apply",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept:
              "application/json"
          },
          body: JSON.stringify({
            owner:
              getOwner(),
            repo:
              getRepo(),
            branch:
              state.selectedBranch,
            message:
              buildCommitMessage(),
            changes
          })
        }
      );

    const data =
      await readJson(response);

    if (
      !response.ok ||
      !data?.ok
    ) {
      throw new Error(
        getReadableError(
          data?.error
        ) ||
          "GitHub apply failed."
      );
    }

    if (
      !data.commit ||
      typeof data.commit.sha !==
        "string"
    ) {
      throw new Error(
        "GitHub apply returned an invalid commit."
      );
    }

    state.agent.applied =
      true;

    state.agent.phase =
      "applied";

    updateProgress(
      "GitHub commit verify kar raha hoon..."
    );

    const verification =
      await verifyChanges(
        data.commit.sha,
        changes
      );

    if (
      !verification.verified
    ) {
      state.agent.phase =
        "verification-failed";

      throw new Error(
        getReadableError(
          verification.error
        ) ||
          "GitHub changes apply ho gayi hain lekin verification fail ho gayi."
      );
    }

    state.agent.phase =
      "completed";

    removeProgress();

    const resultText =
      formatApplyResult(
        data,
        verification
      );

    appendMessage(
      "assistant",
      resultText
    );

    await saveChatMessage(
      "assistant",
      resultText,
      {
        operation:
          "apply",
        commit:
          data.commit
      }
    );

    showGlobalMessage(
      "Changes successfully apply aur verify ho gayi hain.",
      "success"
    );

    return {
      apply: data,
      verification
    };
  } catch (error) {
    if (
      state.agent.phase !==
      "verification-failed"
    ) {
      state.agent.phase =
        "error";
    }

    console.error(
      "Agent apply workflow failed:",
      error
    );

    removeProgress();

    const readableError =
      getReadableError(error);

    appendMessage(
      "error",
      readableError
    );

    await saveChatMessage(
      "error",
      readableError,
      {
        operation:
          "apply"
      }
    );

    showGlobalMessage(
      readableError,
      "error"
    );

    throw new Error(
      readableError
    );
  } finally {
    setBusy(false);
  }
}


export async function verifyChanges(
  commitSha,
  changes = state.agent.changes
) {
  if (
    !isValidSha(commitSha)
  ) {
    throw new Error(
      "Invalid commit SHA returned by GitHub."
    );
  }

  if (
    !Array.isArray(changes) ||
    changes.length === 0
  ) {
    throw new Error(
      "No changes available for verification."
    );
  }

  const response =
    await fetch(
      "/api/agent/verify",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept:
            "application/json"
        },
        body: JSON.stringify({
          owner:
            getOwner(),
          repo:
            getRepo(),
          branch:
            state.selectedBranch,
          commitSha,
          changes
        })
      }
    );

  const data =
    await readJson(response);

  if (
    !response.ok ||
    !data?.ok ||
    !data?.verified
  ) {
    return {
      ...data,
      verified: false,
      error:
        getReadableError(
          data?.error
        ) ||
        "Post-apply verification failed."
    };
  }

  return {
    ...data,
    verifiedFiles:
      normalizeStringArray(
        data.verifiedFiles
      ),
    verification:
      normalizeStringArray(
        data.verification
      )
  };
}


export function resetAgent() {
  state.agent = {
    phase: "idle",
    requestId: null,
    plan: null,
    changes: [],
    permission: null,
    applied: false
  };
}


export function getPendingChanges() {
  if (
    state.agent.phase !==
      "permission-required" &&
    state.agent.phase !==
      "permission-granted"
  ) {
    return [];
  }

  return Array.isArray(
    state.agent.changes
  )
    ? state.agent.changes
    : [];
}


function buildPermissionRequest(
  changes
) {
  return {
    mode: "always_ask",
    changeCount:
      changes.length,
    changes:
      changes.map(
        (change) => ({
          operation:
            safeString(
              change.operation
            ),
          path:
            safeString(
              change.path
            ),
          reason:
            safeString(
              change.reason
            )
        })
      )
  };
}


function formatPlan(plan) {
  const normalized =
    normalizePlan(plan);

  const lines = [];

  lines.push(
    `Plan: ${normalized.summary}`
  );

  if (
    normalized.analysis
  ) {
    lines.push(
      "",
      `Analysis: ${normalized.analysis}`
    );
  }

  if (
    normalized.changes.length
  ) {
    lines.push(
      "",
      "Planned changes:"
    );

    normalized.changes.forEach(
      (change, index) => {
        lines.push(
          `${index + 1}. ${safeString(change.operation)} ${safeString(change.path)}`,
          `   ${safeString(change.reason || change.details)}`
        );
      }
    );
  }

  if (
    normalized.verification.length
  ) {
    lines.push(
      "",
      "Verification:"
    );

    normalized.verification.forEach(
      (step, index) => {
        lines.push(
          `${index + 1}. ${step}`
        );
      }
    );
  }

  if (normalized.risk) {
    lines.push(
      "",
      `Risk: ${normalized.risk}`
    );
  }

  return lines.join("\n");
}


function formatChanges(
  result
) {
  const changes =
    normalizeChanges(
      result?.changes
    );

  const lines = [
    `Exact changes generated: ${changes.length}`
  ];

  changes.forEach(
    (change, index) => {
      lines.push(
        "",
        `${index + 1}. ${String(
          change.operation || ""
        ).toUpperCase()} ${safeString(
          change.path
        )}`,
        change.reason
          ? `Reason: ${safeString(
              change.reason
            )}`
          : ""
      );
    }
  );

  const verification =
    normalizeStringArray(
      result?.verification
    );

  if (
    verification.length
  ) {
    lines.push(
      "",
      "Verification after apply:"
    );

    verification.forEach(
      (step, index) => {
        lines.push(
          `${index + 1}. ${step}`
        );
      }
    );
  }

  return lines
    .filter(Boolean)
    .join("\n");
}


function formatPermissionRequest(
  permission
) {
  const lines = [
    "PERMISSION REQUIRED",
    "",
    `GitHub par ${permission.changeCount} change(s) apply hone wali hain.`,
    ""
  ];

  permission.changes.forEach(
    (change, index) => {
      lines.push(
        `${index + 1}. ${String(
          change.operation
        ).toUpperCase()} ${safeString(
          change.path
        )}`
      );

      if (change.reason) {
        lines.push(
          `   ${change.reason}`
        );
      }
    }
  );

  lines.push(
    "",
    "Permission options:",
    "ALLOW ONCE — sirf is change set ke liye",
    "ALLOW FOR TASK — current task ke liye",
    "DENY — koi GitHub write nahi"
  );

  return lines.join("\n");
}


function permissionGrantedMessage(
  mode,
  data
) {
  const label =
    mode === "allow_once"
      ? "ALLOW ONCE"
      : "ALLOW FOR TASK";

  const expires =
    data?.expiresAt
      ? ` Expires: ${safeString(
          data.expiresAt
        )}.`
      : "";

  return `${label} granted.${expires} Actual GitHub write ab apply step mein hoga.`;
}


function formatApplyResult(
  apply,
  verification
) {
  const verifiedFiles =
    Array.isArray(
      verification?.verifiedFiles
    )
      ? verification.verifiedFiles
      : [];

  const commitSha =
    safeString(
      apply?.commit?.sha
    );

  const lines = [
    "GitHub changes successfully applied.",
    "",
    `Commit: ${commitSha}`,
    `Verified files: ${verifiedFiles.length}`
  ];

  if (
    apply?.commit?.url
  ) {
    lines.push(
      `Commit URL: ${safeString(
        apply.commit.url
      )}`
    );
  }

  lines.push(
    "",
    "Post-apply verification: PASSED"
  );

  return lines.join("\n");
}


function buildCommitMessage() {
  const summary =
    state.agent.plan?.summary;

  if (
    typeof summary ===
      "string" &&
    summary.trim()
  ) {
    return `LD76 Code Agent: ${summary.trim()}`.slice(
      0,
      500
    );
  }

  return "LD76 Code Agent changes";
}


function isValidSha(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{40}$/i.test(
      value
    )
  );
}


function validateRepositorySelection() {
  if (!state.githubConnected) {
    throw new Error(
      "GitHub connect karo pehle."
    );
  }

  if (
    !state.selectedRepository ||
    !state.selectedBranch
  ) {
    throw new Error(
      "Repository aur branch select karo pehle."
    );
  }
}


function getOwner() {
  const repository =
    state.selectedRepository || "";

  const separator =
    repository.indexOf("/");

  if (
    separator <= 0
  ) {
    throw new Error(
      "Invalid repository selection."
    );
  }

  return repository.slice(
    0,
    separator
  );
}


function getRepo() {
  const repository =
    state.selectedRepository || "";

  const separator =
    repository.indexOf("/");

  if (
    separator <= 0 ||
    separator ===
      repository.length - 1
  ) {
    throw new Error(
      "Invalid repository selection."
    );
  }

  return repository.slice(
    separator + 1
  );
}


function normalizePlan(
  value
) {
  const plan =
    value &&
    typeof value === "object"
      ? value
      : {};

  return {
    ...plan,
    summary:
      safeString(
        plan.summary
      ) ||
      "No summary provided.",
    analysis:
      safeString(
        plan.analysis
      ),
    requiresWrite:
      Boolean(
        plan.requiresWrite
      ),
    changes:
      normalizeChanges(
        plan.changes
      ),
    verification:
      normalizeStringArray(
        plan.verification
      ),
    risk:
      safeString(
        plan.risk
      ) ||
      "unknown"
  };
}


function normalizeChanges(
  changes
) {
  if (
    !Array.isArray(changes)
  ) {
    return [];
  }

  return changes
    .filter(
      (change) =>
        change &&
        typeof change ===
          "object"
    )
    .map(
      (change) => ({
        ...change,
        operation:
          safeString(
            change.operation
          ),
        path:
          safeString(
            change.path
          ),
        reason:
          safeString(
            change.reason
          ),
        details:
          safeString(
            change.details
          )
      })
    );
}


function normalizeStringArray(
  value
) {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return value.map(
    (item) =>
      safeString(item)
  );
}


function safeString(
  value
) {
  if (
    typeof value ===
      "string"
  ) {
    return value;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return String(value);
  }

  return getReadableError(
    value
  );
}


function getReadableError(
  error
) {
  if (
    typeof error ===
      "string"
  ) {
    return error;
  }

  if (
    error &&
    typeof error.message ===
      "string"
  ) {
    return error.message;
  }

  if (
    error &&
    typeof error.error ===
      "string"
  ) {
    return error.error;
  }

  if (
    error &&
    error.error &&
    typeof error.error.message ===
      "string"
  ) {
    return error.error.message;
  }

  if (
    error &&
    typeof error.statusText ===
      "string"
  ) {
    return error.statusText;
  }

  try {
    const serialized =
      JSON.stringify(error);

    if (
      serialized &&
      serialized !== "{}"
    ) {
      return serialized;
    }
  } catch {
    // Ignore serialization errors.
  }

  return "Agent request failed.";
}

    



async function readJson(
  response
) {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  let data;

  try {
    data =
      JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned invalid JSON (${response.status}).`
    );
  }

  if (
    data &&
    typeof data === "object" &&
    data.error !== undefined &&
    typeof data.error !== "string"
  ) {
    data.error =
      getReadableError(
        data.error
      );
  }

  return data;
    }
