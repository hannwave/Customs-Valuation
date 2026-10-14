"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiAlertTriangle, FiArchive, FiArrowRight, FiExternalLink, FiFileText, FiGlobe, FiMapPin, FiRefreshCw, FiSearch, FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import { fetchDocumentBlob } from "@/components/ImporterDocumentPreview";
import { formatMoney, importerApi } from "@/lib/importer";
import { lineCode, type OfficerCase } from "@/lib/officer-case";
import { officerNoteIssue } from "@/lib/officer-note-quality";
import type { CustomsTradeBenchmark, InternationalPriceSearch } from "@/lib/types/customs";
import { workspaceApi } from "@/lib/workspace";

type Source = "declared" | "intlMedian" | "intlMean" | "benchmark" | "originFob" | "custom";
type Rate = { rate: number; source: string; date?: string };
type Historical = { summary?: { currentInternationalPrice: number | null; internationalAsOf: string | null } | null; currency: string; methodology?: string };
type Async<T> = { busy: boolean; error: string; value: T | null };

const markets: { code: string; label: string; currency: string }[] = [
  { code: "us", label: "United States", currency: "USD" }, { code: "gb", label: "United Kingdom", currency: "GBP" },
  { code: "de", label: "Germany", currency: "EUR" }, { code: "ae", label: "UAE", currency: "AED" }, { code: "za", label: "South Africa", currency: "ZAR" },
];
const ASSESSMENT_CURRENCY = "ETB";
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const idle = <T,>(): Async<T> => ({ busy: false, error: "", value: null });
const methodNames: Record<Source, string> = {
  declared: "Transaction value: declared price plus freight and insurance (CIF)", intlMedian: "International market median", intlMean: "International market mean",
  benchmark: "Customs trade benchmark", originFob: "Country-of-origin export value (UN Comtrade)", custom: "Officer-determined customs value",
};
const apiSource: Record<Source, string> = { declared: "originFobCif", intlMedian: "internationalMedian", intlMean: "internationalMean", benchmark: "customsBenchmark", originFob: "countryOriginFob", custom: "custom" };

/** Tariff units map to the unit UN Comtrade reports quantities in. */
function comtradeUnit(unit: string) {
  const value = unit.trim().toLowerCase();
  if (["kg", "kgm", "kilogram", "kilograms"].includes(value)) return "kg";
  if (!value || ["u", "unt", "unit", "units", "pcs", "piece", "pieces", "no", "nmb", "item", "items"].includes(value)) return "u";
  return "";
}

