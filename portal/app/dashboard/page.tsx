"use client";

import Link from "next/link";
import { Select } from "@mantine/core";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity, FiArrowRight, FiArchive, FiBarChart2, FiBookOpen, FiCheckCircle,
  FiChevronRight, FiClock, FiFileText, FiGlobe, FiMapPin, FiSearch, FiShield,
  FiUploadCloud, FiUser, FiUserPlus, FiUsers, FiX,
} from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { FeedbackToast } from "@/components/FeedbackToast";
import { PhaseTwoOverview } from "@/components/PhaseTwoOverview";
import { BenchmarkFetchChecks } from "@/components/BenchmarkFetchChecks";
import { getPhase2HsCode, loadPhase2, searchPhase2HsCodes } from "@/lib/phase2Api";
import { importerApi, importerApiBase, type ImporterDeclaration } from "@/lib/importer";
import { displayHsCode, recommendedHsCode } from "@/lib/hs-recommendation";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
import type { Phase2Response, CustomsTradeBenchmark, HsCode, InternationalPriceSearch, PriceStatistics } from "@/lib/types/customs";
import { roleLabel, workspaceApi, type DashboardLocation, type WorkspaceDashboard, type WorkspaceProfile } from "@/lib/workspace";
import { clearValuationSession, readValuationSession, updateValuationSession, writeValuationSession, addRecentSearch, readRecentSearches, removeRecentSearch, type HistoricalSessionEvidence } from "@/lib/valuation-session";
import { officerNoteIssue } from "@/lib/officer-note-quality";
import { compareCountries } from "@/lib/country-order";

type Phase = "one" | "two";

function PhaseBar({ phase, onChange, phase2Ready }: { phase: Phase; onChange: (next: Phase) => void; phase2Ready: boolean }) {
  return <nav className={`phase-bar phase-bar--${phase}`} aria-label="Officer valuation phases">
    <button type="button" aria-pressed={phase === "one"} aria-current={phase === "one" ? "step" : undefined} className={phase === "one" ? "is-active" : "is-complete"} onClick={() => onChange("one")}><span>{phase === "two" ? "✓" : "01"}</span><strong>Price Review</strong><small>Evidence and value</small></button>
    <FiChevronRight aria-hidden="true" />
    <button type="button" aria-pressed={phase === "two"} aria-current={phase === "two" ? "step" : undefined} className={phase === "two" ? "is-active" : "is-upcoming"} disabled={!phase2Ready} onClick={() => phase2Ready && onChange("two")}><span>02</span><strong>Duty &amp; Tax Assessment</strong><small>{phase2Ready ? "Calculate duties and taxes" : "Submit Price Review first"}</small></button>
  </nav>;
}

function KpiGrid({ data }: { data: WorkspaceDashboard }) {
  return <section className="dashboard-kpis" aria-label="Dashboard summary">{data.kpis.map(kpi => <article className={`dashboard-kpi dashboard-kpi--${kpi.tone}`} key={kpi.key}><span>{kpi.label}</span><strong>{kpi.value}</strong><small>{kpi.detail}</small></article>)}</section>;
}

function LocationTree({ locations }: { locations: DashboardLocation[] }) {
  const children = useMemo(() => {
    const map = new Map<string, DashboardLocation[]>();
    for (const location of locations) { const key = location.parentLocationId ?? "root"; map.set(key, [...(map.get(key) ?? []), location]); }
    return map;
  }, [locations]);
  function Branch({ parent = "root", depth = 0 }: { parent?: string; depth?: number }) {
    return <>{(children.get(parent) ?? []).map(location => <div key={location.id}>
      <div className="location-node" style={{ paddingLeft: `${12 + depth * 20}px` }}><span className="location-node-icon"><FiMapPin /></span><span><strong>{location.displayName || location.name}</strong><small>{location.officialCode} · {location.locationType.replaceAll("_", " ")}</small></span><em className={location.status === "ACTIVE" ? "is-online" : "is-muted"}>{location.status}</em></div>
      {depth < 4 && <Branch parent={location.id} depth={depth + 1} />}
    </div>)}</>;
  }
  return locations.length ? <div className="location-tree"><Branch /></div> : <DataState kind="empty" compact title="No locations configured" description="Create the official Customs hierarchy to activate location-based operations." />;
}

