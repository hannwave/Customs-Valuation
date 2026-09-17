"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiAlertTriangle, FiArrowRight, FiArchive, FiBookOpen, FiCheckCircle, FiChevronRight, FiGlobe, FiLayers, FiPlus, FiRefreshCw, FiSave, FiSearch, FiShoppingBag, FiTrash2 } from "react-icons/fi";
import { calculatePhase2, loadPhase2, savePhase2, searchPhase2HsCodes } from "@/lib/phase2Api";
import { getSessionAccessToken } from "@/lib/auth/session";
import type { HsCode, Phase2Request, Phase2Response, Phase2TaxLineRequest } from "@/lib/types/customs";

type Phase = "one" | "two";
const currencyOptions = ["ETB", "USD", "EUR", "GBP"];

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
}

function defaultTaxLines(currency = "ETB"): Phase2TaxLineRequest[] {
  return [
    { name: "Tax 1", calculationType: "Percentage", value: 0, currency, order: 1, calculationBasis: "InitialDuty", notes: "" },
    { name: "Tax 2", calculationType: "Percentage", value: 0, currency, order: 2, calculationBasis: "InitialDuty", notes: "" },
  ];
}

function emptyDraft(): Phase2Request {
  return { selectedHsCodeId: null, targetCurrency: "ETB", exchangeRate: 1, exchangeRateSource: "Same currency", exchangeRateDate: null, exemptionAmount: 0, waiverAmount: 0, manualAdjustmentAmount: 0, manualAdjustmentType: "Fixed", notes: "", taxLines: defaultTaxLines() };
}

function PhaseBar({ phase, onChange }: { phase: Phase; onChange: (next: Phase) => void }) {
  return <nav className={`phase-bar phase-bar--${phase}`} aria-label="Officer valuation phases">
    <button type="button" aria-pressed={phase === "one"} className={phase === "one" ? "is-active" : "is-collapsed"} onClick={() => onChange("one")}><span>01</span><strong>Phase 1</strong><small>Initial duty</small></button>
    <FiChevronRight aria-hidden="true" />
    <button type="button" aria-pressed={phase === "two"} className={phase === "two" ? "is-active" : "is-collapsed"} onClick={() => onChange("two")}><span>02</span><strong>Phase 2</strong><small>Additional taxes</small></button>
  </nav>;
}

function PhaseOneOverview() {
  const { t } = useTranslation();
  const pools = [
    { href: "/international-prices", key: "international", icon: FiGlobe, number: "01", body: t("overview.internationalBody", "Explore overseas market prices with source, currency and product context."), action: t("overview.internationalAction", "Explore international prices") },
    { href: "/local-prices", key: "local", icon: FiShoppingBag, number: "02", body: t("overview.localBody", "Analyze Ethiopian marketplace observations and review comparable listings."), action: t("overview.localAction", "Analyze local prices") },
    { href: "/historical-customs-prices", key: "historical", icon: FiArchive, number: "03", body: t("overview.historicalBody", "A dedicated space for historical customs evidence. This module is planned."), action: t("overview.historicalAction", "View module details") },
  ];
  return <>
    <div className="page-heading"><div><p className="eyebrow">{t("overview.eyebrow", "CLASSIFICATION · EVIDENCE · REVIEW")}</p><h1>{t("overview.title", "Your valuation workspace")}</h1><p className="lead">{t("overview.intro", "Find the right classification. Build a clearer picture of value.")}</p></div><span className="workspace-tag"><FiLayers />{t("overview.tag", "Reference workspace")}</span></div>
    <section className="overview-hero"><div><span className="hero-kicker">{t("overview.startLabel", "A WELL-INFORMED DECISION STARTS HERE")}</span><h2>{t("overview.hero", "Start with the right HS code.")}</h2><p>{t("overview.heroBody", "Search commodity classifications, check tariff details and establish the basis for your evidence review.")}</p><Link className="primary-link" href="/hs-codes"><FiBookOpen />{t("start")}<FiArrowRight /></Link></div><div className="hero-watermark" aria-hidden="true"><FiBookOpen /></div></section>
    <div className="section-heading"><div><p className="eyebrow">{t("overview.evidence", "BUILD YOUR EVIDENCE")}</p><h2>{t("separatePools")}</h2><p>{t("overview.poolBody", "Each source has its own context. Keep the evidence distinct as you assess comparability.")}</p></div></div>
    <div className="evidence-cards">{pools.map(pool => <Link className="evidence-card" href={pool.href} key={pool.key}><div className="evidence-card-top"><span className="evidence-icon"><pool.icon /></span><span className="evidence-number">{pool.number}</span></div><h3>{t(pool.key)}</h3><p>{pool.body}</p><span className="card-action">{pool.action}<FiArrowRight /></span></Link>)}</div>
    <section className="decision-note"><FiCheckCircle aria-hidden="true" /><div><h3>{t("overview.officer", "Evidence informs. Officers decide.")}</h3><p>{t("decisionSupport")}</p></div></section>
  </>;
}

