import { elements } from "./js/dom.js";

import {
  state
} from "./js/state.js";

import {
  showScreen,
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

document.addEventListener(
  "DOMContentLoaded",
  initialize
);

async function initialize() {
  initializeNavigation();

  initializeEvents();

  initializeGitHub();

  showScreen("chat");

  addWelcomeMessage();

  resetAgent();

  await initializeServices();
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
