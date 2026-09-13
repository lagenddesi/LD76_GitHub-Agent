export default async function handler(request, response) {
  if (request.method !== "GET") {
    return response.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  }

  const accessToken = getCookie(
    request.headers.cookie,
    "ld76_github_access_token"
  );

  if (!accessToken) {
    return response.status(401).json({
      ok: false,
      error: "GitHub is not connected."
    });
  }

  const owner = String(
    request.query?.owner || ""
  ).trim();

  const repo = String(
    request.query?.repo || ""
  ).trim();

  const path = String(
    request.query?.path || ""
  ).trim();

  const ref = String(
    request.query?.ref || ""
  ).trim();

  if (!owner || !repo || !path) {
    return response.status(400).json({
      ok: false,
      error:
        "owner, repo, and path are required."
    });
  }

  if (
    !isValidGitHubName(owner) ||
    !isValidGitHubName(repo) ||
    !isValidPath(path)
  ) {
    return response.status(400).json({
      ok: false,
      error: "Invalid repository or file path."
    });
  }

  if (
    ref &&
    !isValidRef(ref)
  ) {
    return response.status(400).json({
      ok: false,
      error: "Invalid Git reference."
    });
  }

  try {
    const file = await fetchGitHubFile(
      accessToken,
      owner,
      repo,
      path,
      ref
    );

    return response.status(200).json({
      ok: true,
      owner,
      repo,
      path: file.path,
      sha: file.sha,
      size: file.size,
      encoding: file.encoding,
      content: file.content,
      url: file.url
    });
  } catch (error) {
    console.error(
      "GitHub file read request failed:",
      error
    );

    if (error.status === 401) {
      clearAccessTokenCookie(response);

      return response.status(401).json({
        ok: false,
        error:
          "GitHub authorization has expired or is invalid. Please reconnect GitHub."
      });
    }

    if (error.status === 404) {
      return response.status(404).json({
        ok: false,
        error:
          "The requested file was not found."
      });
    }

    return response.status(
      error.status >= 400 &&
        error.status < 600
        ? error.status
        : 502
    ).json({
      ok: false,
      error:
        error.message ||
        "Could not read the GitHub file."
    });
  }
}

async function fetchGitHubFile(
  accessToken,
  owner,
  repo,
  path,
  ref
) {
  const query = ref
    ? `?ref=${encodeURIComponent(ref)}`
    : "";

  const githubResponse =
    await githubFetch(
      `/repos/${encodeURIComponent(
        owner
      )}/${encodeURIComponent(
        repo
      )}/contents/${path}${query}`,
      accessToken
    );

  if (!githubResponse.ok) {
    throw await githubError(
      githubResponse,
      "Could not read the GitHub file."
    );
  }

  const data =
    await githubResponse.json();

  if (
    !data ||
    Array.isArray(data) ||
    data.type !== "file"
  ) {
    const error = new Error(
      "The requested path is not a file."
    );

    error.status = 400;

    throw error;
  }

  if (
    typeof data.content !== "string"
  ) {
    const error = new Error(
      "GitHub did not return file content."
    );

    error.status = 502;

    throw error;
  }

  if (
    data.encoding !== "base64"
  ) {
    const error = new Error(
      "GitHub returned an unsupported file encoding."
    );

    error.status = 502;

    throw error;
  }

  let content;

  try {
    content = decodeBase64(
      data.content
    );
  } catch {
    const error = new Error(
      "Could not decode the GitHub file content."
    );

    error.status = 502;

    throw error;
  }

  return {
    path:
      typeof data.path === "string"
        ? data.path
        : path,
    sha:
      typeof data.sha === "string"
        ? data.sha
        : "",
    size:
      Number.isFinite(data.size)
        ? data.size
        : null,
    encoding: "utf-8",
    content,
    url:
      typeof data.html_url === "string"
        ? data.html_url
        : null
  };
}

function githubFetch(
  path,
  accessToken
) {
  return fetch(
    `https://api.github.com${path}`,
    {
      method: "GET",
      headers: {
        Accept:
          "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version":
          "2022-11-28"
      }
    }
  );
}

async function githubError(
  response,
  fallbackMessage
) {
  let message = fallbackMessage;

  try {
    const data =
      await response.json();

    if (
      data?.message &&
      typeof data.message === "string"
    ) {
      message = data.message;
    }
  } catch {
    // Keep fallback message.
  }

  const error = new Error(message);
  error.status = response.status;

  return error;
}

function getCookie(
  cookieHeader,
  name
) {
  if (!cookieHeader) {
    return "";
  }

  const cookies =
    cookieHeader.split(";");

  for (const cookie of cookies) {
    const separator =
      cookie.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key =
      cookie
        .slice(0, separator)
        .trim();

    if (key !== name) {
      continue;
    }

    return decodeURIComponent(
      cookie
        .slice(separator + 1)
        .trim()
    );
  }

  return "";
}

function clearAccessTokenCookie(
  response
) {
  response.setHeader(
    "Set-Cookie",
    "ld76_github_access_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  );
}

function isValidGitHubName(
  value
) {
  return /^[A-Za-z0-9_.-]+$/.test(
    value
  );
}

function isValidPath(
  value
) {
  if (
    value.length < 1 ||
    value.length > 1000
  ) {
    return false;
  }

  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.includes("..")
  ) {
    return false;
  }

  return true;
}

function isValidRef(
  value
) {
  if (
    value.length < 1 ||
    value.length > 255
  ) {
    return false;
  }

  if (
    value.includes("\0") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes("//") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".") ||
    value.includes(" ") ||
    value.includes("~") ||
    value.includes("^") ||
    value.includes(":") ||
    value.includes("?") ||
    value.includes("*") ||
    value.includes("[")
  ) {
    return false;
  }

  return true;
}

function decodeBase64(
  value
) {
  const normalized =
    value.replace(/\s+/g, "");

  const binary =
    globalThis.atob(normalized);

  const bytes =
    Uint8Array.from(
      binary,
      (character) =>
        character.charCodeAt(0)
    );

  return new TextDecoder(
    "utf-8",
    {
      fatal: false
    }
  ).decode(bytes);
}
