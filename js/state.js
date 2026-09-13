export const state = {
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

  conversationId: null,
  historyLoaded: false,

  busy: false,

  agent: {
    phase: "idle",
    requestId: null,
    plan: null,
    changes: [],
    permission: null,
    applied: false
  }
};

export function resetAgentState() {
  state.agent = {
    phase: "idle",
    requestId: null,
    plan: null,
    changes: [],
    permission: null,
    applied: false
  };
}

export function resetRepositoryState() {
  state.repositories = [];
  state.branches = [];
  state.selectedRepository = "";
  state.selectedBranch = "";
}

export function resetGeminiState() {
  state.availableModels = [];
  state.geminiConfigured = false;
  state.geminiConnected = false;
}
