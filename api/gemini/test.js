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
    const upstreamResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`
    );

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

    return response.status(200).json({
      ok: true,
      service: "Gemini API",
      status: "connected"
    });
  } catch (error) {
    console.error("Gemini connection test failed:", error);

    return response.status(502).json({
      ok: false,
      error:
        "Could not reach the Gemini API. Check the server network connection and try again."
    });
  }
}
