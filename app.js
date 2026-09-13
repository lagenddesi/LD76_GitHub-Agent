import { elements } from "./js/dom.js";

import {
  state
} from "./js/state.js";

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
  createConversationId,
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
    state.conversationId =
      createConversationId();

    const messages =
      await getConversationMessages(
        state.conversationId
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
