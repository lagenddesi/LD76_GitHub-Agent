export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  const accessToken = getCookie(
    request.headers.cookie || "",
    "ld76_github_access_token"
  );

  if (!accessToken) {
    return response.status(401).json({
      ok: false,
      error: "GitHub is not connected."
    });
  }

  try {
    const repositories = [];
    let page = 1;

    while (page <= 10) {
      const githubResponse = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`,
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
        return response.status(401).json({
          ok: false,
          error:
            "GitHub authentication has expired. Please connect GitHub again."
        });
      }

      if (!githubResponse.ok) {
        const errorData =
          await readJsonSafely(githubResponse);

        console.error(
          "GitHub repository request failed:",
          errorData
        );

        return response.status(502).json({
          ok: false,
          error:
            "Could not load your GitHub repositories."
        });
      }

      const pageData =
        await githubResponse.json();

      if (!Array.isArray(pageData)) {
        return response.status(502).json({
          ok: false,
          error:
            "GitHub returned an unexpected repository response."
        });
      }

      repositories.push(
        ...pageData
          .filter(
            (repository) =>
              repository &&
              typeof repository.id === "number" &&
              typeof repository.full_name ===
                "string"
          )
          .map((repository) => ({
            id: repository.id,
            name: repository.name,
            fullName:
              repository.full_name,
            private:
              Boolean(repository.private),
            defaultBranch:
              typeof repository.default_branch ===
              "string"
                ? repository.default_branch
                : "main",
            description:
              typeof repository.description ===
              "string"
                ? repository.description
                : null,
            htmlUrl:
              typeof repository.html_url ===
              "string"
                ? repository.html_url
                : null,
            language:
              typeof repository.language ===
              "string"
                ? repository.language
                : null,
            updatedAt:
              typeof repository.updated_at ===
              "string"
                ? repository.updated_at
                : null
          }))
      );

      if (pageData.length < 100) {
        break;
      }

      page += 1;
    }

    return response.status(200).json({
      ok: true,
      repositories
    });
  } catch (error) {
    console.error(
      "GitHub repository loading failed:",
      error
    );

    return response.status(502).json({
      ok: false,
      error:
        "Could not reach GitHub to load repositories."
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

async function readJsonSafely(
  githubResponse
) {
  try {
    return await githubResponse.json();
  } catch {
    return null;
  }
}
