const state = {
  currentScreen: "chat",
  selectedModel: "auto",
  availableModels: [],
  geminiConfigured: false,
  geminiConnected: false,
  githubConnected: false,
  githubUser: null,
  repositories: [],
  branches: [],
  selectedRepository: "",
  selectedBranch: "",
  busy: false
};

const elements = {
  screens: {
    chat: document.getElementById("screen-chat"),
    github: document.getElementById("screen-github"),
    settings: document.getElementById("screen-settings")
  },

  navButtons: document.querySelectorAll("[data-navigate]"),

  connectionStatus:
    document.getElementById("connection-status"),

  chatMessages:
    document.getElementById("chat-messages"),

  chatForm:
    document.getElementById("chat-form"),

  chatInput:
    document.getElementById("message-input"),

  sendButton:
    document.getElementById("send-button"),

  modelSelector:
    document.getElementById("model-selector"),

  githubStatusBadge:
    document.getElementById("github-status-badge"),

  githubConnectButton:
    document.getElementById("github-connect-button"),

  githubDisconnectButton:
    document.getElementById("github-disconnect-button"),

  githubConnectionMessage:
    document.getElementById("github-connection-message"),

  repositorySelector:
    document.getElementById("repository-selector"),

  branchSelector:
    document.getElementById("branch-selector"),

  currentRepository:
    document.getElementById("current-repository"),

  repositoryStatus:
    document.getElementById("repository-status"),

  geminiTestButton:
    document.getElementById("gemini-test-button"),

  refreshModelsButton:
    document.getElementById("refresh-models-button"),

  agentProgress:
    document.getElementById("agent-progress"),

  agentProgressText:
    document.getElementById("agent-progress-text"),

  globalMessage:
    document.getElementById("global-message"),

  newChatButton:
    document.getElementById("new-chat-button"),

  clearLocalDataButton:
    document.getElementById("clear-local-data-button"),

  menuButton:
    document.getElementById("menu-button"),

  mainNavigation:
    document.getElementById("main-navigation")
};

document.addEventListener(
  "DOMContentLoaded",
  initialize
);

async function initialize() {
  bindNavigation();
  bindChat();
  bindGeminiControls();
  bindGitHubControls();
  bindLocalDataControls();
  bindMenuControls();

  showScreen("chat");
  addWelcomeMessage();

  await Promise.all([
    refreshGeminiStatus(),
    refreshModels(),
    refreshGitHubStatus()
  ]);

  handleGitHubCallbackMessage();
}

function bindNavigation() {
  elements.navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const screen = button.dataset.navigate;

      if (
        screen === "chat" ||
        screen === "github" ||
        screen === "settings"
      ) {
        showScreen(screen);
      }
    });
  });
}

function showScreen(screen) {
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

  if (
    elements.mainNavigation &&
    elements.menuButton
  ) {
    elements.menuButton.setAttribute(
      "aria-expanded",
      "false"
    );
  }
}

function bindMenuControls() {
  elements.menuButton?.addEventListener(
    "click",
    () => {
      const expanded =
        elements.menuButton.getAttribute(
          "aria-expanded"
        ) === "true";

      elements.menuButton.setAttribute(
        "aria-expanded",
        String(!expanded)
      );
    }
  );
}

function bindChat() {
  elements.chatForm?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      sendChatMessage();
    }
  );

  elements.chatInput?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        sendChatMessage();
      }
    }
  );

  elements.modelSelector?.addEventListener(
    "change",
    () => {
      state.selectedModel =
        elements.modelSelector.value ||
        "auto";
    }
  );
}

function bindGeminiControls() {
  elements.geminiTestButton?.addEventListener(
    "click",
    testGeminiConnection
  );

  elements.refreshModelsButton?.addEventListener(
    "click",
    refreshModels
  );
}

