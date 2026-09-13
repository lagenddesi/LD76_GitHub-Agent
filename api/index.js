export default async function handler(request, response) {
  const route = getRoute(request);

  if (route.length === 0) {
    return response.status(404).json({
      ok: false,
      error: "API route not found."
    });
  }

  const [service, ...serviceRoute] = route;

  try {
    if (service === "gemini") {
      const { handleGeminiRoute } =
        await import("../server/gemini.js");

      return handleGeminiRoute(
        request,
        response,
        serviceRoute
      );
    }

    if (service === "github") {
      const { handleGitHubRoute } =
        await import("../server/github.js");

      return handleGitHubRoute(
        request,
        response,
        serviceRoute
      );
    }

    if (service === "agent") {
      const { handleAgentRoute } =
        await import("../server/agent.js");

      return handleAgentRoute(
        request,
        response,
        serviceRoute
      );
    }

    return response.status(404).json({
      ok: false,
      error: "API service not found."
    });
  } catch (error) {
    console.error("API route error:", error);

    return response.status(500).json({
      ok: false,
      error:
        error?.message ||
        "API function failed.",
      service
    });
  }
}

function getRoute(request) {
  const queryPath = request?.query?.path;

  if (typeof queryPath === "string" && queryPath) {
    return splitPath(queryPath);
  }

  if (Array.isArray(queryPath)) {
    return queryPath
      .flatMap(splitPath)
      .filter(Boolean);
  }

  const pathname =
    request?.url
      ? new URL(
          request.url,
          `https://${request.headers?.host || "localhost"}`
        ).pathname
      : "";

  if (!pathname.startsWith("/api/")) {
    return [];
  }

  return splitPath(
    pathname.slice("/api/".length)
  );
}

function splitPath(value) {
  return String(value)
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
