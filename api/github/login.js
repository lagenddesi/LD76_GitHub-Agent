export default function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  const clientId = process.env.LD76_GITHUB_CLIENT_ID;
  const redirectUri =
    process.env.LD76_GITHUB_REDIRECT_URI;

  if (!clientId) {
    return response.status(503).json({
      ok: false,
      error:
        "GitHub OAuth client ID is not configured. Add LD76_GITHUB_CLIENT_ID to the Vercel environment variables."
    });
  }

  if (!redirectUri) {
    return response.status(503).json({
      ok: false,
      error:
        "GitHub OAuth redirect URI is not configured. Add LD76_GITHUB_REDIRECT_URI to the Vercel environment variables."
    });
  }

  const state = cryptoRandomState();

  const authorizationUrl =
    new URL(
      "https://github.com/login/oauth/authorize"
    );

  authorizationUrl.searchParams.set(
    "client_id",
    clientId
  );

  authorizationUrl.searchParams.set(
    "redirect_uri",
    redirectUri
  );

  authorizationUrl.searchParams.set(
    "scope",
    "repo"
  );

  authorizationUrl.searchParams.set(
    "state",
    state
  );

  response.setHeader(
    "Set-Cookie",
    `ld76_github_oauth_state=${encodeURIComponent(
      state
    )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  return response.redirect(
    302,
    authorizationUrl.toString()
  );
}

function cryptoRandomState() {
  const bytes =
    new Uint8Array(32);

  globalThis.crypto.getRandomValues(
    bytes
  );

  return Array.from(bytes)
    .map((byte) =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}
