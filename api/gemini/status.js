export default function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  return response.status(200).json({
    ok: true,
    configured: Boolean(apiKey),
    service: "Gemini API"
  });
}
