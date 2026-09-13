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
  navButtons: document.querySelectorAll("[data-screen]"),
  chatMessages: document.getElementById("chat-messages"),
  chatInput: document.getElementById("chat-input"),
  sendButton: document.getElementById("send-button"),
  modelSelector: document.getElementById("model-selector"),
  geminiStatusBadge:
    document.getElementById("gemini-status-badge"),
  githubStatusBadge:
    document.getElementById("github-status-badge"),
  githubConnectButton:
    document.getElementById("github-connect-button"),
  githubConnectionMessage:
    document.getElementById("github-connection-message"),
  repositorySelector:
    document.getElementById("repository-selector"),
  branchSelector:
    document.getElementById("branch-selector"),
  repositoryStatus:
    document.getElementById("repository-status"),
  geminiTestButton:
    document.getElementById("gemini-test-button"),
  refreshModelsButton:
    document.getElementById("refresh-models-button")
};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindNavigation();
  bindChat();
  bindGeminiControls();
  bindGitHubControls();

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
      const screen = button.dataset.screen;

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

      element.hidden = name !== screen;
    }
  );

  elements.navButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.screen === screen
    );
  });
}

function bindChat() {
  elements.sendButton?.addEventListener(
    "click",
    sendChatMessage
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
        elements.modelSelector.value || "auto";
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
      window.location.href = "/api/github/login";
    }
  );

  elements.repositorySelector?.addEventListener(
    "change",
    async () => {
      const value =
        elements.repositorySelector.value || "";

      state.selectedRepository = value;
      state.selectedBranch = "";
      state.branches = [];

      resetBranchSelector();

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

      await loadBranches(owner, repo);
    }
  );

  elements.branchSelector?.addEventListener(
    "change",
    () => {
      state.selectedBranch =
        elements.branchSelector.value || "";

      updateRepositoryStatus();
    }
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

    const data = await readJson(response);

    if (!response.ok || !data?.ok) {
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

    setGeminiStatus("unavailable");
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

    const data = await readJson(response);

    if (!response.ok || !data?.ok) {
      throw new Error(
        data?.error ||
          "Gemini connection test failed."
      );
    }

    state.geminiConfigured = true;
    state.geminiConnected = true;

    setGeminiStatus("connected");
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

    const data = await readJson(response);

    if (!response.ok || !data?.ok) {
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
    document.createElement("option");

  autoOption.value = "auto";
  autoOption.textContent = "Auto";

  elements.modelSelector.appendChild(
    autoOption
  );

  state.availableModels.forEach((model) => {
    if (
      !model ||
      typeof model.name !== "string"
    ) {
      return;
    }

    const option =
      document.createElement("option");

    option.value = model.name;

    option.textContent =
      typeof model.displayName === "string" &&
      model.displayName.trim()
        ? model.displayName
        : model.name;

    elements.modelSelector.appendChild(
      option
    );
  });

  const selectedExists =
    state.selectedModel === "auto" ||
    state.availableModels.some(
      (model) =>
        model &&
        model.name === state.selectedModel
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
    elements.chatInput?.value.trim() || "";

  if (!message) {
    return;
  }

  appendMessage("user", message);

  elements.chatInput.value = "";

  setBusy(true);
  appendProgress("Thinking...");

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
          model: state.selectedModel
        })
      }
    );

    const data = await readJson(response);

    removeProgress();

    if (!response.ok || !data?.ok) {
      throw new Error(
        data?.error ||
          "Gemini generation failed."
      );
    }

    appendMessage(
      "assistant",
      data.text || "No response returned."
    );

    if (
      typeof data.model === "string" &&
      data.model
    ) {
      appendMessage(
        "system",
        `Model used: ${data.model}`
      );
    }

    state.geminiConnected = true;
    setGeminiStatus("connected");
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
  setGitHubStatus("checking");

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

    const data = await readJson(response);

    if (!response.ok || !data?.ok) {
      throw new Error(
        data?.error ||
          "Could not check GitHub connection."
      );
    }

    if (!data.connected) {
      state.githubConnected = false;
      state.githubUser = null;
      state.repositories = [];
      state.branches = [];

      resetRepositorySelector();
      resetBranchSelector();

      setGitHubStatus("disconnected");
      updateGitHubMessage();
      return;
    }

    state.githubConnected = true;
    state.githubUser =
      data.user || null;

    setGitHubStatus("connected");
    updateGitHubMessage();

    await loadRepositories();
  } catch (error) {
    console.error(
      "GitHub status check failed:",
      error
    );

    state.githubConnected = false;
    state.githubUser = null;

    setGitHubStatus("error");
    updateGitHubMessage();
  }
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

    const data = await readJson(response);

    if (!response.ok || !data?.ok) {
      throw new Error(
        data?.error ||
          "Could not load GitHub repositories."
      );
    }

    state.repositories =
      Array.isArray(data.repositories)
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

