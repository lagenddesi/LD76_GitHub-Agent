import { state } from "./state.js";
import {
  appendMessage,
  setBusy,
  appendProgress,
  updateProgress,
  removeProgress,
  showGlobalMessage
} from "./ui.js";

export async function runAgent(message) {
  if (state.busy) {
    return;
  }

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

  const cleanMessage =
    String(message || "").trim();

  if (!cleanMessage) {
    return;
  }

  resetAgent();

  appendMessage(
    "user",
    cleanMessage
  );

  setBusy(true);

  try {
    appendProgress(
      "Repository inspect kar raha hoon..."
    );

    const plan =
      await createPlan(cleanMessage);

    state.agent.plan = plan;
    state.agent.phase = "planned";

    appendMessage(
      "assistant",
      formatPlan(plan)
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

      return plan;
    }

    updateProgress(
      "Required files aur exact changes generate kar raha hoon..."
    );

    const changes =
      await createChanges(
        cleanMessage,
        plan
      );

    state.agent.changes =
      changes.changes;

    state.agent.phase =
      "changes-ready";

    appendMessage(
      "assistant",
      formatChanges(changes)
    );

    state.agent.permission =
      buildPermissionRequest(
        changes.changes
      );

    state.agent.phase =
      "permission-required";

    appendMessage(
      "system",
      formatPermissionRequest(
        state.agent.permission
      )
    );

    updateProgress(
      "Changes ready. Write se pehle permission required hai."
    );

    showGlobalMessage(
      "Changes ready hain. GitHub write se pehle permission required hai.",
      "info"
    );

    return {
      plan,
      changes,
      permission:
        state.agent.permission
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

export async function createPlan(
  message
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

  return normalizePlan(
    data.plan
  );
}

export async function createChanges(
  message,
  plan
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

    appendMessage(
      "system",
      "GitHub changes denied. Koi file write nahi ki gayi."
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

  appendMessage(
    "system",
    permissionGrantedMessage(
      mode,
      data
    )
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

    appendMessage(
      "assistant",
      formatApplyResult(
        data,
        verification
      )
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

  return lines.join(
    "\n"
  );
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

  return lines.join(
    "\n"
  );
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

  return lines.join(
    "\n"
  );
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
