import { state } from "./js/state.js";

import {
  showScreen,
  renderStoredMessages,
  addWelcomeMessage
} from "./js/ui.js";

import {
  initializeNavigation
} from "./js/navigation.js";

import {
  refreshGeminiStatus,
  refreshModels
} from "./js/gemini.js";

import {
  initializeGitHub,
  refreshGitHubStatus
} from "./js/github.js";

import {
  initializeEvents
} from "./js/events.js";

import {
  resetAgent
} from "./js/agent.js";

import {
  getActiveConversationId,
  startNewConversation,
  getConversationMessages
} from "./js/history.js";

document.addEventListener(
  "DOMContentLoaded",
  initialize
);

async function initialize() {
  initializeNavigation();

  initializeEvents();

  initializeGitHub();

  showScreen("chat");

  resetAgent();

  await initializeConversation();

  await initializeServices();
}

async function initializeConversation() {
  try {
    let conversationId =
      getActiveConversationId();

    if (!conversationId) {
      conversationId =
        startNewConversation();
    }

    state.conversationId =
      conversationId;

    const messages =
      await getConversationMessages(
        conversationId
      );

    state.historyLoaded = true;

    renderStoredMessages(messages);

    if (messages.length === 0) {
      addWelcomeMessage();
    }
  } catch (error) {
    console.error(
      "Conversation history initialization failed:",
      error
    );

    state.historyLoaded = true;

    if (!state.conversationId) {
      state.conversationId =
        startNewConversation();
    }

    renderStoredMessages([]);

    addWelcomeMessage();
  }
}

async function initializeServices() {
  try {
    await Promise.all([
      refreshGeminiStatus(),
      refreshModels(),
      refreshGitHubStatus()
    ]);
  } catch (error) {
    console.error(
      "Application initialization failed:",
      error
    );
  }
}