async function loadBranches(owner, repo) {
  setBranchLoading(true);

  try {
    const query =
      `?owner=${encodeURIComponent(
        owner
      )}&repo=${encodeURIComponent(repo)}`;

    const response = await fetch(
      `/api/github/branches${query}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      }
    );

    const data = await readJson(response);

    if (!response.ok || !data?.ok) {
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

    const selectedRepository =
      findSelectedRepository();

    if (
      selectedRepository &&
      typeof selectedRepository.defaultBranch ===
        "string" &&
      state.branches.some(
        (branch) =>
          branch.name ===
          selectedRepository.defaultBranch
      )
    ) {
      state.selectedBranch =
        selectedRepository.defaultBranch;

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
    document.createElement("option");

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
        document.createElement("option");

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
    document.createElement("option");

  emptyOption.value = "";

  emptyOption.textContent =
    state.branches.length
      ? "Select branch"
      : "No branches found";

  elements.branchSelector.appendChild(
    emptyOption
  );

  state.branches.forEach((branch) => {
    if (
      !branch ||
      typeof branch.name !== "string"
    ) {
      return;
    }

    const option =
      document.createElement("option");

    option.value = branch.name;

    option.textContent =
      branch.protected
        ? `${branch.name} 🔒`
        : branch.name;

    elements.branchSelector.appendChild(
      option
    );
  });

  elements.branchSelector.disabled =
    !state.selectedRepository ||
    state.branches.length === 0;

  if (state.selectedBranch) {
    elements.branchSelector.value =
      state.selectedBranch;
  }
}

function resetRepositorySelector() {
  state.selectedRepository = "";

  if (!elements.repositorySelector) {
    return;
  }

  elements.repositorySelector.replaceChildren();

  const option =
    document.createElement("option");

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
  state.selectedBranch = "";
  state.branches = [];

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

function findSelectedRepository() {
  return state.repositories.find(
    (repository) =>
      repository.fullName ===
      state.selectedRepository
  ) || null;
}

function updateGitHubMessage() {
  if (!elements.githubConnectionMessage) {
    return;
  }

  if (state.githubConnected) {
    const login =
      state.githubUser?.login || "GitHub user";

    elements.githubConnectionMessage.textContent =
      `Connected as ${login}.`;
    return;
  }

  elements.githubConnectionMessage.textContent =
    "Connect GitHub to select a repository and branch.";
}

function updateRepositoryStatus(
  customMessage = ""
) {
  if (!elements.repositoryStatus) {
    return;
  }

  if (customMessage) {
    elements.repositoryStatus.textContent =
      customMessage;
    return;
  }

  if (!state.selectedRepository) {
    elements.repositoryStatus.textContent =
      "No repository selected.";
    return;
  }

  if (!state.selectedBranch) {
    elements.repositoryStatus.textContent =
      `Repository: ${state.selectedRepository} — select a branch.`;
    return;
  }

  elements.repositoryStatus.textContent =
    `Selected: ${state.selectedRepository} / ${state.selectedBranch}`;
}

function setRepositoryLoading(loading) {
  if (!elements.repositorySelector) {
    return;
  }

  if (loading) {
    elements.repositorySelector.replaceChildren();

    const option =
      document.createElement("option");

    option.value = "";
    option.textContent =
      "Loading repositories...";

    elements.repositorySelector.appendChild(
      option
    );

    elements.repositorySelector.disabled =
      true;
  } else {
    renderRepositorySelector();
  }
}

function setBranchLoading(loading) {
  if (!elements.branchSelector) {
    return;
  }

  if (loading) {
    elements.branchSelector.replaceChildren();

    const option =
      document.createElement("option");

    option.value = "";
    option.textContent =
      "Loading branches...";

    elements.branchSelector.appendChild(
      option
    );

    elements.branchSelector.disabled =
      true;
  } else {
    renderBranchSelector();
  }
}

function setGitHubStatus(status) {
  if (!elements.githubStatusBadge) {
    return;
  }

  const labels = {
    checking: "Checking...",
    connected: "Connected",
    disconnected: "Not connected",
    error: "Unavailable"
  };

  elements.githubStatusBadge.textContent =
    labels[status] || "Unknown";

  elements.githubStatusBadge.dataset.status =
    status;
}

function setGeminiStatus(status) {
  if (!elements.geminiStatusBadge) {
    return;
  }

  const labels = {
    testing: "Testing...",
    connected: "Connected",
    configured: "Configured",
    "not-configured": "Not configured",
    unavailable: "Unavailable",
    error: "Error"
  };

  elements.geminiStatusBadge.textContent =
    labels[status] || "Unknown";

  elements.geminiStatusBadge.dataset.status =
    status;
}

function setBusy(value) {
  state.busy = value;

  if (elements.sendButton) {
    elements.sendButton.disabled = value;
  }

  if (elements.chatInput) {
    elements.chatInput.disabled = value;
  }

  if (elements.geminiTestButton) {
    elements.geminiTestButton.disabled =
      value;
  }

  if (elements.refreshModelsButton) {
    elements.refreshModelsButton.disabled =
      value;
  }
}

function appendMessage(
  role,
  text
) {
  if (!elements.chatMessages) {
    return;
  }

  const message =
    document.createElement("div");

  message.className =
    `message message-${role}`;

  const content =
    document.createElement("div");

  content.className =
    "message-content";

  content.textContent = text;

  message.appendChild(content);
  elements.chatMessages.appendChild(
    message
  );

  scrollChatToBottom();
}

function appendProgress(text) {
  if (!elements.chatMessages) {
    return;
  }

  removeProgress();

  const progress =
    document.createElement("div");

  progress.id =
    "chat-progress";

  progress.className =
    "message message-progress";

  const content =
    document.createElement("div");

  content.className =
    "message-content";

  content.textContent = text;

  progress.appendChild(content);

  elements.chatMessages.appendChild(
    progress
  );

  scrollChatToBottom();
}

function removeProgress() {
  document
    .getElementById("chat-progress")
    ?.remove();
}

function addWelcomeMessage() {
  if (
    !elements.chatMessages ||
    elements.chatMessages.children.length > 0
  ) {
    return;
  }

  appendMessage(
    "assistant",
    "LD76 Code Agent ready. Connect GitHub and choose a repository when you are ready."
  );
}

function scrollChatToBottom() {
  if (!elements.chatMessages) {
    return;
  }

  elements.chatMessages.scrollTop =
    elements.chatMessages.scrollHeight;
}

async function readJson(response) {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      error:
        "Server returned an invalid JSON response."
    };
  }
}

function handleGitHubCallbackMessage() {
  const url =
    new URL(window.location.href);

  const status =
    url.searchParams.get("github");

  if (status === "connected") {
    showScreen("github");
    appendMessage(
      "system",
      "GitHub connected successfully."
    );

    url.searchParams.delete("github");

    window.history.replaceState(
      {},
      document.title,
      url.pathname +
        (url.searchParams.toString()
          ? `?${url.searchParams.toString()}`
          : "") +
        url.hash
    );

    refreshGitHubStatus();
  }
    }
