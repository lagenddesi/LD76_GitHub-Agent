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
    updateProgress(
      "Repository inspect kar raha hoon..."
    );
    appendProgress(
      "Repository inspect kar raha hoon..."
    );

    const plan = await createPlan(
      cleanMessage
    );

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
    state.agent.phase = "error";

    console.error(
      "Agent workflow failed:",
      error
    );

    removeProgress();

    appendMessage(
      "error",
      error.message ||
        "Agent request failed."
    );

    showGlobalMessage(
      error.message ||
        "Agent request failed.",
      "error"
    );

    throw error;
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
      data?.error ||
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

  return data.plan;
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
      data?.error ||
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

  return data;
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
    !Array.isArray(changes)
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
      data?.error ||
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
    "Permission granted. Write step abhi separate apply phase mein hoga."
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
    changes: changes.map(
      (change) => ({
        operation:
          change.operation,
        path:
          change.path,
        reason:
          change.reason || ""
      })
    )
  };
}

function formatPlan(plan) {
  const lines = [];

  lines.push(
    `Plan: ${plan.summary || "No summary provided."}`
  );

  if (
    plan.analysis
  ) {
    lines.push(
      "",
      `Analysis: ${plan.analysis}`
    );
  }

  if (
    Array.isArray(
      plan.changes
    ) &&
    plan.changes.length
  ) {
    lines.push(
      "",
      "Planned changes:"
    );

    plan.changes.forEach(
      (change, index) => {
        lines.push(
          `${index + 1}. ${change.operation} ${change.path}`,
          `   ${change.reason || change.details || ""}`
        );
      }
    );
  }

  if (
    Array.isArray(
      plan.verification
    ) &&
    plan.verification.length
  ) {
    lines.push(
      "",
      "Verification:"
    );

    plan.verification.forEach(
      (step, index) => {
        lines.push(
          `${index + 1}. ${step}`
        );
      }
    );
  }

  if (plan.risk) {
    lines.push(
      "",
      `Risk: ${plan.risk}`
    );
  }

  return lines.join("\n");
}

function formatChanges(
  result
) {
  const changes =
    Array.isArray(
      result?.changes
    )
      ? result.changes
      : [];

  const lines = [
    `Exact changes generated: ${changes.length}`
  ];

  changes.forEach(
    (change, index) => {
      lines.push(
        "",
        `${index + 1}. ${String(
          change.operation || ""
        ).toUpperCase()} ${change.path}`,
        change.reason
          ? `Reason: ${change.reason}`
          : ""
      );
    }
  );

  if (
    Array.isArray(
      result?.verification
    ) &&
    result.verification.length
  ) {
    lines.push(
      "",
      "Verification after apply:"
    );

    result.verification.forEach(
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
        ).toUpperCase()} ${change.path}`
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
      ? ` Expires: ${data.expiresAt}.`
      : "";

  return `${label} granted.${expires} Actual GitHub write abhi separate apply step mein hoga.`;
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

async function readJson(
  response
) {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned invalid JSON (${response.status}).`
    );
  }
    }
