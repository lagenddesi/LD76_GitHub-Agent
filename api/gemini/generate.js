export default async function handler(request, response) {
  if (request.method !== "POST") {
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

  let body;

  try {
    body =
      typeof request.body === "object" &&
      request.body !== null
        ? request.body
        : JSON.parse(request.body || "{}");
  } catch {
    return response.status(400).json({
      ok: false,
      error: "Invalid JSON request body."
    });
  }

  const message =
    typeof body?.message === "string"
      ? body.message.trim()
      : "";

  const requestedModel =
    typeof body?.model === "string"
      ? body.model.trim()
      : "auto";

  if (!message) {
    return response.status(400).json({
      ok: false,
      error: "Message is required."
    });
  }

  if (message.length > 20000) {
    return response.status(400).json({
      ok: false,
      error:
        "Message is too long. Maximum length is 20000 characters."
    });
  }

  if (
    requestedModel !== "auto" &&
    !/^models\/[A-Za-z0-9._:-]+$/.test(
      requestedModel
    )
  ) {
    return response.status(400).json({
      ok: false,
      error: "Invalid Gemini model identifier."
    });
  }

  async function fetchAvailableModels() {
    const models = [];
    let pageToken = "";

    do {
      const url = new URL(
        "https://generativelanguage.googleapis.com/v1beta/models"
      );

      url.searchParams.set("key", apiKey);
      url.searchParams.set("pageSize", "1000");

      if (pageToken) {
        url.searchParams.set(
          "pageToken",
          pageToken
        );
      }

      const upstreamResponse = await fetch(url);
      const responseText =
        await upstreamResponse.text();

      let upstreamData;

      try {
        upstreamData =
          JSON.parse(responseText);
      } catch {
        upstreamData = null;
      }

      if (!upstreamResponse.ok) {
        const upstreamMessage =
          upstreamData?.error?.message ||
          "Gemini API returned an unexpected error.";

        const error = new Error(
          `Gemini API error: ${upstreamMessage}`
        );

        error.status =
          upstreamResponse.status;

        throw error;
      }

      const pageModels =
        Array.isArray(
          upstreamData?.models
        )
          ? upstreamData.models
          : [];

      for (const model of pageModels) {
        const methods =
          Array.isArray(
            model?.supportedGenerationMethods
          )
            ? model.supportedGenerationMethods
            : [];

        if (
          typeof model?.name !== "string" ||
          !methods.includes(
            "generateContent"
          )
        ) {
          continue;
        }

        models.push(model);
      }

      pageToken =
        typeof upstreamData?.nextPageToken ===
        "string"
          ? upstreamData.nextPageToken
          : "";
    } while (pageToken);

    return Array.from(
      new Map(
        models.map((model) => [
          model.name,
          model
        ])
      ).values()
    );
  }

  function selectAutoModel(models) {
    if (!models.length) {
      return null;
    }

    return [...models].sort(
      (first, second) => {
        const firstThinking =
          first.thinking === true
            ? 1
            : 0;

        const secondThinking =
          second.thinking === true
            ? 1
            : 0;

        if (
          secondThinking !==
          firstThinking
        ) {
          return (
            secondThinking -
            firstThinking
          );
        }

        const firstOutput =
          Number.isInteger(
            first.outputTokenLimit
          )
            ? first.outputTokenLimit
            : 0;

        const secondOutput =
          Number.isInteger(
            second.outputTokenLimit
          )
            ? second.outputTokenLimit
            : 0;

        if (
          secondOutput !==
          firstOutput
        ) {
          return (
            secondOutput -
            firstOutput
          );
        }

        const firstInput =
          Number.isInteger(
            first.inputTokenLimit
          )
            ? first.inputTokenLimit
            : 0;

        const secondInput =
          Number.isInteger(
            second.inputTokenLimit
          )
            ? second.inputTokenLimit
            : 0;

        if (
          secondInput !==
          firstInput
        ) {
          return (
            secondInput -
            firstInput
          );
        }

        return String(
          first.name
        ).localeCompare(
          String(second.name)
        );
      }
    )[0];
  }

  try {
    let selectedModel =
      requestedModel;

    if (requestedModel === "auto") {
      const models =
        await fetchAvailableModels();

      const autoModel =
        selectAutoModel(models);

      if (!autoModel) {
        return response.status(503).json({
          ok: false,
          error:
            "No Gemini models supporting generateContent are available for this API key."
        });
      }

      selectedModel =
        autoModel.name;
    }

    const modelId =
      selectedModel.replace(
        /^models\//,
        ""
      );

    const generateUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelId
      )}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

    const upstreamResponse =
      await fetch(generateUrl, {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: message
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2
          }
        })
      });

    const responseText =
      await upstreamResponse.text();

    let upstreamData;

    try {
      upstreamData =
        JSON.parse(responseText);
    } catch {
      upstreamData = null;
    }

    if (!upstreamResponse.ok) {
      const upstreamMessage =
        upstreamData?.error?.message ||
        "Gemini API returned an unexpected error.";

      return response.status(
        upstreamResponse.status
      ).json({
        ok: false,
        error: `Gemini API error: ${upstreamMessage}`
      });
    }

    const candidates =
      Array.isArray(
        upstreamData?.candidates
      )
        ? upstreamData.candidates
        : [];

    const firstCandidate =
      candidates[0];

    const parts =
      Array.isArray(
        firstCandidate?.content?.parts
      )
        ? firstCandidate.content.parts
        : [];

    const text = parts
      .filter(
        (part) =>
          typeof part?.text ===
          "string"
      )
      .map(
        (part) => part.text
      )
      .join("");

    if (!text.trim()) {
      const finishReason =
        firstCandidate?.finishReason ||
        "unknown";

      return response.status(502).json({
        ok: false,
        error:
          `Gemini returned no text content. Finish reason: ${finishReason}.`
      });
    }

    return response.status(200).json({
      ok: true,
      service: "Gemini API",
      model: selectedModel,
      text
    });
  } catch (error) {
    console.error(
      "Gemini generation failed:",
      error
    );

    const status =
      Number.isInteger(error?.status) &&
      error.status >= 400 &&
      error.status < 600
        ? error.status
        : 502;

    return response.status(status).json({
      ok: false,
      error:
        error?.message ||
        "Could not complete the Gemini request."
    });
  }
  }
