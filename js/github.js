import { state, resetRepositoryState } from "./state.js";
import { elements } from "./dom.js";
import {
  setBusy,
  setGitHubStatus,
  setGitHubConnectionMessage,
  updateCurrentRepository,
  updateRepositoryStatus,
  resetBranchSelector,
  setRepositorySelectorEnabled,
  setBranchSelectorEnabled,
  showGlobalMessage
} from "./ui.js";

export function initializeGitHub() {
  elements.githubConnectButton?.addEventListener(
    "click",
    connectGitHub
  );

  elements.githubDisconnectButton?.addEventListener(
    "click",
    disconnectGitHub
  );

  elements.repositorySelector?.addEventListener(
    "change",
    handleRepositoryChange
  );

  elements.branchSelector?.addEventListener(
    "change",
    handleBranchChange
  );
}

export function connectGitHub() {
  if (state.busy) {
    return;
  }

  window.location.href =
    "/api/github/login";
}

export async function disconnectGitHub() {
  if (state.busy) {
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
          "Could not disconnect GitHub."
      );
    }

    state.githubConnected = false;
    state.githubUser = null;

    resetRepositoryState();

    resetRepositorySelector();
    resetBranchSelector();
    setBranchSelectorEnabled(false);

    setGitHubStatus(
      "disconnected"
    );

    setGitHubConnectionMessage(
      "GitHub is not connected."
    );

    updateCurrentRepository();
    updateRepositoryStatus();

    showGlobalMessage(
      "GitHub disconnected.",
      "success"
    );
  } catch (error) {
    console.error(
      "GitHub disconnect failed:",
      error
    );

    setGitHubStatus("error");

    showGlobalMessage(
      error.message ||
        "Could not disconnect GitHub.",
      "error"
    );
  } finally {
    setBusy(false);
  }
}

export async function refreshGitHubStatus() {
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

    const data =
      await readJson(response);

    if (
      !response.ok ||
      !data?.ok
    ) {
      if (
        response.status === 401 ||
        data?.connected === false
      ) {
        handleDisconnectedState();
        return;
      }

      throw new Error(
        data?.error ||
          "Could not check GitHub status."
      );
    }

    if (!data.connected) {
      handleDisconnectedState();
      return;
    }

    state.githubConnected = true;
    state.githubUser =
      data.user || null;

    setGitHubStatus("connected");

    setGitHubConnectionMessage(
      data.user?.login
        ? `Connected as ${data.user.login}`
        : "GitHub connected."
    );

    await loadRepositories();
  } catch (error) {
    console.error(
      "GitHub status check failed:",
      error
    );

    state.githubConnected = false;
    state.githubUser = null;

    setGitHubStatus("error");

    setGitHubConnectionMessage(
      error.message ||
        "Could not check GitHub connection."
    );

    resetRepositoryState();
    resetRepositorySelector();
    resetBranchSelector();
  }
}

export async function loadRepositories() {
  if (!state.githubConnected) {
    return;
  }

  setRepositorySelectorEnabled(false);

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
      if (response.status === 401) {
        handleDisconnectedState();
        return;
      }

      throw new Error(
        data?.error ||
          "Could not load GitHub repositories."
      );
    }

    state.repositories =
      Array.isArray(data.repositories)
        ? data.repositories
        : [];

    renderRepositories();

    setRepositorySelectorEnabled(
      state.repositories.length > 0
    );

    if (
      state.repositories.length === 0
    ) {
      updateRepositoryStatus(
        "No accessible repositories found."
      );
      return;
    }

    if (
      state.selectedRepository &&
      state.repositories.some(
        (repository) =>
          getRepositoryValue(
            repository
          ) ===
          state.selectedRepository
      )
    ) {
      elements.repositorySelector.value =
        state.selectedRepository;

      const parts =
        state.selectedRepository.split(
          "/"
        );

      if (parts.length === 2) {
        await loadBranches(
          parts[0],
          parts[1]
        );
      }

      return;
    }

    updateRepositoryStatus(
      "Select a repository."
    );
  } catch (error) {
    console.error(
      "Repository loading failed:",
      error
    );

    state.repositories = [];

    resetRepositorySelector();

    updateRepositoryStatus(
      error.message ||
        "Could not load repositories."
    );
  }
}