function DashboardHeader({ profile, eyebrow, title, description, actions }: { profile: WorkspaceProfile; eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="dashboard-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lead">{description}</p></div><div className="dashboard-heading-side"><span className="workspace-tag"><FiShield />{roleLabel(profile.user.role)}</span>{actions}</div></div>;
}

type EvidenceSource = "internationalMedian" | "internationalMean" | "customsBenchmark" | "declaredPrice" | "custom";
type ConvertedPrice = { convertedAmount: number; to: string; rate: number; source: string; date?: string };
type CountryOption = { code: string; name: string };

const COUNTRY_CODES = "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" ");

function money(value: number | null | undefined, currency: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function tradePeriod(period: number | null | undefined) {
  if (period == null) return "Current month";
  const value = String(period);
  if (!/^\d{6}$/.test(value)) return value;
  const date = new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, 1));
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function tradeCheckedAt(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function StatisticCard({ title, icon, stats, currency, href }: { title: string; icon: React.ReactNode; stats: PriceStatistics | null; currency: string; href: string }) {
  const tone = "international";
  return <Link href={href} className={`valuation-stat-card valuation-stat-card--${tone} valuation-stat-card--link`} aria-label={`Open ${title.toLowerCase()} details`}>
    <div className="valuation-card-title"><span>{icon}</span><strong>{title}</strong><em>n = {stats?.observationCount ?? "—"}</em></div>
    <span className="valuation-label">Median unit price</span>
    <b>{money(stats?.median, currency)}</b>
    {(stats?.observationCount === 0 || stats == null) && <p className="valuation-stat-provider-note">{stats?.observationCount === 0 ? "No comparable prices were returned for this search." : "Price statistics have not loaded."}</p>}
    <dl>
      <div><dt>Mean</dt><dd>{money(stats?.mean, currency)}</dd></div>
      <div><dt>Minimum</dt><dd>{money(stats?.minimum, currency)}</dd></div>
      <div><dt>Maximum</dt><dd>{money(stats?.maximum, currency)}</dd></div>
    </dl>
  </Link>;
}

function CountryOriginFobCard({ value, countryName, busy, error, onRetry }: { value: CustomsTradeBenchmark | null; countryName: string; busy: boolean; error: string; onRetry: () => void }) {
  return <section className="valuation-stat-card manufacturer-price-card country-origin-fob-card" aria-label="Country of Origin FOB reference price">
    <div className="valuation-card-title"><span><FiMapPin /></span><strong>Country of Origin FOB</strong><em>{tradePeriod(value?.period)}</em></div>
    {busy ? <p role="status" className="manufacturer-price-note">Loading {countryName || "country"} FOB export evidence…</p>
      : error ? <><p role="alert" className="manufacturer-price-error">{error}</p><button type="button" className="manufacturer-source-link" onClick={onRetry}>Retry FOB lookup</button></>
        : value?.unitValue != null ? <>
          <span className="valuation-label">{value.reporter} · {value.partner || "Ethiopia"} · {value.hsCode} · {tradePeriod(value.period)} · {value.currency} · FOB / {value.unit === "u" ? "item" : value.unit}</span>
          <b>{money(value.unitValue, value.currency)} / {value.unit === "u" ? "item" : value.unit}</b>
          <p className="manufacturer-price-note">Last checked {tradeCheckedAt(value.lastCheckedAtUtc)} · reported quantity {value.quantity?.toLocaleString() ?? "not recorded"} {value.unit || ""}</p>
          <p className="manufacturer-price-note">Latest available UN Comtrade export reference for the selected country of origin. Reference only; it does not replace the declared/import price.</p>
          <p className="manufacturer-price-note">WTO customs valuation principles require evidence to be considered with the transaction and other available evidence; WTO does not publish a universal fixed product price.</p>
          {value.sourceUrl && <a className="manufacturer-source-link" href={value.sourceUrl} target="_blank" rel="noopener noreferrer">UN Comtrade FOB source <FiArrowRight /></a>}
        </> : <><p className="manufacturer-price-note">{value?.message ?? `No country-of-origin FOB data is available for ${countryName || "the selected country"}.`}</p>{value && <button type="button" className="manufacturer-source-link" onClick={onRetry}>Retry FOB lookup</button>}</>}
  </section>;
}

function EvidenceTrend({ international, customerPrice, currency }: { international: PriceStatistics | null; customerPrice: number | null; currency: string }) {
  const internationalValue = international?.median;
  const scaleMaximum = Math.max(internationalValue ?? 0, customerPrice ?? 0, 1);
  const customerY = customerPrice == null ? null : 68 - Math.min(42, Math.max(0, customerPrice / scaleMaximum * 34));
  const toPoints = (value: number | undefined, offset: number) => value == null ? "" : Array.from({ length: 6 }, (_, index) => `${8 + index * 17},${68 - Math.min(42, Math.max(0, value / scaleMaximum * 34) + ((index % 2) * 2) + offset)}`).join(" ");
  return <section className="valuation-trend"><div className="valuation-trend-heading"><div><h3>Price evidence snapshot</h3><p>International median and customer-declared price in {currency}</p></div><span>Current search</span></div>
    <div className="valuation-chart" aria-label="International and customer-declared price comparison"><svg viewBox="0 0 100 80" preserveAspectRatio="none" role="img"><path className="chart-grid" d="M0 15H100M0 40H100M0 65H100" />{internationalValue != null && <polyline className="chart-line chart-line--international" points={toPoints(internationalValue, 5)} />}{customerPrice != null && customerY != null && <circle className="chart-point--customer" cx="92" cy={customerY} r="2.7"><title>Customer-paid price: {money(customerPrice, currency)}</title></circle>}</svg><div className="chart-legend"><span><i className="chart-key chart-key--international" />International median {money(internationalValue, currency)}</span>{customerPrice != null && <span><i className="chart-key chart-key--customer" />Customer-paid price {money(customerPrice, currency)}</span>}</div></div>
  </section>;
}

function HistoricalPriceCard({ historical, internationalPrice, currency }: { historical: HistoricalSessionEvidence | null; internationalPrice: number | null; currency: string }) {
  return <section className="valuation-history-card">
    <div className="valuation-history-heading"><div><span>Saved database evidence</span><h3>Historical prices</h3></div><Link href="/historical-customs-prices">Open history <FiArrowRight /></Link></div>
    <div className="valuation-history-values">
      <div><span>Latest international</span><strong>{money(internationalPrice, currency)}</strong><small>{historical?.summary?.internationalAsOf ? `Observed ${historical.summary.internationalAsOf}` : "No matching saved observation"}</small></div>
    </div>
    <p>{historical?.methodology ?? "Only exact-query observations previously stored in the database are shown. No history is invented or fetched live."}</p>
  </section>;
}

function OfficerEvidenceWorkspace({ profile, onSubmitted, importDeclaration }: { profile: WorkspaceProfile; onSubmitted: () => void; importDeclaration: ImporterDeclaration | null }) {
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("us");
  const [purchaseCountry, setPurchaseCountry] = useState("");
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
  const [international, setInternational] = useState<InternationalPriceSearch | null>(null);
  const [customsBenchmark, setCustomsBenchmark] = useState<CustomsTradeBenchmark | null>(null);
  const [countryOriginFob, setCountryOriginFob] = useState<CustomsTradeBenchmark | null>(null);
  const [benchmarkBusy, setBenchmarkBusy] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState("");
  const [benchmarkRetry, setBenchmarkRetry] = useState(0);
  const [countryOriginFobBusy, setCountryOriginFobBusy] = useState(false);
  const [countryOriginFobError, setCountryOriginFobError] = useState("");
  const [countryOriginFobRetry, setCountryOriginFobRetry] = useState(0);
  const [benchmarkConversion, setBenchmarkConversion] = useState<ConvertedPrice | null>(null);
  const [benchmarkConversionError, setBenchmarkConversionError] = useState("");
  const [benchmarkConversionRetry, setBenchmarkConversionRetry] = useState(0);
  const [searchedTerm, setSearchedTerm] = useState("");
  const searchSerial = useRef(0);
  const hsLookupSerial = useRef(0);
  const [hsInput, setHsInput] = useState("");
  const [hsCode, setHsCode] = useState<HsCode | null>(null);
  const [hsCandidates, setHsCandidates] = useState<HsCode[]>([]);
  const [hsBusy, setHsBusy] = useState(false);
  const [hsMessage, setHsMessage] = useState("");
  const [historical, setHistorical] = useState<HistoricalSessionEvidence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<EvidenceSource>("internationalMedian");
  const [customValue, setCustomValue] = useState("");
  const [justification, setJustification] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordNotice, setRecordNotice] = useState("");
  const [declaredPrice, setDeclaredPrice] = useState("");
  const [declaredCurrency, setDeclaredCurrency] = useState("USD");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [declaredConversion, setDeclaredConversion] = useState<{ convertedAmount: number; rate: number; source: string; to?: string; date?: string } | null>(null);
  const currency = ({ us: "USD", gb: "GBP", de: "EUR", ae: "AED", za: "ZAR" } as Record<string, string>)[market] ?? "USD";
  const justificationIssue = officerNoteIssue(justification);

  useEffect(() => {
    const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
    setCountryOptions(COUNTRY_CODES.map(code => ({ code, name: names?.of(code) ?? code }))
      .sort(compareCountries));
  }, []);

  useEffect(() => {
    if (!receiptFile) { setReceiptPreviewUrl(null); return; }
    const previewUrl = URL.createObjectURL(receiptFile);
    setReceiptPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [receiptFile]);

  useEffect(() => {
    setRecentSearches(readRecentSearches());
    const active = readValuationSession();
    if (!active) return;
    setQuery(active.query); setMarket(active.market); setPurchaseCountry(active.purchaseCountryCode ?? ""); setInternational(active.international); setHistorical(active.historical ?? null);
    setCustomsBenchmark(active.customsBenchmark ?? null);
    setCountryOriginFob(active.countryOriginFob ?? null);
    if (active.international || active.historical || active.customsBenchmark) setSearchedTerm(active.query);
    if (active.hsCode) setHsInput(active.hsCode);
    if (active.hsCodeId) {
      void getPhase2HsCode(active.hsCodeId).then(setHsCode).catch(() => {});
    }
    if (active.customerTransaction) {
      setDeclaredPrice(active.customerTransaction.amount?.toString() ?? "");
      setDeclaredCurrency(active.customerTransaction.currency || "USD");
    }
    if (["internationalMedian", "internationalMean", "customsBenchmark", "declaredPrice", "custom"].includes(active.selectedSource ?? ""))
      setSelected(active.selectedSource as EvidenceSource);
  }, []);

  useEffect(() => {
    if (!importDeclaration) return;
    setQuery(importDeclaration.productName); setPurchaseCountry(importDeclaration.originCountryCode);
    if (importDeclaration.confirmedHsCodeId) void getPhase2HsCode(importDeclaration.confirmedHsCodeId)
      .then(item => { setHsCode(item); setHsInput(displayHsCode(item)); }).catch(() => setError("The verified tariff item could not be loaded."));
    const invoice = importDeclaration.documents.find(document => document.kind === "COMMERCIAL_INVOICE");
    const token = getSessionAccessToken();
    if (invoice && token) void fetch(`${importerApiBase}/importer-declarations/${importDeclaration.id}/documents/COMMERCIAL_INVOICE`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { if (!response.ok) throw new Error("Invoice unavailable."); return new File([await response.blob()], invoice.fileName, { type: invoice.contentType }); })
      .then(setReceiptFile).catch(() => setError("The importer invoice could not be loaded. Open the submission and try again."));
  }, [importDeclaration]);

  async function lookupHs(searchTerm: string, serial: number, automatic: boolean) {
    setHsBusy(true);
    setHsMessage("");
    try {
      const expected = automatic ? recommendedHsCode(searchTerm) : null;
      const result = await searchPhase2HsCodes(expected ?? searchTerm);
      if (serial !== hsLookupSerial.current) return;
      setHsCandidates(result.items);
      const exact = result.items.find(item =>
        (item.code ?? "").replace(/\D/g, "") === (expected ?? searchTerm).replace(/\D/g, "") ||
        (item.tariffItemNo ?? "").replace(/\D/g, "") === (expected ?? searchTerm).replace(/\D/g, ""));
      const chosen = exact ?? (automatic && result.items.length === 1 ? result.items[0] : null);
      if (chosen) {
        setHsCode(chosen);
        setHsInput(displayHsCode(chosen));
        updateValuationSession({ hsCodeId: chosen.id, hsCode: displayHsCode(chosen) });
      } else {
        setHsMessage(result.items.length ? "Choose the correct tariff line below." : "No confident HS match. Search by code or product description, then choose a tariff line.");
      }
    } catch (reason) {
      if (serial === hsLookupSerial.current) setHsMessage(reason instanceof Error ? reason.message : "HS lookup is unavailable. Try entering a code.");
    } finally {
      if (serial === hsLookupSerial.current) setHsBusy(false);
    }
  }

  function editHs(value: string) {
    setHsInput(value);
    setHsCode(null);
    setHsCandidates([]);
    setHsMessage("");
    setCustomsBenchmark(null);
    setCountryOriginFob(null);
    setBenchmarkConversion(null);
    if (selected === "customsBenchmark") setSelected("internationalMedian");
    setBenchmarkError("");
    updateValuationSession({ hsCodeId: null, hsCode: "", customsBenchmark: null, selectedValue: null });
    const serial = ++hsLookupSerial.current;
    if (value.trim().length < 2) { setHsBusy(false); return; }
    window.setTimeout(() => { if (serial === hsLookupSerial.current) void lookupHs(value.trim(), serial, false); }, 300);
  }

  function chooseHs(item: HsCode) {
    setHsCode(item);
    setHsInput(displayHsCode(item));
    setHsCandidates([]);
    setHsMessage("");
    setCustomsBenchmark(null);
    setCountryOriginFob(null);
    setBenchmarkConversion(null);
    setBenchmarkError("");
    if (selected === "customsBenchmark") setSelected("internationalMedian");
    ++hsLookupSerial.current;
    setHsBusy(false);
    updateValuationSession({ hsCodeId: item.id, hsCode: displayHsCode(item), customsBenchmark: null, selectedValue: null });
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) { setError("Enter a product description with at least two characters."); return; }
    if (!purchaseCountry) { setError("Select the country where the item was bought."); document.getElementById("valuation-purchase-country")?.focus(); return; }
    if (!Number.isFinite(Number(declaredPrice)) || Number(declaredPrice) <= 0) { setError("Enter the customer’s original price before searching."); document.getElementById("customer-price-input")?.focus(); return; }
    if (!receiptFile) { setError("Attach the customer’s receipt before searching."); document.getElementById("customer-receipt-input")?.focus(); return; }
    const serial = ++searchSerial.current;
    const hsSerial = ++hsLookupSerial.current;
    setBusy(true); setError(""); setRecordNotice(""); setInternational(null); setHistorical(null);
    setCustomsBenchmark(null); setCountryOriginFob(null); setBenchmarkConversion(null); setBenchmarkError(""); setCountryOriginFobError(""); setSearchedTerm(term);
    setHsCode(null); setHsInput(""); setHsCandidates([]); setHsMessage("");
    setSelected("internationalMedian"); setCustomValue(""); setJustification("");
    // Start a fresh client-side session for this search. Later asynchronous
    // evidence responses merge into this record, so a late response cannot
    // overwrite a decision that was already submitted from Phase 1.
    writeValuationSession({
      id: `valuation-${Date.now()}`,
      query: term,
      market,
      purchaseCountryCode: purchaseCountry,
      purchaseCountryName: countryOptions.find(country => country.code === purchaseCountry)?.name ?? purchaseCountry,
      international: null,
      customsBenchmark: null,
      countryOriginFob: null,
      historical: null,
      hsCodeId: null,
      hsCode: "",
      customerTransaction: null,
      createdAt: new Date().toISOString(),
    });
    const token = getSessionAccessToken();
    if (!token) { window.location.assign("/login?next=%2Fdashboard"); return; }
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
    let redirectingForExpiredSession = false;
    const request = async <T,>(url: string) => {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401) {
        setSessionAccessToken(null);
        if (!redirectingForExpiredSession) {
          redirectingForExpiredSession = true;
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        }
        throw new Error("Your session expired. Please sign in again.");
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? body.message ?? "Evidence source could not be searched.");
      return body as T;
    };
    let internationalValue: InternationalPriceSearch | null = null;
    const persist = () => {
      const current = readValuationSession();
      writeValuationSession({
        ...(current ?? {}),
        id: current?.id ?? `valuation-${Date.now()}`,
        query: term,
        market,
        purchaseCountryCode: purchaseCountry,
        purchaseCountryName: countryOptions.find(country => country.code === purchaseCountry)?.name ?? purchaseCountry,
        international: internationalValue ?? current?.international ?? null,
        historical: historicalValue ?? current?.historical ?? null,
        createdAt: current?.createdAt ?? new Date().toISOString(),
      });
    };
    let historicalValue: HistoricalSessionEvidence | null = null;
    if (importDeclaration?.confirmedHsCodeId) void getPhase2HsCode(importDeclaration.confirmedHsCodeId)
      .then(item => { setHsCode(item); setHsInput(displayHsCode(item)); setHsBusy(false); })
      .catch(() => void lookupHs(term, hsSerial, true));
    else void lookupHs(term, hsSerial, true);
    void request<InternationalPriceSearch>(`${base}/api/international-prices/search?${new URLSearchParams({ q: term, market })}`)
      .then(result => { internationalValue = result; setInternational(result); persist(); if (result.statistics) setSelected("internationalMedian"); })
      .catch(reason => { if (redirectingForExpiredSession) return; setError(current => current || (reason instanceof Error ? `International prices could not load: ${reason.message}` : "International evidence is unavailable.")); })
      .finally(() => setBusy(false));
    void request<HistoricalSessionEvidence>(`${base}/api/historical-markets/summary?${new URLSearchParams({ q: term })}`)
      .then(result => { historicalValue = result; setHistorical(result); persist(); })
      .catch(() => { historicalValue = null; setHistorical(null); });
  }

  const declaredAmount = Number(declaredPrice);
  const hasDeclaredAmount = Number.isFinite(declaredAmount) && declaredAmount > 0;
  const hasRequiredCustomerEvidence = hasDeclaredAmount && Boolean(receiptFile);
  const canSearch = query.trim().length >= 2 && Boolean(purchaseCountry) && hasRequiredCustomerEvidence && !busy;
  const declaredPreferredValue = declaredConversion?.to === currency ? declaredConversion.convertedAmount : null;
  const historicalInternationalValue = historical?.summary?.currentInternationalPrice ?? null;
  const benchmarkCodeDigits = (hsCode?.code ?? "").replace(/\D/g, "");
  const benchmarkHsCode = (benchmarkCodeDigits.length >= 6 ? benchmarkCodeDigits : (hsCode?.tariffItemNo ?? "").replace(/\D/g, "")).slice(0, 6);
  const tariffUnit = hsCode?.unit?.trim().toLowerCase() ?? "";
  // When tariff unit metadata is absent, keep the existing item-price workspace
  // preference. Only actual reported item counts qualify; weights stay references.
  const benchmarkPreferredUnit = ["kg", "kilogram", "kilograms"].includes(tariffUnit) ? "kg" : !tariffUnit || ["u", "unit", "units", "item", "items", "pcs", "piece", "pieces"].includes(tariffUnit) ? "u" : "";
  const benchmarkIsPerItem = customsBenchmark?.unit === "u" && benchmarkPreferredUnit === "u";
  const benchmarkPreferredValue = benchmarkIsPerItem && customsBenchmark
    ? currency === "USD" ? customsBenchmark.unitValue : benchmarkConversion?.to === currency ? benchmarkConversion.convertedAmount : null
    : null;
  const selectedValue = selected === "internationalMedian" ? international?.statistics?.median
    : selected === "internationalMean" ? international?.statistics?.mean
      : selected === "customsBenchmark" ? benchmarkPreferredValue
      : selected === "declaredPrice" ? declaredConversion?.convertedAmount
        : Number(customValue);
  const selectedCurrency = currency;
  const hasResults = Boolean(searchedTerm || international || historical || customsBenchmark);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    setBenchmarkConversion(null);
    setBenchmarkConversionError("");
    const token = getSessionAccessToken();
    if (customsBenchmark?.unitValue == null || customsBenchmark.unit !== "u") return;
    if (currency === "USD") {
      setBenchmarkConversion({ convertedAmount: customsBenchmark.unitValue, to: currency, rate: 1, source: "Same currency" });
      return;
    }
    if (!token) { setBenchmarkConversionError("Sign in again to convert this benchmark."); return; }
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
    void (async () => {
      const params = new URLSearchParams({ amount: String(customsBenchmark.unitValue), from: "USD", to: currency });
      const response = await fetch(`${base}/api/exchange-rates/convert?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.detail ?? result.message ?? result.title ?? "Currency conversion is unavailable. The USD benchmark is still shown.");
      if (!Number.isFinite(result.convertedAmount) || result.to !== currency) throw new Error("The currency service returned an invalid conversion.");
      if (!cancelled) setBenchmarkConversion(result);
    })().catch(reason => { if (!cancelled) setBenchmarkConversionError(reason instanceof Error ? reason.message : "Currency conversion is unavailable. The USD benchmark is still shown."); });
    return () => { cancelled = true; abort.abort(); };
  }, [customsBenchmark, currency, benchmarkConversionRetry]);

  useEffect(() => {
    if (!searchedTerm || benchmarkHsCode.length < 6) {
      setBenchmarkBusy(false);
      setBenchmarkError(searchedTerm && hsCode ? "Choose a complete six-digit HS category or tariff line before loading a benchmark." : "");
      return;
    }
    let cancelled = false;
    const abort = new AbortController();
    const token = getSessionAccessToken();
    if (!token) { setBenchmarkBusy(false); setBenchmarkError("Sign in again to load the customs trade benchmark."); return; }
    setBenchmarkBusy(true); setBenchmarkError(""); setCustomsBenchmark(null);
    updateValuationSession({ customsBenchmark: null, selectedValue: null });
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
    const params = new URLSearchParams({ hsCode: benchmarkHsCode });
    if (benchmarkPreferredUnit) params.set("unit", benchmarkPreferredUnit);
    void fetch(`${base}/api/customs-trade-benchmark/search?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.detail ?? body.message ?? body.title ?? (response.status === 401
          ? "Your session has expired. Sign in again to load the customs trade benchmark."
          : response.status === 403 ? "This benchmark requires a customs officer account."
            : response.status === 404 ? "The running API does not expose the trade benchmark. Restart it with the latest build."
              : `Customs trade benchmark could not be loaded (HTTP ${response.status}).`));
        if (typeof body.hsCode !== "string" || typeof body.message !== "string") throw new Error("The API returned an invalid trade benchmark response.");
        const result = body as CustomsTradeBenchmark;
        return result;
      })
      .then(result => { if (!cancelled) { setCustomsBenchmark(result); updateValuationSession({ customsBenchmark: result }); } })
      .catch(reason => { if (!cancelled) setBenchmarkError(reason instanceof TypeError ? "The customs API could not be reached. Check that it is running, then retry." : reason instanceof Error ? reason.message : "Customs trade benchmark could not be loaded."); })
      .finally(() => { if (!cancelled) setBenchmarkBusy(false); });
    return () => { cancelled = true; abort.abort(); };
  }, [hsCode, benchmarkHsCode, benchmarkPreferredUnit, searchedTerm, benchmarkRetry]);

  useEffect(() => {
    if (!searchedTerm || benchmarkHsCode.length < 6 || !purchaseCountry) {
      setCountryOriginFobBusy(false);
      return;
    }
    let cancelled = false;
    const abort = new AbortController();
    const token = getSessionAccessToken();
    if (!token) { setCountryOriginFobBusy(false); setCountryOriginFobError("Sign in again to load the country-of-origin FOB value."); return; }
    setCountryOriginFobBusy(true); setCountryOriginFobError(""); setCountryOriginFob(null);
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
    const params = new URLSearchParams({ hsCode: benchmarkHsCode, countryCode: purchaseCountry });
    if (benchmarkPreferredUnit) params.set("unit", benchmarkPreferredUnit);
    void fetch(`${base}/api/customs-trade-benchmark/origin-fob?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.detail ?? body.message ?? body.title ?? `Country-of-origin FOB lookup failed (HTTP ${response.status}).`);
        if (typeof body.hsCode !== "string" || typeof body.message !== "string") throw new Error("The API returned an invalid country-of-origin FOB response.");
        const result = body as CustomsTradeBenchmark;
        return result;
      })
      .then(result => { if (!cancelled) { setCountryOriginFob(result); updateValuationSession({ countryOriginFob: result }); } })
      .catch(reason => { if (!cancelled && reason?.name !== "AbortError") setCountryOriginFobError(reason instanceof Error ? reason.message : "Country-of-origin FOB data could not be loaded."); })
      .finally(() => { if (!cancelled) setCountryOriginFobBusy(false); });
    return () => { cancelled = true; abort.abort(); };
  }, [hsCode, benchmarkHsCode, benchmarkPreferredUnit, purchaseCountry, searchedTerm, countryOriginFobRetry]);

  useEffect(() => {
    const amount = Number(declaredPrice);
    if (!Number.isFinite(amount) || amount <= 0) { setDeclaredConversion(null); return; }
    setDeclaredConversion(null);
    const timer = window.setTimeout(() => {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
      const token = getSessionAccessToken();
      void fetch(`${base}/api/exchange-rates/convert?${new URLSearchParams({ amount: String(amount), from: declaredCurrency, to: currency })}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
        .then(setDeclaredConversion).catch(() => setDeclaredConversion(null));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [declaredPrice, declaredCurrency, currency]);

  useEffect(() => {
    updateValuationSession({
      preferredCurrency: currency,
      purchaseCountryCode: purchaseCountry,
      purchaseCountryName: countryOptions.find(country => country.code === purchaseCountry)?.name ?? purchaseCountry,
      selectedSource: selected,
      customerTransaction: {
        amount: Number.isFinite(Number(declaredPrice)) && Number(declaredPrice) > 0 ? Number(declaredPrice) : null,
        currency: declaredCurrency,
        convertedAmount: declaredConversion?.to === currency ? declaredConversion.convertedAmount : null,
        convertedCurrency: currency,
        exchangeRate: declaredConversion?.to === currency ? declaredConversion.rate : null,
        exchangeRateSource: declaredConversion?.to === currency ? declaredConversion.source : null,
        exchangeRateDate: declaredConversion?.to === currency ? declaredConversion.date ?? null : null,
        receiptFileName: receiptFile?.name ?? null,
        receiptContentType: receiptFile?.type || null,
        receiptFileSize: receiptFile?.size ?? null,
      },
    });
  }, [currency, selected, purchaseCountry, countryOptions, declaredPrice, declaredCurrency, declaredConversion, receiptFile]);

  async function recordDecision() {
    const parsedSelectedValue = Number(selectedValue);

    if (justificationIssue) { setError(justificationIssue); return; }
    if (!Number.isFinite(parsedSelectedValue) || parsedSelectedValue <= 0) { setError("Select a valid customs value before submitting the valuation."); return; }
    if (!Number.isFinite(Number(declaredPrice)) || Number(declaredPrice) <= 0) { setError("Enter the original price paid by the customer."); return; }
    if (!purchaseCountry) { setError("Select the country where the item was bought."); return; }
    if (!declaredConversion || declaredConversion.to !== currency) { setError(`The customer's original price has not been converted to ${currency} yet.`); return; }
    if (!receiptFile) { setError("Attach the customer's PDF, JPG, or PNG receipt before continuing."); return; }
    setRecording(true); setError(""); setRecordNotice("");
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
       const now = Date.now();
       const assignedLocationId = profile.locations.find(location =>
         location.id === profile.user.primaryLocationId &&
         location.locationType === "BRANCH" &&
         location.status === "ACTIVE" &&
         new Date(location.effectiveFrom).getTime() <= now &&
         (!location.effectiveTo || new Date(location.effectiveTo).getTime() > now) &&
         (location.supportsValuation || location.supportsInspection)
       )?.id ?? null;
       if (!assignedLocationId) throw new Error("Your assigned office is not enabled for valuation or inspection. Ask your Customs Administrator to assign an active valuation office.");

       const purchaseCountryName = countryOptions.find(country => country.code === purchaseCountry)?.name ?? purchaseCountry;
       const productPhotoUrl = international?.items.find(item => item.thumbnailUrl)?.thumbnailUrl ?? null;
       const valuationMethod = ({ internationalMedian: "International market median", internationalMean: "International market mean", customsBenchmark: "Customs trade benchmark", declaredPrice: "Transaction value", custom: "Officer-selected customs value" } as Record<EvidenceSource, string>)[selected];
       const evidenceSnapshot = {
          product: query.trim(), hsCode: hsCode ? displayHsCode(hsCode) : null, searchQuery: query.trim(), selectedCustomsValue: parsedSelectedValue,
          importerDeclaration: importDeclaration ? { id: importDeclaration.id, reference: importDeclaration.reference, purpose: importDeclaration.importPurpose, requestedTreatments: importDeclaration.requestedTreatments } : null,
          selectedCurrency, supportingSource: selected, valuationMethod, purchaseCountryCode: purchaseCountry, purchaseCountryName, productPhoto: productPhotoUrl, officer: { id: profile.user.id, name: profile.user.fullName },
         decidedAt: new Date().toISOString(), internationalEvidence: international?.items ?? [],
         customsTradeBenchmark: customsBenchmark,
         statistics: { international: international?.statistics ?? null },
         priceBasis: {
           preferredCurrency: currency,
           internationalMedian: international?.statistics?.median ?? null,
           internationalCurrency: currency,
           customsTradeBenchmark: customsBenchmark ? {
             ...customsBenchmark,
             convertedUnitValue: benchmarkPreferredValue,
             convertedCurrency: currency,
             exchangeRate: benchmarkConversion?.rate ?? null,
             exchangeRateSource: benchmarkConversion?.source ?? null,
           } : null,
           historical: historical ? { summary: historical.summary ?? null, rows: historical.rows, currency: historical.currency, asOf: historical.asOf ?? null } : null,
           customerDeclared: {
             originalAmount: Number(declaredPrice), originalCurrency: declaredCurrency,
           convertedAmount: declaredConversion?.convertedAmount ?? null, convertedCurrency: currency,
             exchangeRate: declaredConversion?.rate ?? null, exchangeRateSource: declaredConversion?.source ?? null,
             receiptFileName: receiptFile?.name ?? null, receiptContentType: receiptFile?.type ?? null, receiptFileSize: receiptFile?.size ?? null,
           },
         },
         outliers: { international: international?.statistics?.potentialOutliers ?? [] },
         tariff: { hsCodeId: hsCode?.id ?? null, hsCode: hsCode?.code ?? null, rate: hsCode?.duty ?? null, amount: null, source: hsCode ? "Matched against the active Ethiopian tariff; duty and tax assessment remains in Phase 2." : "HS classification will be reviewed in Phase 2." },
       };

       const form = new FormData();
       if (importDeclaration) form.append("importerDeclarationId", importDeclaration.id);
       if (hsCode) form.append("hsCodeId", hsCode.id);
       form.append("locationId", assignedLocationId); form.append("selectedReferenceValue", String(parsedSelectedValue));
       form.append("currency", selectedCurrency); form.append("decision", `Customs value selected for ${query.trim()}`);
       form.append("justification", justification.trim()); form.append("evidence", JSON.stringify(evidenceSnapshot));
       form.append("productName", query.trim()); form.append("purchaseCountryCode", purchaseCountry);
       form.append("selectedPriceSource", selected); form.append("valuationMethod", valuationMethod);
       if (productPhotoUrl) form.append("productPhotoUrl", productPhotoUrl);
       form.append("declaredPriceAmount", declaredPrice); form.append("declaredPriceCurrency", declaredCurrency); form.append("receipt", receiptFile);
       const token = getSessionAccessToken();
       const response = await fetch(`${base}/api/workspace/decisions/with-receipt`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
       const payload = await response.json().catch(() => ({}));
       if (!response.ok) throw new Error(payload.message ?? "The valuation and receipt could not be saved.");
       const created = payload as { id: string; version: string };
       const submitted = await workspaceApi<{ status: string }>(`/decisions/${created.id}/submit`, { method: "POST", body: JSON.stringify({ version: created.version, justification: justification.trim() }) });
       updateValuationSession({ hsCodeId: hsCode?.id ?? null, hsCode: hsCode ? displayHsCode(hsCode) : "", selectedValue: parsedSelectedValue, selectedCurrency, selectedSource: selected, decisionId: created.id, phase1Submitted: submitted.status === "Submitted" });
       setRecordNotice("Price Review submitted. Continuing to Final Assessment…");
       onSubmitted();
    } catch (exception) { setError(exception instanceof Error ? exception.message : "The valuation decision could not be saved."); }
    finally { setRecording(false); }
  }
  const internationalOutliers = international?.statistics?.potentialOutliers.length ?? 0;
  const clearAll = () => { searchSerial.current++; hsLookupSerial.current++; clearValuationSession(); setQuery(""); setPurchaseCountry(""); setSearchedTerm(""); setInternational(null); setHistorical(null); setCustomsBenchmark(null); setCountryOriginFob(null); setBenchmarkConversion(null); setBenchmarkError(""); setCountryOriginFobError(""); setHsCode(null); setHsInput(""); setHsCandidates([]); setHsMessage(""); setHsBusy(false); setDeclaredPrice(""); setReceiptFile(null); setDeclaredConversion(null); setSelected("internationalMedian"); setCustomValue(""); setJustification(""); setError(""); setRecordNotice(""); };
  const handleRecentClick = (term: string) => { setQuery(term); const fakeEvent = { preventDefault: () => {} } as FormEvent<HTMLFormElement>; setTimeout(() => { const form = document.getElementById("valuation-search-form") as HTMLFormElement | null; if (form) form.requestSubmit(); }, 0); };
  const handleRemoveRecent = (term: string) => { removeRecentSearch(term); setRecentSearches(readRecentSearches()); };
  return <section className="overview-evidence-workspace">
    {/* ── Breadcrumb + Page Heading ── */}
    <nav className="valuation-breadcrumb" aria-label="Breadcrumb"><span>Home</span><FiChevronRight aria-hidden="true" /><strong>Valuation</strong></nav>
    <div className="valuation-page-heading"><h1>Search a product to begin valuation</h1><p>Find a product, add the required transaction evidence and get a valuation estimate.</p></div>

    <p role="status">{recording ? "Saving price review…" : "Not submitted — current edits and receipt selection are unsaved"}</p>
    {/* ── Unified Search Card ── */}
    <div className="valuation-search-card">
      <form id="valuation-search-form" className="valuation-search-row" onSubmit={search} noValidate>
        <div className="valuation-search-product">
          <label className="valuation-field-label" htmlFor="valuation-product-query">Product to search</label>
          <div className="valuation-search-input-wrap">
            <FiSearch aria-hidden="true" />
          <input id="valuation-product-query" aria-label="Product description" placeholder="Search by brand and product, model, or HS code" value={query} onChange={event => { setQuery(event.currentTarget.value); setSearchedTerm(""); setInternational(null); setHistorical(null); setCustomsBenchmark(null); setCountryOriginFob(null); setBenchmarkConversion(null); setCountryOriginFobError(""); setHsCode(null); setHsInput(""); setHsCandidates([]); setHsMessage(""); hsLookupSerial.current++; setError(""); }} required />
          </div>
        </div>
        <div className="valuation-market-select">
          <label className="valuation-field-label" htmlFor="valuation-market">International market</label>
          <div className="valuation-market-control">
            <FiGlobe aria-hidden="true" />
            <select id="valuation-market" aria-label="International market" value={market} onChange={event => setMarket(event.currentTarget.value)}>
              <option value="us">US - USD</option><option value="gb">UK - GBP</option><option value="de">DE - EUR</option><option value="ae">UAE - AED</option><option value="za">ZA - ZAR</option>
            </select>
          </div>
        </div>
        <div className="valuation-country-select">
          <label className="valuation-field-label" htmlFor="valuation-purchase-country">Country where bought</label>
          <Select
            id="valuation-purchase-country"
            title="Saved with the Phase One search and valuation audit record."
            placeholder="Select country"
            searchable
            clearable
            limit={20}
            nothingFoundMessage="No country found"
            data={countryOptions.map(country => ({ value: country.code, label: country.name }))}
            value={purchaseCountry || null}
            onChange={value => { setPurchaseCountry(value ?? ""); setError(""); }}
            leftSection={purchaseCountry ? <span className={`flag:${purchaseCountry}`} aria-hidden="true" /> : <FiGlobe aria-hidden="true" />}
            renderOption={({ option }) => <span className="valuation-country-option"><span className={`flag:${option.value}`} aria-hidden="true" />{option.label}</span>}
            classNames={{ input: "valuation-country-input" }}
            required
          />
        </div>
        <div className="valuation-price-group">
          <label className="valuation-price-label" htmlFor="customer-price-input">Price paid by customer</label>
          <div className="valuation-price-input-wrap">
            <span className="valuation-price-icon"><FiFileText aria-hidden="true" /></span>
            <input id="customer-price-input" type="number" min="0.01" step="0.01" placeholder="e.g. 250.00" value={declaredPrice} aria-required="true" onChange={event => { setDeclaredPrice(event.currentTarget.value); setError(""); }} />
            <select aria-label="Invoice currency" value={declaredCurrency} onChange={event => setDeclaredCurrency(event.currentTarget.value)}>{["USD","EUR","GBP","AED","ZAR","ETB"].map(code => <option key={code}>{code}</option>)}</select>
          </div>
        </div>
        <button className="valuation-search-btn" type="submit" aria-describedby="valuation-search-requirement" aria-busy={busy || undefined} disabled={!canSearch}><FiSearch />{busy ? "Searching…" : "Search"}</button>
        <button className="valuation-clear-btn" type="button" onClick={clearAll}><FiX />Clear</button>
      </form>

      <div className="valuation-hs-lookup">
        <div><label htmlFor="valuation-hs-code">HS code</label><small>{hsCode ? "Matched to the active Ethiopian tariff. You can change it." : hsBusy ? "Matching the product to the tariff…" : "Search the product first, or enter an HS code manually."}</small></div>
        <div className="valuation-hs-control"><input id="valuation-hs-code" value={hsInput} onChange={event => editHs(event.currentTarget.value)} placeholder="Search or enter HS code" autoComplete="off" aria-autocomplete="list" aria-expanded={hsCandidates.length > 0} />{hsCode && <span className="valuation-hs-confirmed"><FiCheckCircle /> Matched</span>}</div>
        {hsCode && <p className="valuation-hs-description">{hsCode.descriptionEn}{hsCode.duty ? ` · Duty ${hsCode.duty}` : ""}</p>}
        {hsMessage && <p className="valuation-hs-message" role="status">{hsMessage}</p>}
        {hsCandidates.length > 0 && !hsCode && <div className="valuation-hs-candidates" role="listbox" aria-label="Matching HS codes">{hsCandidates.map(item => <button type="button" role="option" aria-selected={false} key={item.id} onClick={() => chooseHs(item)}><strong>{displayHsCode(item)}</strong><span>{item.descriptionEn}</span></button>)}</div>}
      </div>

      {/* ── Upload Area ── */}
      <div className="valuation-upload-row">
        <div className="valuation-upload-icon"><FiUploadCloud /></div>
        <div className="valuation-upload-info">
          <strong>Upload customer transaction evidence</strong>
          <small>PDF, JPG or PNG • Max 8 MB</small>
          <span id="valuation-search-requirement" className={`valuation-upload-hint${hasRequiredCustomerEvidence ? " is-ready" : ""}`} role="status"><FiFileText />{busy ? "Searching with the required transaction evidence…" : hasRequiredCustomerEvidence ? "Price and receipt attached — ready to search." : !hasDeclaredAmount ? "Enter the amount paid and attach the receipt before searching." : "Attach the receipt before searching."}</span>
        </div>
        <label className="valuation-upload-btn">
          <FiFileText />{receiptFile ? receiptFile.name : "Choose file"}
          <input id="customer-receipt-input" type="file" accept="application/pdf,image/jpeg,image/png" aria-label="Customer transaction receipt" aria-required="true" onChange={event => { setReceiptFile(event.currentTarget.files?.[0] ?? null); setError(""); }} />
        </label>
      </div>
    </div>

    {/* ── Recent Searches ── */}
    {recentSearches.length > 0 && <div className="valuation-recent-section">
      <div className="valuation-recent-heading"><FiClock /><strong>Recent searches</strong><button type="button" className="valuation-recent-viewall" onClick={() => {}}>View all <FiArrowRight /></button></div>
      <div className="valuation-recent-chips">
        {recentSearches.slice(0, 5).map(term => <span className="valuation-recent-chip" key={term}><button type="button" className="valuation-recent-chip-text" disabled={!hasRequiredCustomerEvidence} onClick={() => handleRecentClick(term)}><FiSearch />{term}</button><button type="button" className="valuation-recent-chip-remove" aria-label={`Remove ${term}`} onClick={() => handleRemoveRecent(term)}><FiX /></button></span>)}
      </div>
    </div>}

    {hasResults && <div className="officer-search-links"><Link href={`/international-prices?q=${encodeURIComponent(query.trim())}&market=${market}`}><FiGlobe />Global market details</Link><Link href="/historical-customs-prices"><FiArchive />Customs history</Link><Link href="/outlier-analysis"><FiBarChart2 />Price analysis</Link></div>}
    <FeedbackToast error={error} success={recordNotice} onDismissError={() => setError("")} onDismissSuccess={() => setRecordNotice("")} />
    <BenchmarkFetchChecks hsCode={benchmarkHsCode} preferredUnit={benchmarkPreferredUnit} />
    {hasResults && (
      <>
        <div className="valuation-stat-grid valuation-results-overview">
            <StatisticCard title="Global market statistics" icon={<FiGlobe />} stats={international?.statistics ?? null} currency={currency} href={`/international-prices?q=${encodeURIComponent(query.trim())}&market=${market}`} />
            <CountryOriginFobCard value={countryOriginFob} countryName={countryOptions.find(country => country.code === purchaseCountry)?.name ?? purchaseCountry} busy={countryOriginFobBusy} error={countryOriginFobError} onRetry={() => setCountryOriginFobRetry(value => value + 1)} />
            <section className="paid-price-card paid-price-card--inline valuation-stat-card customer-price-card" aria-label="Required customer transaction evidence">
              <div className="valuation-card-title customer-price-card-title"><span><FiUser /></span><strong>Customer-paid price</strong><em>{hasDeclaredAmount ? "n = 1" : "Required"}</em></div>
              <div className="customer-price-readout" aria-live="polite">
                <div className="customer-price-readout-copy">
                  <div className="customer-price-readout-row"><span>Price paid</span><strong>{hasDeclaredAmount ? money(declaredAmount, declaredCurrency) : "—"}</strong></div>
                  <div className="customer-price-readout-row customer-price-readout-row--converted"><span>Converted to {currency}</span><strong>{declaredPreferredValue == null ? hasDeclaredAmount ? "Converting…" : "—" : money(declaredPreferredValue, currency)}</strong></div>
                </div>
                <a className={`customer-price-receipt-icon${receiptPreviewUrl ? "" : " is-unavailable"}`} href={receiptPreviewUrl ?? undefined} target="_blank" rel="noreferrer" aria-label={receiptPreviewUrl ? "View customer receipt" : "Receipt unavailable in this session"} title={receiptFile?.name ?? "Receipt unavailable in this session"} aria-disabled={!receiptPreviewUrl} tabIndex={receiptPreviewUrl ? 0 : -1} onClick={event => { if (!receiptPreviewUrl) event.preventDefault(); }}><FiFileText aria-hidden="true" /></a>
              </div>
            </section>
            <section className="valuation-stat-card manufacturer-price-card" aria-label="Customs trade benchmark">
              <div className="valuation-card-title"><span><FiArchive /></span><strong>Customs trade benchmark</strong><em>{tradePeriod(customsBenchmark?.period)}</em></div>
              {benchmarkBusy ? <p role="status" className="manufacturer-price-note">Checking Ethiopia imports and supplier export reports…</p>
                : benchmarkError ? <><p role="alert" className="manufacturer-price-error">{benchmarkError}</p><button type="button" className="manufacturer-source-link" onClick={() => setBenchmarkRetry(value => value + 1)}>Retry benchmark</button></>
                : customsBenchmark?.unitValue != null ? <>
                  <span className="valuation-label">{customsBenchmark.sourceLabel ?? "Ethiopia imports"} · {customsBenchmark.partner || "World"} · HS {customsBenchmark.hsCode} · {tradePeriod(customsBenchmark.period)}{customsBenchmark.valuationBasis ? ` · ${customsBenchmark.valuationBasis}` : ""}</span>
                  <b>{money(customsBenchmark.unitValue, "USD")} / {customsBenchmark.unit === "u" ? "item" : customsBenchmark.unit}</b>
                  <p className="manufacturer-price-note">Reporter {customsBenchmark.reporter} · Last checked {tradeCheckedAt(customsBenchmark.lastCheckedAtUtc)} · reported quantity {customsBenchmark.quantity?.toLocaleString() ?? "not recorded"} {customsBenchmark.unit || ""}</p>
                  <p className="manufacturer-price-note">Latest available trade reference. {benchmarkIsPerItem ? benchmarkPreferredValue == null ? benchmarkConversionError || "Converting to the selected currency…" : `≈ ${money(benchmarkPreferredValue, currency)} per item` : `Benchmark loaded per ${customsBenchmark.unit === "u" ? "item" : customsBenchmark.unit}. Reference only: the invoice quantity and tariff units must be comparable before this can be used as a valuation amount.`}</p>
                  {benchmarkConversionError && <button type="button" className="manufacturer-source-link" onClick={() => setBenchmarkConversionRetry(value => value + 1)}>Retry conversion</button>}
                  <p className="manufacturer-price-note">{customsBenchmark.message}</p>
                  {customsBenchmark.sourceUrl && <a className="manufacturer-source-link" href={customsBenchmark.sourceUrl} target="_blank" rel="noopener noreferrer">UN Comtrade source <FiArrowRight /></a>}
                </> : <><p className="manufacturer-price-note">{customsBenchmark?.message ?? (hsCandidates.length > 1 && !hsCode ? "Choose the correct HS tariff line above to fetch this benchmark; the product matches multiple categories." : hsCode ? "Waiting for trade statistics." : "Select an HS code to look up Ethiopia trade statistics.")}</p>{customsBenchmark && <button type="button" className="manufacturer-source-link" onClick={() => setBenchmarkRetry(value => value + 1)}>Retry benchmark</button>}</>}
            </section>
        </div>
        <div className="valuation-workspace-grid">
        <div className="valuation-evidence-area">
          <EvidenceTrend international={international?.statistics ?? null} customerPrice={declaredPreferredValue} currency={currency} />
          <HistoricalPriceCard historical={historical} internationalPrice={historicalInternationalValue} currency="ETB" />
          <section className="valuation-insight-grid">
            <Link href="/outlier-analysis"><strong>Price analysis</strong><span>{internationalOutliers} suspected outlier{internationalOutliers === 1 ? "" : "s"}</span><small>International market · View reasons <FiArrowRight /></small></Link>
            <Link href="/historical-customs-prices"><strong>Customs history</strong><span>Saved history review</span><small>Open the historical comparison <FiArrowRight /></small></Link>
            <Link href={`/international-prices?q=${encodeURIComponent(query.trim())}&market=${market}`}><strong>Global market</strong><span>{international?.items.length ?? 0} offers</span><small>View exact offers <FiArrowRight /></small></Link>
          </section>
        </div>
        <aside className="valuation-decision-panel">
          <div className="valuation-decision-title"><FiCheckCircle /><div><h3>Selected customs value</h3><p>Choose market evidence, an HS-category customs trade benchmark, or the customer’s converted invoice price. Your selection is passed to Final Assessment.</p></div></div>
          <div className="reference-options">
            <label className={selected === "internationalMedian" ? "is-selected" : ""}><input type="radio" disabled={international?.statistics?.median == null} checked={selected === "internationalMedian"} onChange={() => setSelected("internationalMedian")} /><span><strong>International market median</strong><small>{international?.statistics?.observationCount ?? 0} observations · {currency}</small></span><b>{money(international?.statistics?.median, currency)}</b></label>
            <label className={selected === "internationalMean" ? "is-selected" : ""}><input type="radio" disabled={international?.statistics?.mean == null} checked={selected === "internationalMean"} onChange={() => setSelected("internationalMean")} /><span><strong>International market mean</strong><small>{international?.statistics?.observationCount ?? 0} observations · {currency}</small></span><b>{money(international?.statistics?.mean, currency)}</b></label>
            {customsBenchmark?.unitValue != null && <label className={selected === "customsBenchmark" ? "is-selected" : ""}><input type="radio" disabled={benchmarkPreferredValue == null} title={!benchmarkIsPerItem ? `Reference only: reported per ${customsBenchmark.unit}; invoice quantity and units must be comparable.` : undefined} checked={selected === "customsBenchmark"} onChange={() => setSelected("customsBenchmark")} /><span><strong>Customs trade benchmark</strong><small>HS {customsBenchmark.hsCode} · {tradePeriod(customsBenchmark.period)} · {customsBenchmark.unit === "u" ? "per item" : `per ${customsBenchmark.unit}`} {!benchmarkIsPerItem && "(reference only)"} · {customsBenchmark.isMirror ? "export mirror" : "import"}{customsBenchmark.valuationBasis ? ` (${customsBenchmark.valuationBasis})` : ""} · category average</small></span><b>{benchmarkIsPerItem ? money(benchmarkPreferredValue, currency) : `${money(customsBenchmark.unitValue, "USD")} / ${customsBenchmark.unit === "u" ? "item" : customsBenchmark.unit}`}</b></label>}
            <label className={selected === "declaredPrice" ? "is-selected" : ""}><input type="radio" disabled={declaredConversion?.to !== currency || Number(declaredPrice) <= 0} checked={selected === "declaredPrice"} onChange={() => setSelected("declaredPrice")} /><span><strong>Customer’s original price paid</strong><small>{declaredPrice ? `Invoice ${declaredCurrency} ${Number(declaredPrice).toLocaleString()} · ${receiptFile ? "receipt attached" : "receipt required"}` : "Enter the invoice amount and attach its receipt above"}</small></span><b>{declaredConversion?.to === currency ? money(declaredConversion.convertedAmount, currency) : "—"}</b></label>
            <label className={selected === "custom" ? "is-selected" : ""}><input type="radio" checked={selected === "custom"} onChange={() => setSelected("custom")} /><span><strong>Enter a different customs value</strong><small>Use an officer-selected amount · {currency}</small></span></label>
            {selected === "custom" && <div className="custom-reference-field"><label htmlFor="custom-reference-input">Customs value <span>({currency})</span></label><input id="custom-reference-input" className="custom-reference-input" type="number" min="0.01" step="0.01" placeholder={"Enter amount in " + currency} value={customValue} onChange={event => setCustomValue(event.currentTarget.value)} /><small>Enter the amount the officer wants to carry into Final Assessment.</small></div>}
          </div>
          <div className="overview-decision-fields"><label>Officer note (optional)<textarea maxLength={500} aria-invalid={Boolean(justificationIssue)} value={justification} onChange={event => setJustification(event.currentTarget.value)} placeholder="Add an optional note about this customs value…" rows={3} />{justificationIssue && <small className="field-validation-error" role="alert">{justificationIssue}</small>}</label></div>
          <div className="selected-reference"><span>Selected customs value</span><b>{money(selectedValue, selectedCurrency)}</b></div>
          <button className="valuation-record-link" type="button" disabled={recording || hsBusy || Boolean(justificationIssue) || !Number.isFinite(Number(selectedValue)) || Number(selectedValue) <= 0 || !declaredPrice || !receiptFile || declaredConversion?.to !== currency} onClick={() => void recordDecision()}><FiFileText />{recording ? "Submitting valuation…" : "Continue to next phase"}</button>
          {(!declaredPrice || !receiptFile || declaredConversion?.to !== currency) && <small className="decision-disclaimer">Enter the original paid price, complete its currency conversion, and attach the customer receipt to continue.</small>}
          <small className="decision-disclaimer">Your selected customs value and evidence will be carried into Final Assessment.</small>
        </aside>
      </div>
      </>
    )}
  </section>;
}

function SystemDashboard({ data, profile }: { data: WorkspaceDashboard; profile: WorkspaceProfile }) {
  const regions = data.locations.filter(location => location.locationType === "REGION");
  const branches = data.locations.filter(location => location.locationType === "BRANCH");
  const administrators = data.employees.filter(employee => employee.user.role === "CustomsAdministrator");
  return <>
    <DashboardHeader profile={profile} eyebrow="System administration" title="Overview" description="Manage the Customs regions, branches, and administrator accounts from one place." actions={<div className="dashboard-quick-actions"><Link href="/administration/regions"><FiMapPin />Manage regions</Link><Link href="/administration/branches"><FiMapPin />Manage branches</Link><Link href="/administration"><FiUserPlus />Manage administrators</Link></div>} />
    <KpiGrid data={data} />
    <div className="system-overview-grid system-overview-grid--simple">
      <section className="dashboard-panel system-overview-structure"><div className="dashboard-panel-heading"><div><p className="eyebrow">Location management</p><h2>Regions and branches</h2><span>Keep the official two-level Customs hierarchy accurate.</span></div><Link href="/administration/organization">Open structure <FiArrowRight /></Link></div><div className="system-location-counts"><Link href="/administration/regions"><strong>{regions.length}</strong><span>Regions</span><small>Add or update regions</small></Link><Link href="/administration/branches"><strong>{branches.length}</strong><span>Branches</span><small>Manage branch offices</small></Link></div><LocationTree locations={data.locations} /></section>
      <section className="dashboard-panel system-overview-admins"><div className="dashboard-panel-heading"><div><p className="eyebrow">Access management</p><h2>Customs Administrators</h2><span>Administrator accounts responsible for branch operations.</span></div><Link href="/administration">Open administration <FiArrowRight /></Link></div>{administrators.length ? <div className="system-admin-list">{administrators.map(employee => <Link href="/administration" key={employee.user.id}><span className="system-admin-avatar"><FiUsers /></span><span><strong>{employee.user.fullName}</strong><small>{employee.user.email}</small></span><em className={employee.user.active ? "status-active" : "status-pending"}>{employee.user.status}</em></Link>)}</div> : <DataState kind="empty" compact title="No Customs Administrators" description="Approved Customs Administrator accounts will appear here." />}</section>
    </div>
  </>;
}

function AdminDashboard({ data, profile }: { data: WorkspaceDashboard; profile: WorkspaceProfile }) {
  const root = data.locations.find(location => !location.parentLocationId) ?? data.locations[0];
  const statusCounts = ["Submitted", "Draft", "Returned", "Approved"].map(status => ({ status, count: data.decisions.filter(decision => decision.status === status).length }));
  return <>
    <DashboardHeader profile={profile} eyebrow="Branch and district management" title={root?.displayName || root?.name || "My operational location"} description="People, office assignments, valuation workload, and cases requiring attention." actions={<div className="dashboard-quick-actions"><Link href="/administration"><FiUsers />Manage Officers</Link><Link href="/valuation-decisions"><FiCheckCircle />Review valuations</Link></div>} />
    <KpiGrid data={data} />
    <div className="dashboard-main-grid">
      <section className="dashboard-panel dashboard-panel--wide"><div className="dashboard-panel-heading"><div><p className="eyebrow">My assigned organization</p><h2>Assigned offices</h2><span>Locations available for your operational responsibilities</span></div></div><LocationTree locations={data.locations} /></section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Operational monitoring</p><h2>Valuation workload</h2></div><Link href="/valuation-decisions">Review queue <FiArrowRight /></Link></div><div className="workload-list">{statusCounts.map(item => <div key={item.status}><span>{item.status}</span><div><i style={{ width: `${Math.max(4, Math.min(100, item.count * 12))}%` }} /></div><strong>{item.count}</strong></div>)}</div></section>
      <section className="dashboard-panel dashboard-panel--full"><div className="dashboard-panel-heading"><div><p className="eyebrow">Employee management</p><h2>Officers in my location</h2><span>Current office, access status, and most recent account activity</span></div><Link href="/administration">Assignments <FiArrowRight /></Link></div>{data.employees.length ? <div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Officer</th><th>Employee number</th><th>Office</th><th>Responsibilities</th><th>Status</th><th>Last activity</th></tr></thead><tbody>{data.employees.map(employee => <tr key={employee.user.id}><td><strong>{employee.user.fullName}</strong><small>{employee.user.email}</small></td><td>{employee.user.employeeNumber || "—"}</td><td>{data.locations.find(location => location.id === employee.locationId)?.displayName ?? "Unassigned"}</td><td>General valuation</td><td><span className={employee.user.active ? "status-active" : "status-pending"}>{employee.user.status}</span></td><td>{employee.user.lastLoginAt ? new Date(employee.user.lastLoginAt).toLocaleString() : "No sign-in recorded"}</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No Officers in this location" description="Create or assign an Officer to a location." />}</section>
      <section className="dashboard-panel dashboard-panel--full"><div className="dashboard-panel-heading"><div><p className="eyebrow">Requires attention</p><h2>Submitted and returned valuations</h2></div><Link href="/valuation-decisions">Open all <FiArrowRight /></Link></div><DecisionTable data={data} filter={decision => decision.status === "Submitted" || decision.status === "Returned"} /></section>
    </div>
  </>;
}

function RecordedPriceReview({ caseId }: { caseId: string }) {
  const [record, setRecord] = useState<Phase2Response | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void loadPhase2(caseId).then(value => { if (active) setRecord(value); }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [caseId]);
  if (error) return <DataState kind="error" title="Case unavailable" description={error} />;
  if (!record) return <DataState kind="loading" title="Loading recorded price review" />;
  return <section className="assessment-change-summary"><h1>Recorded price review</h1><p>Case: {caseId} · Saved</p><h2>{record.phase1.productName}</h2><p>Selected customs value: {money(record.phase1.initialDuty, record.phase1.initialDutyCurrency)}</p><p>Source: {record.phase1.source}</p><p><a href={`/audit/cases/${caseId}`}>Review the decision, reasons, and evidence in case history</a></p></section>;
}

function OfficerDashboard({ profile }: { profile: WorkspaceProfile }) {
  const [importDeclaration, setImportDeclaration] = useState<ImporterDeclaration | null>(null);
  const [importError, setImportError] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("importDeclarationId");
    if (!id) return;
    void importerApi<ImporterDeclaration>(`/importer-declarations/${encodeURIComponent(id)}`)
      .then(item => { if (item.status !== "ASSESSMENT_READY") throw new Error("The importer submission is not ready for assessment."); setImportDeclaration(item); })
      .catch(reason => setImportError(reason instanceof Error ? reason.message : "Importer submission unavailable."));
  }, []);
  const [linkedCase, setLinkedCase] = useState("");
  const [phase, setCurrentPhase] = useState<Phase>("one");
  const setPhase = (next: Phase) => {
    setCurrentPhase(next);
    const url = new URL(window.location.href);
    url.searchParams.set("phase", next);
    const session = readValuationSession();
    if (!url.searchParams.has("case") && session?.decisionId) url.searchParams.set("case", session.decisionId);
    setLinkedCase(url.searchParams.get("case") || "");
    window.history.replaceState(null, "", url);
  };
  useEffect(() => {
    const syncPhase = () => { const params = new URLSearchParams(window.location.search); setCurrentPhase(params.get("phase") === "two" ? "two" : "one"); setLinkedCase(params.get("case") || ""); };
    syncPhase(); window.addEventListener("popstate", syncPhase);
    return () => window.removeEventListener("popstate", syncPhase);
  }, []);
  const [activeSession, setActiveSession] = useState<ReturnType<typeof readValuationSession>>(null);
  useEffect(() => {
    const sync = () => setActiveSession(readValuationSession());
    sync(); window.addEventListener("storage", sync); window.addEventListener("focus", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", sync); };
  }, []);
  return <>
    {importError && <div className="importer-error" role="alert">{importError}</div>}
    {importDeclaration && <section className="importer-handoff importer-card"><strong>Importer submission {importDeclaration.reference}</strong><p>{importDeclaration.productName} · {importDeclaration.originCountryName} · {importDeclaration.quantity} {importDeclaration.unit}</p><p>Purpose: {importDeclaration.importPurpose.replaceAll("_", " ")}. Requested treatment: {importDeclaration.requestedTreatments.length ? importDeclaration.requestedTreatments.join(", ").replaceAll("_", " ") : "none"}. Officer approval remains required for any exemption.</p><Link href="/importer-review">Review submitted details and documents</Link></section>}
    {phase === "one" ? <>
      <PhaseBar phase={phase} onChange={setPhase} phase2Ready={Boolean(linkedCase || (activeSession?.phase1Submitted && activeSession.decisionId))} />
      {linkedCase ? <RecordedPriceReview key={linkedCase} caseId={linkedCase} /> : <OfficerEvidenceWorkspace profile={profile} importDeclaration={importDeclaration} onSubmitted={() => { setActiveSession(readValuationSession()); setPhase("two"); }} />}
    </> : <PhaseTwoOverview onBackToReview={() => setPhase("one")} />}
    {activeSession && <section className="dashboard-session-strip"><span><FiCheckCircle />Active valuation session</span><strong>{activeSession.query}</strong><small>Started {new Date(activeSession.createdAt).toLocaleString()} · {activeSession.phase1Submitted ? "Price Review submitted" : "Price Review in progress"}</small></section>}
  </>;
}

function DecisionTable({ data, filter = () => true }: { data: WorkspaceDashboard; filter?: (decision: WorkspaceDashboard["decisions"][number]) => boolean }) {
  const rows = data.decisions.filter(filter).slice(0, 8);
  return rows.length ? <div className="table-wrap"><table className="dashboard-table"><thead><tr><th>HS code / product</th><th>Office</th><th>Reference value</th><th>Customer paid / invoice</th><th>Status</th><th>Recorded</th></tr></thead><tbody>{rows.map(decision => <tr key={decision.id}><td><strong>{decision.hsCode || "—"}</strong><small>{decision.product}</small></td><td>{data.locations.find(location => location.id === decision.locationId)?.officialCode ?? "—"}</td><td>{decision.currency} {decision.selectedReferenceValue.toLocaleString()}</td><td>{decision.declaredPriceAmount != null ? <>{decision.declaredPriceCurrency} {decision.declaredPriceAmount.toLocaleString()}<small>→ {decision.declaredPriceConvertedCurrency} {decision.declaredPriceConvertedAmount?.toLocaleString()} · {decision.receiptFileName || "Receipt missing"}</small></> : "Legacy record"}</td><td><span className={`decision-status decision-status--${decision.status.toLowerCase()}`}>{decision.status}</span></td><td>{new Date(decision.recordedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No valuation cases" description="Cases appear here as the valuation workflow is used." />;
}

function AuditList({ data }: { data: WorkspaceDashboard }) {
  return data.audit.length ? <div className="activity-list">{data.audit.map(item => <article key={item.id}><span className="activity-icon"><FiActivity /></span><div><strong>{item.action.replaceAll("_", " ")}</strong><p>{item.justification || `${item.module} record updated`}</p><small>{item.username || "System"} · {new Date(item.occurredAt).toLocaleString()}</small></div></article>)}</div> : <DataState kind="empty" compact title="No recent activity" description="Audited actions will appear here." />;
}

export default function Dashboard() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [data, setData] = useState<WorkspaceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const current = await workspaceApi<WorkspaceProfile>("/me");
      setProfile(current);
      if (current.user.role === "CustomsOfficer") { setData(null); return; }
      const dashboard = await workspaceApi<WorkspaceDashboard>("/dashboard");
      setData(dashboard);
    }
    catch (ex) { setError(ex instanceof Error ? ex.message : "The dashboard could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <DataState kind="loading" title="Preparing your dashboard" description="Loading the system, location, and work information authorized for your account." />;
  if (!profile || (profile.user.role !== "CustomsOfficer" && !data)) return <DataState kind="error" title="Dashboard unavailable" description={error} onRetry={() => void load()} />;
  if (profile.user.role === "CustomsOfficer") return <OfficerDashboard profile={profile} />;
  if (!data) return <DataState kind="error" title="Dashboard unavailable" description={error} onRetry={() => void load()} />;
  if (data.role === "SystemAdministrator") return <SystemDashboard data={data} profile={profile} />;
  if (data.role === "CustomsAdministrator") return <AdminDashboard data={data} profile={profile} />;
  return <DataState kind="error" title="Dashboard unavailable" description="The account role is not supported for this workspace." onRetry={() => void load()} />;
}
