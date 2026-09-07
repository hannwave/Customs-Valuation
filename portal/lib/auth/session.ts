// Adapter boundary for the organization's OIDC client. No tokens are persisted.
// Replace this with approved PKCE/session renewal integration during phase 1.
let accessToken: string | null = null;
export function setSessionAccessToken(token: string | null) { accessToken = token; }
export function getSessionAccessToken() { return accessToken; }
