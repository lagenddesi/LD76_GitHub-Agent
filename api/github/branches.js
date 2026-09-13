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

  const owner =
    typeof request.query?.owner === "string"
      ? request.query.owner.trim()
      : "";

  const repo =
    typeof request.query?.repo === "string"
      ? request.query.repo.trim()
      : "";

  if (!isValidName(owner) || !isValidName(repo)) {
    return response.status(400).json({
      ok: false,
      error:
        "A valid GitHub repository owner and name are required."
    });
  }

  try {
    const branches = [];
    let page = 1;

    while (page <= 10) {
      const githubResponse = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(
          owner
        )}/${encodeURIComponent(
          repo
        )}/branches?per_page=100&page=${page}`,
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

      if (githubResponse.status === 404) {
        return response.status(404).json({
          ok: false,
          error:
            "Repository was not found or you do not have access to it."
        });
      }

      if (!githubResponse.ok) {
        const errorData =
          await readJsonSafely(githubResponse);

        console.error(
          "GitHub branch request failed:",
          errorData
        );

        return response.status(502).json({
          ok: false,
          error:
            "Could not load repository branches."
        });
      }

      const pageData =
        await githubResponse.json();

      if (!Array.isArray(pageData)) {
        return response.status(502).json({
          ok: false,
          error:
            "GitHub returned an unexpected branch response."
        });
      }

      branches.push(
        ...pageData
          .filter(
            (branch) =>
              branch &&
              typeof branch.name === "string"
          )
          .map((branch) => ({
            name: branch.name,
            protected:
              Boolean(branch.protected)
          }))
      );

      if (pageData.length < 100) {
        break;
      }

      page += 1;
    }

    return response.status(200).json({
      ok: true,
      owner,
      repo,
      branches
    });
  } catch (error) {
    console.error(
      "GitHub branch loading failed:",
      error
    );

    return response.status(502).json({
      ok: false,
      error:
        "Could not reach GitHub to load repository branches."
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

function isValidName(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 100 &&
    /^[A-Za-z0-9_.-]+$/.test(value)
  );
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