export async function loadBranches(
  owner,
  repo
) {
  if (
    !state.githubConnected ||
    !owner ||
    !repo
  ) {
    return;
  }

  setBranchSelectorEnabled(false);
  resetBranchSelector();

  updateRepositoryStatus(
    "Loading branches..."
  );

  try {
    const params =
      new URLSearchParams({
        owner,
        repo
      });

    const response = await fetch(
      `/api/github/branches?${params.toString()}`,
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
      if (response.status === 401) {
        handleDisconnectedState();
        return;
      }

      throw new Error(
        data?.error ||
          "Could not load repository branches."
      );
    }

    state.branches =
      Array.isArray(data.branches)
        ? data.branches
        : [];

    renderBranches();

    setBranchSelectorEnabled(
      state.branches.length > 0
    );

    if (
      state.selectedBranch &&
      state.branches.some(
        (branch) =>
          getBranchName(branch) ===
          state.selectedBranch
      )
    ) {
      elements.branchSelector.value =
        state.selectedBranch;

      updateCurrentRepository();
      updateRepositoryStatus();

      return;
    }

    if (
      state.branches.length === 1
    ) {
      const branch =
        getBranchName(
          state.branches[0]
        );

      if (branch) {
        state.selectedBranch =
          branch;

        elements.branchSelector.value =
          branch;
      }
    }

    updateCurrentRepository();
    updateRepositoryStatus();
  } catch (error) {
    console.error(
      "Branch loading failed:",
      error
    );

    state.branches = [];

    resetBranchSelector();

    updateRepositoryStatus(
      error.message ||
        "Could not load branches."
    );
  }
}

async function handleRepositoryChange() {
  if (state.busy) {
    return;
  }

  const value =
    elements.repositorySelector?.value ||
    "";

  state.selectedRepository =
    value;

  state.selectedBranch = "";
  state.branches = [];

  resetBranchSelector();
  updateCurrentRepository();

  if (!value) {
    updateRepositoryStatus();
    return;
  }

  const parts =
    value.split("/");

  if (parts.length !== 2) {
    updateRepositoryStatus(
      "Invalid repository selection."
    );
    return;
  }

  await loadBranches(
    parts[0],
    parts[1]
  );
}

function handleBranchChange() {
  const value =
    elements.branchSelector?.value ||
    "";

  state.selectedBranch =
    value;

  updateCurrentRepository();
  updateRepositoryStatus();
}

function renderRepositories() {
  if (!elements.repositorySelector) {
    return;
  }

  elements.repositorySelector.replaceChildren();

  const defaultOption =
    document.createElement(
      "option"
    );

  defaultOption.value = "";
  defaultOption.textContent =
    "Select repository";

  elements.repositorySelector.appendChild(
    defaultOption
  );

  state.repositories.forEach(
    (repository) => {
      const value =
        getRepositoryValue(
          repository
        );

      if (!value) {
        return;
      }

      const option =
        document.createElement(
          "option"
        );

      option.value = value;

      option.textContent =
        getRepositoryLabel(
          repository,
          value
        );

      elements.repositorySelector.appendChild(
        option
      );
    }
  );

  elements.repositorySelector.value =
    state.selectedRepository || "";
}

function renderBranches() {
  if (!elements.branchSelector) {
    return;
  }

  elements.branchSelector.replaceChildren();

  const defaultOption =
    document.createElement(
      "option"
    );

  defaultOption.value = "";
  defaultOption.textContent =
    "Select branch";

  elements.branchSelector.appendChild(
    defaultOption
  );

  state.branches.forEach(
    (branch) => {
      const name =
        getBranchName(branch);

      if (!name) {
        return;
      }

      const option =
        document.createElement(
          "option"
        );

      option.value = name;
      option.textContent =
        branch.protected
          ? `${name} (protected)`
          : name;

      elements.branchSelector.appendChild(
        option
      );
    }
  );

  elements.branchSelector.value =
    state.selectedBranch || "";
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

function handleDisconnectedState() {
  state.githubConnected = false;
  state.githubUser = null;

  resetRepositoryState();

  resetRepositorySelector();
  resetBranchSelector();

  setRepositorySelectorEnabled(
    false
  );

  setBranchSelectorEnabled(
    false
  );

  setGitHubStatus(
    "disconnected"
  );

  setGitHubConnectionMessage(
    "GitHub is not connected."
  );

  updateCurrentRepository();
  updateRepositoryStatus();
}

function getRepositoryValue(
  repository
) {
  if (!repository) {
    return "";
  }

  if (
    typeof repository.fullName ===
      "string" &&
    repository.fullName
  ) {
    return repository.fullName;
  }

  if (
    typeof repository.full_name ===
      "string" &&
    repository.full_name
  ) {
    return repository.full_name;
  }

  if (
    typeof repository.owner ===
      "string" &&
    typeof repository.name ===
      "string"
  ) {
    return `${repository.owner}/${repository.name}`;
  }

  if (
    repository.owner &&
    typeof repository.owner.login ===
      "string" &&
    typeof repository.name ===
      "string"
  ) {
    return `${repository.owner.login}/${repository.name}`;
  }

  return "";
}

function getRepositoryLabel(
  repository,
  value
) {
  if (
    typeof repository?.name ===
      "string" &&
    repository.name
  ) {
    return repository.name;
  }

  return value;
}

function getBranchName(branch) {
  if (
    typeof branch ===
      "string"
  ) {
    return branch;
  }

  if (
    typeof branch?.name ===
      "string"
  ) {
    return branch.name;
  }

  return "";
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
    throw new Error(
      `Server returned invalid JSON (${response.status}).`
    );
  }
  }
