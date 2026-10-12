// public/js/common/api.js - JSON requests to the HelpHub API

const LOGIN_PAGE = "/pages/login.html";

/**
 * Sends the session cookie, encodes/decodes JSON and turns error responses
 * into thrown Errors carrying the server's message.
 * With redirectOn401, an expired session sends the user back to login.
 */
export async function requestJson(
  url,
  { method = "GET", body, redirectOn401 = false } = {}
) {
  const options = { method, credentials: "include", headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (response.status === 401 && redirectOn401) {
    window.location.href = LOGIN_PAGE;
    throw new Error("Session expired");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      result.error || `Request failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }
  return result;
}