function bindGitHubControls() {
  elements.githubConnectButton?.addEventListener(
    "click",
    () => {
      if (state.busy) {
        return;
      }

      window.location.href =
        "/api/github/login";
    }
  );

  elements.githubDisconnectButton?.addEventListener(
    "click",
    disconnectGitHub
  );

  elements.repositorySelector?.addEventListener(
    "change",
    async () => {
      const value =
        elements.repositorySelector.value ||
        "";

      state.selectedRepository = value;
      state.selectedBranch = "";
      state.branches = [];

      resetBranchSelector();
      updateCurrentRepository();

      if (!value) {
        updateRepositoryStatus();
        return;
      }

      const parts = value.split("/");

      if (parts.length !== 2) {
        updateRepositoryStatus(
          "Invalid repository selection."
        );
        return;
      }

      const [owner, repo] = parts;

      await loadBranches(
        owner,
        repo
      );
    }
  );

  elements.branchSelector?.addEventListener(
    "change",
    () => {
      state.selectedBranch =
        elements.branchSelector.value ||
        "";

      updateRepositoryStatus();
    }
  );
}

function bindLocalDataControls() {
  elements.newChatButton?.addEventListener(
    "click",
    startNewChat
  );

  elements.clearLocalDataButton?.addEventListener(
    "click",
    clearLocalData
  );
}

async function refreshGeminiStatus() {
  try {
    const response = await fetch(
      "/api/gemini/status",
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
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
          "Could not check Gemini configuration."
      );
    }

    state.geminiConfigured =
      Boolean(data.configured);

    setGeminiStatus(
      state.geminiConfigured
        ? "configured"
        : "not-configured"
    );
  } catch (error) {
    console.error(
      "Gemini status check failed:",
      error
    );

    state.geminiConfigured = false;
    state.geminiConnected = false;

    setGeminiStatus(
      "unavailable"
    );
  }
}

async function testGeminiConnection() {
  if (state.busy) {
    return;
  }

  setBusy(true);
  setGeminiStatus("testing");

  try {
    const response = await fetch(
      "/api/gemini/test",
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
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
          "Gemini connection test failed."
      );
    }

    state.geminiConfigured = true;
    state.geminiConnected = true;

    setGeminiStatus(
      "connected"
    );

    showGlobalMessage(
      "Gemini connection successful.",
      "success"
    );
  } catch (error) {
    console.error(
      "Gemini connection test failed:",
      error
    );

    state.geminiConnected = false;

    setGeminiStatus(
      state.geminiConfigured
        ? "error"
        : "not-configured"
    );

    showGlobalMessage(
      error.message ||
        "Gemini connection test failed.",
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function refreshModels() {
  if (state.busy) {
    return;
  }

  setBusy(true);

  try {
    const response = await fetch(
      "/api/gemini/models",
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
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
          "Could not load Gemini models."
      );
    }

    state.availableModels =
      Array.isArray(data.models)
        ? data.models
        : [];

    renderModelSelector();

    state.geminiConfigured = true;

    setGeminiStatus(
      state.geminiConnected
        ? "connected"
        : "configured"
    );
  } catch (error) {
    console.error(
      "Gemini model loading failed:",
      error
    );

    state.availableModels = [];

    renderModelSelector();

    setGeminiStatus(
      state.geminiConfigured
        ? "error"
        : "not-configured"
    );
  } finally {
    setBusy(false);
  }
}

function renderModelSelector() {
  if (!elements.modelSelector) {
    return;
  }

  elements.modelSelector.replaceChildren();

  const autoOption =
    document.createElement(
      "option"
    );

  autoOption.value = "auto";
  autoOption.textContent = "Auto";

  elements.modelSelector.appendChild(
    autoOption
  );

  state.availableModels.forEach(
    (model) => {
      if (
        !model ||
        typeof model.name !==
          "string"
      ) {
        return;
      }

      const option =
        document.createElement(
          "option"
        );

      option.value = model.name;

      option.textContent =
        typeof model.displayName ===
          "string" &&
        model.displayName.trim()
          ? model.displayName
          : model.name;

      elements.modelSelector.appendChild(
        option
      );
    }
  );

  const selectedExists =
    state.selectedModel === "auto" ||
    state.availableModels.some(
      (model) =>
        model &&
        model.name ===
          state.selectedModel
    );

  if (!selectedExists) {
    state.selectedModel = "auto";
  }

  elements.modelSelector.value =
    state.selectedModel;

  elements.modelSelector.disabled =
    state.availableModels.length === 0;
}

async function sendChatMessage() {
  if (state.busy) {
    return;
  }

  const message =
    elements.chatInput?.value.trim() ||
    "";

  if (!message) {
    return;
  }

  appendMessage(
    "user",
    message
  );

  elements.chatInput.value = "";

  setBusy(true);
  appendProgress(
    "Thinking..."
  );

  try {
    const response = await fetch(
      "/api/gemini/generate",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          message,
          model:
            state.selectedModel
        })
      }
    );

    const data =
      await readJson(response);

    removeProgress();

    if (
      !response.ok ||
      !data?.ok
    ) {
      throw new Error(
        data?.error ||
          "Gemini generation failed."
      );
    }

    appendMessage(
      "assistant",
      data.text ||
        "No response returned."
    );

    if (
      typeof data.model ===
        "string" &&
      data.model
    ) {
      appendMessage(
        "system",
        `Model used: ${data.model}`
      );
    }

    state.geminiConnected = true;

    setGeminiStatus(
      "connected"
    );
  } catch (error) {
    removeProgress();

    console.error(
      "Chat generation failed:",
      error
    );

    appendMessage(
      "error",
      error.message ||
        "Could not generate a response."
    );

    state.geminiConnected = false;

    setGeminiStatus(
      state.geminiConfigured
        ? "error"
        : "not-configured"
    );
  } finally {
    setBusy(false);
  }
}

