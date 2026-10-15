"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FiAlertTriangle, FiBarChart2, FiCheck, FiEdit3, FiExternalLink, FiFileText, FiGlobe, FiMapPin, FiRefreshCw, FiSearch, FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import { formatMoney, importerApi } from "@/lib/importer";
import type { CustomsTradeBenchmark, InternationalPriceSearch } from "@/lib/types/customs";
import { HsItem } from "@/components/hs/HsItem";

/** What the evidence is gathered for: the shipment as declared (portal) or as entered by the officer (valuation search). */
export type EvidenceInput = {
  productQuery: string; quantity: number; unit: string; hsCode: string; tariffLabel?: string;
  originCountryCode: string; originCountryName: string;
  declared: { amount: number; currency: string; freight: number; insurance: number; incoterm?: string; documentLabel: string } | null;
};
export type EvidenceKey = "declared" | "originFob" | "baseMarket" | "intlMedian" | "intlMean" | "custom";
export type CommodityQuote = { key: string; name: string; symbol: string; exchange: string; contract: string; price: number; currency: string; quoteUnit: string; usdPerValueUnit: number; valueUnit: string; asOf: string; previousClose: number | null; changePercent: number | null; history: { date: string; close: number }[]; source: string; sourceUrl: string };
type CommodityMatch = { matched: boolean; hsCode: string; quote: CommodityQuote | null; message: string };
export type EvidenceChoice = {
  key: EvidenceKey; value: number | null; methodName: string; apiSource: string;
  /** FOB-based values are the standard basis; any other basis needs a valuation note. */
  fobBased: boolean; weightKg: number | null; photoUrl: string | null; evidence: Record<string, unknown>;
};
type Rate = { rate: number; source: string; date?: string };
type Viewer = "declared" | "fob" | "market" | "base";
type Async<T> = { busy: boolean; error: string; value: T | null };

export const ASSESSMENT_CURRENCY = "ETB";
const markets = [
  { code: "us", label: "United States", currency: "USD" }, { code: "gb", label: "United Kingdom", currency: "GBP" },
  { code: "de", label: "Germany", currency: "EUR" }, { code: "ae", label: "UAE", currency: "AED" }, { code: "za", label: "South Africa", currency: "ZAR" },
];
export const evidenceMethodNames: Record<EvidenceKey, string> = {
  declared: "Transaction value: FOB price plus freight and insurance (CIF)",
  originFob: "Country-of-origin FOB export value plus freight and insurance (UN Comtrade)",
  baseMarket: "Global base market price plus freight and insurance (exchange price)",
  intlMedian: "International market median", intlMean: "International market mean", custom: "Officer-determined customs value",
};
const apiSources: Record<EvidenceKey, string> = { declared: "originFobCif", originFob: "countryOriginFob", baseMarket: "globalBaseMarket", intlMedian: "internationalMedian", intlMean: "internationalMean", custom: "custom" };
const idle = <T,>(): Async<T> => ({ busy: false, error: "", value: null });

/** Kilograms in a shipment quantity, when its unit is a weight (or litres, for liquids priced per litre). */
export function shipmentWeightKg(quantity: number, unit: string) {
  const value = unit.trim().toLowerCase();
  if (["kg", "kgs", "kilogram", "kilograms", "kilograms (kg)", "kgm"].includes(value)) return quantity;
  if (["t", "tonne", "tonnes", "ton", "tons", "metric tons", "mt"].includes(value)) return quantity * 1000;
  if (["g", "gram", "grams"].includes(value)) return quantity / 1000;
  if (["l", "litre", "litres", "liter", "liters"].includes(value)) return quantity;
  return null;
}

function Sparkline({ points }: { points: { close: number }[] }) {
  if (points.length < 2) return null;
  const values = points.map(point => point.close);
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const path = values.map((value, index) => `${(index / (values.length - 1) * 100).toFixed(2)},${(36 - (value - min) / span * 32).toFixed(2)}`).join(" ");
  return <svg className="ve-spark" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`30-day price range ${min.toFixed(2)} to ${max.toFixed(2)}`}><polyline points={path} /></svg>;
}

/**
 * Price evidence and the choice of customs value, shared by the importer case and the officer's valuation search.
 * Gathers the declared FOB value, the origin country's FOB export value, the live global base market price and
 * international retail offers, converts each to ETB for the whole shipment, and shows a detailed viewer for each.
 */
