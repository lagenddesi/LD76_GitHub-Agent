import { state } from "./state.js";
import { elements } from "./dom.js";
import {
  setBusy,
  showAgentPermission,
  hideAgentPermission,
  updateAgentPermissionUI,
  showGlobalMessage
} from "./ui.js";
import {
  runAgent,
  applyChanges,
  requestPermission,
  resetAgent
} from "./agent.js";

export function initializeEvents() {
  bindChatEvents();
  bindModelEvents();
  bindPermissionEvents();
  bindLocalDataEvents();
}

function bindChatEvents() {
  elements.chatForm?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      await submitChat();
    }
  );

  elements.chatInput?.addEventListener(
    "keydown",
    async (event) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();

      await submitChat();
    }
  );
}

async function submitChat() {
  if (state.busy) {
    return;
  }

  const message =
    elements.chatInput?.value.trim() ||
    "";

  if (!message) {
    return;
  }

  if (!state.githubConnected) {
    showGlobalMessage(
      "Pehle GitHub connect karo.",
      "error"
    );

    return;
  }

  if (
    !state.selectedRepository ||
    !state.selectedBranch
  ) {
    showGlobalMessage(
      "Repository aur branch select karo.",
      "error"
    );

    return;
  }

  if (elements.chatInput) {
    elements.chatInput.value = "";
  }

  try {
    await runAgent(message);

    updateAgentPermissionUI();
  } catch (error) {
    console.error(
      "Chat submission failed:",
      error
    );
  }
}

function bindModelEvents() {
  elements.modelSelector?.addEventListener(
    "change",
    () => {
      state.selectedModel =
        elements.modelSelector.value ||
        "auto";
    }
  );
}

function bindPermissionEvents() {
  elements.agentAllowOnceButton?.addEventListener(
    "click",
    async () => {
      await handlePermissionAction(
        "allow_once"
      );
    }
  );

  elements.agentAllowTaskButton?.addEventListener(
    "click",
    async () => {
      await handlePermissionAction(
        "allow_for_task"
      );
    }
  );

  elements.agentDenyButton?.addEventListener(
    "click",
    async () => {
      await handlePermissionAction(
        "deny"
      );
    }
  );
}

async function handlePermissionAction(
  mode
) {
  if (state.busy) {
    return;
  }

  if (
    state.agent.phase !==
    "permission-required"
  ) {
    return;
  }

  setBusy(true);

  try {
    if (mode === "deny") {
      await requestPermission(
        "deny"
      );

      hideAgentPermission();

      return;
    }

    await applyChanges(mode);

    hideAgentPermission();
  } catch (error) {
    console.error(
      "Permission action failed:",
      error
    );

    showGlobalMessage(
      error.message ||
        "Permission action failed.",
      "error"
    );

    updateAgentPermissionUI();
  } finally {
    setBusy(false);
  }
}

function bindLocalDataEvents() {
  elements.newChatButton?.addEventListener(
    "click",
    () => {
      resetAgent();

      hideAgentPermission();

      elements.chatMessages?.replaceChildren();

      showGlobalMessage(
        "New chat started.",
        "success"
      );
    }
  );

  elements.clearLocalDataButton?.addEventListener(
    "click",
    () => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (error) {
        console.error(
          "Local data clear failed:",
          error
        );
      }

      resetAgent();
      hideAgentPermission();

      elements.chatMessages?.replaceChildren();

      showGlobalMessage(
        "Local data cleared.",
        "success"
      );
    }
  );
}
