import { state } from "./state.js";
import { elements } from "./dom.js";

import {
  setBusy,
  setGeminiStatus,
  showGlobalMessage
} from "./ui.js";

export async function refreshGeminiStatus() {
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

    if (
      !response.ok ||
      !data?.ok
    ) {
      throw createResponseError(
        data,
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

export async function testGeminiConnection() {
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

    if (
      !response.ok ||
      !data?.ok
    ) {
      throw createResponseError(
        data,
        "Gemini connection test failed."
      );
    }

    state.geminiConfigured = true;
    state.geminiConnected = true;

    setGeminiStatus("connected");

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
      getErrorMessage(
        error,
        "Gemini connection test failed."
      ),
      "error"
    );
  } finally {
    setBusy(false);
  }
}

export async function refreshModels() {
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

    if (
      !response.ok ||
      !data?.ok
    ) {
      throw createResponseError(
        data,
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

export function renderModelSelector() {
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

  state.availableModels.forEach(
    (model) => {
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

async function readJson(response) {
  const text = await response.text();

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

function createResponseError(
  data,
  fallbackMessage
) {
  const message =
    getErrorMessage(
      data?.error,
      fallbackMessage
    );

  return new Error(message);
}

function getErrorMessage(
  value,
  fallbackMessage
) {
  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return value;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    if (
      typeof value.message === "string" &&
      value.message.trim()
    ) {
      return value.message;
    }

    if (
      typeof value.error === "string" &&
      value.error.trim()
    ) {
      return value.error;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return fallbackMessage;
    }
  }

  if (
    value !== undefined &&
    value !== null
  ) {
    return String(value);
  }

  return fallbackMessage;
}
