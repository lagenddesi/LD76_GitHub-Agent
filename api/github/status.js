export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  const accessToken =
    getCookie(
      request.headers.cookie || "",
      "ld76_github_access_token"
    );

  if (!accessToken) {
    return response.status(200).json({
      ok: true,
      connected: false
    });
  }

  try {
    const githubResponse = await fetch(
      "https://api.github.com/user",
      {
        method: "GET",
        headers: {
          Accept:
            "application/vnd.github+json",
          Authorization:
            `Bearer ${accessToken}`,
          "X-GitHub-Api-Version":
            "2022-11-28"
        }
      }
    );

    if (githubResponse.status === 401) {
      return response.status(200).json({
        ok: true,
        connected: false
      });
    }

    if (!githubResponse.ok) {
      console.error(
        "GitHub status request failed:",
        githubResponse.status
      );

      return response.status(502).json({
        ok: false,
        error:
          "Could not verify the GitHub connection."
      });
    }

    const user =
      await githubResponse.json();

    return response.status(200).json({
      ok: true,
      connected: true,
      user: {
        login:
          typeof user.login === "string"
            ? user.login
            : "",
        name:
          typeof user.name === "string"
            ? user.name
            : null,
        avatarUrl:
          typeof user.avatar_url === "string"
            ? user.avatar_url
            : null
      }
    });
  } catch (error) {
    console.error(
      "GitHub status check failed:",
      error
    );

    return response.status(502).json({
      ok: false,
      error:
        "Could not reach GitHub to verify the connection."
    });
  }
}

function getCookie(
  cookieHeader,
  cookieName
) {
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

    if (name !== cookieName) {
      continue;
    }

    const value =
      part
        .slice(separatorIndex + 1)
        .trim();

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return "";
}
