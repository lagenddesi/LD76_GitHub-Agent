export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  const clientId =
    process.env.LD76_GITHUB_CLIENT_ID;

  const clientSecret =
    process.env.LD76_GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return response.status(503).json({
      ok: false,
      error:
        "GitHub OAuth credentials are not configured. Add LD76_GITHUB_CLIENT_ID and LD76_GITHUB_CLIENT_SECRET to the Vercel environment variables."
    });
  }

  const code =
    typeof request.query?.code === "string"
      ? request.query.code
      : "";

  const returnedState =
    typeof request.query?.state === "string"
      ? request.query.state
      : "";

  const error =
    typeof request.query?.error === "string"
      ? request.query.error
      : "";

  if (error) {
    return response.status(400).json({
      ok: false,
      error:
        "GitHub authorization was cancelled or denied."
    });
  }

  if (!code || !returnedState) {
    return response.status(400).json({
      ok: false,
      error:
        "GitHub OAuth callback is missing the authorization code or state."
    });
  }

  const cookies = parseCookies(
    request.headers.cookie || ""
  );

  const expectedState =
    cookies.ld76_github_oauth_state || "";

  if (
    !expectedState ||
    !timingSafeEqual(
      expectedState,
      returnedState
    )
  ) {
    return response.status(400).json({
      ok: false,
      error:
        "GitHub OAuth state validation failed. Please start the GitHub connection again."
    });
  }

  try {
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code
        })
      }
    );

    const tokenData =
      await tokenResponse.json();

    if (
      !tokenResponse.ok ||
      !tokenData?.access_token
    ) {
      console.error(
        "GitHub OAuth token exchange failed:",
        tokenData
      );

      return response.status(502).json({
        ok: false,
        error:
          "GitHub authorization succeeded, but the access token could not be obtained."
      });
    }

    response.setHeader(
      "Set-Cookie",
      [
        `ld76_github_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
        `ld76_github_access_token=${encodeURIComponent(
          tokenData.access_token
        )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
      ]
    );

    return response.redirect(
      302,
      "/?github=connected"
    );
  } catch (error) {
    console.error(
      "GitHub OAuth callback failed:",
      error
    );

    return response.status(502).json({
      ok: false,
      error:
        "Could not complete GitHub authentication. Please try again."
    });
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};

  for (const part of cookieHeader.split(";")) {
    const separatorIndex =
      part.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name =
      part
        .slice(0, separatorIndex)
        .trim();

    const value =
      part
        .slice(separatorIndex + 1)
        .trim();

    if (!name) {
      continue;
    }

    try {
      cookies[name] =
        decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
}

function timingSafeEqual(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    left.length !== right.length
  ) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < left.length; index += 1) {
    result |=
      left.charCodeAt(index) ^
      right.charCodeAt(index);
  }

  return result === 0;
}
