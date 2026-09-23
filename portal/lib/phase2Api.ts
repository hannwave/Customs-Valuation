import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
import type { HsCode, PagedResult, Phase2Request, Phase2Response } from "@/lib/types/customs";

const apiBase = () => process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionAccessToken();
  if (!token) {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new Error("Sign in to continue.");
  }
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (response.status === 401) {
    setSessionAccessToken(null);
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new Error("Your session expired. Please sign in again.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message ?? body.detail ?? body.title;
    throw new Error(message || `Phase 2 request failed (HTTP ${response.status}). Please retry or reload the assessment.`);
  }
  return body as T;
}

export const loadPhase2 = (decisionId: string) => request<Phase2Response>(`/api/valuation-decisions/${decisionId}/phase-2`);
export const calculatePhase2 = (decisionId: string, payload: Phase2Request) => request<Phase2Response>(`/api/valuation-decisions/${decisionId}/phase-2/calculate`, { method: "POST", body: JSON.stringify(payload) });
export const savePhase2 = (decisionId: string, payload: Phase2Request, complete = false) => request<Phase2Response>(`/api/valuation-decisions/${decisionId}/phase-2${complete ? "/complete" : ""}`, { method: complete ? "POST" : "PUT", body: JSON.stringify(payload) });
export const searchPhase2HsCodes = (search: string) => request<PagedResult<HsCode>>(`/api/hs-codes?${new URLSearchParams({ search, page: "1", pageSize: "8" })}`);

export async function downloadPhase1Receipt(decisionId: string) {
  const token = getSessionAccessToken();
  if (!token) throw new Error("Sign in to access the customer receipt.");
  const response = await fetch(`${apiBase()}/api/workspace/decisions/${decisionId}/receipt`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? "The customer receipt could not be opened.");
  }
  return response.blob();
}
