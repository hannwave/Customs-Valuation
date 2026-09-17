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
  if (!response.ok) throw new Error(body.message ?? body.detail ?? "The Phase 2 request could not be completed.");
  return body as T;
}

export const loadPhase2 = (decisionId: string) => request<Phase2Response>(`/api/valuation-decisions/${decisionId}/phase-2`);
export const calculatePhase2 = (decisionId: string, payload: Phase2Request) => request<Phase2Response>(`/api/valuation-decisions/${decisionId}/phase-2/calculate`, { method: "POST", body: JSON.stringify(payload) });
export const savePhase2 = (decisionId: string, payload: Phase2Request, complete = false) => request<Phase2Response>(`/api/valuation-decisions/${decisionId}/phase-2${complete ? "/complete" : ""}`, { method: complete ? "POST" : "PUT", body: JSON.stringify(payload) });
export const searchPhase2HsCodes = (search: string) => request<PagedResult<HsCode>>(`/api/hs-codes?${new URLSearchParams({ search, page: "1", pageSize: "8" })}`);