function requestFromPhase2(data: Phase2Response): Phase2Request {
  if (!data.phase2) return emptyDraft();
  return {
    selectedHsCodeId: data.phase2.selectedHsCodeId,
    targetCurrency: data.phase2.targetCurrency,
    exchangeRate: data.phase2.exchangeRate,
    exchangeRateSource: data.phase2.exchangeRateSource,
    exchangeRateDate: data.phase2.exchangeRateDate,
    exemptionAmount: data.phase2.exemptionAmount,
    waiverAmount: data.phase2.waiverAmount,
    manualAdjustmentAmount: data.phase2.manualAdjustmentAmount,
    manualAdjustmentType: data.phase2.manualAdjustmentType,
    notes: data.phase2.notes,
    expectedVersion: data.phase2.version,
    taxLines: data.phase2.taxLines.map(({ id: _id, baseAmount: _base, calculatedAmount: _calculated, ...line }) => line),
  };
}

function PhaseTwoOverview() {
  const [caseId, setCaseId] = useState("");
  const [data, setData] = useState<Phase2Response | null>(null);
  const [draft, setDraft] = useState<Phase2Request>(emptyDraft());
  const [hsSearch, setHsSearch] = useState("");
  const [hsResults, setHsResults] = useState<HsCode[]>([]);
  const [busy, setBusy] = useState<"load" | "search" | "calculate" | "save" | "complete" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const initialCase = new URLSearchParams(window.location.search).get("caseId");
    if (initialCase) { setCaseId(initialCase); void loadCase(initialCase); }
  }, []);

  async function loadCase(id = caseId) {
    const normalized = id.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) { setError("Enter the Phase 1 valuation case ID to continue."); return; }
    setBusy("load"); setError(""); setNotice("");
    try { const response = await loadPhase2(normalized); setData(response); setDraft(requestFromPhase2(response)); setNotice("Phase 1 case loaded. Phase 2 can now be saved as an extension of this case."); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "The Phase 1 case could not be loaded."); }
    finally { setBusy(null); }
  }

  async function findHsCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hsSearch.trim().length < 2) { setError("Enter at least two characters to search HS codes."); return; }
    setBusy("search"); setError("");
    try { const response = await searchPhase2HsCodes(hsSearch.trim()); setHsResults(response.items); if (!response.items.length) setNotice("No HS codes matched that search."); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "HS codes could not be searched."); }
    finally { setBusy(null); }
  }

  function updateTax(index: number, patch: Partial<Phase2TaxLineRequest>) {
    setDraft(current => ({ ...current, taxLines: current.taxLines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) }));
  }

  function payload(): Phase2Request {
    return { ...draft, targetCurrency: draft.targetCurrency.toUpperCase(), exchangeRate: Number(draft.exchangeRate) || 0, exemptionAmount: Number(draft.exemptionAmount) || 0, waiverAmount: Number(draft.waiverAmount) || 0, manualAdjustmentAmount: Number(draft.manualAdjustmentAmount) || 0, taxLines: draft.taxLines.map((line, index) => ({ ...line, value: Number(line.value) || 0, order: index + 1, currency: line.currency.toUpperCase() })) };
  }

  async function calculate() {
    if (!data) { setError("Load a saved Phase 1 case before calculating Phase 2."); return; }
    setBusy("calculate"); setError(""); setNotice("");
    try { setData(await calculatePhase2(data.decisionId, payload())); setNotice("Provisional Phase 2 calculation updated. Save the draft to retain it."); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "The Phase 2 calculation could not be completed."); }
    finally { setBusy(null); }
  }

  async function save(complete = false) {
    if (!data) { setError("Load a saved Phase 1 case before saving Phase 2."); return; }
    setBusy(complete ? "complete" : "save"); setError(""); setNotice("");
    try { const response = await savePhase2(data.decisionId, payload(), complete); setData(response); setDraft(requestFromPhase2(response)); setNotice(complete ? "Phase 2 completed and audited." : "Phase 2 draft saved."); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "The Phase 2 draft could not be saved."); }
    finally { setBusy(null); }
  }

  const phase2 = data?.phase2;
  const selectedHs = hsResults.find(item => item.id === draft.selectedHsCodeId);
  const initialDutyCurrency = data?.phase1.initialDutyCurrency ?? "ETB";
  const convertedInitialDuty = data ? data.phase1.initialDuty * (draft.targetCurrency === initialDutyCurrency ? 1 : Number(draft.exchangeRate) || 0) : 0;
  const authenticated = Boolean(getSessionAccessToken());

  return <section className="phase-two-workspace">
    <div className="page-heading"><div><p className="eyebrow">OFFICER OPERATIONS · PHASE 2</p><h1>Extend the valuation case</h1><p className="lead">Use the saved Phase 1 result as the starting point for provisional additional taxes, conversions, exemptions, waivers, and adjustments.</p></div><span className={`phase-status phase-status--${phase2?.status?.toLowerCase() ?? "not-started"}`}>{phase2?.status ?? "Not started"}</span></div>
    {!authenticated && <div className="phase-notice phase-notice--warning"><FiAlertTriangle />Sign in as a Customs Officer to load or save a case.</div>}
    <section className="phase2-handoff card"><div><p className="eyebrow">PHASE 1 HANDOFF</p><h2>Open the saved valuation case</h2><p>Phase 2 is linked to one Phase 1 case. The case ID is supplied by the completed Phase 1 workflow.</p></div><form className="case-loader" onSubmit={event => { event.preventDefault(); void loadCase(); }}><label htmlFor="phase2-case-id">Phase 1 case ID</label><div><input id="phase2-case-id" value={caseId} onChange={event => setCaseId(event.currentTarget.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /><button className="secondary-button" type="submit" disabled={busy !== null}>{busy === "load" ? "Loading…" : "Load case"}<FiArrowRight /></button></div></form></section>
    {error && <div className="phase-notice phase-notice--error" role="alert"><FiAlertTriangle />{error}</div>}
    {notice && <div className="phase-notice phase-notice--success" role="status"><FiCheckCircle />{notice}</div>}
    <div className="phase2-grid">
      <div className="phase2-main">
        <section className="card phase2-summary"><div className="panel-heading"><div><p className="eyebrow">SAVED INPUT</p><h2>Phase 1 initial duty</h2></div><span className="snapshot-label">Read-only snapshot</span></div>{data ? <div className="phase2-summary-grid"><div><span>Original HS code ID</span><strong>{data.phase1.hsCodeId}</strong></div><div><span>Initial duty</span><strong>{money(data.phase1.initialDuty, initialDutyCurrency)}</strong></div><div><span>Phase 1 source</span><strong>{data.phase1.source}</strong></div><div><span>Working total</span><strong>{money(convertedInitialDuty, draft.targetCurrency)}</strong></div></div> : <p className="empty-state">Load a Phase 1 case to display its saved duty and evidence context.</p>}</section>
        <section className="card"><div className="panel-heading"><div><p className="eyebrow">CLASSIFICATION</p><h2>Confirm HS code</h2><p>HS-code changes are retained as a Phase 2 selection and flagged for later rule review.</p></div><FiBookOpen className="section-icon" /></div><form className="hs-lookup" onSubmit={findHsCode}><input aria-label="Search HS code" value={hsSearch} onChange={event => setHsSearch(event.currentTarget.value)} placeholder="Search by HS code or description" /><button className="secondary-button" type="submit" disabled={busy !== null}><FiSearch />{busy === "search" ? "Searching…" : "Search"}</button></form>{selectedHs && <div className="selected-hs"><FiCheckCircle /><span><strong>{selectedHs.code}</strong><small>{selectedHs.descriptionEn}</small></span><button type="button" onClick={() => setDraft(current => ({ ...current, selectedHsCodeId: null }))}>Clear</button></div>}<div className="hs-results">{hsResults.map(item => <button type="button" key={item.id} className={item.id === draft.selectedHsCodeId ? "is-selected" : ""} onClick={() => setDraft(current => ({ ...current, selectedHsCodeId: item.id }))}><strong>{item.code}</strong><span>{item.descriptionEn}</span><FiChevronRight /></button>)}</div></section>
        <section className="card"><div className="panel-heading"><div><p className="eyebrow">TAX PLACEHOLDERS</p><h2>Additional taxes</h2><p>Tax names and order are provisional until the approved taxing rules are supplied.</p></div><button className="secondary-button" type="button" onClick={() => setDraft(current => ({ ...current, taxLines: [...current.taxLines, { name: `Tax ${current.taxLines.length + 1}`, calculationType: "Percentage", value: 0, currency: current.targetCurrency, order: current.taxLines.length + 1, calculationBasis: "InitialDuty", notes: "" }] }))}><FiPlus />Add tax</button></div><div className="tax-lines">{draft.taxLines.map((line, index) => <div className="tax-line" key={`${line.order}-${index}`}><div className="tax-line-heading"><strong>{line.name || `Tax ${index + 1}`}</strong><button type="button" aria-label={`Remove ${line.name || `Tax ${index + 1}`}`} onClick={() => setDraft(current => ({ ...current, taxLines: current.taxLines.filter((_, lineIndex) => lineIndex !== index) }))}><FiTrash2 /></button></div><label>Tax name<input value={line.name} onChange={event => updateTax(index, { name: event.currentTarget.value })} placeholder={`Tax ${index + 1}`} /></label><label>Type<select value={line.calculationType} onChange={event => updateTax(index, { calculationType: event.currentTarget.value as "Percentage" | "Fixed" })}><option value="Percentage">Percentage</option><option value="Fixed">Fixed amount</option></select></label><label>{line.calculationType === "Percentage" ? "Rate (%)" : "Amount"}<input type="number" min="0" step="0.01" value={line.value} onChange={event => updateTax(index, { value: Number(event.currentTarget.value) })} /></label><label>Currency<select value={line.currency} onChange={event => updateTax(index, { currency: event.currentTarget.value })}>{currencyOptions.map(currency => <option key={currency}>{currency}</option>)}</select></label><small className="tax-line-note">Current provisional basis: initial duty. Final taxing rules will define the approved basis and order.</small></div>)}</div></section>
        <section className="card"><div className="panel-heading"><div><p className="eyebrow">RELIEF & ADJUSTMENTS</p><h2>Exemptions, waivers, and manual adjustment</h2></div></div><div className="form-grid phase2-form-grid"><label>Exemption amount<input type="number" min="0" step="0.01" value={draft.exemptionAmount} onChange={event => setDraft(current => ({ ...current, exemptionAmount: Number(event.currentTarget.value) }))} /></label><label>Waiver amount<input type="number" min="0" step="0.01" value={draft.waiverAmount} onChange={event => setDraft(current => ({ ...current, waiverAmount: Number(event.currentTarget.value) }))} /></label><label>Manual adjustment type<select value={draft.manualAdjustmentType} onChange={event => setDraft(current => ({ ...current, manualAdjustmentType: event.currentTarget.value as "Fixed" | "Percentage" }))}><option value="Fixed">Fixed amount</option><option value="Percentage">Percentage</option></select></label><label>Manual adjustment value<input type="number" min="0" step="0.01" value={draft.manualAdjustmentAmount} onChange={event => setDraft(current => ({ ...current, manualAdjustmentAmount: Number(event.currentTarget.value) }))} /></label></div><label className="wide-label">Justification and notes<textarea rows={4} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.currentTarget.value }))} placeholder="Record the reason, reference, or supporting note for relief or adjustment." /></label></section>
      </div>
      <aside className="phase2-side">
        <section className="card"><div className="panel-heading"><div><p className="eyebrow">CONVERSION</p><h2>Working currency</h2></div><FiRefreshCw className="section-icon" /></div><label>Target currency<select value={draft.targetCurrency} onChange={event => setDraft(current => ({ ...current, targetCurrency: event.currentTarget.value, taxLines: current.taxLines.map(line => ({ ...line, currency: event.currentTarget.value })) }))}>{currencyOptions.map(currency => <option key={currency}>{currency}</option>)}</select></label>{draft.targetCurrency !== initialDutyCurrency && <><label>Exchange rate<span className="field-hint">{draft.targetCurrency} per {initialDutyCurrency}</span><input type="number" min="0" step="0.000001" value={draft.exchangeRate} onChange={event => setDraft(current => ({ ...current, exchangeRate: Number(event.currentTarget.value) }))} /></label><label>Rate source<input value={draft.exchangeRateSource} onChange={event => setDraft(current => ({ ...current, exchangeRateSource: event.currentTarget.value }))} /></label><label>Rate date<input type="date" value={draft.exchangeRateDate ?? ""} onChange={event => setDraft(current => ({ ...current, exchangeRateDate: event.currentTarget.value || null }))} /></label></>}</section>
        <section className="card calculation-card"><div className="panel-heading"><div><p className="eyebrow">PROVISIONAL RESULT</p><h2>Calculation summary</h2></div></div><dl><div><dt>Initial duty</dt><dd>{data ? money(convertedInitialDuty, draft.targetCurrency) : "—"}</dd></div><div><dt>Additional taxes</dt><dd>{phase2 ? money(phase2.totalAdditionalTax, draft.targetCurrency) : "Calculate to preview"}</dd></div><div><dt>Exemption + waiver</dt><dd>− {money((draft.exemptionAmount || 0) + (draft.waiverAmount || 0), draft.targetCurrency)}</dd></div><div><dt>Manual adjustment</dt><dd>{draft.manualAdjustmentType === "Percentage" ? `${draft.manualAdjustmentAmount || 0}%` : `+ ${money(draft.manualAdjustmentAmount || 0, draft.targetCurrency)}`}</dd></div><div className="calculation-total"><dt>Final total</dt><dd>{phase2 ? money(phase2.finalAmount, draft.targetCurrency) : "—"}</dd></div></dl><small>Amounts are rounded to two decimal places using the provisional Phase 2 rule version.</small></section>
        <div className="phase2-actions"><button className="secondary-button" type="button" disabled={!data || busy !== null} onClick={() => void calculate()}>{busy === "calculate" ? "Calculating…" : <><FiRefreshCw />Calculate</>}</button><button className="primary-link" type="button" disabled={!data || busy !== null} onClick={() => void save(false)}>{busy === "save" ? "Saving…" : <><FiSave />Save draft</>}</button><button className="complete-button" type="button" disabled={!data || busy !== null} onClick={() => void save(true)}>{busy === "complete" ? "Completing…" : <><FiCheckCircle />Complete Phase 2</>}</button></div>
      </aside>
    </div>
  </section>;
}

export default function Dashboard() {
  const [phase, setPhase] = useState<Phase>("one");
  return <><PhaseBar phase={phase} onChange={setPhase} />{phase === "one" ? <PhaseOneOverview /> : <PhaseTwoOverview />}</>;
}
