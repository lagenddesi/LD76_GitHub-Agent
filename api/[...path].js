import { handleGeminiRoute } from "../../server/gemini.js";

export default async function handler(request, response) {
  const route = getRoute(request);

  try {
    return await handleGeminiRoute(
      request,
      response,
      route
    );
  } catch (error) {
    console.error(
      "Gemini API route error:",
      error
    );

    return response.status(500).json({
      ok: false,
      error:
        error?.message ||
        "Gemini API request failed."
    });
  }
}

function getRoute(request) {
  const value = request?.query?.path;

  if (Array.isArray(value)) {
    return value
      .flatMap(splitPathValue)
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return splitPathValue(value);
  }

  return [];
}

function splitPathValue(value) {
  return String(value)
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .filter(Boolean);
}
