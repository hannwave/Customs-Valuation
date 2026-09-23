import type { InternationalPriceSearch, LocalMarketPriceSearch } from "@/lib/types/customs";

export const ACTIVE_VALUATION_SESSION_KEY = "customs.active-valuation-session";

export interface HistoricalSessionEvidence {
  rows: {
    date: string;
    internationalPrice: number | null;
    localPrice: number | null;
    difference?: number | null;
    percentageDifference?: number | null;
    countryCount?: number;
    localCount?: number;
  }[];
  product: string;
  currency: string;
  asOf?: string;
  countries?: string[];
  messages?: string[];
  methodology?: string;
  summary?: {
    currentInternationalPrice: number | null;
    internationalAsOf: string | null;
    currentLocalPrice: number | null;
    localAsOf?: string | null;
    sixMonthChange?: number | null;
    differencePercent?: number | null;
  };
}

export interface CustomerTransactionEvidence {
  amount: number | null;
  currency: string;
  convertedAmount: number | null;
  convertedCurrency: string;
  exchangeRate: number | null;
  exchangeRateSource: string | null;
  exchangeRateDate: string | null;
  receiptFileName: string | null;
  receiptContentType: string | null;
  receiptFileSize: number | null;
}

export interface ValuationSession {
  id: string;
  query: string;
  market: string;
  international: InternationalPriceSearch | null;
  local: LocalMarketPriceSearch | null;
  historical?: HistoricalSessionEvidence | null;
  customerTransaction?: CustomerTransactionEvidence | null;
  preferredCurrency?: string;
  selectedSource?: string;
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

/* ── Recent searches ─────────────────────────────────────────────────── */
export const RECENT_SEARCHES_KEY = "customs.recent-searches";
const MAX_RECENT = 10;

export function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  const term = query.trim();
  if (!term) return;
  const list = readRecentSearches().filter(item => item.toLowerCase() !== term.toLowerCase());
  list.unshift(term);
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

export function removeRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  const list = readRecentSearches().filter(item => item !== query);
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
}

export function clearRecentSearches() {
  if (typeof window !== "undefined") window.localStorage.removeItem(RECENT_SEARCHES_KEY);
}
