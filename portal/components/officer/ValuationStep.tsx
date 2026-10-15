"use client";

import { useMemo, useState } from "react";
import { FiAlertTriangle, FiArrowRight } from "react-icons/fi";
import { fetchDocumentBlob } from "@/components/ImporterDocumentPreview";
import { ASSESSMENT_CURRENCY, ValuationEvidence, type EvidenceChoice, type EvidenceInput } from "@/components/valuation/ValuationEvidence";
import { formatMoney, importerApi } from "@/lib/importer";
import { lineCode, type OfficerCase } from "@/lib/officer-case";
import { officerNoteIssue } from "@/lib/officer-note-quality";
import { workspaceApi } from "@/lib/workspace";

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

/** Invoice terms the portal records in the description ("Invoice terms: FOB."). */
function incotermOf(description: string) { return /Invoice terms: ([A-Z]+)/.exec(description)?.[1]; }

export function ValuationStep({ data, onSaved, onError }: { data: OfficerCase; onSaved: (message: string) => Promise<void>; onError: (message: string) => void }) {
  const d = data.declaration;
  const line = data.confirmedLine;
  const [choice, setChoice] = useState<EvidenceChoice | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const noteIssue = officerNoteIssue(note);
  const noteRequired = choice ? !choice.fobBased : false;

  const input = useMemo<EvidenceInput>(() => ({
    productQuery: [d.brand, d.model].filter(value => value && value !== "Generic").join(" ") || d.productName,
    quantity: Number(d.quantity) || 1, unit: d.unit, hsCode: line?.hsCode ?? "", tariffLabel: line ? lineCode(line) : "",
    originCountryCode: d.originCountryCode, originCountryName: d.originCountryName,
    declared: d.invoiceAmount ? { amount: d.invoiceAmount, currency: d.invoiceCurrency, freight: d.freightAmount ?? 0, insurance: d.insuranceAmount ?? 0, incoterm: incotermOf(d.description), documentLabel: "commercial invoice" } : null,
  }), [d, line]);

  async function save() {
    if (!line) { onError("Confirm the HS classification before valuation."); return; }
    if (!data.canValue) { onError("Only an officer assigned to this declaration's branch can value it."); return; }
    if (!choice?.value || choice.value <= 0) { onError("Choose a customs value with an amount in ETB."); return; }
    if (noteIssue) { onError(noteIssue); return; }
    if (noteRequired && note.trim().length < 10) { onError("FOB is the standard basis. Explain in the note why another value was used."); document.getElementById("oc-valuation-note")?.focus(); return; }
    const invoice = d.documents.find(document => document.kind === "COMMERCIAL_INVOICE");
    if (!invoice || !d.invoiceAmount) { onError("The declaration has no commercial invoice or declared price."); return; }
    if (invoice.size > MAX_RECEIPT_BYTES) { onError("The commercial invoice is larger than 8 MB, which the valuation record cannot store. Ask the importer for a smaller file."); return; }
    setSaving(true);
    try {
      const blob = await fetchDocumentBlob(`/importer-declarations/${d.id}/documents/COMMERCIAL_INVOICE`);
      const evidence = {
        ...choice.evidence, product: d.productName, hsCode: lineCode(line), nationalCode: line.nationalCode, tariffLineId: line.tariffLineId,
        importPurpose: d.importPurpose, isMachineryOrEquipment: d.isMachineryOrEquipment, productType: d.importPurpose === "MANUFACTURING" ? "MANUFACTURING" : "COMMODITY",
        importerDeclaration: { id: d.id, reference: d.reference, purpose: d.importPurpose, originCountryCode: d.originCountryCode, originCountryName: d.originCountryName, requestedTreatments: d.requestedTreatments },
      };
      const form = new FormData();
      form.append("importerDeclarationId", d.id); form.append("hsCodeId", line.hsCodeId); form.append("locationId", d.locationId);
      form.append("selectedReferenceValue", String(choice.value)); form.append("currency", ASSESSMENT_CURRENCY);
      form.append("decision", `Customs value for ${d.reference}: ${d.productName}`); form.append("justification", note.trim());
      form.append("evidence", JSON.stringify(evidence)); form.append("productName", d.productName.slice(0, 300));
      form.append("purchaseCountryCode", d.originCountryCode); form.append("selectedPriceSource", choice.apiSource); form.append("valuationMethod", choice.methodName);
      if (choice.photoUrl) form.append("productPhotoUrl", choice.photoUrl);
      form.append("declaredPriceAmount", String(d.invoiceAmount)); form.append("declaredPriceCurrency", d.invoiceCurrency);
      if (choice.key === "declared") {
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

  return <div className="oc-step-grid">
    <section className="oc-card" aria-labelledby="oc-evidence-title">
      <header className="oc-card-head"><div><span className="oc-eyebrow">Price evidence</span><h2 id="oc-evidence-title">Choose the customs value</h2><p className="oc-muted">Gathered automatically for the whole shipment of {d.quantity} {d.unit}, converted to ETB. FOB plus freight and insurance is the standard basis.</p></div></header>
      <ValuationEvidence input={input} onChange={setChoice} />
    </section>

    <section className="oc-card oc-decision" aria-labelledby="oc-value-title">
      <header className="oc-card-head"><div><span className="oc-eyebrow">Customs value</span><h2 id="oc-value-title">{choice?.value != null ? formatMoney(choice.value, ASSESSMENT_CURRENCY) : "Choose a value"}</h2><p className="oc-muted">{choice?.methodName}</p></div></header>
      <label className="oc-field" htmlFor="oc-valuation-note">Valuation note {noteRequired ? <small>required — FOB is the standard basis</small> : <small>optional</small>}
        <textarea id="oc-valuation-note" rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder={noteRequired ? "e.g. Invoice price is 40% below comparable market offers; market median applied." : "Optional note for the record"} /></label>
      {noteIssue && <p className="oc-inline-error" role="alert">{noteIssue}</p>}
      {!data.canValue && <p className="oc-callout is-warning"><FiAlertTriangle aria-hidden="true" />Your assigned office is not this declaration&apos;s branch, so you can review it but not value it.</p>}
      <div className="oc-actions"><button type="button" className="oc-btn is-primary" disabled={saving || !choice?.value || !data.canValue} onClick={() => void save()}>{saving ? "Recording value…" : "Record value and assess taxes"}<FiArrowRight aria-hidden="true" /></button></div>
    </section>
  </div>;
}