export function ValuationEvidence({ input, onChange, autoSearch = true }: { input: EvidenceInput; onChange: (choice: EvidenceChoice) => void; autoSearch?: boolean }) {
  const hs6 = input.hsCode.replace(/\D/g, "").slice(0, 6);
  const declaredWeight = shipmentWeightKg(input.quantity, input.unit);
  const [query, setQuery] = useState(input.productQuery);
  const [market, setMarket] = useState("us");
  const marketCurrency = markets.find(item => item.code === market)?.currency ?? "USD";
  const [international, setInternational] = useState<Async<InternationalPriceSearch>>(idle);
  const [originFob, setOriginFob] = useState<Async<CustomsTradeBenchmark>>(idle);
  const [commodity, setCommodity] = useState<Async<CommodityMatch>>(idle);
  const [rates, setRates] = useState<Record<string, Rate | "missing">>({});
  const [weight, setWeight] = useState(declaredWeight ? String(declaredWeight) : "");
  const [selected, setSelected] = useState<EvidenceKey>(input.declared ? "declared" : "intlMedian");
  const [customValue, setCustomValue] = useState("");
  const [viewer, setViewer] = useState<Viewer>(input.declared ? "declared" : "fob");
  const started = useRef(false);
  const weightKg = Number(weight) > 0 ? Number(weight) : null;

  const loadRate = useCallback(async (currency: string) => {
    if (!currency || currency === ASSESSMENT_CURRENCY) return;
    try {
      const result = await importerApi<{ rate: number; source: string; date?: string }>(`/exchange-rates/convert?${new URLSearchParams({ amount: "1", from: currency, to: ASSESSMENT_CURRENCY })}`);
      setRates(state => ({ ...state, [currency]: { rate: result.rate, source: result.source, date: result.date } }));
    } catch { setRates(state => ({ ...state, [currency]: "missing" })); }
  }, []);
  useEffect(() => { for (const currency of new Set([input.declared?.currency ?? "USD", marketCurrency, "USD"])) if (!rates[currency]) void loadRate(currency); }, [input.declared?.currency, marketCurrency, rates, loadRate]);
  const toEtb = (amount: number | null | undefined, currency: string) => {
    if (amount == null || !Number.isFinite(amount)) return null;
    if (currency === ASSESSMENT_CURRENCY) return Math.round(amount * 100) / 100;
    const rate = rates[currency];
    return rate && rate !== "missing" ? Math.round(amount * rate.rate * 100) / 100 : null;
  };

  const searchMarket = useCallback(async () => {
    const term = query.trim();
    if (term.length < 2) return;
    setInternational({ busy: true, error: "", value: null });
    try { setInternational({ busy: false, error: "", value: await importerApi<InternationalPriceSearch>(`/international-prices/search?${new URLSearchParams({ q: term, market })}`) }); }
    catch (reason) { setInternational({ busy: false, error: reason instanceof Error ? reason.message : "International prices could not be loaded.", value: null }); }
  }, [query, market]);
  const searchOriginFob = useCallback(() => {
    if (hs6.length < 6 || !input.originCountryCode) { setOriginFob({ busy: false, error: "Choose the HS code and country of origin to look up its FOB export value.", value: null }); return; }
    const params = new URLSearchParams({ hsCode: hs6, countryCode: input.originCountryCode });
    params.set("unit", declaredWeight != null ? "kg" : "u");
    setOriginFob({ busy: true, error: "", value: null });
    void importerApi<CustomsTradeBenchmark>(`/customs-trade-benchmark/origin-fob?${params}`).then(value => setOriginFob({ busy: false, error: "", value }))
      .catch(reason => setOriginFob({ busy: false, error: reason instanceof Error ? reason.message : "Origin-country FOB data could not be loaded.", value: null }));
  }, [hs6, input.originCountryCode, declaredWeight]);
  const searchCommodity = useCallback(() => {
    if (hs6.length < 4) { setCommodity({ busy: false, error: "", value: null }); return; }
    setCommodity({ busy: true, error: "", value: null });
    void importerApi<CommodityMatch>(`/commodity-prices/match?${new URLSearchParams({ hsCode: hs6 })}`).then(value => setCommodity({ busy: false, error: "", value }))
      .catch(reason => setCommodity({ busy: false, error: reason instanceof Error ? reason.message : "The global base market price could not be loaded.", value: null }));
  }, [hs6]);

  // All sources load in parallel when the panel opens; each option becomes selectable as soon as its value arrives.
  useEffect(() => { if (!autoSearch || started.current) return; started.current = true; void searchMarket(); searchOriginFob(); searchCommodity(); }, [autoSearch, searchMarket, searchOriginFob, searchCommodity]);

  const stats = international.value?.statistics ?? null;
  const fob = originFob.value;
  const quote = commodity.value?.quote ?? null;
  const transport = input.declared ? toEtb(input.declared.freight + input.declared.insurance, input.declared.currency) ?? 0 : 0;
  const fobQuantity = fob?.unitValue == null ? null : fob.unit === "u" ? input.quantity : fob.unit === "kg" ? weightKg : null;
  const baseQuantity = quote ? (quote.valueUnit === "L" ? (shipmentWeightKg(input.quantity, input.unit) ?? weightKg) : weightKg) : null;

  // Retail offers are per item; multiplying them by a weight would be meaningless.
  const retailByWeight = declaredWeight != null;
  const rateLoading = (currency: string) => currency !== ASSESSMENT_CURRENCY && !rates[currency];
  type Candidate = { key: EvidenceKey; label: string; detail: string; value: number | null; reason?: string; icon: ReactNode; badge?: string; busy?: boolean };
  const candidates: Candidate[] = useMemo(() => {
    const list: Candidate[] = [];
    if (input.declared) {
      const d = input.declared;
      list.push({ key: "declared", label: "Declared FOB + freight + insurance", badge: "Standard", icon: <FiFileText />, busy: rateLoading(d.currency),
        value: toEtb(d.amount + d.freight + d.insurance, d.currency),
        detail: `${formatMoney(d.amount, d.currency)}${d.incoterm ? ` ${d.incoterm}` : ""}${d.freight || d.insurance ? ` + ${formatMoney(d.freight + d.insurance, d.currency)} freight & insurance` : ""} · ${d.documentLabel}`,
        reason: d.amount > 0 ? undefined : "No price was declared." });
    }
    const fobValue = fob?.unitValue != null && fobQuantity != null ? toEtb(fob.unitValue * fobQuantity, fob.currency || "USD") : null;
    list.push({ key: "originFob", label: `${input.originCountryName || "Origin country"} FOB export value`, badge: "FOB", icon: <FiMapPin />, busy: originFob.busy || rateLoading("USD"),
      value: fobValue == null ? null : Math.round((fobValue + transport) * 100) / 100,
      detail: originFob.busy ? "Loading UN Comtrade export records…" : fob?.unitValue != null
        ? `${formatMoney(fob.unitValue, fob.currency || "USD")} per ${fob.unit === "u" ? "item" : fob.unit} × ${fobQuantity ?? "?"} ${fob.unit === "u" ? "items" : "kg"}${transport ? " + freight & insurance" : ""} · ${fob.period ?? "latest"}`
        : originFob.error || fob?.message || "No export records for this HS code and country.",
      reason: originFob.busy ? "Still loading." : fob?.unitValue == null ? "No FOB export value is available." : fobQuantity == null ? "Enter the shipment's net weight in kilograms to use a per-kg FOB value." : undefined });
    const baseValue = quote && baseQuantity != null ? toEtb(quote.usdPerValueUnit * baseQuantity, "USD") : null;
    // Only offered when the tariff item is an exchange-traded raw material (copper, iron ore, coffee…).
    if (quote) list.push({ key: "baseMarket", label: quote ? `Global base market · ${quote.name}` : "Global base market price", badge: "Live", icon: <FiBarChart2 />, busy: commodity.busy || rateLoading("USD"),
      value: baseValue == null ? null : Math.round((baseValue + transport) * 100) / 100,
      detail: commodity.busy ? "Loading live exchange price…" : quote
        ? `USD ${quote.usdPerValueUnit.toLocaleString(undefined, { maximumFractionDigits: 4 })} per ${quote.valueUnit} × ${baseQuantity ?? "?"} ${quote.valueUnit}${transport ? " + freight & insurance" : ""} · ${quote.exchange}`
        : commodity.error || commodity.value?.message || "Not an exchange-traded raw material.",
      reason: commodity.busy ? "Still loading." : !quote ? "No exchange price applies to this tariff item." : baseQuantity == null ? `Enter the shipment's net weight in ${quote.valueUnit === "L" ? "litres" : "kilograms"}.` : undefined });
    list.push({ key: "intlMedian", label: "International market median", icon: <FiGlobe />, busy: international.busy || rateLoading(marketCurrency),
      value: stats && !retailByWeight ? toEtb(stats.median * input.quantity, marketCurrency) : null,
      detail: stats ? `${formatMoney(stats.median, marketCurrency)} each${retailByWeight ? " · reference only (shipment by weight)" : ` × ${input.quantity}`} · ${stats.observationCount} offers` : international.busy ? "Searching retail offers…" : international.error || "No market prices",
      reason: retailByWeight ? "Retail offers are priced per item; this shipment is measured by weight." : stats ? undefined : international.busy ? "Still loading." : "No market prices." });
    list.push({ key: "intlMean", label: "International market mean", icon: <FiGlobe />, busy: international.busy,
      value: stats && !retailByWeight ? toEtb(stats.mean * input.quantity, marketCurrency) : null,
      detail: stats ? `${formatMoney(stats.mean, marketCurrency)} each${retailByWeight ? " · reference only (shipment by weight)" : ` × ${input.quantity}`}` : international.busy ? "Searching…" : "No market prices",
      reason: retailByWeight ? "Retail offers are priced per item; this shipment is measured by weight." : stats ? undefined : international.busy ? "Still loading." : "No market prices." });
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, fob, fobQuantity, originFob.busy, originFob.error, quote, baseQuantity, commodity, stats, international.busy, international.error, marketCurrency, rates, transport]);

  const chosen = selected === "custom" ? { value: Number(customValue) > 0 ? Number(customValue) : null } : candidates.find(item => item.key === selected);
  const chosenValue = chosen?.value ?? null;

  useEffect(() => {
    onChange({
      key: selected, value: chosenValue, methodName: evidenceMethodNames[selected], apiSource: apiSources[selected],
      fobBased: selected === "declared" || selected === "originFob", weightKg,
      photoUrl: international.value?.items.find(item => item.thumbnailUrl)?.thumbnailUrl ?? null,
      evidence: {
        searchQuery: query.trim(), market, quantity: input.quantity, unit: input.unit, netWeightKg: weightKg,
        declared: input.declared ? { ...input.declared, totalEtb: candidates[0]?.key === "declared" ? candidates[0].value : null } : null,
        internationalEvidence: international.value?.items ?? [], statistics: { international: stats },
        countryOriginFob: fob, globalBaseMarket: quote,
        exchangeRates: Object.fromEntries(Object.entries(rates).filter(([, value]) => value !== "missing")),
        selectedSource: selected, selectedCustomsValue: chosenValue, currency: ASSESSMENT_CURRENCY, decidedAt: new Date().toISOString(),
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, chosenValue, weightKg, international.value, fob, quote, rates, query, market]);

  // Once the standard (declared FOB) value cannot be used, move to the first FOB-based option that has a value.
  useEffect(() => {
    const current = candidates.find(item => item.key === selected);
    if (selected === "custom" || !current || current.value != null || current.busy) return;
    const fallback = candidates.find(item => item.value != null);
    if (fallback) setSelected(fallback.key);
  }, [candidates, selected]);

  const valueOf = (key: EvidenceKey) => candidates.find(item => item.key === key)?.value ?? null;
  const declaredEtb = valueOf("declared");
  const fobReference = valueOf("originFob") != null ? "the origin FOB value" : "the global base market price";
  const fobEtb = valueOf("originFob") ?? valueOf("baseMarket");
  const gap = declaredEtb && fobEtb ? (declaredEtb - fobEtb) / fobEtb : null;
  const missingRates = Object.entries(rates).filter(([, value]) => value === "missing").map(([code]) => code);
  const needsWeight = declaredWeight == null && ((fob?.unit === "kg") || Boolean(quote));
  const each = (amount: number, currency: string, unit: string) => `${formatMoney(amount, currency)} per ${unit}`;
  const vsDeclared = (value: number | null) => declaredEtb && value != null && declaredEtb > 0 ? Math.round((value - declaredEtb) / declaredEtb * 100) : null;

  // The four price references shown big at the top. The global base price appears only for exchange-traded raw materials.
  type Card = { key: EvidenceKey; viewer: Viewer; title: string; icon: ReactNode; badge?: string; perUnit: string; facts: [string, string][]; tone: string };
  const d = input.declared;
  const cards: Card[] = [
    ...(d ? [{ key: "declared" as const, viewer: "declared" as const, title: "Customer paid", icon: <FiFileText />, badge: "Invoice", tone: "paid",
      perUnit: d.amount > 0 ? each(d.amount / Math.max(input.quantity, 1), d.currency, input.unit || "item") : "No price declared",
      facts: [["Price paid", `${formatMoney(d.amount, d.currency)}${d.incoterm ? ` ${d.incoterm}` : ""}`], ["Freight + insurance", formatMoney(d.freight + d.insurance, d.currency)],
        ["CIF", formatMoney(d.amount + d.freight + d.insurance, d.currency)], ["Document", d.documentLabel]] as [string, string][] }] : []),
    { key: "originFob", viewer: "fob", title: `FOB price · ${input.originCountryName || "origin"}`, icon: <FiMapPin />, badge: "Standard", tone: "fob",
      perUnit: fob?.unitValue != null ? each(fob.unitValue, fob.currency || "USD", fob.unit === "u" ? "item" : fob.unit ?? "kg") : originFob.busy ? "Loading UN Comtrade export records…" : "No FOB export value",
      facts: fob?.unitValue != null ? [["Period", String(fob.period ?? "latest")], ["Reporter", fob.reporter || input.originCountryName], ["Shipment", fobQuantity != null ? `${fobQuantity.toLocaleString()} ${fob.unit === "u" ? "items" : "kg"}` : "weight needed"], ["Basis", "FOB + freight & insurance"]] : [] },
    { key: "intlMedian", viewer: "market", title: "Global market price", icon: <FiGlobe />, badge: markets.find(item => item.code === market)?.label, tone: "market",
      perUnit: stats ? each(stats.median, marketCurrency, "item") + " (median)" : international.busy ? "Searching international offers…" : "No market prices",
      facts: stats ? [["Offers", String(stats.observationCount)], ["Range", `${formatMoney(stats.minimum, marketCurrency)} – ${formatMoney(stats.maximum, marketCurrency)}`], ["Mean", formatMoney(stats.mean, marketCurrency)], ["Search", query.trim()]] : [] },
    ...(quote ? [{ key: "baseMarket" as const, viewer: "base" as const, title: `Global base price · ${quote.name}`, icon: <FiBarChart2 />, badge: "Live", tone: "base",
      perUnit: `USD ${quote.usdPerValueUnit.toLocaleString(undefined, { maximumFractionDigits: 4 })} per ${quote.valueUnit}`,
      facts: [["Exchange", `${quote.exchange} · ${quote.symbol}`], ["Quote", `${quote.price.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${quote.quoteUnit}`],
        ["Shipment", baseQuantity != null ? `${baseQuantity.toLocaleString()} ${quote.valueUnit}` : "weight needed"], ["Matched", `HS ${hs6} → ${quote.name}`]] as [string, string][] }] : []),
  ];
  const compared = cards.map(card => ({ card, value: valueOf(card.key) })).filter(item => item.value != null) as { card: Card; value: number }[];
  const top = Math.max(1, ...compared.map(item => item.value));
  const pick = (card: Card) => { setViewer(card.viewer); if (valueOf(card.key) != null) setSelected(card.key); };

  return <div className="ve">
    {missingRates.length > 0 && <p className="oc-callout is-warning"><FiAlertTriangle aria-hidden="true" />No approved exchange rate for {missingRates.join(", ")} to ETB, so those values cannot be used yet. <button type="button" className="oc-link" onClick={() => setRates({})}>Retry</button></p>}
    {needsWeight && <label className="oc-field ve-weight">Net weight of the shipment <small>kg — needed for per-kilogram FOB and exchange prices</small>
      <input type="number" min="0.001" step="any" value={weight} onChange={event => setWeight(event.target.value)} placeholder="e.g. 1200" /></label>}

    <div className={`ve-hero is-${cards.length}`} role="radiogroup" aria-label="Customs value basis">
      {cards.map(card => {
        const candidate = candidates.find(item => item.key === card.key);
        const value = candidate?.value ?? null;
        const diff = card.key === "declared" ? null : vsDeclared(value);
        return <div key={card.key} role="radio" aria-checked={selected === card.key} aria-disabled={value == null} tabIndex={0}
          className={`ve-card is-${card.tone}${selected === card.key ? " is-selected" : ""}${value == null ? " is-unavailable" : ""}${viewer === card.viewer ? " is-viewing" : ""}`}
          onClick={() => pick(card)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(card); } }}>
          <header><span className="ve-card-icon" aria-hidden="true">{card.icon}</span><span className="ve-card-title">{card.title}</span>{card.badge && <em className="ve-badge">{card.badge}</em>}
            <span className="ve-card-check" aria-hidden="true">{selected === card.key && <FiCheck />}</span></header>
          <strong className="ve-card-value">{candidate?.busy ? <span className="ve-loading" aria-label="Loading" /> : value != null ? formatMoney(value, ASSESSMENT_CURRENCY) : "—"}</strong>
          <span className="ve-card-unit">{card.perUnit}</span>
          {card.facts.length > 0 && <dl className="ve-card-facts">{card.facts.map(([label, text]) => <div key={label}><dt>{label}</dt><dd title={text}>{text}</dd></div>)}</dl>}
          <footer>{value == null ? <small className="ve-card-reason">{candidate?.reason ?? "Not available"}</small>
            : diff != null ? <small className={`ve-card-diff ${diff < 0 ? "is-down" : "is-up"}`}>{diff > 0 ? "+" : ""}{diff}% vs customer paid</small>
            : <small className="ve-card-diff">Whole shipment, in ETB</small>}
            <span className="ve-card-more">Details</span></footer>
        </div>;
      })}
    </div>

    {gap != null && Math.abs(gap) >= 0.25 && <div className={`oc-callout ${gap < 0 ? "is-warning" : "is-info"}`}>{gap < 0 ? <FiTrendingDown aria-hidden="true" /> : <FiTrendingUp aria-hidden="true" />}<div><strong>Customer paid is {Math.round(Math.abs(gap) * 100)}% {gap < 0 ? "below" : "above"} {fobReference}</strong><p>{gap < 0 ? "Check the invoice for undervaluation before accepting the transaction value." : "The declared price is high against the reference; check the goods match."}</p></div></div>}

    {compared.length > 1 && <div className="ve-compare" aria-label="Values compared for the whole shipment">
      {compared.map(({ card, value }) => <div key={card.key} className={`ve-compare-row is-${card.tone}${selected === card.key ? " is-selected" : ""}`}>
        <span>{card.title}</span><div className="ve-compare-track"><i style={{ width: `${Math.max(2, value / top * 100)}%` }} /></div><b>{formatMoney(value, ASSESSMENT_CURRENCY)}</b>
      </div>)}
    </div>}

    <section className="ve-viewer" aria-label="Evidence details">
      <div className="oc-segmented" role="tablist" aria-label="Evidence source">
        {d && <button type="button" role="tab" aria-selected={viewer === "declared"} onClick={() => setViewer("declared")}><FiFileText aria-hidden="true" />Customer paid</button>}
        <button type="button" role="tab" aria-selected={viewer === "fob"} onClick={() => setViewer("fob")}><FiMapPin aria-hidden="true" />FOB price</button>
        <button type="button" role="tab" aria-selected={viewer === "market"} onClick={() => setViewer("market")}><FiGlobe aria-hidden="true" />Global market</button>
        {quote && <button type="button" role="tab" aria-selected={viewer === "base"} onClick={() => setViewer("base")}><FiBarChart2 aria-hidden="true" />Global base price</button>}
      </div>
      {viewer === "declared" && d && <div className="ve-panel">
        <div className="ve-figure"><span>Commercial invoice · {d.documentLabel}</span><strong>{formatMoney(d.amount + d.freight + d.insurance, d.currency)} <small>CIF paid by the customer</small></strong></div>
        <dl className="ve-facts"><div><dt>Price paid{d.incoterm ? ` (${d.incoterm})` : ""}</dt><dd>{formatMoney(d.amount, d.currency)}</dd></div><div><dt>Freight</dt><dd>{formatMoney(d.freight, d.currency)}</dd></div><div><dt>Insurance</dt><dd>{formatMoney(d.insurance, d.currency)}</dd></div><div><dt>Per {input.unit || "item"}</dt><dd>{formatMoney(d.amount / Math.max(input.quantity, 1), d.currency)}</dd></div></dl>
        <dl className="ve-facts"><div><dt>Quantity</dt><dd>{input.quantity.toLocaleString()} {input.unit}</dd></div><div><dt>Exchange rate</dt><dd>{d.currency === ASSESSMENT_CURRENCY ? "—" : rates[d.currency] && rates[d.currency] !== "missing" ? `1 ${d.currency} = ${(rates[d.currency] as Rate).rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETB` : "loading"}</dd></div><div><dt>Rate source</dt><dd>{rates[d.currency] && rates[d.currency] !== "missing" ? (rates[d.currency] as Rate).source : "—"}</dd></div><div><dt>Customs value</dt><dd>{declaredEtb != null ? formatMoney(declaredEtb, ASSESSMENT_CURRENCY) : "—"}</dd></div></dl>
        <p className="oc-muted">The transaction value — the price actually paid plus freight and insurance to Ethiopia — is the first basis under the WTO Valuation Agreement. Compare it with the FOB and market references before accepting it.</p>
      </div>}
      {viewer === "fob" && <div className="ve-panel">{originFob.busy ? <p className="oc-muted">Loading UN Comtrade export records for <HsItem code={hs6} /> from {input.originCountryName}…</p>
        : fob?.unitValue != null ? <>
          <div className="ve-figure"><span>{input.originCountryName} → world exports · <HsItem code={fob.hsCode} /> · {fob.period ?? "latest"}</span><strong>{formatMoney(fob.unitValue, fob.currency || "USD")} <small>FOB per {fob.unit === "u" ? "item" : fob.unit}</small></strong></div>
          <dl className="ve-facts"><div><dt>Reporter</dt><dd>{fob.reporter}</dd></div><div><dt>Partner</dt><dd>{fob.partner || "World"}</dd></div><div><dt>Reported quantity</dt><dd>{fob.quantity?.toLocaleString() ?? "—"} {fob.unit}</dd></div><div><dt>Data updated</dt><dd>{fob.dataUpdatedAtUtc ? new Date(fob.dataUpdatedAtUtc).toLocaleDateString() : "—"}</dd></div></dl>
          <p className="oc-muted">FOB is the standard customs basis: the export value at the origin port. Freight and insurance to Ethiopia are added to reach the CIF customs value.</p>
          {fob.sourceUrl && <a className="oc-source-link" href={fob.sourceUrl} target="_blank" rel="noopener noreferrer">UN Comtrade source <FiExternalLink aria-hidden="true" /></a>}
        </> : <p className="oc-muted">{originFob.error || fob?.message || "No country-of-origin FOB data."} <button type="button" className="oc-link" onClick={searchOriginFob}>Retry</button></p>}</div>}
      {viewer === "base" && quote && <div className="ve-panel">
        <div className="ve-figure"><span>{quote.contract} · {quote.exchange} · as of {new Date(quote.asOf).toLocaleString()}</span>
          <strong>{quote.price.toLocaleString(undefined, { maximumFractionDigits: 4 })} <small>{quote.quoteUnit}</small>{quote.changePercent != null && <em className={quote.changePercent < 0 ? "is-down" : "is-up"}>{quote.changePercent > 0 ? "+" : ""}{quote.changePercent}%</em>}</strong></div>
        <Sparkline points={quote.history} />
        <dl className="ve-facts"><div><dt>Per {quote.valueUnit}</dt><dd>USD {quote.usdPerValueUnit.toLocaleString(undefined, { maximumFractionDigits: 4 })}</dd></div><div><dt>Shipment</dt><dd>{baseQuantity != null ? `${baseQuantity.toLocaleString()} ${quote.valueUnit}` : "weight needed"}</dd></div><div><dt>30-day range</dt><dd>{quote.history.length ? `${Math.min(...quote.history.map(point => point.close)).toLocaleString()} – ${Math.max(...quote.history.map(point => point.close)).toLocaleString()}` : "—"}</dd></div><div><dt>Symbol</dt><dd>{quote.symbol}</dd></div></dl>
        <p className="oc-muted">This tariff item (<HsItem code={hs6} />) matches the exchange-traded raw material {quote.name}. The value is the live price per {quote.valueUnit} × the shipment&apos;s {quote.valueUnit === "L" ? "volume" : "net weight"}, plus freight and insurance. Processed or manufactured goods are worth more than their raw-material content.</p>
        <a className="oc-source-link" href={quote.sourceUrl} target="_blank" rel="noopener noreferrer">{quote.source} <FiExternalLink aria-hidden="true" /></a>
      </div>}
      {viewer === "market" && <div className="ve-panel">
        <form className="oc-search-row" onSubmit={event => { event.preventDefault(); void searchMarket(); }}>
          <label className="oc-search"><FiSearch aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} maxLength={200} aria-label="Product to search in international markets" /></label>
          <select value={market} onChange={event => setMarket(event.target.value)} aria-label="International market">{markets.map(item => <option key={item.code} value={item.code}>{item.label} · {item.currency}</option>)}</select>
          <button type="submit" className="oc-btn" disabled={international.busy}><FiRefreshCw aria-hidden="true" className={international.busy ? "oc-spin" : ""} />{international.busy ? "Searching…" : "Search again"}</button>
        </form>
        {international.busy ? <p className="oc-muted">Searching international retail offers…</p>
          : international.value && international.value.items.length > 0 ? <>
            {stats && <dl className="ve-facts"><div><dt>Median</dt><dd>{formatMoney(stats.median, marketCurrency)}</dd></div><div><dt>Mean</dt><dd>{formatMoney(stats.mean, marketCurrency)}</dd></div><div><dt>Range</dt><dd>{formatMoney(stats.minimum, marketCurrency)} – {formatMoney(stats.maximum, marketCurrency)}</dd></div><div><dt>Offers</dt><dd>{stats.observationCount}</dd></div></dl>}
            <ul className="oc-offers-list">{international.value.items.slice(0, 12).map((item, index) => <li key={`${item.title}-${index}`}>{item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" loading="lazy" />}<span><strong>{item.title}</strong><small>{item.source}{item.condition ? ` · ${item.condition}` : ""}</small></span><b>{item.displayPrice}</b>{item.productUrl && <a href={item.productUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open offer ${item.title}`}><FiExternalLink /></a>}</li>)}</ul>
          </> : <p className="oc-muted">{international.error || "No international offers for this search."}</p>}
      </div>}
    </section>

    <div className="ve-other" role="radiogroup" aria-label="Other customs value bases">
      <span className="ve-other-title">Other bases</span>
      {candidates.filter(item => item.key === "intlMean").map(item => <label key={item.key} className={`oc-candidate${selected === item.key ? " is-selected" : ""}${item.value == null ? " is-disabled" : ""}`} title={item.reason}>
        <input type="radio" name="ve-value" checked={selected === item.key} disabled={item.value == null} onChange={() => setSelected(item.key)} />
        <span className="oc-candidate-icon" aria-hidden="true">{item.icon}</span>
        <span className="oc-candidate-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
        <b>{item.busy ? <span className="ve-loading" aria-label="Loading" /> : item.value != null ? formatMoney(item.value, ASSESSMENT_CURRENCY) : "—"}</b>
      </label>)}
      <label className={`oc-candidate${selected === "custom" ? " is-selected" : ""}`}>
        <input type="radio" name="ve-value" checked={selected === "custom"} onChange={() => setSelected("custom")} />
        <span className="oc-candidate-icon" aria-hidden="true"><FiEdit3 /></span>
        <span className="oc-candidate-copy"><strong>Officer-determined value</strong><small>Another valuation method; explain it in the note</small></span>
        <input className="oc-money" type="number" min="0.01" step="0.01" value={customValue} onFocus={() => setSelected("custom")} onChange={event => setCustomValue(event.target.value)} placeholder="ETB" aria-label="Customs value in ETB" />
      </label>
    </div>

    <div className={`ve-chosen${chosenValue != null ? "" : " is-empty"}`} aria-live="polite">
      <span>Customs value (CIF) for the whole shipment</span>
      <strong>{chosenValue != null ? formatMoney(chosenValue, ASSESSMENT_CURRENCY) : "Choose a value"}</strong>
      <small>{evidenceMethodNames[selected]}</small>
    </div>
  </div>;
}
