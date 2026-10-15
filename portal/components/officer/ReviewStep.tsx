"use client";

import { useState } from "react";
import { FiAlertTriangle, FiArrowRight, FiCheck, FiClock, FiMessageSquare, FiSlash, FiXCircle } from "react-icons/fi";
import { HsClassificationCard, optionToLine } from "@/components/officer/HsClassificationCard";
import { formatMoney, purposeLabels, type TariffOption } from "@/lib/importer";
import { lineCode, lineTitle, readableTariffText, reviewDeclaration, type OfficerCase, type TariffLineView } from "@/lib/officer-case";
import { splitDescription } from "@/lib/declaration-description";

const treatmentLabels: Record<string, string> = { WITHHOLDING_REVIEW: "Withholding tax review", VAT_EXEMPTION: "VAT exemption", CUSTOMS_DUTY_EXEMPTION: "Customs duty exemption", MACHINERY_EXEMPTION: "Machinery / equipment exemption" };
const checks = [
  "Commercial invoice shows the declared price, quantity and seller",
  "Packing list matches the goods and quantity declared",
  "Certificate of origin matches the declared country of origin",
  "The item description supports the selected tariff line",
];

export function ReviewStep({ data, onSaved, onError }: { data: OfficerCase; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const d = data.declaration;
  const [pending, setPending] = useState<TariffLineView | null>(null);
  const [note, setNote] = useState("");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const actions = data.allowedActions;
  const deciding = actions.some(action => ["APPROVE_FOR_VALUATION", "REQUEST_INFORMATION", "REJECT", "CONTINUE_ASSESSMENT"].includes(action));
  const submitted = d.status === "SUBMITTED";
  const line = submitted ? pending ?? data.confirmedLine ?? data.suggestedLine : data.confirmedLine ?? data.suggestedLine;
  const source = submitted ? pending ? "pending" : data.confirmedLine ? "officer" : "importer" : data.confirmedLine ? "officer" : "importer";
  const declaredTotal = (d.invoiceAmount ?? 0) + (d.freightAmount ?? 0) + (d.insuranceAmount ?? 0);
  const allTicked = checks.every(item => ticked[item]);

  async function act(action: string, message: string, options: { tariffLineId?: string | null; note?: string } = {}) {
    setBusy(true); setFieldError("");
    try { await reviewDeclaration(d.id, action, d.version, options); setPending(null); setNote(""); await onSaved(message); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "The decision could not be saved."); }
    finally { setBusy(false); }
  }

  function changeLine(option: TariffOption, reason: string) {
    if (submitted) { setPending(optionToLine(option)); return; }
    void act("RECLASSIFY", `Reclassified to ${readableTariffText(option.description, option.hsDescription)} (${option.tariffItemNo || option.hsCode}). The importer has been notified.`, { tariffLineId: option.tariffLineId, note: reason });
  }

  function needsReason(label: string) {
    if (note.trim().length >= 10) return false;
    setFieldError(`Write at least 10 characters telling the importer why you ${label}.`);
    document.getElementById("oc-review-note")?.focus();
    return true;
  }

  const described = splitDescription(d.description);
  const facts: [string, React.ReactNode][] = [
    ...([["Brand / model", [d.brand, d.model].filter(Boolean).join(" / ").replace("Generic / Generic", "No brand (generic goods)")], ["Manufacturer", d.manufacturer], ["Serial / part no.", d.serialOrPartNumber]] as [string, string][])
      .filter(([, value]) => value?.trim()),
    ["Quantity", `${d.quantity} ${d.unit}`], ...described.facts, ["Country of origin", d.originCountryName], ["Purpose", purposeLabels[d.importPurpose] ?? d.importPurpose],
    ["Price paid", <b key="p">{formatMoney(d.invoiceAmount, d.invoiceCurrency)}</b>], ["Freight / insurance", `${formatMoney(d.freightAmount ?? 0, d.invoiceCurrency)} / ${formatMoney(d.insuranceAmount ?? 0, d.invoiceCurrency)}`],
    ["Declared CIF value", <b key="c">{formatMoney(declaredTotal, d.invoiceCurrency)}</b>], ["Receiving branch", data.branch ? data.branch.displayName || data.branch.name : "—"],
  ];

  return <div className="oc-step-grid">
    {d.status === "INFORMATION_REQUESTED" && <div className="oc-callout is-warning"><FiClock aria-hidden="true" /><div><strong>Waiting for the importer</strong><p>You asked: “{d.reviewNote}”. The declaration returns to this queue when they resubmit.</p></div></div>}
    {d.status === "REJECTED" && <div className="oc-callout is-danger"><FiXCircle aria-hidden="true" /><div><strong>Rejected</strong><p>{d.reviewNote}</p></div></div>}

    <section className="oc-card" aria-labelledby="oc-goods-title">
      <header className="oc-card-head"><div><span className="oc-eyebrow">Declared goods</span><h2 id="oc-goods-title">{d.productName}</h2></div></header>
      <dl className="oc-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {described.details && <><h3 className="oc-subtitle">{described.facts.length ? "Importer's notes" : "Item description"}</h3><p className="oc-prose">{described.details}</p></>}
      {d.specifications && <><h3 className="oc-subtitle">Specifications</h3><p className="oc-prose">{d.specifications}</p></>}
      {d.purposeDetails && <><h3 className="oc-subtitle">Purpose details</h3><p className="oc-prose">{d.purposeDetails}</p></>}
      {d.importPurpose === "MANUFACTURING" && <div className="oc-callout is-info"><FiAlertTriangle aria-hidden="true" /><div><strong>{d.isMachineryOrEquipment ? "Manufacturing: machinery or equipment" : "Manufacturing: production inputs"}</strong>
        <p>{d.isMachineryOrEquipment
          ? "Declared as capital goods for production. The tax assessment applies the capital-goods exemption (duty, VAT, social welfare levy) and no withholding by default; check the investment permit before finalising."
          : "Declared as production inputs. The tax assessment drops the import withholding; duty and VAT apply at the tariff rates."}</p></div></div>}
      {d.requestedTreatments.length > 0 && <div className="oc-callout is-info"><FiAlertTriangle aria-hidden="true" /><div><strong>Importer requests special treatment</strong>
        <p>{d.requestedTreatments.map(code => treatmentLabels[code] ?? code).join(" · ")}. These are claims only; decide on them in the tax assessment.</p></div></div>}
    </section>

    <HsClassificationCard line={line} source={source} productName={d.productName} description={d.description} busy={busy}
      editable={actions.includes("RECLASSIFY")} askNote={!submitted} onChange={changeLine} />

    {deciding && <section className="oc-card oc-decision" aria-labelledby="oc-decision-title">
      <header className="oc-card-head"><div><span className="oc-eyebrow">Officer decision</span><h2 id="oc-decision-title">{submitted ? "Accept the declaration?" : "Continue the declaration"}</h2></div></header>
      {submitted && <fieldset className="oc-checks"><legend>Before approving, confirm against the documents</legend>
        {checks.map(item => <label key={item}><input type="checkbox" checked={!!ticked[item]} onChange={event => setTicked(state => ({ ...state, [item]: event.target.checked }))} />{item}</label>)}</fieldset>}
      <label className="oc-field" htmlFor="oc-review-note">Note to the importer <small>required to request information or reject</small>
        <textarea id="oc-review-note" rows={3} maxLength={2000} value={note} onChange={event => { setNote(event.target.value); setFieldError(""); }} placeholder="e.g. The invoice total does not match the declared price. Upload the final signed invoice." /></label>
      {fieldError && <p className="oc-inline-error" role="alert">{fieldError}</p>}
      <div className="oc-actions">
        {actions.includes("APPROVE_FOR_VALUATION") && <button type="button" className="oc-btn is-primary" disabled={busy || !allTicked || !line || line.retired}
          onClick={() => void act("APPROVE_FOR_VALUATION", `Approved under ${lineTitle(line)} (${lineCode(line)}). Continue with valuation.`, { tariffLineId: line?.tariffLineId, note: note.trim() })}>
          <FiCheck aria-hidden="true" />Approve and start valuation<FiArrowRight aria-hidden="true" /></button>}
        {actions.includes("CONTINUE_ASSESSMENT") && <button type="button" className="oc-btn is-primary" disabled={busy} onClick={() => void act("CONTINUE_ASSESSMENT", "Moved to valuation.")}><FiArrowRight aria-hidden="true" />Start valuation</button>}
        {actions.includes("REQUEST_INFORMATION") && <button type="button" className="oc-btn" disabled={busy} onClick={() => { if (!needsReason("need more information")) void act("REQUEST_INFORMATION", "Information requested. The importer has been notified.", { note: note.trim() }); }}><FiMessageSquare aria-hidden="true" />Request information</button>}
        {actions.includes("REJECT") && <button type="button" className="oc-btn is-danger" disabled={busy} onClick={() => { if (!needsReason("rejected the declaration") && window.confirm(`Reject ${d.reference}? The importer will see your note.`)) void act("REJECT", `${d.reference} was rejected. The importer has been notified.`, { note: note.trim() }); }}><FiSlash aria-hidden="true" />Reject</button>}
      </div>
      {submitted && !allTicked && <small className="oc-muted">Tick every check to enable approval.</small>}
    </section>}
  </div>;
}
