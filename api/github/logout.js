export default function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  response.setHeader(
    "Set-Cookie",
    [
      "ld76_github_access_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      "ld76_github_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    ]
  );

  return response.status(200).json({
    ok: true,
    connected: false
  });
}
