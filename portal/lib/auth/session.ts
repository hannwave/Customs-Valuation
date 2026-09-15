// Adapter boundary for the organization's OIDC client.
// Keep the in-memory value in sync with browser storage so API clients created
// after a page refresh can still authenticate with the current JWT.
const ACCESS_TOKEN_KEY = "customs_access_token";

let accessToken: string | null = null;

export function setSessionAccessToken(token: string | null) {
  accessToken = token;

  if (typeof window === "undefined") return;

  if (token) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

export function getSessionAccessToken() {
  if (accessToken) return accessToken;
  if (typeof window === "undefined") return null;

  accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  return accessToken;
}
