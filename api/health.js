export default function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  return response.status(200).json({
    ok: true,
    service: "LD76 Code Agent",
    status: "ready",
    phase: 0
  });
}
