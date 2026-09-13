const GEMINI_API =
  "https://generativelanguage.googleapis.com/v1beta";

const API_KEY_ENV =
  "LD76_GEMINI_API_KEY";

export async function handleGeminiRoute(
  request,
  response,
  route = []
) {
  const path = route.join("/");

  try {
    if (path === "status") {
      return handleStatus(request, response);
    }

    if (path === "test") {
      return handleTest(request, response);
    }

    if (path === "models") {
      return handleModels(request, response);
    }

    return response.status(404).json({
      ok: false,
      error: "Gemini API route not found."
    });
  } catch (error) {
    console.error(
      "Gemini route error:",
      error
    );

    return response.status(
      error.status >= 400 &&
      error.status < 600
        ? error.status
        : 500
    ).json({
      ok: false,
      error:
        error.message ||
        "Gemini request failed."
    });
  }
}

function handleStatus(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(response);
  }

  const apiKey =
    process.env[API_KEY_ENV];

  return response.status(200).json({
    ok: true,
    configured: Boolean(apiKey),
    service: "Gemini API"
  });
}

async function handleTest(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(response);
  }

  const apiKey =
    process.env[API_KEY_ENV];

  if (!apiKey) {
    return response.status(503).json({
      ok: false,
      error:
        "Gemini API key is not configured. Add LD76_GEMINI_API_KEY to the Vercel environment variables."
    });
  }

  try {
    const upstreamResponse =
      await fetch(
        `${GEMINI_API}/models?key=${encodeURIComponent(
          apiKey
        )}`
      );

    const upstreamData =
      await parseJsonResponse(
        upstreamResponse
      );

    if (!upstreamResponse.ok) {
      const upstreamMessage =
        upstreamData?.error?.message ||
        "Gemini API returned an unexpected error.";

      return response.status(
        upstreamResponse.status
      ).json({
        ok: false,
        error:
          `Gemini API error: ${upstreamMessage}`
      });
    }

    return response.status(200).json({
      ok: true,
      service: "Gemini API",
      status: "connected"
    });
  } catch (error) {
    console.error(
      "Gemini connection test failed:",
      error
    );

    return response.status(502).json({
      ok: false,
      error:
        "Could not reach the Gemini API. Check the server network connection and try again."
    });
  }
}

async function handleModels(
  request,
  response
) {
  if (request.method !== "GET") {
    return methodNotAllowed(response);
  }

  const apiKey =
    process.env[API_KEY_ENV];

  if (!apiKey) {
    return response.status(503).json({
      ok: false,
      error:
        "Gemini API key is not configured. Add LD76_GEMINI_API_KEY to the Vercel environment variables."
    });
  }

  try {
    const models = [];
    let pageToken = "";

    do {
      const url =
        new URL(
          `${GEMINI_API}/models`
        );

      url.searchParams.set(
        "key",
        apiKey
      );

      url.searchParams.set(
        "pageSize",
        "1000"
      );

      if (pageToken) {
        url.searchParams.set(
          "pageToken",
          pageToken
        );
      }

      const upstreamResponse =
        await fetch(url);

      const upstreamData =
        await parseJsonResponse(
          upstreamResponse
        );

      if (!upstreamResponse.ok) {
        const upstreamMessage =
          upstreamData?.error?.message ||
          "Gemini API returned an unexpected error.";

        return response.status(
          upstreamResponse.status
        ).json({
          ok: false,
          error:
            `Gemini API error: ${upstreamMessage}`
        });
      }

      const pageModels =
        Array.isArray(
          upstreamData?.models
        )
          ? upstreamData.models
          : [];

      for (
        const model of pageModels
      ) {
        const supportedGenerationMethods =
          Array.isArray(
            model?.supportedGenerationMethods
          )
            ? model.supportedGenerationMethods
            : [];

        if (
          typeof model?.name !==
            "string" ||
          !supportedGenerationMethods.includes(
            "generateContent"
          )
        ) {
          continue;
        }

        models.push({
          name:
            model.name,

          baseModelId:
            typeof model.baseModelId ===
            "string"
              ? model.baseModelId
              : "",

          version:
            typeof model.version ===
            "string"
              ? model.version
              : "",

          displayName:
            typeof model.displayName ===
            "string"
              ? model.displayName
              : model.name,

          description:
            typeof model.description ===
            "string"
              ? model.description
              : "",

          inputTokenLimit:
            Number.isInteger(
              model.inputTokenLimit
            )
              ? model.inputTokenLimit
              : null,

          outputTokenLimit:
            Number.isInteger(
              model.outputTokenLimit
            )
              ? model.outputTokenLimit
              : null,

          supportedGenerationMethods,

          thinking:
            typeof model.thinking ===
            "boolean"
              ? model.thinking
              : null
        });
      }

      pageToken =
        typeof upstreamData?.nextPageToken ===
        "string"
          ? upstreamData.nextPageToken
          : "";
    } while (pageToken);

    const uniqueModels =
      Array.from(
        new Map(
          models.map(
            (model) => [
              model.name,
              model
            ]
          )
        ).values()
      );

    uniqueModels.sort(
      (first, second) =>
        first.displayName.localeCompare(
          second.displayName,
          undefined,
          {
            sensitivity: "base"
          }
        )
    );

    return response.status(200).json({
      ok: true,
      service: "Gemini API",
      count:
        uniqueModels.length,
      models:
        uniqueModels
    });
  } catch (error) {
    console.error(
      "Gemini model discovery failed:",
      error
    );

    return response.status(502).json({
      ok: false,
      error:
        "Could not reach the Gemini models endpoint. Check the server network connection and try again."
    });
  }
}

async function parseJsonResponse(
  response
) {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function methodNotAllowed(
  response
) {
  return response.status(405).json({
    ok: false,
    error: "Method not allowed."
  });
    }
