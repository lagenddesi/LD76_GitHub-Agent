import { state } from "./state.js";
import { elements } from "./dom.js";

export function showScreen(screen) {
  state.currentScreen = screen;

  Object.entries(elements.screens).forEach(
    ([name, element]) => {
      if (!element) {
        return;
      }

      element.classList.toggle(
        "active",
        name === screen
      );

      element.hidden = name !== screen;
    }
  );

  elements.navButtons.forEach((button) => {
    const active =
      button.dataset.navigate === screen;

    button.classList.toggle(
      "active",
      active
    );

    if (active) {
      button.setAttribute(
        "aria-current",
        "page"
      );
    } else {
      button.removeAttribute(
        "aria-current"
      );
    }
  });

  closeNavigation();
}

export function closeNavigation() {
  if (!elements.mainNavigation) {
    return;
  }

  elements.mainNavigation.classList.remove(
    "open"
  );

  elements.menuButton?.setAttribute(
    "aria-expanded",
    "false"
  );
}

export function setBusy(busy) {
  state.busy = Boolean(busy);

  if (elements.sendButton) {
    elements.sendButton.disabled =
      state.busy;
  }

  if (elements.chatInput) {
    elements.chatInput.disabled =
      state.busy;
  }

  if (elements.githubConnectButton) {
    elements.githubConnectButton.disabled =
      state.busy;
  }

  if (elements.githubDisconnectButton) {
    elements.githubDisconnectButton.disabled =
      state.busy;
  }

  if (elements.geminiTestButton) {
    elements.geminiTestButton.disabled =
      state.busy;
  }

  if (elements.refreshModelsButton) {
    elements.refreshModelsButton.disabled =
      state.busy;
  }
}

export function appendProgress(message) {
  if (
    !elements.agentProgress ||
    !elements.agentProgressText
  ) {
    return;
  }

  elements.agentProgressText.textContent =
    message || "Working...";

  elements.agentProgress.classList.remove(
    "hidden"
  );
}

export function updateProgress(message) {
  if (!elements.agentProgressText) {
    return;
  }

  elements.agentProgressText.textContent =
    message || "Working...";
}

export function removeProgress() {
  elements.agentProgress?.classList.add(
    "hidden"
  );
}

export function appendMessage(
  type,
  message
) {
  if (!elements.chatMessages) {
    return;
  }

  const emptyChat =
    elements.chatMessages.querySelector(
      ".empty-chat"
    );

  emptyChat?.remove();

  const article =
    document.createElement("article");

  article.className =
    `chat-message chat-message-${type}`;

  const content =
    document.createElement("div");

  content.className =
    "chat-message-content";

  content.textContent =
    String(message ?? "");

  article.appendChild(content);

  elements.chatMessages.appendChild(
    article
  );

  elements.chatMessages.scrollTop =
    elements.chatMessages.scrollHeight;
}

export function addWelcomeMessage() {
  if (!elements.chatMessages) {
    return;
  }

  if (
    elements.chatMessages.querySelector(
      ".chat-message"
    )
  ) {
    return;
  }

  appendMessage(
    "system",
    "Ready. Connect GitHub, select a repository and branch, then tell the agent what you want to build or change."
  );
}

export function clearChatMessages() {
  if (!elements.chatMessages) {
    return;
  }

  elements.chatMessages.replaceChildren();
}

export function showGlobalMessage(
  message,
  type = "info"
) {
  if (!elements.globalMessage) {
    return;
  }

  elements.globalMessage.textContent =
    String(message ?? "");

  elements.globalMessage.className =
    `global-message ${type}`;

  window.clearTimeout(
    showGlobalMessage.timeoutId
  );

  showGlobalMessage.timeoutId =
    window.setTimeout(() => {
      elements.globalMessage.classList.add(
        "hidden"
      );
    }, 5000);
}

export function setGeminiStatus(
  status
) {
  if (!elements.connectionStatus) {
    return;
  }

  const labels = {
    configured: "Gemini configured",
    connected: "Gemini connected",
    testing: "Testing Gemini...",
    error: "Gemini error",
    "not-configured":
      "Gemini not configured",
    unavailable:
      "Gemini unavailable"
  };

  elements.connectionStatus.textContent =
    labels[status] ||
    "Not connected";
}

export function setGitHubStatus(
  status
) {
  if (!elements.githubStatusBadge) {
    return;
  }

  const labels = {
    checking: "Checking...",
    connected: "Connected",
    disconnected: "Disconnected",
    error: "Error"
  };

  elements.githubStatusBadge.textContent =
    labels[status] ||
    "Disconnected";

  elements.githubStatusBadge.className =
    `status-badge status-${status}`;
}

export function setGitHubConnectionMessage(
  message
) {
  if (
    !elements.githubConnectionMessage
  ) {
    return;
  }

  elements.githubConnectionMessage.textContent =
    String(message ?? "");
}

export function updateCurrentRepository() {
  if (!elements.currentRepository) {
    return;
  }

  if (
    !state.selectedRepository ||
    !state.selectedBranch
  ) {
    elements.currentRepository.textContent =
      "No repository selected";

    return;
  }

  elements.currentRepository.textContent =
    `${state.selectedRepository} / ${state.selectedBranch}`;
}

export function updateRepositoryStatus(
  message
) {
  if (!elements.repositoryStatus) {
    return;
  }

  if (message) {
    elements.repositoryStatus.textContent =
      message;

    return;
  }

  if (
    state.selectedRepository &&
    state.selectedBranch
  ) {
    elements.repositoryStatus.textContent =
      `Working context: ${state.selectedRepository} / ${state.selectedBranch}`;

    return;
  }

  if (state.selectedRepository) {
    elements.repositoryStatus.textContent =
      `Repository selected: ${state.selectedRepository}. Select a branch.`;

    return;
  }

  elements.repositoryStatus.textContent =
    "No repository selected.";
}

export function resetBranchSelector() {
  if (!elements.branchSelector) {
    return;
  }

  elements.branchSelector.replaceChildren();

  const option =
    document.createElement("option");

  option.value = "";
  option.textContent =
    "Select a repository first";

  elements.branchSelector.appendChild(
    option
  );

  elements.branchSelector.disabled =
    true;
}

export function setRepositorySelectorEnabled(
  enabled
) {
  if (!elements.repositorySelector) {
    return;
  }

  elements.repositorySelector.disabled =
    !enabled;
}

export function setBranchSelectorEnabled(
  enabled
) {
  if (!elements.branchSelector) {
    return;
  }

  elements.branchSelector.disabled =
    !enabled;
}
