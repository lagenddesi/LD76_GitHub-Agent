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

  if (elements.agentAllowOnceButton) {
    elements.agentAllowOnceButton.disabled =
      state.busy;
  }

  if (elements.agentAllowTaskButton) {
    elements.agentAllowTaskButton.disabled =
      state.busy;
  }

  if (elements.agentDenyButton) {
    elements.agentDenyButton.disabled =
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

/**
 * Render one chat message.
 *
 * Supported roles:
 * - user
 * - assistant
 * - system
 * - error
 */
export function appendMessage(
  role,
  message,
  metadata = null
) {
  if (!elements.chatMessages) {
    return;
  }

  const cleanRole =
    normalizeMessageRole(role);

  const cleanMessage =
    String(message ?? "");

  if (!cleanMessage.trim()) {
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
    `chat-message chat-message-${cleanRole}`;

  article.dataset.role =
    cleanRole;

  if (
    metadata &&
    typeof metadata === "object"
  ) {
    if (metadata.type) {
      article.dataset.messageType =
        String(metadata.type);
    }

    if (metadata.operation) {
      article.dataset.operation =
        String(metadata.operation);
    }
  }

  const header =
    document.createElement("div");

  header.className =
    "chat-message-header";

  const sender =
    document.createElement("span");

  sender.className =
    "chat-message-sender";

  sender.textContent =
    getSenderLabel(cleanRole);

  header.appendChild(sender);

  if (
    metadata?.timestamp
  ) {
    const time =
      document.createElement("time");

    time.className =
      "chat-message-time";

    time.textContent =
      formatMessageTime(
        metadata.timestamp
      );

    header.appendChild(time);
  }

  const content =
    document.createElement("div");

  content.className =
    "chat-message-content";

  content.textContent =
    cleanMessage;

  article.appendChild(header);
  article.appendChild(content);

  elements.chatMessages.appendChild(
    article
  );

  scrollChatToBottom();
}

/**
 * Render messages loaded from IndexedDB.
 */
export function renderStoredMessages(
  messages
) {
  if (!elements.chatMessages) {
    return;
  }

  clearChatMessages();

  if (
    !Array.isArray(messages) ||
    messages.length === 0
  ) {
    addWelcomeMessage();
    return;
  }

  messages.forEach((message) => {
    appendMessage(
      message?.role,
      message?.content,
      {
        ...(message?.metadata || {}),
        timestamp:
          message?.createdAt || null
      }
    );
  });
}

/**
 * Render a message object returned
 * from history without requiring the
 * caller to manually map its fields.
 */
export function appendHistoryMessage(
  message
) {
  if (!message) {
    return;
  }

  appendMessage(
    message.role,
    message.content,
    {
      ...(message.metadata || {}),
      timestamp:
        message.createdAt || null
    }
  );
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
    "Ready. Tum mujhse normal conversation, planning, code review ya GitHub coding task ke bare mein baat kar sakte ho. Main bina clear instruction ke koi file change nahi karunga."
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
    configured:
      "Gemini configured",
    connected:
      "Gemini connected",
    testing:
      "Testing Gemini...",
    error:
      "Gemini error",
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
    checking:
      "Checking...",
    connected:
      "Connected",
    disconnected:
      "Disconnected",
    error:
      "Error"
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

export function showAgentPermission(
  permission
) {
  if (!elements.agentPermission) {
    return;
  }

  const changes =
    Array.isArray(
      permission?.changes
    )
      ? permission.changes
      : [];

  if (elements.agentPermissionMessage) {
    elements.agentPermissionMessage.textContent =
      `Agent ${changes.length} GitHub change(s) apply karna chahta hai. Review karo aur explicit permission do.`;
  }

  renderAgentPermissionChanges(
    changes
  );

  elements.agentPermission.classList.remove(
    "hidden"
  );

  elements.agentPermission.hidden =
    false;
}

export function hideAgentPermission() {
  if (!elements.agentPermission) {
    return;
  }

  elements.agentPermission.classList.add(
    "hidden"
  );

  elements.agentPermission.hidden =
    true;

  elements.agentPermissionChanges?.replaceChildren();
}

export function renderAgentPermissionChanges(
  changes
) {
  if (!elements.agentPermissionChanges) {
    return;
  }

  elements.agentPermissionChanges.replaceChildren();

  if (
    !Array.isArray(changes) ||
    changes.length === 0
  ) {
    const empty =
      document.createElement("p");

    empty.textContent =
      "No changes available.";

    elements.agentPermissionChanges.appendChild(
      empty
    );

    return;
  }

  changes.forEach(
    (change, index) => {
      const item =
        document.createElement("div");

      item.className =
        "agent-permission-change";

      const title =
        document.createElement("strong");

      const operation =
        String(
          change?.operation ||
            "change"
        ).toUpperCase();

      const path =
        String(
          change?.path ||
            "unknown file"
        );

      title.textContent =
        `${index + 1}. ${operation} ${path}`;

      item.appendChild(title);

      if (change?.reason) {
        const reason =
          document.createElement("p");

        reason.textContent =
          String(change.reason);

        item.appendChild(reason);
      }

      elements.agentPermissionChanges.appendChild(
        item
      );
    }
  );
}

export function updateAgentPermissionUI() {
  if (
    state.agent.phase ===
    "permission-required"
  ) {
    showAgentPermission(
      state.agent.permission
    );

    return;
  }

  hideAgentPermission();
}

function normalizeMessageRole(
  role
) {
  const value =
    String(role || "")
      .trim()
      .toLowerCase();

  if (
    value === "user" ||
    value === "assistant" ||
    value === "system" ||
    value === "error"
  ) {
    return value;
  }

  return "system";
}

function getSenderLabel(role) {
  const labels = {
    user: "You",
    assistant: "Gemini",
    system: "Agent",
    error: "Error"
  };

  return (
    labels[role] ||
    "Agent"
  );
}

function formatMessageTime(
  timestamp
) {
  const date =
    new Date(timestamp);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

function scrollChatToBottom() {
  if (!elements.chatMessages) {
    return;
  }

  elements.chatMessages.scrollTop =
    elements.chatMessages.scrollHeight;
    }
