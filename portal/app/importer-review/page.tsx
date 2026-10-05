"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ImporterDocumentPreview } from "@/components/ImporterDocumentPreview";
import { importerApi, type ImporterDeclaration, type TariffOption } from "@/lib/importer";
import { getPhase2HsCode } from "@/lib/phase2Api";
import type { HsCode } from "@/lib/types/customs";

type Summary = Pick<ImporterDeclaration, "id" | "reference" | "status" | "productName" | "originCountryName" | "submittedAt">;
const treatmentLabels: Record<string, string> = {
  WITHHOLDING_REVIEW: "Withholding tax review", VAT_EXEMPTION: "VAT exemption review",
  CUSTOMS_DUTY_EXEMPTION: "Customs duty exemption review", MACHINERY_EXEMPTION: "Machinery / equipment exemption review",
};

export default function ImporterReviewPage() {
  const [items, setItems] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<ImporterDeclaration | null>(null);
  const [resolvedHsCode, setResolvedHsCode] = useState<HsCode | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(""); const [tariffSearch, setTariffSearch] = useState("");
  const [candidates, setCandidates] = useState<TariffOption[]>([]); const [confirmedLine, setConfirmedLine] = useState("");
  const load = useCallback(async () => {
    try { setItems(await importerApi<Summary[]>("/importer-declarations")); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Queue unavailable."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    const hsCodeId = selected?.confirmedHsCodeId ?? selected?.suggestedHsCodeId;
    if (!hsCodeId) { setResolvedHsCode(null); return; }
    setResolvedHsCode(null);
    void getPhase2HsCode(hsCodeId)
      .then(code => { if (!cancelled) setResolvedHsCode(code); })
      .catch(() => { if (!cancelled) setResolvedHsCode(null); });
    return () => { cancelled = true; };
  }, [selected?.confirmedHsCodeId, selected?.suggestedHsCodeId]);
  useEffect(() => {
    if (!selected || tariffSearch.trim().length < 2) { setCandidates([]); return; }
    const timer = window.setTimeout(() => {
      void importerApi<{ items: TariffOption[] }>(`/importer-declarations/catalog?${new URLSearchParams({ stage: "tariffs", q: tariffSearch.trim() })}`)
        .then(result => setCandidates(result.items)).catch(reason => setError(String(reason)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [selected, tariffSearch]);
  async function open(id: string) {
    setError(""); setNotice("");
    try {
      const declaration = await importerApi<ImporterDeclaration>(`/importer-declarations/${id}`);
      setSelected(declaration); setConfirmedLine(declaration.confirmedTariffLineId ?? declaration.suggestedTariffLineId);
      setTariffSearch(""); setNote(declaration.reviewNote ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Declaration unavailable."); }
  }
  async function review(action: string) {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await importerApi<ImporterDeclaration>(`/importer-declarations/${selected.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirmedTariffLineId: action === "APPROVE_INFORMATION" ? confirmedLine : null, note, expectedVersion: selected.version }),
      });
      setSelected(result); setNotice(`${result.reference}: ${result.status.replaceAll("_", " ").toLowerCase()}.`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Review could not be saved."); }
    finally { setBusy(false); }
  }
  return <div className="importer-review-page"><div className="importer-intro"><p className="importer-eyebrow">CUSTOMS OFFICER</p><h1>Importer submissions</h1><p>Review item details and mandatory documents. Confirm the tariff line before the declaration enters valuation and tax assessment.</p></div>
    {error && <div className="importer-error" role="alert">{error}</div>}{notice && <div className="importer-success" role="status">{notice}</div>}
    <div className="importer-review-grid"><section className="importer-card"><h2>Branch queue</h2>{items.length ? <ul className="importer-list">{items.map(item => <li key={item.id}><strong>{item.productName}</strong><span>{item.reference} · {item.originCountryName}</span><small>{item.status.replaceAll("_", " ")} · {new Date(item.submittedAt).toLocaleDateString()}</small><button type="button" onClick={() => void open(item.id)}>Review details</button></li>)}</ul> : <p>No importer submissions are assigned to your branch.</p>}</section>
      <section className="importer-card">{selected ? <><p className="importer-eyebrow">{selected.reference}</p><h2>{selected.productName}</h2><p><strong>Status:</strong> {selected.status.replaceAll("_", " ")}</p>
        <dl className="importer-item-classification"><div><dt>Item description</dt><dd>{selected.description}</dd></div><div><dt>{selected.confirmedHsCodeId ? "Confirmed HS code" : "Suggested HS code"}</dt><dd>{resolvedHsCode?.tariffItemNo || resolvedHsCode?.code || (selected.confirmedHsCodeId || selected.suggestedHsCodeId ? "Loading HS code…" : "Not assigned")}</dd></div></dl>
        <dl className="importer-detail-grid"><div><dt>Country of origin</dt><dd>{selected.originCountryName}</dd></div><div><dt>Purpose</dt><dd>{selected.importPurpose.replaceAll("_", " ")}</dd></div><div><dt>Quantity</dt><dd>{selected.quantity} {selected.unit}</dd></div><div><dt>Provisional tariff description</dt><dd>{selected.suggestedTariffDescription}</dd></div><div><dt>Brand / model</dt><dd>{selected.brand || "—"} / {selected.model || "—"}</dd></div><div><dt>Manufacturer</dt><dd>{selected.manufacturer || "—"}</dd></div><div><dt>Serial / part number</dt><dd>{selected.serialOrPartNumber || "—"}</dd></div><div><dt>Machinery / equipment</dt><dd>{selected.isMachineryOrEquipment ? "Claimed by importer" : "No"}</dd></div></dl>
        {selected.specifications && <p><strong>Specifications:</strong> {selected.specifications}</p>}{selected.purposeDetails && <p><strong>Purpose details:</strong> {selected.purposeDetails}</p>}
        <h3>Potential tax treatment</h3>{selected.requestedTreatments.length ? <ul>{selected.requestedTreatments.map(code => <li key={code}>{treatmentLabels[code] ?? code}</li>)}</ul> : <p>No special treatment requested.</p>}<p className="importer-disclaimer">These are importer claims. Apply an exemption only after checking the governing rule and evidence in the officer assessment workflow.</p>
        <h3>Documents</h3><div className="importer-review-documents">{selected.documents.map(document => <div key={document.kind}><strong>{document.kind.replaceAll("_", " ")}</strong><small>{document.fileName} · {(document.size / 1024).toFixed(0)} KB</small><ImporterDocumentPreview declarationId={selected.id} kind={document.kind} label={document.kind.replaceAll("_", " ")} contentType={document.contentType} /></div>)}</div>
        {selected.status === "SUBMITTED" && <div className="importer-officer-actions"><h3>HS mapping and review</h3><label>Search current tariff descriptions<input value={tariffSearch} onChange={e => setTariffSearch(e.target.value)} placeholder="Search by keyword or HS code" /></label>
          <label>Confirmed tariff item<select value={confirmedLine} onChange={e => setConfirmedLine(e.target.value)}><option value={selected.suggestedTariffLineId}>Importer suggestion: {selected.suggestedTariffDescription}</option>{candidates.filter(x => x.tariffLineId !== selected.suggestedTariffLineId).map(item => <option key={item.tariffLineId} value={item.tariffLineId}>{item.tariffItemNo || item.hsCode} · {item.description}</option>)}</select></label>
          <label>Review note<textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Explain a correction or information request" /></label>
          <div className="importer-actions"><button type="button" disabled={busy || !confirmedLine} className="importer-primary" onClick={() => void review("APPROVE_INFORMATION")}>Confirm HS and approve information</button><button type="button" disabled={busy} onClick={() => void review("REQUEST_INFORMATION")}>Request information</button><button type="button" disabled={busy} onClick={() => void review("REJECT")}>Reject submission</button></div>
        </div>}
        {selected.status === "VERIFIED" && <div className="importer-officer-actions"><p>Information and HS mapping verified. Continue when ready to begin valuation.</p><button type="button" disabled={busy} className="importer-primary" onClick={() => void review("CONTINUE_ASSESSMENT")}>Continue to assessment</button></div>}
        {selected.status === "ASSESSMENT_READY" && <div className="importer-officer-actions"><p>Ready for officer valuation and duty/tax assessment. No tax or exemption has been granted.</p><Link className="importer-primary" href={`/dashboard?importDeclarationId=${selected.id}`}>Open valuation workspace</Link></div>}
        </> : <p>Select a submission to inspect its details and documents.</p>}</section></div>
  </div>;
}
