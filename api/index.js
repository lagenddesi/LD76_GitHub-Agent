import { handleAgentRoute } from "../server/agent.js";
import { handleGitHubRoute } from "../server/github.js";
import { handleGeminiRoute } from "../server/gemini.js";

export default async function handler(request, response) {
  const route = getRoute(request);

  if (route.length === 0) {
    return response.status(404).json({
      ok: false,
      error: "API route not found."
    });
  }

  const [service, ...serviceRoute] = route;

  if (service === "agent") {
    return handleAgentRoute(
      request,
      response,
      serviceRoute
    );
  }

  if (service === "github") {
    return handleGitHubRoute(
      request,
      response,
      serviceRoute
    );
  }

  if (service === "gemini") {
    return handleGeminiRoute(
      request,
      response,
      serviceRoute
    );
  }

  return response.status(404).json({
    ok: false,
    error: "API service not found."
  });
}

function getRoute(request) {
  const pathname =
    request?.url
      ? new URL(
          request.url,
          `https://${request.headers?.host || "localhost"}`
        ).pathname
      : "";

  const apiPrefix = "/api/";

  if (!pathname.startsWith(apiPrefix)) {
    return [];
  }

  return pathname
    .slice(apiPrefix.length)
    .split("/")
    .map(part => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .filter(Boolean);
}
