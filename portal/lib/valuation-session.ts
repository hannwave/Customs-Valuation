import type { InternationalPriceSearch, LocalMarketPriceSearch } from "@/lib/types/customs";

export const ACTIVE_VALUATION_SESSION_KEY = "customs.active-valuation-session";

export interface ValuationSession {
  id: string;
  query: string;
  market: string;
  international: InternationalPriceSearch | null;
  local: LocalMarketPriceSearch | null;
  historical?: { rows: { date: string; internationalPrice: number | null; localPrice: number | null }[]; product: string; currency: string } | null;
  createdAt: string;
  hsCode?: string;
  selectedValue?: number | null;
  selectedCurrency?: string;
  decisionId?: string;
  phase1Submitted?: boolean;
}

export function readValuationSession(): ValuationSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_VALUATION_SESSION_KEY);
    return raw ? JSON.parse(raw) as ValuationSession : null;
  } catch {
    return null;
  }
}

export function writeValuationSession(session: ValuationSession) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_VALUATION_SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new Event("valuation-session-updated"));
  }
}

export function updateValuationSession(patch: Partial<ValuationSession>) {
  const current = readValuationSession();
  if (current) {
    const next = { ...current, ...patch };
    if (patch.hsCode === undefined) delete next.hsCode;
    writeValuationSession(next);
  }
}

export function clearValuationSession() {
  if (typeof window !== "undefined") window.localStorage.removeItem(ACTIVE_VALUATION_SESSION_KEY);
}
