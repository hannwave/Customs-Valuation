"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FiCheck, FiChevronLeft, FiFileText, FiMail, FiPhone, FiRefreshCw, FiUser } from "react-icons/fi";
import { FeedbackToast } from "@/components/FeedbackToast";
import { PageSkeleton } from "@/components/PageSkeleton";
import { ImporterDocumentPreview } from "@/components/ImporterDocumentPreview";
import { FinalStep } from "@/components/officer/FinalStep";
import { ScanAlert, ScanDetail, ScanPill, useDocumentScans } from "@/components/officer/DocumentScan";
import { ReviewStep } from "@/components/officer/ReviewStep";
import { StatusBadge } from "@/components/officer/StatusBadge";
import { TaxStep } from "@/components/officer/TaxStep";
import { ValuationStep } from "@/components/officer/ValuationStep";
import { flaggedScans } from "@/lib/document-scan";
import { declarationDocumentLabels, formatMoney, importerTypes } from "@/lib/importer";
import { loadCase, stageFor, type CaseStage, type OfficerCase } from "@/lib/officer-case";

const steps: { key: CaseStage; label: string; hint: string }[] = [
  { key: "review", label: "Review & classify", hint: "Documents and HS code" },
  { key: "valuation", label: "Valuation", hint: "Set the customs value" },
  { key: "tax", label: "Tax assessment", hint: "Duties and taxes" },
  { key: "final", label: "Assessed", hint: "Importer notified" },
];
const order: CaseStage[] = ["review", "valuation", "tax", "final"];
const historyLabel = (action: string) => action.replace(/^IMPORTER_DECLARATION_|^ETHIOPIAN_IMPORT_TAX_|^VALUATION_/, "").replaceAll("_", " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());

export default function ImporterCasePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<OfficerCase | null>(null);
  const [view, setView] = useState<CaseStage | null>(null);
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const { scans, busy: scanBusy, rescan } = useDocumentScans(`/importer-declarations/${id}/document-scans`, data?.documentScans);
  const [scanOpen, setScanOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setRefreshing(true);
    try { const next = await loadCase(id); setData(next); setLoadError(""); return next; }
    catch (reason) { setLoadError(reason instanceof Error ? reason.message : "This declaration could not be opened."); return null; }
    finally { setRefreshing(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const saved = useCallback(async (message: string) => {
    const next = await load();
    if (next) setView(stageFor(next.declaration.status));
    setSuccess(message);
  }, [load]);
  const failed = useCallback((message: string) => setError(message), []);

  if (loadError && !data) return <div className="oc-page"><Link className="oc-back" href="/importer-review"><FiChevronLeft aria-hidden="true" />Importer submissions</Link><div className="oc-callout is-danger" role="alert">{loadError}</div></div>;
  if (!data) return <PageSkeleton variant="detail" label="Loading declaration" />;

  const d = data.declaration;
  const stage = stageFor(d.status);
  const active = view && order.indexOf(view) <= order.indexOf(stage) ? view : stage;
  const reached = order.indexOf(stage);
  const closed = d.status === "REJECTED";
  const declaredTotal = (d.invoiceAmount ?? 0) + (d.freightAmount ?? 0) + (d.insuranceAmount ?? 0);
  const typeLabel = importerTypes.find(item => item.value === data.importer.importerType)?.title ?? "Importer";

  return <div className="oc-page oc-case">
    <Link className="oc-back" href="/importer-review"><FiChevronLeft aria-hidden="true" />Importer submissions</Link>
    <header className="oc-case-head">
      <div className="oc-case-title">
        <p className="oc-eyebrow"><span className="oc-mono">{d.reference}</span> · submitted {new Date(d.submittedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</p>
        <h1>{d.productName}</h1>
        <p className="oc-case-meta"><StatusBadge status={d.status} /><span>{data.importer.legalName}</span><span>{d.quantity} {d.unit}</span><span>from {d.originCountryName}</span>{data.branch && <span>{data.branch.displayName || data.branch.name}</span>}</p>
      </div>
      <dl className="oc-case-figures">
        <div><dt>Declared</dt><dd>{formatMoney(declaredTotal, d.invoiceCurrency)}</dd></div>
        <div><dt>Customs value</dt><dd>{data.valuation ? formatMoney(data.valuation.selectedReferenceValue, data.valuation.currency) : "—"}</dd></div>
        <div className="is-accent"><dt>Payable</dt><dd>{d.assessedPayable != null ? formatMoney(d.assessedPayable, d.assessmentCurrency) : "—"}</dd></div>
      </dl>
      <button type="button" className="oc-icon-button" onClick={() => void load()} aria-label="Refresh" title="Refresh"><FiRefreshCw aria-hidden="true" className={refreshing ? "oc-spin" : ""} /></button>
    </header>

    <ol className="oc-stepper" aria-label="Declaration workflow">
      {steps.map((step, index) => { const done = !closed && (index < reached || stage === "final"); const current = index === reached && !closed && stage !== "final"; const reachable = index <= reached;
        return <li key={step.key} className={`${done ? "is-done" : ""}${current ? " is-current" : ""}${active === step.key ? " is-viewing" : ""}`}>
          <button type="button" disabled={!reachable} onClick={() => setView(step.key)} aria-current={active === step.key ? "step" : undefined}>
            <span className="oc-step-dot" aria-hidden="true">{done ? <FiCheck /> : index + 1}</span><span><strong>{step.label}</strong><small>{step.hint}</small></span>
          </button></li>; })}
    </ol>

    <div className="oc-case-grid">
      <div className="oc-case-main">
        {active === "review" && flaggedScans(scans).length > 0 && <ScanAlert scans={scans} labels={declarationDocumentLabels} />}
        {active === "review" && <ReviewStep data={data} onSaved={saved} onError={failed} />}
        {active === "valuation" && (stage === "valuation" ? <ValuationStep data={data} onSaved={saved} onError={failed} />
          : <section className="oc-card"><span className="oc-eyebrow">Customs value</span><h2>{data.valuation ? formatMoney(data.valuation.selectedReferenceValue, data.valuation.currency) : "—"}</h2><p className="oc-muted">{data.valuation?.valuationMethod}{data.valuation?.justification ? ` — ${data.valuation.justification}` : ""}</p>
            <p className="oc-muted">Recorded {data.valuation ? new Date(data.valuation.recordedAt).toLocaleString() : ""}. The valuation is fixed once recorded; adjust the assessment if needed.</p></section>)}
        {active === "tax" && <TaxStep data={data} onSaved={saved} onError={failed} />}
        {active === "final" && <FinalStep data={data} onRevise={() => setView("tax")} />}
      </div>

      <aside className="oc-case-side">
        <section className="oc-card oc-side-card">
          <h3 className="oc-subtitle"><FiUser aria-hidden="true" />Importer</h3>
          <p className="oc-side-name">{data.importer.legalName}</p>
          <p className="oc-muted">{typeLabel}{data.importer.tin ? <> · TIN <span className="oc-mono">{data.importer.tin}</span></> : null}</p>
          <ul className="oc-contact">{data.importer.email && <li><FiMail aria-hidden="true" /><a href={`mailto:${data.importer.email}`}>{data.importer.email}</a></li>}{data.importer.phone && <li><FiPhone aria-hidden="true" /><span className="oc-mono">{data.importer.phone}</span></li>}</ul>
          {data.importer.verificationStatus && data.importer.verificationStatus !== "VERIFIED" && <p className="oc-callout is-warning">Account status: {data.importer.verificationStatus.replaceAll("_", " ").toLowerCase()}</p>}
        </section>
        <section className="oc-card oc-side-card">
          <h3 className="oc-subtitle"><FiFileText aria-hidden="true" />Documents <small>{d.documents.length}</small></h3>
          <ScanAlert scans={scans} labels={declarationDocumentLabels} />
          <ul className="oc-doc-list">{d.documents.map(document => { const label = declarationDocumentLabels[document.kind] ?? document.kind;
            const scan = scans?.[document.kind]; const flagged = scan?.flag === "SUSPICIOUS" || scan?.flag === "UNRELATED"; const open = scanOpen[document.kind] ?? flagged;
            return <li key={document.kind}><div className="ds-doc-head"><div><strong>{label}</strong><small>{document.fileName} · {Math.max(1, Math.round(document.size / 1024))} KB</small></div>
              <ScanPill scan={scan} open={open} onClick={() => setScanOpen(current => ({ ...current, [document.kind]: !open }))} /></div>
              {open && <ScanDetail scan={scan} busy={scanBusy === document.kind} onRescan={() => void rescan(document.kind, `/importer-declarations/${d.id}/documents/${document.kind}/rescan`)} />}
              <ImporterDocumentPreview declarationId={d.id} kind={document.kind} label={label} contentType={document.contentType} fileName={document.fileName} /></li>; })}</ul>
        </section>
        <section className="oc-card oc-side-card">
          <h3 className="oc-subtitle">Activity</h3>
          {data.history.length ? <ol className="oc-timeline">{data.history.map((entry, index) => <li key={index}><strong>{historyLabel(entry.action)}</strong><small>{new Date(entry.occurredAt).toLocaleString()} · {entry.username || "Importer"}</small>{entry.note && <p>{entry.note}</p>}</li>)}</ol> : <p className="oc-muted">No activity yet.</p>}
        </section>
      </aside>
    </div>
    <FeedbackToast error={error} success={success} onDismissError={() => setError("")} onDismissSuccess={() => setSuccess("")} />
  </div>;
}
