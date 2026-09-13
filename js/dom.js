export const elements = {
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
