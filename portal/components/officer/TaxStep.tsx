"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiExternalLink, FiRefreshCw, FiSave, FiSend } from "react-icons/fi";
import { formatMoney } from "@/lib/importer";
import { type OfficerCase } from "@/lib/officer-case";
import { officerNoteIssue } from "@/lib/officer-note-quality";
import { calculatePhase2, loadPhase2, savePhase2 } from "@/lib/phase2Api";
import type { Phase2Request, Phase2Response, Phase2TaxLine, Phase2TaxLineRequest } from "@/lib/types/customs";

const categories = ["General goods", "Food", "Textile / garment", "Alcoholic beverage", "Non-alcoholic beverage", "Tobacco", "Plastic bag", "Motor vehicle", "Fertilizer", "Petroleum", "Lubricants", "Capital goods", "Manufacturing input", "Aircraft", "Other"];
const exemptionOptions: [string, string, string?][] = [
  ["CUSTOMS_DUTY_EXEMPT", "Customs duty exemption", "CUSTOMS_DUTY_EXEMPTION"],
  ["MACHINERY_EQUIPMENT_EXEMPT", "Qualifying machinery (duty and VAT)", "MACHINERY_EXEMPTION"],
  ["VAT_EXEMPT", "VAT exemption", "VAT_EXEMPTION"],
  ["WITHHOLDING_NOT_APPLICABLE", "Withholding not applicable", "WITHHOLDING_REVIEW"],
  ["SURTAX_EXEMPT", "Surtax exemption"], ["SOCIAL_WELFARE_EXEMPT", "Social welfare levy exemption"],
  ["TAX_EXEMPT", "General tax exemption"], ["DIPLOMATIC", "Diplomatic goods"],
];
const exciseUnits = ["Pieces (PCS)", "Kilograms (KG)", "Litres (L)", "Pack (20 sticks)"];
const basisLabels: Record<string, string> = { CIF: "Customs value", CIFPlusDuty: "Value + duty", CIFPlusDutyPlusExcise: "Value + duty + excise", CIFPlusDutyPlusExcisePlusSurtax: "Value + duty + excise + surtax", UNIT_RATE_ETB: "Quantity × ETB rate", UNIT_RATE_ETB_GREATER_OF: "Compared with % excise" };
const statusLabels: Record<string, string> = { Recommended: "From tariff", OfficerAdjusted: "Adjusted", NotApplicable: "Not applicable", ReviewRequired: "Needs review", Exempt: "Exempt", Pending: "Pending" };
const ASSESSMENT_CURRENCY = "ETB";
type Edit = { value?: number; isApplicable?: boolean };

