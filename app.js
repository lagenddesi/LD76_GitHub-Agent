/*
 * LD76 Code Agent
 * Phase 2 — dynamic Gemini model discovery and selection
 */

(() => {
  "use strict";

  const state = {
    activeScreen: "chat",
    isBusy: false,
    selectedRepository: "",
    selectedBranch: "",
    selectedModel: "auto",
    permissionMode: "always-ask",
    models: [],
    modelsLoaded: false
  };

  const elements = {
    screens: document.querySelectorAll(".screen"),
    navigationItems: document.querySelectorAll("[data-navigate]"),

    connectionStatus:
      document.getElementById("connection-status"),

    menuButton:
      document.getElementById("menu-button"),
    mainNavigation:
      document.getElementById("main-navigation"),

    newChatButton:
      document.getElementById("new-chat-button"),

    currentRepository:
      document.getElementById("current-repository"),
    modelSelector:
      document.getElementById("model-selector"),

    chatMessages:
      document.getElementById("chat-messages"),
    chatForm:
      document.getElementById("chat-form"),
    messageInput:
      document.getElementById("message-input"),
    sendButton:
      document.getElementById("send-button"),

    agentProgress:
      document.getElementById("agent-progress"),
    agentProgressText:
      document.getElementById("agent-progress-text"),

    githubConnectionMessage:
      document.getElementById(
        "github-connection-message"
      ),
    githubStatusBadge:
      document.getElementById(
        "github-status-badge"
      ),
    githubConnectButton:
      document.getElementById(
        "github-connect-button"
      ),

    repositorySelector:
      document.getElementById(
        "repository-selector"
      ),
    branchSelector:
      document.getElementById(
        "branch-selector"
      ),
    repositoryStatus:
      document.getElementById(
        "repository-status"
      ),

    geminiTestButton:
      document.getElementById(
        "gemini-test-button"
      ),
    refreshModelsButton:
      document.getElementById(
        "refresh-models-button"
      ),

    permissionMode:
      document.getElementById(
        "permission-mode"
      ),

    clearLocalDataButton:
      document.getElementById(
        "clear-local-data-button"
      ),

    globalMessage:
      document.getElementById(
        "global-message"
      )
  };

  function showScreen(screenName) {
    const validScreens = [
      "chat",
      "github",
      "settings"
    ];

    if (!validScreens.includes(screenName)) {
      return;
    }

    state.activeScreen = screenName;

    elements.screens.forEach((screen) => {
      const isActive =
        screen.dataset.screen === screenName;

      screen.classList.toggle(
        "active",
        isActive
      );
    });

    elements.navigationItems.forEach(
      (item) => {
        const isActive =
          item.dataset.navigate ===
          screenName;

        item.classList.toggle(
          "active",
          isActive
        );

        if (isActive) {
          item.setAttribute(
            "aria-current",
            "page"
          );
        } else {
          item.removeAttribute(
            "aria-current"
          );
        }
      }
    );

    closeMobileNavigation();
  }

  function closeMobileNavigation() {
    if (!elements.mainNavigation) {
      return;
    }

    elements.mainNavigation.classList.remove(
      "mobile-open"
    );

    if (elements.menuButton) {
      elements.menuButton.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  }

  function toggleMobileNavigation() {
    if (
      !elements.mainNavigation ||
      !elements.menuButton
    ) {
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

    elements.sendButton.disabled =
      isBusy;
    elements.messageInput.disabled =
      isBusy;
    elements.newChatButton.disabled =
      isBusy;
    elements.geminiTestButton.disabled =
      isBusy;
    elements.refreshModelsButton.disabled =
      isBusy;

    if (isBusy) {
      elements.agentProgress.classList.remove(
        "hidden"
      );
    } else {
      elements.agentProgress.classList.add(
        "hidden"
      );
    }
  }

  function setProgress(message) {
    elements.agentProgressText.textContent =
      message;

    elements.agentProgress.classList.remove(
      "hidden"
    );
  }

  function showGlobalMessage(message) {
    if (!message) {
      return;
    }

    elements.globalMessage.textContent =
      message;

    elements.globalMessage.classList.remove(
      "hidden"
    );

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

  function createMessageElement(
    role,
    content
  ) {
    const wrapper =
      document.createElement("div");

    wrapper.className =
      "chat-message";
    wrapper.dataset.role =
      role;

    const label =
      document.createElement("strong");

    label.className =
      "chat-message-role";

    label.textContent =
      role === "user"
        ? "You"
        : "LD76 Agent";

    const body =
      document.createElement("div");

    body.className =
      "chat-message-content";

    body.textContent =
      content;

    wrapper.appendChild(label);
    wrapper.appendChild(body);

    return wrapper;
  }

  function appendMessage(
    role,
    content
  ) {
    const emptyState =
      elements.chatMessages.querySelector(
        ".empty-chat"
      );

    if (emptyState) {
      emptyState.remove();
    }

    const messageElement =
      createMessageElement(
        role,
        content
      );

    elements.chatMessages.appendChild(
      messageElement
    );

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

    elements.messageInput.value =
      "";

    autoResizeTextarea();

    showGlobalMessage(
      "New chat started."
    );
  }

  function autoResizeTextarea() {
    const textarea =
      elements.messageInput;

    textarea.style.height =
      "auto";

    const maxHeight = 160;

    const nextHeight =
      Math.min(
        textarea.scrollHeight,
        maxHeight
      );

    textarea.style.height =
      `${Math.max(
        42,
        nextHeight
      )}px`;
  }

  function updateRepositoryState(
    repository
  ) {
    state.selectedRepository =
      repository || "";

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

  function updateBranchState(
    branch
  ) {
    state.selectedBranch =
      branch || "";
  }

  function updateModelState(
    model
  ) {
    state.selectedModel =
      model || "auto";
  }

  function updatePermissionState(
    mode
  ) {
    state.permissionMode =
      mode || "always-ask";
  }

  function setGeminiConnectionState(
    connected,
    configured
  ) {
    if (connected) {
      elements.connectionStatus.textContent =
        "Gemini connected";
      return;
    }

    if (configured === false) {
      elements.connectionStatus.textContent =
        "Gemini not configured";
      return;
    }

    elements.connectionStatus.textContent =
      "Gemini unavailable";
  }

  async function checkGeminiStatus() {
    try {
      const response =
        await fetch(
          "/api/gemini/status",
          {
            method: "GET",
            headers: {
              Accept:
                "application/json"
            },
            cache: "no-store"
          }
        );

      let data = null;

      try {
        data =
          await response.json();
      } catch {
        data = null;
      }

      if (
        !response.ok ||
        !data?.ok
      ) {
        setGeminiConnectionState(
          false,
          null
        );

        return false;
      }

      if (!data.configured) {
        setGeminiConnectionState(
          false,
          false
        );

        return false;
      }

      setGeminiConnectionState(
        false,
        true
      );

      return true;
    } catch (error) {
      console.error(
        "Gemini status check failed:",
        error
      );

      setGeminiConnectionState(
        false,
        null
      );

      return false;
    }
  }

  async function testGeminiConnection() {
    if (state.isBusy) {
      return;
    }

    setBusy(true);

    setProgress(
      "Testing Gemini connection..."
    );

    try {
      const response =
        await fetch(
          "/api/gemini/test",
          {
            method: "GET",
            headers: {
              Accept:
                "application/json"
            },
            cache: "no-store"
          }
        );

      let data = null;

      try {
        data =
          await response.json();
      } catch {
        data = null;
      }

      if (
        !response.ok ||
        !data?.ok
      ) {
        const errorMessage =
          data?.error ||
          `Gemini connection test failed with HTTP ${response.status}.`;

        setGeminiConnectionState(
          false,
          response.status !==
            503
        );

        showGlobalMessage(
          errorMessage
        );

        return;
      }

      setGeminiConnectionState(
        true,
        true
      );

      showGlobalMessage(
        "Gemini API connection is working."
      );
    } catch (error) {
      console.error(
        "Gemini connection test failed:",
        error
      );

      setGeminiConnectionState(
        false,
        null
      );

      showGlobalMessage(
        "Could not reach the Gemini test endpoint. Check the deployment and network connection."
      );
    } finally {
      setBusy(false);
    }
  }

  function getModelLabel(model) {
    if (
      model &&
      typeof model.displayName ===
        "string" &&
      model.displayName.trim()
    ) {
      return model.displayName.trim();
    }

    if (
      model &&
      typeof model.name ===
        "string"
    ) {
      return model.name
        .replace(/^models\//, "");
    }

    return "Unknown model";
  }

  function getModelValue(model) {
    if (
      !model ||
      typeof model.name !==
        "string"
    ) {
      return "";
    }

    return model.name;
  }

  function populateModelSelector(
    models
  ) {
    const previousSelection =
      state.selectedModel;

    elements.modelSelector.innerHTML =
      "";

    const autoOption =
      document.createElement(
        "option"
      );

    autoOption.value = "auto";
    autoOption.textContent =
      "Auto";

    elements.modelSelector.appendChild(
      autoOption
    );

    for (const model of models) {
      const value =
        getModelValue(model);

      if (!value) {
        continue;
      }

      const option =
        document.createElement(
          "option"
        );

      option.value = value;
      option.textContent =
        getModelLabel(model);

      option.title =
        model.description || value;

      elements.modelSelector.appendChild(
        option
      );
    }

    const selectionExists =
      previousSelection ===
        "auto" ||
      models.some(
        (model) =>
          getModelValue(model) ===
          previousSelection
      );

    if (selectionExists) {
      elements.modelSelector.value =
        previousSelection;
    } else {
      state.selectedModel =
        "auto";

      elements.modelSelector.value =
        "auto";
    }

    elements.modelSelector.disabled =
      false;
  }

  function clearModelSelector() {
    elements.modelSelector.innerHTML =
      "";

    const option =
      document.createElement(
        "option"
      );

    option.value = "auto";
    option.textContent =
      "Auto";

    elements.modelSelector.appendChild(
      option
    );

    elements.modelSelector.value =
      "auto";

    elements.modelSelector.disabled =
      true;

    state.selectedModel =
      "auto";
    state.models = [];
    state.modelsLoaded = false;
  }

  async function fetchGeminiModels(
    options = {}
  ) {
    const {
      showProgress = true,
      showResultMessage = true
    } = options;

    if (state.isBusy) {
      return false;
    }

    setBusy(true);

    if (showProgress) {
      setProgress(
        "Loading available Gemini models..."
      );
    }

    try {
      const response =
        await fetch(
          "/api/gemini/models",
          {
            method: "GET",
            headers: {
              Accept:
                "application/json"
            },
            cache: "no-store"
          }
        );

      let data = null;

      try {
        data =
          await response.json();
      } catch {
        data = null;
      }

      if (
        !response.ok ||
        !data?.ok
      ) {
        const errorMessage =
          data?.error ||
          `Gemini model discovery failed with HTTP ${response.status}.`;

        clearModelSelector();

        showGlobalMessage(
          errorMessage
        );

        return false;
      }

      const models =
        Array.isArray(data.models)
          ? data.models
          : [];

      state.models =
        models;

      state.modelsLoaded =
        true;

      populateModelSelector(
        models
      );

      if (showResultMessage) {
        if (models.length === 0) {
          showGlobalMessage(
            "No Gemini models supporting generateContent are available for this API key."
          );
        } else {
          showGlobalMessage(
            `${models.length} Gemini model${models.length === 1 ? "" : "s"} available.`
          );
        }
      }

      return true;
    } catch (error) {
      console.error(
        "Gemini model discovery failed:",
        error
      );

      clearModelSelector();

      showGlobalMessage(
        "Could not reach the Gemini models endpoint. Check the deployment and network connection."
      );

      return false;
    } finally {
      setBusy(false);
    }
  }

  async function refreshGeminiModels() {
    await fetchGeminiModels({
      showProgress: true,
      showResultMessage: true
    });
  }

  async function sendChatMessage(
    message
  ) {
    /*
     * Actual Gemini generation remains separate
     * from model discovery in this step.
     *
     * Phase 2 currently establishes:
     * - real model discovery
     * - capability filtering
     * - model selection
     * - Auto selection state
     *
     * Generation endpoint integration will use
     * the selected model in the next Phase 2 step.
     */

    setBusy(true);

    setProgress(
      "Preparing Gemini request..."
    );

    await new Promise(
      (resolve) => {
        window.setTimeout(
          resolve,
          300
        );
      }
    );

    setBusy(false);

    showGlobalMessage(
      `Gemini model selection is ready. Selected: ${state.selectedModel === "auto" ? "Auto" : state.selectedModel}.`
    );
  }

  async function handleChatSubmit(
    event
  ) {
    event.preventDefault();

    if (state.isBusy) {
      return;
    }

    const message =
      elements.messageInput.value.trim();

    if (!message) {
      return;
    }

    appendMessage(
      "user",
      message
    );

    elements.messageInput.value =
      "";

    autoResizeTextarea();

    await sendChatMessage(
      message
    );
  }

  function handleRepositoryChange(
    event
  ) {
    updateRepositoryState(
      event.target.value
    );

    if (!event.target.value) {
      elements.branchSelector.disabled =
        true;

      elements.branchSelector.innerHTML = `
        <option value="">
          Select a repository first
        </option>
      `;

      updateBranchState("");

      return;
    }

    elements.branchSelector.disabled =
      false;

    elements.branchSelector.innerHTML = `
      <option value="main">main</option>
    `;

    updateBranchState(
      "main"
    );
  }

  function handleBranchChange(
    event
  ) {
    updateBranchState(
      event.target.value
    );
  }

  function handleModelChange(
    event
  ) {
    updateModelState(
      event.target.value
    );

    const selectedModel =
      state.models.find(
        (model) =>
          model.name ===
          state.selectedModel
      );

    if (
      state.selectedModel !==
        "auto" &&
      selectedModel
    ) {
      showGlobalMessage(
        `Model selected: ${getModelLabel(selectedModel)}`
      );
    } else if (
      state.selectedModel ===
      "auto"
    ) {
      showGlobalMessage(
        "Model selection set to Auto."
      );
    }
  }

  function handlePermissionChange(
    event
  ) {
    updatePermissionState(
      event.target.value
    );
  }

  function handleGitHubConnect() {
    showGlobalMessage(
      "GitHub authentication will be implemented in Phase 3."
    );
  }

  function handleClearLocalData() {
    const confirmed =
      window.confirm(
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

  function handleNavigation(
    event
  ) {
    const screenName =
      event.currentTarget.dataset
        .navigate;

    showScreen(
      screenName
    );
  }

  function handleMenuClick() {
    toggleMobileNavigation();
  }

  function handleDocumentClick(
    event
  ) {
    if (
      window.innerWidth >= 700 ||
      !elements.mainNavigation ||
      !elements.menuButton
    ) {
      return;
    }

    const clickedInsideNavigation =
      elements.mainNavigation.contains(
        event.target
      );

    const clickedMenuButton =
      elements.menuButton.contains(
        event.target
      );

    if (
      !clickedInsideNavigation &&
      !clickedMenuButton
    ) {
      closeMobileNavigation();
    }
  }

  async function initialize() {
    elements.navigationItems.forEach(
      (item) => {
        item.addEventListener(
          "click",
          handleNavigation
        );
      }
    );

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
      testGeminiConnection
    );

    elements.refreshModelsButton.addEventListener(
      "click",
      refreshGeminiModels
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
      "Checking Gemini...";

    elements.githubConnectionMessage.textContent =
      "GitHub is not connected.";

    elements.githubStatusBadge.textContent =
      "Disconnected";

    elements.permissionMode.value =
      state.permissionMode;

    clearModelSelector();

    showScreen("chat");

    autoResizeTextarea();

    const geminiConfigured =
      await checkGeminiStatus();

    if (geminiConfigured) {
      await fetchGeminiModels({
        showProgress: false,
        showResultMessage: false
      });
    }
  }

  initialize();
})();