async function refreshGitHubStatus() {
  setGitHubStatus(
    "checking"
  );

  try {
    const response = await fetch(
      "/api/github/status",
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
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
          "Could not check GitHub connection."
      );
    }

    if (!data.connected) {
      clearGitHubState();

      setGitHubStatus(
        "disconnected"
      );

      updateGitHubMessage();
      return;
    }

    state.githubConnected = true;
    state.githubUser =
      data.user || null;

    setGitHubStatus(
      "connected"
    );

    updateGitHubMessage();

    await loadRepositories();
  } catch (error) {
    console.error(
      "GitHub status check failed:",
      error
    );

    clearGitHubState();

    setGitHubStatus(
      "error"
    );

    updateGitHubMessage();
  }
}

async function disconnectGitHub() {
  if (state.busy) {
    return;
  }

  const confirmed =
    window.confirm(
      "Disconnect GitHub from LD76 Code Agent?"
    );

  if (!confirmed) {
    return;
  }

  setBusy(true);

  try {
    const response = await fetch(
      "/api/github/logout",
      {
        method: "POST",
        headers: {
          Accept: "application/json"
        }
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
          "GitHub disconnect failed."
      );
    }

    clearGitHubState();

    setGitHubStatus(
      "disconnected"
    );

    updateGitHubMessage();

    showGlobalMessage(
      "GitHub disconnected successfully.",
      "success"
    );

    showScreen("github");
  } catch (error) {
    console.error(
      "GitHub disconnect failed:",
      error
    );

    showGlobalMessage(
      error.message ||
        "Could not disconnect GitHub.",
      "error"
    );
  } finally {
    setBusy(false);
  }
}

function clearGitHubState() {
  state.githubConnected = false;
  state.githubUser = null;
  state.repositories = [];
  state.branches = [];
  state.selectedRepository = "";
  state.selectedBranch = "";

  resetRepositorySelector();
  resetBranchSelector();
  updateCurrentRepository();
  updateRepositoryStatus();
}

async function loadRepositories() {
  if (!state.githubConnected) {
    return;
  }

  setRepositoryLoading(true);

  try {
    const response = await fetch(
      "/api/github/repos",
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
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
          "Could not load GitHub repositories."
      );
    }

    state.repositories =
      Array.isArray(
        data.repositories
      )
        ? data.repositories
        : [];

    renderRepositorySelector();

    updateRepositoryStatus();
  } catch (error) {
    console.error(
      "GitHub repository loading failed:",
      error
    );

    state.repositories = [];

    resetRepositorySelector();

    updateRepositoryStatus(
      error.message ||
        "Could not load repositories."
    );
  } finally {
    setRepositoryLoading(false);
  }
}

