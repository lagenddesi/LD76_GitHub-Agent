/*
 * LD76 Code Agent
 * Phase 0 — Frontend application shell
 *
 * No real Gemini or GitHub operations are implemented in Phase 0.
 * This file only provides the UI state, navigation, local shell behavior,
 * and backend API foundation hooks required by the Phase 0 interface.
 */

(() => {
  "use strict";

  const state = {
    activeScreen: "chat",
    isBusy: false,
    selectedRepository: "",
    selectedBranch: "",
    selectedModel: "auto",
    permissionMode: "always-ask"
  };

  const elements = {
    screens: document.querySelectorAll(".screen"),
    navigationItems: document.querySelectorAll("[data-navigate]"),

    connectionStatus: document.getElementById("connection-status"),

    menuButton: document.getElementById("menu-button"),
    mainNavigation: document.getElementById("main-navigation"),

    newChatButton: document.getElementById("new-chat-button"),

    currentRepository: document.getElementById("current-repository"),
    modelSelector: document.getElementById("model-selector"),

    chatMessages: document.getElementById("chat-messages"),
    chatForm: document.getElementById("chat-form"),
    messageInput: document.getElementById("message-input"),
    sendButton: document.getElementById("send-button"),

    agentProgress: document.getElementById("agent-progress"),
    agentProgressText: document.getElementById("agent-progress-text"),

    githubConnectionMessage: document.getElementById(
      "github-connection-message"
    ),
    githubStatusBadge: document.getElementById(
      "github-status-badge"
    ),
    githubConnectButton: document.getElementById(
      "github-connect-button"
    ),

    repositorySelector: document.getElementById(
      "repository-selector"
    ),
    branchSelector: document.getElementById(
      "branch-selector"
    ),
    repositoryStatus: document.getElementById(
      "repository-status"
    ),

    geminiTestButton: document.getElementById(
      "gemini-test-button"
    ),
    refreshModelsButton: document.getElementById(
      "refresh-models-button"
    ),

    permissionMode: document.getElementById(
      "permission-mode"
    ),

    clearLocalDataButton: document.getElementById(
      "clear-local-data-button"
    ),

    globalMessage: document.getElementById("global-message")
  };

  function showScreen(screenName) {
    const validScreens = ["chat", "github", "settings"];

    if (!validScreens.includes(screenName)) {
      return;
    }

    state.activeScreen = screenName;

    elements.screens.forEach((screen) => {
      const isActive =
        screen.dataset.screen === screenName;

      screen.classList.toggle("active", isActive);
    });

    elements.navigationItems.forEach((item) => {
      const isActive =
        item.dataset.navigate === screenName;

      item.classList.toggle("active", isActive);

      if (isActive) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    closeMobileNavigation();
  }

  function closeMobileNavigation() {
    if (!elements.mainNavigation) {
      return;
    }

    elements.mainNavigation.classList.remove("mobile-open");

    if (elements.menuButton) {
      elements.menuButton.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  }

  function toggleMobileNavigation() {
    if (!elements.mainNavigation || !elements.menuButton) {
      return;
    }

    const isOpen =
      elements.mainNavigation.classList.toggle(
        "mobile-open"
      );

    elements.menuButton.setAttribute(
      "aria-expanded",
      String(isOpen)
    );
  }

  function setBusy(isBusy) {
    state.isBusy = isBusy;

    elements.sendButton.disabled = isBusy;
    elements.messageInput.disabled = isBusy;
    elements.newChatButton.disabled = isBusy;

    if (isBusy) {
      elements.agentProgress.classList.remove("hidden");
    } else {
      elements.agentProgress.classList.add("hidden");
    }
  }

  function setProgress(message) {
    elements.agentProgressText.textContent = message;
    elements.agentProgress.classList.remove("hidden");
  }

  function showGlobalMessage(message) {
    if (!message) {
      return;
    }

    elements.globalMessage.textContent = message;
    elements.globalMessage.classList.remove("hidden");

    window.clearTimeout(showGlobalMessage.timeoutId);

    showGlobalMessage.timeoutId = window.setTimeout(() => {
      elements.globalMessage.classList.add("hidden");
    }, 3500);
  }

  function createMessageElement(role, content) {
    const wrapper = document.createElement("div");

    wrapper.className = "chat-message";
    wrapper.dataset.role = role;

    const label = document.createElement("strong");
    label.className = "chat-message-role";
    label.textContent =
      role === "user" ? "You" : "LD76 Agent";

    const body = document.createElement("div");
    body.className = "chat-message-content";
    body.textContent = content;

    wrapper.appendChild(label);
    wrapper.appendChild(body);

    return wrapper;
  }

  function appendMessage(role, content) {
    const emptyState =
      elements.chatMessages.querySelector(".empty-chat");

    if (emptyState) {
      emptyState.remove();
    }

    const messageElement =
      createMessageElement(role, content);

    elements.chatMessages.appendChild(messageElement);

    elements.chatMessages.scrollTop =
      elements.chatMessages.scrollHeight;
  }

  function resetChat() {
    if (state.isBusy) {
      return;
    }

    elements.chatMessages.innerHTML = `
      <div class="empty-chat">
        <div class="empty-chat-icon">⌘</div>

        <h2>Ready to code</h2>

        <p>
          Connect a GitHub repository and start a conversation
          with your coding agent.
        </p>
      </div>
    `;

    elements.messageInput.value = "";
    autoResizeTextarea();

    showGlobalMessage("New chat started.");
  }

  function autoResizeTextarea() {
    const textarea = elements.messageInput;

    textarea.style.height = "auto";

    const maxHeight = 160;
    const nextHeight = Math.min(
      textarea.scrollHeight,
      maxHeight
    );

    textarea.style.height = `${Math.max(
      42,
      nextHeight
    )}px`;
  }

  function updateRepositoryState(repository) {
    state.selectedRepository = repository || "";

    if (state.selectedRepository) {
      elements.currentRepository.textContent =
        state.selectedRepository;

      elements.repositoryStatus.textContent =
        `Selected repository: ${state.selectedRepository}`;
    } else {
      elements.currentRepository.textContent =
        "No repository selected";

      elements.repositoryStatus.textContent =
        "No repository selected.";
    }
  }

  function updateBranchState(branch) {
    state.selectedBranch = branch || "";
  }

  function updateModelState(model) {
    state.selectedModel = model || "auto";
  }

  function updatePermissionState(mode) {
    state.permissionMode = mode || "always-ask";
  }

  async function sendChatMessage(message) {
    /*
     * Phase 0 deliberately does not call Gemini.
     * The endpoint is reserved for the real backend implementation
     * in later phases.
     */

    setBusy(true);
    setProgress("Preparing request...");

    await new Promise((resolve) => {
      window.setTimeout(resolve, 300);
    });

    setBusy(false);

    showGlobalMessage(
      "AI backend is not enabled yet. Phase 0 UI is ready."
    );
  }

  async function handleChatSubmit(event) {
    event.preventDefault();

    if (state.isBusy) {
      return;
    }

    const message =
      elements.messageInput.value.trim();

    if (!message) {
      return;
    }

    appendMessage("user", message);

    elements.messageInput.value = "";
    autoResizeTextarea();

    await sendChatMessage(message);
  }

  function handleRepositoryChange(event) {
    updateRepositoryState(event.target.value);

    if (!event.target.value) {
      elements.branchSelector.disabled = true;

      elements.branchSelector.innerHTML = `
        <option value="">
          Select a repository first
        </option>
      `;

      updateBranchState("");
      return;
    }

    /*
     * Phase 0 only prepares the branch selector.
     * Real branch retrieval arrives with GitHub integration.
     */

    elements.branchSelector.disabled = false;

    elements.branchSelector.innerHTML = `
      <option value="main">main</option>
    `;

    updateBranchState("main");
  }

  function handleBranchChange(event) {
    updateBranchState(event.target.value);
  }

  function handleModelChange(event) {
    updateModelState(event.target.value);
  }

  function handlePermissionChange(event) {
    updatePermissionState(event.target.value);
  }

  function handleGitHubConnect() {
    showGlobalMessage(
      "GitHub authentication will be implemented in Phase 3."
    );
  }

  function handleGeminiTest() {
    showGlobalMessage(
      "Gemini connection testing will be implemented in Phase 1."
    );
  }

  function handleRefreshModels() {
    showGlobalMessage(
      "Dynamic model discovery will be implemented in Phase 2."
    );
  }

  function handleClearLocalData() {
    const confirmed = window.confirm(
      "Clear local application data?"
    );

    if (!confirmed) {
      return;
    }

    try {
      window.localStorage.clear();
      window.sessionStorage.clear();

      showGlobalMessage(
        "Local browser data cleared."
      );
    } catch (error) {
      console.error(
        "Failed to clear local browser data:",
        error
      );

      showGlobalMessage(
        "Could not clear local browser data."
      );
    }
  }

  function handleNavigation(event) {
    const screenName =
      event.currentTarget.dataset.navigate;

    showScreen(screenName);
  }

  function handleMenuClick() {
    toggleMobileNavigation();
  }

  function handleDocumentClick(event) {
    if (
      window.innerWidth >= 700 ||
      !elements.mainNavigation ||
      !elements.menuButton
    ) {
      return;
    }

    const clickedInsideNavigation =
      elements.mainNavigation.contains(event.target);

    const clickedMenuButton =
      elements.menuButton.contains(event.target);

    if (
      !clickedInsideNavigation &&
      !clickedMenuButton
    ) {
      closeMobileNavigation();
    }
  }

  function initialize() {
    elements.navigationItems.forEach((item) => {
      item.addEventListener(
        "click",
        handleNavigation
      );
    });

    elements.menuButton.addEventListener(
      "click",
      handleMenuClick
    );

    elements.newChatButton.addEventListener(
      "click",
      resetChat
    );

    elements.chatForm.addEventListener(
      "submit",
      handleChatSubmit
    );

    elements.messageInput.addEventListener(
      "input",
      autoResizeTextarea
    );

    elements.messageInput.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();

          elements.chatForm.requestSubmit();
        }
      }
    );

    elements.repositorySelector.addEventListener(
      "change",
      handleRepositoryChange
    );

    elements.branchSelector.addEventListener(
      "change",
      handleBranchChange
    );

    elements.modelSelector.addEventListener(
      "change",
      handleModelChange
    );

    elements.permissionMode.addEventListener(
      "change",
      handlePermissionChange
    );

    elements.githubConnectButton.addEventListener(
      "click",
      handleGitHubConnect
    );

    elements.geminiTestButton.addEventListener(
      "click",
      handleGeminiTest
    );

    elements.refreshModelsButton.addEventListener(
      "click",
      handleRefreshModels
    );

    elements.clearLocalDataButton.addEventListener(
      "click",
      handleClearLocalData
    );

    document.addEventListener(
      "click",
      handleDocumentClick
    );

    window.addEventListener(
      "resize",
      () => {
        if (window.innerWidth >= 700) {
          closeMobileNavigation();
        }
      }
    );

    elements.connectionStatus.textContent =
      "Not connected";

    elements.githubConnectionMessage.textContent =
      "GitHub is not connected.";

    elements.githubStatusBadge.textContent =
      "Disconnected";

    elements.permissionMode.value =
      state.permissionMode;

    elements.modelSelector.value =
      state.selectedModel;

    showScreen("chat");
    autoResizeTextarea();
  }

  initialize();
})();