export function TaxStep({ data, onSaved, onError }: { data: OfficerCase; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const d = data.declaration;
  const decisionId = data.valuation?.id ?? "";
  const [response, setResponse] = useState<Phase2Response | null>(null);
  const [draft, setDraft] = useState<Phase2Request | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState<"" | "draft" | "final">("");
  const [confirmed, setConfirmed] = useState(false);
  const [loadError, setLoadError] = useState("");
  const serial = useRef(0);

  const lines = response?.phase2?.taxLines ?? [];
  const requestLines = useCallback((source: Phase2TaxLine[], pending: Record<string, Edit>): Phase2TaxLineRequest[] =>
    source.filter(line => line.status === "OfficerAdjusted" || pending[line.name]).map(line => ({
      name: line.name, calculationType: line.calculationType, value: pending[line.name]?.value ?? line.value, currency: line.currency, order: line.order,
      calculationBasis: line.calculationBasis, notes: "", isApplicable: pending[line.name]?.isApplicable ?? line.isApplicable,
      status: line.status === "OfficerAdjusted" || pending[line.name] ? "OfficerAdjusted" : line.status,
    })), []);

  const calculate = useCallback(async (next: Phase2Request) => {
    const current = ++serial.current; setCalculating(true);
    try {
      const result = await calculatePhase2(decisionId, next);
      if (current !== serial.current) return;
      setResponse(result); setEdits({});
    } catch (reason) { if (current === serial.current) onError(reason instanceof Error ? reason.message : "The taxes could not be calculated."); }
    finally { if (current === serial.current) setCalculating(false); }
  }, [decisionId, onError]);

  useEffect(() => {
    if (!decisionId) return;
    let active = true;
    void loadPhase2(decisionId).then(result => {
      if (!active) return;
      const saved = result.phase2;
      const base: Phase2Request = {
        selectedHsCodeId: data.confirmedLine?.hsCodeId ?? result.phase1.hsCodeId, targetCurrency: ASSESSMENT_CURRENCY, exchangeRate: 1, exchangeRateSource: "Customs value set in ETB", exchangeRateDate: null,
        exemptionAmount: saved?.exemptionAmount ?? 0, waiverAmount: saved?.waiverAmount ?? 0, manualAdjustmentAmount: saved?.manualAdjustmentAmount ?? 0, manualAdjustmentType: saved?.manualAdjustmentType ?? "Fixed",
        notes: saved?.notes ?? "", taxLines: [], customsValueAmount: data.valuation?.selectedReferenceValue ?? result.phase1.initialDuty, customsValueCurrency: ASSESSMENT_CURRENCY,
        quantity: saved?.quantity || Number(d.quantity) || 1, unit: (saved?.unit || d.unit || "Pieces (PCS)").slice(0, 40), originCountry: d.originCountryCode,
        productCategory: saved?.productCategory || (d.importPurpose === "MANUFACTURING" ? "Manufacturing input" : "General goods"), exemptionCodes: saved?.exemptionCodes ?? [],
        originPreferenceClaimed: saved?.originPreferenceClaimed ?? false, exciseTaxApplicable: false, isCommercialImport: saved?.isCommercialImport ?? (d.isCommercialProduct || d.importPurpose === "COMMERCIAL_RESALE"),
        withholdingApplicable: saved?.withholdingApplicable ?? true, adjustmentReason: saved?.adjustmentReason ?? "", officerConfirmation: false, expectedVersion: saved?.version,
      };
      base.taxLines = saved ? requestLines(saved.taxLines, {}) : [];
      setDraft(base); setResponse(result);
      void calculate(base);
    }).catch(reason => { if (active) setLoadError(reason instanceof Error ? reason.message : "The assessment could not be opened."); });
    return () => { active = false; };
  // The case is loaded once per valuation; later edits recalculate explicitly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionId, data.confirmedLine?.hsCodeId]);

  function update(patch: Partial<Phase2Request>) {
    if (!draft) return;
    const next = { ...draft, ...patch, taxLines: requestLines(lines, edits) };
    setDraft(next); void calculate(next);
  }
  function editLine(name: string, edit: Edit, recalc: boolean) {
    const pending = { ...edits, [name]: { ...edits[name], ...edit } };
    setEdits(pending);
    if (recalc && draft) { const next = { ...draft, taxLines: requestLines(lines, pending) }; setDraft(next); void calculate(next); }
  }

  async function save(complete: boolean) {
    if (!draft) return;
    const notesIssue = officerNoteIssue(draft.notes);
    if (notesIssue) { onError(notesIssue); return; }
    const dutyExemption = draft.exemptionCodes.some(code => code === "CUSTOMS_DUTY_EXEMPT" || code === "MACHINERY_EQUIPMENT_EXEMPT");
    if (complete && dutyExemption && draft.notes.trim().length < 10) { onError("Record the authority and evidence for the duty exemption in the assessment note."); document.getElementById("oc-tax-note")?.focus(); return; }
    if (complete && !confirmed) { onError("Tick the confirmation before finalising."); return; }
    setSaving(complete ? "final" : "draft");
    try {
      const payload = { ...draft, taxLines: requestLines(lines, edits), officerConfirmation: complete, expectedVersion: response?.phase2?.version ?? draft.expectedVersion };
      const result = await savePhase2(decisionId, payload, complete);
      setResponse(result); setEdits({}); setDraft({ ...payload, expectedVersion: result.phase2?.version });
      await onSaved(complete ? `Assessment finalised. ${d.reference} is assessed and the importer has been notified.` : "Assessment draft saved.");
    } catch (reason) { onError(reason instanceof Error ? reason.message : "The assessment could not be saved."); }
    finally { setSaving(""); }
  }

  if (!decisionId) return <div className="oc-callout is-warning"><FiAlertTriangle aria-hidden="true" />Record the customs value before assessing taxes.</div>;
  if (data.valuation && !data.valuation.ownedByMe) return <div className="oc-callout is-info"><FiAlertTriangle aria-hidden="true" /><div><strong>Assessment held by another officer</strong><p>The officer who recorded the customs value completes this assessment. Customs value: {formatMoney(data.valuation.selectedReferenceValue, data.valuation.currency)}.</p></div></div>;
  if (loadError) return <div className="oc-callout is-danger"><FiAlertTriangle aria-hidden="true" />{loadError}</div>;
  if (!draft) return <div className="oc-card"><p className="oc-muted" role="status">Opening the assessment…</p></div>;

  const phase = response?.phase2;
  const customsValue = phase?.customsValueAmount ?? draft.customsValueAmount;
  const payable = phase ? Math.max(0, phase.finalAmount - phase.customsValueAmount) : null;
  const unresolved = lines.some(line => line.status === "ReviewRequired" && line.isApplicable);
  const hasSpecificExcise = lines.some(line => line.name === "Excise Tax (specific)");
  const requested = new Set(d.requestedTreatments);

  return <div className="oc-step-grid oc-tax-layout">
    <section className="oc-card" aria-labelledby="oc-tax-title">
      <header className="oc-card-head"><div><span className="oc-eyebrow">Duties and taxes · ERCA tariff {data.confirmedLine?.tariffItemNo}</span><h2 id="oc-tax-title">Tax assessment</h2>
        <p className="oc-muted">Rates come from the tariff line. Change a rate or switch a tax off only with a legal basis; the change is recorded in the audit trail.</p></div>
        <button type="button" className="oc-icon-button" onClick={() => void calculate({ ...draft, taxLines: requestLines(lines, edits) })} aria-label="Recalculate" title="Recalculate"><FiRefreshCw aria-hidden="true" className={calculating ? "oc-spin" : ""} /></button></header>
      <div className="oc-table-wrap"><table className="oc-tax-table">
        <thead><tr><th scope="col">Applies</th><th scope="col">Duty or tax</th><th scope="col">Calculated on</th><th scope="col">Rate</th><th scope="col">Amount</th></tr></thead>
        <tbody>{lines.map(line => { const edit = edits[line.name]; const applies = edit?.isApplicable ?? line.isApplicable; const comparison = line.calculationBasis === "UNIT_RATE_ETB_GREATER_OF";
          return <tr key={line.name} className={applies ? "" : "is-off"}>
            <td><input type="checkbox" checked={applies} aria-label={`${line.name} applies`} onChange={event => editLine(line.name, { isApplicable: event.target.checked }, true)} disabled={calculating} /></td>
            <td><strong>{line.name}</strong><span className={`oc-tax-status is-${line.status.toLowerCase()}`}>{statusLabels[line.status] ?? line.status}</span>
              <small title={line.notes}>{line.notes}</small>{line.sourceReference?.startsWith("http") && <a href={line.sourceReference} target="_blank" rel="noopener noreferrer" className="oc-source-link">Source <FiExternalLink aria-hidden="true" /></a>}</td>
            <td>{basisLabels[line.calculationBasis] ?? line.calculationBasis}<small>{line.calculationType === "PerUnit" ? `${line.baseAmount} units` : formatMoney(line.baseAmount, ASSESSMENT_CURRENCY)}</small></td>
            <td><span className="oc-rate-input"><input type="number" min="0" step="0.01" value={edit?.value ?? line.value} disabled={!applies || calculating} aria-label={`${line.name} rate`}
              onChange={event => editLine(line.name, { value: Number(event.target.value) }, false)} onBlur={() => { if (edits[line.name]?.value != null && edits[line.name]?.value !== line.value) void calculate({ ...draft, taxLines: requestLines(lines, edits) }); }} />
              <span>{line.calculationType === "PerUnit" ? "ETB/unit" : line.calculationType === "Fixed" ? "ETB" : "%"}</span></span>
              {line.recommendedValue !== line.value && <small>Tariff: {line.recommendedValue}{line.calculationType === "Percentage" ? "%" : ""}</small>}</td>
            <td className="oc-amount">{comparison ? <small>comparison only</small> : formatMoney(applies ? line.calculatedAmount : 0, ASSESSMENT_CURRENCY)}</td>
          </tr>; })}</tbody>
        <tfoot><tr><th scope="row" colSpan={4}>Total duties and taxes</th><td className="oc-amount">{formatMoney(phase?.totalTax ?? null, ASSESSMENT_CURRENCY)}</td></tr></tfoot>
      </table></div>
      {unresolved && <p className="oc-callout is-warning"><FiAlertTriangle aria-hidden="true" />A tax needs review: enter the approved rate or switch it off before finalising.</p>}
    </section>

    <aside className="oc-tax-side">
      <section className="oc-card oc-total-card" aria-label="Assessment totals">
        <dl>
          <div><dt>Customs value (CIF)</dt><dd>{formatMoney(customsValue, ASSESSMENT_CURRENCY)}</dd></div>
          <div><dt>Duties and taxes</dt><dd>{formatMoney(phase?.totalTax ?? null, ASSESSMENT_CURRENCY)}</dd></div>
          {(draft.exemptionAmount > 0 || draft.waiverAmount > 0 || draft.manualAdjustmentAmount !== 0) && <div><dt>Exemptions / adjustments</dt><dd>{formatMoney(-(draft.exemptionAmount + draft.waiverAmount) + draft.manualAdjustmentAmount, ASSESSMENT_CURRENCY)}</dd></div>}
          <div className="is-total"><dt>Payable by importer</dt><dd>{calculating ? "Calculating…" : formatMoney(payable, ASSESSMENT_CURRENCY)}</dd></div>
        </dl>
      </section>

      <section className="oc-card oc-tax-settings" aria-labelledby="oc-tax-settings">
        <h3 id="oc-tax-settings" className="oc-subtitle">Assessment settings</h3>
        <label className="oc-field">Product category<select value={draft.productCategory} onChange={event => update({ productCategory: event.target.value })}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
        {hasSpecificExcise && <label className="oc-field">Unit for specific excise<select value={draft.unit} onChange={event => update({ unit: event.target.value })}>{[...new Set([draft.unit, ...exciseUnits])].map(item => <option key={item}>{item}</option>)}</select></label>}
        <label className="oc-toggle"><input type="checkbox" checked={draft.isCommercialImport} onChange={event => update({ isCommercialImport: event.target.checked })} />Commercial import (withholding applies)</label>
        <fieldset className="oc-checks oc-exemptions"><legend>Exemptions <small>only with a legal basis</small></legend>
          {exemptionOptions.map(([code, label, claim]) => <label key={code}><input type="checkbox" checked={draft.exemptionCodes.includes(code)}
            onChange={event => update({ exemptionCodes: event.target.checked ? [...draft.exemptionCodes, code] : draft.exemptionCodes.filter(item => item !== code) })} />
            {label}{claim && requested.has(claim) && <span className="oc-claim">requested</span>}</label>)}</fieldset>
        <label className="oc-field" htmlFor="oc-tax-note">Assessment note <small>{draft.exemptionCodes.length ? "authority and evidence for exemptions" : "optional"}</small>
          <textarea id="oc-tax-note" rows={3} maxLength={500} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} placeholder="e.g. Duty exemption under investment permit 123/2026." /></label>
      </section>

      <section className="oc-card oc-decision">
        <label className="oc-toggle is-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm the classification, customs value and rates. The importer will be issued this assessment.</label>
        <div className="oc-actions is-stacked">
          <button type="button" className="oc-btn is-primary" disabled={Boolean(saving) || calculating || !confirmed || unresolved} onClick={() => void save(true)}><FiSend aria-hidden="true" />{saving === "final" ? "Finalising…" : d.status === "ASSESSED" ? "Issue revised assessment" : "Finalise and notify importer"}</button>
          <button type="button" className="oc-btn" disabled={Boolean(saving) || calculating} onClick={() => void save(false)}><FiSave aria-hidden="true" />{saving === "draft" ? "Saving…" : "Save draft"}</button>
        </div>
        {phase?.officerConfirmed && <p className="oc-muted"><FiCheckCircle aria-hidden="true" /> A confirmed assessment is on record.</p>}
      </section>
    </aside>
  </div>;
}