async function loadBranches(
  owner,
  repo
) {
  setBranchLoading(true);

  try {
    const query =
      `?owner=${encodeURIComponent(
        owner
      )}&repo=${encodeURIComponent(
        repo
      )}`;

    const response = await fetch(
      `/api/github/branches${query}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
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
          "Could not load repository branches."
      );
    }

    state.branches =
      Array.isArray(data.branches)
        ? data.branches
        : [];

    renderBranchSelector();

    const repository =
      findSelectedRepository();

    if (
      repository &&
      typeof repository.defaultBranch ===
        "string" &&
      state.branches.some(
        (branch) =>
          branch &&
          branch.name ===
            repository.defaultBranch
      )
    ) {
      state.selectedBranch =
        repository.defaultBranch;

      elements.branchSelector.value =
        state.selectedBranch;
    }

    updateRepositoryStatus();
  } catch (error) {
    console.error(
      "GitHub branch loading failed:",
      error
    );

    state.branches = [];

    resetBranchSelector();

    updateRepositoryStatus(
      error.message ||
        "Could not load branches."
    );
  } finally {
    setBranchLoading(false);
  }
}

function renderRepositorySelector() {
  if (!elements.repositorySelector) {
    return;
  }

  elements.repositorySelector.replaceChildren();

  const emptyOption =
    document.createElement(
      "option"
    );

  emptyOption.value = "";

  emptyOption.textContent =
    state.repositories.length
      ? "Select repository"
      : "No repositories found";

  elements.repositorySelector.appendChild(
    emptyOption
  );

  state.repositories.forEach(
    (repository) => {
      if (
        !repository ||
        typeof repository.fullName !==
          "string"
      ) {
        return;
      }

      const option =
        document.createElement(
          "option"
        );

      option.value =
        repository.fullName;

      option.textContent =
        repository.private
          ? `${repository.fullName} 🔒`
          : repository.fullName;

      elements.repositorySelector.appendChild(
        option
      );
    }
  );

  elements.repositorySelector.disabled =
    !state.githubConnected ||
    state.repositories.length === 0;

  if (
    state.selectedRepository &&
    state.repositories.some(
      (repository) =>
        repository.fullName ===
        state.selectedRepository
    )
  ) {
    elements.repositorySelector.value =
      state.selectedRepository;
  }
}

function renderBranchSelector() {
  if (!elements.branchSelector) {
    return;
  }

  elements.branchSelector.replaceChildren();

  const emptyOption =
    document.createElement(
      "option"
    );

  emptyOption.value = "";

  emptyOption.textContent =
    state.branches.length
      ? "Select branch"
      : "No branches found";

  elements.branchSelector.appendChild(
    emptyOption
  );

  state.branches.forEach(
    (branch) => {
      if (
        !branch ||
        typeof branch.name !==
          "string"
      ) {
        return;
      }

      const option =
        document.createElement(
          "option"
        );

      option.value =
        branch.name;

      option.textContent =
        branch.protected
          ? `${branch.name} 🔒`
          : branch.name;

      elements.branchSelector.appendChild(
        option
      );
    }
  );

  elements.branchSelector.disabled =
    !state.githubConnected ||
    !state.selectedRepository ||
    state.branches.length === 0;

  if (
    state.selectedBranch &&
    state.branches.some(
      (branch) =>
        branch.name ===
        state.selectedBranch
    )
  ) {
    elements.branchSelector.value =
      state.selectedBranch;
  }
}

function resetRepositorySelector() {
  if (!elements.repositorySelector) {
    return;
  }

  elements.repositorySelector.replaceChildren();

  const option =
    document.createElement(
      "option"
    );

  option.value = "";
  option.textContent =
    "Connect GitHub first";

  elements.repositorySelector.appendChild(
    option
  );

  elements.repositorySelector.disabled =
    true;
}

function resetBranchSelector() {
  if (!elements.branchSelector) {
    return;
  }

  elements.branchSelector.replaceChildren();

  const option =
    document.createElement(
      "option"
    );

  option.value = "";
  option.textContent =
    "Select a repository first";

  elements.branchSelector.appendChild(
    option
  );

  elements.branchSelector.disabled =
    true;
}

function findSelectedRepository() {
  return state.repositories.find(
    (repository) =>
      repository &&
      repository.fullName ===
        state.selectedRepository
  );
}

function updateGitHubMessage() {
  if (
    !elements.githubConnectionMessage
  ) {
    return;
  }

  if (
    !state.githubConnected
  ) {
    elements.githubConnectionMessage.textContent =
      "GitHub is not connected.";

    updateGitHubButtons();
    return;
  }

  const login =
    state.githubUser?.login;

  if (login) {
    elements.githubConnectionMessage.textContent =
      `Connected as ${login}.`;
  } else {
    elements.githubConnectionMessage.textContent =
      "GitHub is connected.";
  }

  updateGitHubButtons();
}

function updateGitHubButtons() {
  if (
    elements.githubConnectButton
  ) {
    elements.githubConnectButton.hidden =
      state.githubConnected;
  }

  if (
    elements.githubDisconnectButton
  ) {
    elements.githubDisconnectButton.hidden =
      !state.githubConnected;
  }
}

function updateCurrentRepository() {
  if (
    !elements.currentRepository
  ) {
    return;
  }

  if (!state.selectedRepository) {
    elements.currentRepository.textContent =
      "No repository selected";
    return;
  }

  if (!state.selectedBranch) {
    elements.currentRepository.textContent =
      state.selectedRepository;
    return;
  }

  elements.currentRepository.textContent =
    `${state.selectedRepository}:${state.selectedBranch}`;
}

function updateRepositoryStatus(
  overrideMessage = ""
) {
  updateCurrentRepository();

  if (!elements.repositoryStatus) {
    return;
  }

  if (overrideMessage) {
    elements.repositoryStatus.textContent =
      overrideMessage;
    return;
  }

  if (!state.githubConnected) {
    elements.repositoryStatus.textContent =
      "Connect GitHub to select a repository.";
    return;
  }

  if (!state.repositories.length) {
    elements.repositoryStatus.textContent =
      "No repositories available.";
    return;
  }

  if (!state.selectedRepository) {
    elements.repositoryStatus.textContent =
      "No repository selected.";
    return;
  }

  if (!state.selectedBranch) {
    elements.repositoryStatus.textContent =
      `${state.selectedRepository} selected. Choose a branch.`;
    return;
  }

  elements.repositoryStatus.textContent =
    `Working context: ${state.selectedRepository} / ${state.selectedBranch}`;
}

function setRepositoryLoading(
  loading
) {
  if (!elements.repositorySelector) {
    return;
  }

  if (loading) {
    elements.repositorySelector.disabled =
      true;

    elements.repositorySelector.innerHTML =
      `<option value="">Loading repositories...</option>`;

    return;
  }

  renderRepositorySelector();
}

function setBranchLoading(
  loading
) {
  if (!elements.branchSelector) {
    return;
  }

  if (loading) {
    elements.branchSelector.disabled =
      true;

    elements.branchSelector.innerHTML =
      `<option value="">Loading branches...</option>`;

    return;
  }

  renderBranchSelector();
}

function setGitHubStatus(
  status
) {
  if (
    elements.githubStatusBadge
  ) {
    const labels = {
      checking: "Checking...",
      connected: "Connected",
      disconnected: "Disconnected",
      error: "Error"
    };

    elements.githubStatusBadge.textContent =
      labels[status] ||
      "Disconnected";
  }

  if (
    elements.connectionStatus
  ) {
    if (status === "connected") {
      const login =
        state.githubUser?.login;

      elements.connectionStatus.textContent =
        login
          ? `GitHub: ${login}`
          : "GitHub connected";

      return;
    }

    if (status === "checking") {
      elements.connectionStatus.textContent =
        "Checking connection...";
      return;
    }

    elements.connectionStatus.textContent =
      "Not connected";
  }

  updateGitHubButtons();
}

function setGeminiStatus(
  status
) {
  if (
    !elements.globalMessage
  ) {
    return;
  }

  if (status === "connected") {
    return;
  }
}

function setBusy(
  busy
) {
  state.busy = busy;

  if (
    elements.sendButton
  ) {
    elements.sendButton.disabled =
      busy;
  }

  if (
    elements.chatInput
  ) {
    elements.chatInput.disabled =
      busy;
  }

  if (
    elements.geminiTestButton
  ) {
    elements.geminiTestButton.disabled =
      busy;
  }

  if (
    elements.refreshModelsButton
  ) {
    elements.refreshModelsButton.disabled =
      busy;
  }

  if (
    elements.githubConnectButton
  ) {
    elements.githubConnectButton.disabled =
      busy;
  }

  if (
    elements.githubDisconnectButton
  ) {
    elements.githubDisconnectButton.disabled =
      busy;
  }
}

function appendMessage(
  type,
  text
) {
  if (!elements.chatMessages) {
    return;
  }

  const empty =
    elements.chatMessages.querySelector(
      ".empty-chat"
    );

  empty?.remove();

  const message =
    document.createElement(
      "div"
    );

  message.className =
    `chat-message ${type}`;

  const content =
    document.createElement(
      "div"
    );

  content.className =
    "chat-message-content";

  content.textContent =
    String(text);

  message.appendChild(
    content
  );

  elements.chatMessages.appendChild(
    message
  );

  elements.chatMessages.scrollTop =
    elements.chatMessages.scrollHeight;
}

function addWelcomeMessage() {
  if (
    !elements.chatMessages
  ) {
    return;
  }

  if (
    elements.chatMessages.children.length
  ) {
    return;
  }

  const empty =
    document.createElement(
      "div"
    );

  empty.className =
    "empty-chat";

  const icon =
    document.createElement(
      "div"
    );

  icon.className =
    "empty-chat-icon";

  icon.textContent = "⌘";

  const title =
    document.createElement(
      "h2"
    );

  title.textContent =
    "Ready to code";

  const description =
    document.createElement(
      "p"
    );

  description.textContent =
    "Connect a GitHub repository and start a conversation with your coding agent.";

  empty.appendChild(icon);
  empty.appendChild(title);
  empty.appendChild(
    description
  );

  elements.chatMessages.appendChild(
    empty
  );
}

function appendProgress(
  text
) {
  if (
    !elements.agentProgress
  ) {
    return;
  }

  elements.agentProgress.classList.remove(
    "hidden"
  );

  if (
    elements.agentProgressText
  ) {
    elements.agentProgressText.textContent =
      text;
  }
}

function removeProgress() {
  elements.agentProgress?.classList.add(
    "hidden"
  );
}

function showGlobalMessage(
  message,
  type = "info"
) {
  if (
    !elements.globalMessage
  ) {
    return;
  }

  elements.globalMessage.textContent =
    message;

  elements.globalMessage.className =
    `global-message ${type}`;

  window.clearTimeout(
    showGlobalMessage.timer
  );

  showGlobalMessage.timer =
    window.setTimeout(
      () => {
        elements.globalMessage.classList.add(
          "hidden"
        );
      },
      4000
    );
}

function startNewChat() {
  if (
    state.busy ||
    !elements.chatMessages
  ) {
    return;
  }

  elements.chatMessages.replaceChildren();

  addWelcomeMessage();

  elements.chatInput?.focus();
}

function clearLocalData() {
  const confirmed =
    window.confirm(
      "Clear local LD76 Code Agent data from this browser?"
    );

  if (!confirmed) {
    return;
  }

  try {
    localStorage.clear();

    if (
      "indexedDB" in window
    ) {
      console.info(
        "IndexedDB cleanup is not configured yet."
      );
    }

    showGlobalMessage(
      "Local data cleared.",
      "success"
    );
  } catch (error) {
    console.error(
      "Local data cleanup failed:",
      error
    );

    showGlobalMessage(
      "Could not clear local data.",
      "error"
    );
  }
}

function handleGitHubCallbackMessage() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const githubStatus =
    params.get("github");

  if (
    githubStatus === "connected"
  ) {
    showGlobalMessage(
      "GitHub connected successfully.",
      "success"
    );

    refreshGitHubStatus();
  }

  if (
    githubStatus === "error"
  ) {
    showGlobalMessage(
      "GitHub connection failed.",
      "error"
    );
  }

  if (
    githubStatus
  ) {
    const cleanUrl =
      `${window.location.pathname}${window.location.hash}`;

    window.history.replaceState(
      {},
      document.title,
      cleanUrl
    );
  }
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
      `Server returned invalid JSON (HTTP ${response.status}).`
    );
  }
      }