export function ValuationStep({ data, onSaved, onError }: { data: OfficerCase; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const d = data.declaration;
  const line = data.confirmedLine;
  const hs6 = (line?.hsCode ?? "").replace(/\D/g, "").slice(0, 6);
  const unit = comtradeUnit(line?.unit ?? "");
  const [query, setQuery] = useState([d.brand, d.model].filter(Boolean).join(" ") || d.productName);
  const [market, setMarket] = useState("us");
  const marketCurrency = markets.find(item => item.code === market)?.currency ?? "USD";
  const [international, setInternational] = useState<Async<InternationalPriceSearch>>(idle);
  const [historical, setHistorical] = useState<Historical | null>(null);
  const [benchmark, setBenchmark] = useState<Async<CustomsTradeBenchmark>>(idle);
  const [originFob, setOriginFob] = useState<Async<CustomsTradeBenchmark>>(idle);
  const [rates, setRates] = useState<Record<string, Rate | "missing">>({});
  const [selected, setSelected] = useState<Source>("declared");
  const [customValue, setCustomValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const searched = useRef(false);

  const quantity = Number(d.quantity) || 1;
  const declaredTotal = (d.invoiceAmount ?? 0) + (d.freightAmount ?? 0) + (d.insuranceAmount ?? 0);
  const noteIssue = officerNoteIssue(note);

  const loadRate = useCallback(async (currency: string) => {
    if (!currency || currency === ASSESSMENT_CURRENCY) return;
    try {
      const result = await importerApi<{ convertedAmount: number; rate: number; source: string; date?: string }>(`/exchange-rates/convert?${new URLSearchParams({ amount: "1", from: currency, to: ASSESSMENT_CURRENCY })}`);
      setRates(state => ({ ...state, [currency]: { rate: result.rate, source: result.source, date: result.date } }));
    } catch { setRates(state => ({ ...state, [currency]: "missing" })); }
  }, []);
  useEffect(() => { for (const currency of new Set([d.invoiceCurrency, marketCurrency, "USD"])) if (!rates[currency]) void loadRate(currency); }, [d.invoiceCurrency, marketCurrency, rates, loadRate]);
  const toEtb = (amount: number | null | undefined, currency: string) => {
    if (amount == null || !Number.isFinite(amount)) return null;
    if (currency === ASSESSMENT_CURRENCY) return amount;
    const rate = rates[currency];
    return rate && rate !== "missing" ? Math.round(amount * rate.rate * 100) / 100 : null;
  };

  const searchMarket = useCallback(async () => {
    const term = query.trim();
    if (term.length < 2) { onError("Enter a product to search for."); return; }
    setInternational({ busy: true, error: "", value: null });
    try { setInternational({ busy: false, error: "", value: await importerApi<InternationalPriceSearch>(`/international-prices/search?${new URLSearchParams({ q: term, market })}`) }); }
    catch (reason) { setInternational({ busy: false, error: reason instanceof Error ? reason.message : "International prices could not be loaded.", value: null }); }
    void importerApi<Historical>(`/historical-markets/summary?${new URLSearchParams({ q: term })}`).then(setHistorical).catch(() => setHistorical(null));
  }, [query, market, onError]);

  const searchTrade = useCallback(async () => {
    if (hs6.length < 6) return;
    const params = new URLSearchParams({ hsCode: hs6 }); if (unit) params.set("unit", unit);
    setBenchmark({ busy: true, error: "", value: null });
    void importerApi<CustomsTradeBenchmark>(`/customs-trade-benchmark/search?${params}`).then(value => setBenchmark({ busy: false, error: "", value }))
      .catch(reason => setBenchmark({ busy: false, error: reason instanceof Error ? reason.message : "The customs trade benchmark could not be loaded.", value: null }));
    const originParams = new URLSearchParams({ hsCode: hs6, countryCode: d.originCountryCode }); if (unit) originParams.set("unit", unit);
    setOriginFob({ busy: true, error: "", value: null });
    void importerApi<CustomsTradeBenchmark>(`/customs-trade-benchmark/origin-fob?${originParams}`).then(value => setOriginFob({ busy: false, error: "", value }))
      .catch(reason => setOriginFob({ busy: false, error: reason instanceof Error ? reason.message : "Origin-country export data could not be loaded.", value: null }));
  }, [hs6, unit, d.originCountryCode]);

  // Gather evidence once when the officer opens valuation; they can refine the search afterwards.
  useEffect(() => { if (searched.current) return; searched.current = true; void searchMarket(); void searchTrade(); }, [searchMarket, searchTrade]);

  const stats = international.value?.statistics ?? null;
  const perItem = (value: CustomsTradeBenchmark | null) => value?.unitValue != null && value.unit === "u";
  const candidates = useMemo(() => {
    const list: { key: Source; label: string; detail: string; value: number | null; disabled?: string; icon: React.ReactNode }[] = [
      { key: "declared", label: "Declared transaction value", icon: <FiFileText />, value: toEtb(declaredTotal, d.invoiceCurrency),
        detail: `${formatMoney(d.invoiceAmount, d.invoiceCurrency)} paid${(d.freightAmount || d.insuranceAmount) ? ` + ${formatMoney((d.freightAmount ?? 0) + (d.insuranceAmount ?? 0), d.invoiceCurrency)} freight & insurance` : ""} · commercial invoice`,
        disabled: d.invoiceAmount ? undefined : "The importer did not declare a price." },
      { key: "intlMedian", label: "International market median", icon: <FiGlobe />, value: stats ? toEtb(stats.median * quantity, marketCurrency) : null,
        detail: stats ? `${formatMoney(stats.median, marketCurrency)} each × ${quantity} · ${stats.observationCount} offers` : international.busy ? "Searching…" : "No market prices", disabled: stats ? undefined : "No market prices yet." },
      { key: "intlMean", label: "International market mean", icon: <FiGlobe />, value: stats ? toEtb(stats.mean * quantity, marketCurrency) : null,
        detail: stats ? `${formatMoney(stats.mean, marketCurrency)} each × ${quantity}` : "No market prices", disabled: stats ? undefined : "No market prices yet." },
      { key: "benchmark", label: "Customs trade benchmark", icon: <FiArchive />, value: perItem(benchmark.value) ? toEtb((benchmark.value!.unitValue ?? 0) * quantity, "USD") : null,
        detail: benchmark.value?.unitValue != null ? `${formatMoney(benchmark.value.unitValue, "USD")} per ${benchmark.value.unit === "u" ? "item" : benchmark.value.unit} · HS ${benchmark.value.hsCode} · ${benchmark.value.period ?? "latest"}` : benchmark.busy ? "Loading…" : benchmark.error || benchmark.value?.message || "Unavailable",
        disabled: perItem(benchmark.value) ? undefined : "Only per-item benchmarks can be used as a value." },
      { key: "originFob", label: `${d.originCountryName} export value`, icon: <FiMapPin />, value: perItem(originFob.value) ? toEtb((originFob.value!.unitValue ?? 0) * quantity, "USD") : null,
        detail: originFob.value?.unitValue != null ? `${formatMoney(originFob.value.unitValue, "USD")} per ${originFob.value.unit === "u" ? "item" : originFob.value.unit} FOB · ${originFob.value.period ?? "latest"}` : originFob.busy ? "Loading…" : originFob.error || originFob.value?.message || "Unavailable",
        disabled: perItem(originFob.value) ? undefined : "Only per-item export values can be used as a value." },
    ];
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declaredTotal, d, stats, quantity, marketCurrency, benchmark, originFob, international.busy, rates]);

  const chosen = selected === "custom" ? { value: Number(customValue) > 0 ? Number(customValue) : null } : candidates.find(item => item.key === selected);
  const chosenValue = chosen?.value ?? null;
  const declaredEtb = candidates[0].value;
  const marketEtb = candidates[1].value;
  const gap = declaredEtb && marketEtb ? (declaredEtb - marketEtb) / marketEtb : null;

  async function save() {
    if (!line) { onError("Confirm the HS classification before valuation."); return; }
    if (!data.canValue) { onError("Only an officer assigned to this declaration's branch can value it."); return; }
    if (!chosenValue || chosenValue <= 0) { onError("Choose a customs value with an amount in ETB."); return; }
    if (noteIssue) { onError(noteIssue); return; }
    if (selected !== "declared" && note.trim().length < 10) { onError("Explain in the note why the declared transaction value was not accepted."); document.getElementById("oc-valuation-note")?.focus(); return; }
    const invoice = d.documents.find(document => document.kind === "COMMERCIAL_INVOICE");
    if (!invoice || !d.invoiceAmount) { onError("The declaration has no commercial invoice or declared price."); return; }
    if (invoice.size > MAX_RECEIPT_BYTES) { onError("The commercial invoice is larger than 8 MB, which the valuation record cannot store. Ask the importer for a smaller file."); return; }
    setSaving(true);
    try {
      const blob = await fetchDocumentBlob(`/importer-declarations/${d.id}/documents/COMMERCIAL_INVOICE`);
      const photo = international.value?.items.find(item => item.thumbnailUrl)?.thumbnailUrl ?? null;
      const evidence = {
        product: d.productName, searchQuery: query.trim(), market, hsCode: lineCode(line), nationalCode: line.nationalCode, quantity, unit: d.unit,
        importerDeclaration: { id: d.id, reference: d.reference, purpose: d.importPurpose, originCountryCode: d.originCountryCode, originCountryName: d.originCountryName, requestedTreatments: d.requestedTreatments },
        declared: { invoiceAmount: d.invoiceAmount, freightAmount: d.freightAmount, insuranceAmount: d.insuranceAmount, currency: d.invoiceCurrency, totalEtb: declaredEtb },
        internationalEvidence: international.value?.items ?? [], statistics: { international: stats }, historical,
        customsTradeBenchmark: benchmark.value, countryOriginFob: originFob.value,
        exchangeRates: Object.fromEntries(Object.entries(rates).filter(([, value]) => value !== "missing")),
        selectedSource: selected, selectedCustomsValue: chosenValue, currency: ASSESSMENT_CURRENCY, decidedAt: new Date().toISOString(),
      };
      const form = new FormData();
      form.append("importerDeclarationId", d.id); form.append("hsCodeId", line.hsCodeId); form.append("locationId", d.locationId);
      form.append("selectedReferenceValue", String(chosenValue)); form.append("currency", ASSESSMENT_CURRENCY);
      form.append("decision", `Customs value for ${d.reference}: ${d.productName}`); form.append("justification", note.trim());
      form.append("evidence", JSON.stringify(evidence)); form.append("productName", d.productName.slice(0, 300));
      form.append("purchaseCountryCode", d.originCountryCode); form.append("selectedPriceSource", apiSource[selected]); form.append("valuationMethod", methodNames[selected]);
      if (photo) form.append("productPhotoUrl", photo);
      form.append("declaredPriceAmount", String(d.invoiceAmount)); form.append("declaredPriceCurrency", d.invoiceCurrency);
      if (selected === "declared") {
        form.append("fobPriceAmount", String(d.invoiceAmount)); form.append("fobPriceCurrency", d.invoiceCurrency);
        form.append("freightAmount", String(d.freightAmount ?? 0)); form.append("insuranceAmount", String(d.insuranceAmount ?? 0));
      }
      form.append("receipt", new File([blob], invoice.fileName, { type: invoice.contentType }));
      const created = await importerApi<{ id: string; version: string }>("/workspace/decisions/with-receipt", { method: "POST", body: form });
      await workspaceApi(`/decisions/${created.id}/submit`, { method: "POST", body: JSON.stringify({ version: created.version, justification: note.trim() }) });
      await onSaved("Customs value recorded. Review the duties and taxes next.");
    } catch (reason) { onError(reason instanceof Error ? reason.message : "The valuation could not be saved."); }
    finally { setSaving(false); }
  }

  const missingRates = Object.entries(rates).filter(([, value]) => value === "missing").map(([code]) => code);
  return <div className="oc-step-grid">
    <section className="oc-card" aria-labelledby="oc-evidence-title">
      <header className="oc-card-head"><div><span className="oc-eyebrow">Price evidence</span><h2 id="oc-evidence-title">Market and trade prices</h2><p className="oc-muted">Searched automatically from the declaration. All values are for the whole shipment of {quantity} {d.unit}, converted to ETB.</p></div></header>
      <form className="oc-search-row" onSubmit={event => { event.preventDefault(); void searchMarket(); }}>
        <label className="oc-search"><FiSearch aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} maxLength={200} aria-label="Product to search" /></label>
        <select value={market} onChange={event => setMarket(event.target.value)} aria-label="International market">{markets.map(item => <option key={item.code} value={item.code}>{item.label} · {item.currency}</option>)}</select>
        <button type="submit" className="oc-btn" disabled={international.busy}><FiRefreshCw aria-hidden="true" className={international.busy ? "oc-spin" : ""} />{international.busy ? "Searching…" : "Search again"}</button>
      </form>
      {international.error && <p className="oc-inline-error" role="alert">{international.error}</p>}
      {missingRates.length > 0 && <p className="oc-callout is-warning"><FiAlertTriangle aria-hidden="true" />No approved exchange rate for {missingRates.join(", ")} to ETB, so those values cannot be used.</p>}
      {gap != null && Math.abs(gap) >= 0.25 && <div className={`oc-callout ${gap < 0 ? "is-warning" : "is-info"}`}>{gap < 0 ? <FiTrendingDown aria-hidden="true" /> : <FiTrendingUp aria-hidden="true" />}<div><strong>Declared value is {Math.round(Math.abs(gap) * 100)}% {gap < 0 ? "below" : "above"} the market median</strong><p>{gap < 0 ? "Check the invoice for undervaluation before accepting the transaction value." : "The declared price is high for this market; check the item matches the search."}</p></div></div>}

      <div className="oc-candidates" role="radiogroup" aria-label="Customs value basis">
        {candidates.map(item => <label key={item.key} className={`oc-candidate${selected === item.key ? " is-selected" : ""}${item.disabled || item.value == null ? " is-disabled" : ""}`} title={item.disabled}>
          <input type="radio" name="oc-value" checked={selected === item.key} disabled={Boolean(item.disabled) || item.value == null} onChange={() => setSelected(item.key)} />
          <span className="oc-candidate-icon" aria-hidden="true">{item.icon}</span>
          <span className="oc-candidate-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
          <b>{item.value != null ? formatMoney(item.value, ASSESSMENT_CURRENCY) : "—"}</b>
        </label>)}
        <label className={`oc-candidate${selected === "custom" ? " is-selected" : ""}`}>
          <input type="radio" name="oc-value" checked={selected === "custom"} onChange={() => setSelected("custom")} />
          <span className="oc-candidate-icon" aria-hidden="true"><FiFileText /></span>
          <span className="oc-candidate-copy"><strong>Officer-determined value</strong><small>Another valuation method; explain it in the note</small></span>
          <input className="oc-money" type="number" min="0.01" step="0.01" value={customValue} onFocus={() => setSelected("custom")} onChange={event => setCustomValue(event.target.value)} placeholder="ETB" aria-label="Customs value in ETB" />
        </label>
      </div>

      {international.value && international.value.items.length > 0 && <details className="oc-offers"><summary>{international.value.items.length} market offers for “{international.value.query}”</summary>
        <ul>{international.value.items.slice(0, 12).map((item, index) => <li key={`${item.title}-${index}`}>{item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" loading="lazy" />}<span><strong>{item.title}</strong><small>{item.source}{item.condition ? ` · ${item.condition}` : ""}</small></span><b>{item.displayPrice}</b>{item.productUrl && <a href={item.productUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open offer ${item.title}`}><FiExternalLink /></a>}</li>)}</ul>
      </details>}
      {historical?.summary?.currentInternationalPrice != null && <p className="oc-muted">Saved history: latest recorded international price {formatMoney(historical.summary.currentInternationalPrice, historical.currency || "ETB")}{historical.summary.internationalAsOf ? ` (${historical.summary.internationalAsOf})` : ""}.</p>}
    </section>

    <section className="oc-card oc-decision" aria-labelledby="oc-value-title">
      <header className="oc-card-head"><div><span className="oc-eyebrow">Customs value</span><h2 id="oc-value-title">{chosenValue != null ? formatMoney(chosenValue, ASSESSMENT_CURRENCY) : "Choose a value"}</h2><p className="oc-muted">{methodNames[selected]}</p></div></header>
      <label className="oc-field" htmlFor="oc-valuation-note">Valuation note {selected !== "declared" ? <small>required when the declared value is not accepted</small> : <small>optional</small>}
        <textarea id="oc-valuation-note" rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="e.g. Invoice price is 40% below comparable market offers; market median applied." /></label>
      {noteIssue && <p className="oc-inline-error" role="alert">{noteIssue}</p>}
      {!data.canValue && <p className="oc-callout is-warning"><FiAlertTriangle aria-hidden="true" />Your assigned office is not this declaration's branch, so you can review it but not value it.</p>}
      <div className="oc-actions"><button type="button" className="oc-btn is-primary" disabled={saving || !chosenValue || !data.canValue} onClick={() => void save()}>{saving ? "Recording value…" : "Record value and assess taxes"}<FiArrowRight aria-hidden="true" /></button></div>
    </section>
  </div>;
}
