import { state } from "./state.js";
import { elements } from "./dom.js";

import {
  hideAgentPermission,
  updateAgentPermissionUI,
  showGlobalMessage,
  addWelcomeMessage
} from "./ui.js";

import {
  testGeminiConnection,
  refreshModels
} from "./gemini.js";

import {
  runAgent,
  applyChanges,
  requestPermission,
  resetAgent
} from "./agent.js";

import {
  startNewConversation,
  clearAllHistory
} from "./history.js";

export function initializeEvents() {
  bindChatEvents();
  bindModelEvents();
  bindGeminiEvents();
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

    showGlobalMessage(
      error.message ||
        "Agent request failed.",
      "error"
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

function bindGeminiEvents() {
  elements.geminiTestButton?.addEventListener(
    "click",
    async () => {
      await testGeminiConnection();
    }
  );

  elements.refreshModelsButton?.addEventListener(
    "click",
    async () => {
      await refreshModels();
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
  }
}

function bindLocalDataEvents() {
  elements.newChatButton?.addEventListener(
    "click",
    async () => {
      if (state.busy) {
        return;
      }

      try {
        resetAgent();

        hideAgentPermission();

        state.conversationId =
          startNewConversation();

        state.historyLoaded = true;

        elements.chatMessages?.replaceChildren();

        addWelcomeMessage();

        showGlobalMessage(
          "New chat started.",
          "success"
        );
      } catch (error) {
        console.error(
          "New chat failed:",
          error
        );

        showGlobalMessage(
          "New chat start nahi ho saka.",
          "error"
        );
      }
    }
  );

  elements.clearLocalDataButton?.addEventListener(
    "click",
    async () => {
      if (state.busy) {
        return;
      }

      try {
        await clearAllHistory();

        localStorage.clear();
        sessionStorage.clear();

        resetAgent();

        hideAgentPermission();

        state.conversationId =
          startNewConversation();

        state.historyLoaded = true;

        elements.chatMessages?.replaceChildren();

        addWelcomeMessage();

        showGlobalMessage(
          "Local data aur chat history clear ho gayi.",
          "success"
        );
      } catch (error) {
        console.error(
          "Local data clear failed:",
          error
        );

        showGlobalMessage(
          "Local data clear nahi ho saka.",
          "error"
        );
      }
    }
  );
}
