export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  const apiKey = process.env.LD76_GEMINI_API_KEY;

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
      const url = new URL(
        "https://generativelanguage.googleapis.com/v1beta/models"
      );

      url.searchParams.set("key", apiKey);
      url.searchParams.set("pageSize", "1000");

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const upstreamResponse = await fetch(url);

      const responseText = await upstreamResponse.text();

      let upstreamData;

      try {
        upstreamData = JSON.parse(responseText);
      } catch {
        upstreamData = null;
      }

      if (!upstreamResponse.ok) {
        const upstreamMessage =
          upstreamData?.error?.message ||
          "Gemini API returned an unexpected error.";

        return response.status(upstreamResponse.status).json({
          ok: false,
          error: `Gemini API error: ${upstreamMessage}`
        });
      }

      const pageModels = Array.isArray(upstreamData?.models)
        ? upstreamData.models
        : [];

      for (const model of pageModels) {
        const supportedGenerationMethods = Array.isArray(
          model?.supportedGenerationMethods
        )
          ? model.supportedGenerationMethods
          : [];

        if (
          typeof model?.name !== "string" ||
          !supportedGenerationMethods.includes("generateContent")
        ) {
          continue;
        }

        models.push({
          name: model.name,
          baseModelId:
            typeof model.baseModelId === "string"
              ? model.baseModelId
              : "",
          version:
            typeof model.version === "string"
              ? model.version
              : "",
          displayName:
            typeof model.displayName === "string"
              ? model.displayName
              : model.name,
          description:
            typeof model.description === "string"
              ? model.description
              : "",
          inputTokenLimit:
            Number.isInteger(model.inputTokenLimit)
              ? model.inputTokenLimit
              : null,
          outputTokenLimit:
            Number.isInteger(model.outputTokenLimit)
              ? model.outputTokenLimit
              : null,
          supportedGenerationMethods,
          thinking:
            typeof model.thinking === "boolean"
              ? model.thinking
              : null
        });
      }

      pageToken =
        typeof upstreamData?.nextPageToken === "string"
          ? upstreamData.nextPageToken
          : "";
    } while (pageToken);

    const uniqueModels = Array.from(
      new Map(
        models.map((model) => [model.name, model])
      ).values()
    );

    uniqueModels.sort((first, second) =>
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
      count: uniqueModels.length,
      models: uniqueModels
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
