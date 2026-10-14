"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FiAlertTriangle, FiArrowLeft, FiCheck, FiCheckCircle, FiEdit3, FiFileText, FiXCircle } from "react-icons/fi";
import { ImporterDocumentPreview } from "@/components/ImporterDocumentPreview";
import { DeclarationPill, PageHeader, shortDate } from "@/components/importer/PortalParts";
import { declarationDocumentLabels, formatMoney, importerApi, purposeLabels, type ImporterDeclaration } from "@/lib/importer";

const treatmentLabels: Record<string, string> = { WITHHOLDING_REVIEW: "Withholding tax review", VAT_EXEMPTION: "VAT exemption review", CUSTOMS_DUTY_EXEMPTION: "Customs duty exemption review", MACHINERY_EXEMPTION: "Machinery / equipment exemption review" };

const stageIndex: Record<string, number> = { SUBMITTED: 1, INFORMATION_REQUESTED: 1, REJECTED: 1, VERIFIED: 2, ASSESSMENT_READY: 2, IN_ASSESSMENT: 3, ASSESSED: 5 };
const basisLabels: Record<string, string> = { CIF: "Customs value", CIFPlusDuty: "Value + duty", CIFPlusDutyPlusExcise: "Value + duty + excise", CIFPlusDutyPlusExcisePlusSurtax: "Value + duty + excise + surtax", UNIT_RATE_ETB: "Per unit" };

function Tracker({ status }: { status: string }) {
  // Steps before `current` are complete; the current step carries the review outcome.
  const current = stageIndex[status] ?? 1;
  const tone = status === "INFORMATION_REQUESTED" ? "is-warning" : status === "REJECTED" ? "is-danger" : "is-current";
  const steps = [
    { label: "Submitted", detail: "Declaration received" },
    { label: "Officer review", detail: status === "INFORMATION_REQUESTED" ? "Waiting for your response" : status === "REJECTED" ? "Declaration rejected" : current > 1 ? "Documents and HS code confirmed" : "Documents and HS code being checked" },
    { label: "Valuation", detail: current > 2 ? "Customs value set" : "Price compared with market evidence" },
    { label: "Tax assessment", detail: current > 3 ? "Duties and taxes calculated" : "Duties and taxes from the tariff" },
    { label: "Assessed", detail: status === "ASSESSED" ? "Amount payable issued" : "Final notice" },
  ];
  return <ol className="ip-tracker is-five" aria-label="Declaration progress">{steps.map((step, index) => {
    const state = index < current ? "is-done" : index === current ? tone : "";
    return <li key={step.label} className={state} aria-current={index === current ? "step" : undefined}><span aria-hidden="true">{state === "is-done" ? <FiCheck /> : state === "is-danger" ? <FiXCircle /> : state === "is-warning" ? <FiAlertTriangle /> : index + 1}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div></li>;
  })}</ol>;
}

function AssessmentNotice({ d }: { d: ImporterDeclaration }) {
  const currency = d.assessmentCurrency || "ETB";
  const lines = d.assessmentLines.filter(line => line.isApplicable && line.amount > 0);
  return <section className="ip-card ip-assessment" aria-labelledby="ip-assessment-title">
    <header className="ip-assessment-head"><div><p className="importer-eyebrow">ASSESSMENT NOTICE</p><h2 id="ip-assessment-title">Duties and taxes payable</h2><p>Issued {d.assessedAt ? new Date(d.assessedAt).toLocaleString() : ""}</p></div>
      <div className="ip-assessment-total"><span>Amount payable</span><strong>{formatMoney(d.assessedPayable, currency)}</strong></div></header>
    <dl className="ip-assessment-facts">
      <div><dt>Customs value (CIF)</dt><dd>{formatMoney(d.assessedCustomsValue, currency)}</dd></div>
      <div><dt>Declared price</dt><dd>{formatMoney((d.invoiceAmount ?? 0) + (d.freightAmount ?? 0) + (d.insuranceAmount ?? 0), d.invoiceCurrency)}</dd></div>
      <div><dt>Total duties and taxes</dt><dd>{formatMoney(d.assessedTotalTax, currency)}</dd></div>
    </dl>
    <div className="ip-assessment-table-wrap"><table className="ip-assessment-table">
      <thead><tr><th scope="col">Duty or tax</th><th scope="col">Calculated on</th><th scope="col">Rate</th><th scope="col">Amount</th></tr></thead>
      <tbody>{lines.length ? lines.map(line => <tr key={line.name}><td>{line.name}</td><td>{basisLabels[line.calculationBasis] ?? line.calculationBasis} · {formatMoney(line.baseAmount, currency)}</td><td>{line.calculationType === "Percentage" ? `${line.rate}%` : line.calculationType === "PerUnit" ? `${line.rate} ETB / unit` : formatMoney(line.rate, currency)}</td><td>{formatMoney(line.amount, currency)}</td></tr>)
        : <tr><td colSpan={4}>No duties or taxes apply to this declaration.</td></tr>}</tbody>
      <tfoot><tr><th scope="row" colSpan={3}>Amount payable</th><td>{formatMoney(d.assessedPayable, currency)}</td></tr></tfoot>
    </table></div>
    <p className="ip-note">Pay at your customs branch or through its approved payment channel, quoting {d.reference}. Contact the branch if you believe the assessment is wrong.</p>
  </section>;
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const submitted = useSearchParams().get("submitted") === "1";
  const [declaration, setDeclaration] = useState<ImporterDeclaration | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    importerApi<ImporterDeclaration>(`/importer-declarations/${id}`).then(setDeclaration).catch(reason => setError(reason instanceof Error ? reason.message : "The declaration could not be opened."));
  }, [id]);

  const back = <Link className="iv-secondary" href="/importer/declarations"><FiArrowLeft aria-hidden="true" />All declarations</Link>;
  if (error) return <div className="ip-page"><PageHeader eyebrow="DECLARATION" title="Declaration unavailable" actions={back} /><p className="iv-error" role="alert">{error}</p></div>;
  if (!declaration) return <div className="ip-page"><p className="ip-empty">Loading declaration…</p></div>;
  const d = declaration;
  const facts: [string, string][] = [
    ["Country of origin", d.originCountryName], ["Import purpose", purposeLabels[d.importPurpose] ?? d.importPurpose], ["Quantity", `${d.quantity} ${d.unit}`],
    ["Brand / model", [d.brand, d.model].filter(Boolean).join(" / ") || "—"], ["Manufacturer", d.manufacturer || "—"], ["Serial / part number", d.serialOrPartNumber || "—"],
    ["Price paid", d.invoiceAmount != null ? formatMoney(d.invoiceAmount, d.invoiceCurrency) : "—"],
    ["Freight / insurance", d.freightAmount != null || d.insuranceAmount != null ? `${formatMoney(d.freightAmount ?? 0, d.invoiceCurrency)} / ${formatMoney(d.insuranceAmount ?? 0, d.invoiceCurrency)}` : "Included or not declared"],
    ["Your tariff choice", d.suggestedTariffDescription || "—"], ["Submitted", new Date(d.submittedAt).toLocaleString()],
  ];

  return <div className="ip-page">
    <PageHeader eyebrow={d.reference} title={d.productName} actions={<>{back}{d.status === "INFORMATION_REQUESTED" && <Link className="iv-primary" href={`/importer/declarations/new?edit=${d.id}`}><FiEdit3 aria-hidden="true" />Update declaration</Link>}</>} />
    {submitted && <div className="ip-banner is-success"><FiCheckCircle aria-hidden="true" /><div><strong>Sent to a Customs Officer</strong><p>{d.reference} is now in officer review. We will show any request or decision here.</p></div></div>}
    <section className="ip-card ip-status-card"><div className="ip-status-row"><DeclarationPill status={d.status} /><span>Last updated {shortDate(d.updatedAt)}</span></div><Tracker status={d.status} />
      {d.reviewNote && <div className={`ip-banner ${d.status === "REJECTED" ? "is-danger" : d.status === "INFORMATION_REQUESTED" ? "is-warning" : "is-info"}`}><FiAlertTriangle aria-hidden="true" /><div><strong>{d.status === "INFORMATION_REQUESTED" ? "The officer needs more information" : "Officer note"}</strong><p>{d.reviewNote}</p></div></div>}
    </section>
    {d.status === "ASSESSED" && <AssessmentNotice d={d} />}
    <div className="ip-detail-grid">
      <section className="ip-card"><header className="ip-card-head"><h2>Item details</h2></header>
        <dl className="iv-detail-grid">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <h3 className="ip-subtitle">Description</h3><p className="ip-prose">{d.description}</p>
        {d.specifications && <><h3 className="ip-subtitle">Specifications</h3><p className="ip-prose">{d.specifications}</p></>}
        {d.purposeDetails && <><h3 className="ip-subtitle">Purpose details</h3><p className="ip-prose">{d.purposeDetails}</p></>}
        {d.requestedTreatments.length > 0 && <><h3 className="ip-subtitle">Requested tax treatment</h3><ul className="ip-checks-list">{d.requestedTreatments.map(code => <li key={code}><FiCheck aria-hidden="true" />{treatmentLabels[code] ?? code}</li>)}</ul><p className="ip-note">Requests for officer review only. No exemption has been granted.</p></>}
      </section>
      <section className="ip-card"><header className="ip-card-head"><h2>Documents</h2></header>
        <ul className="iv-doc-list">{d.documents.map(document => <li key={document.kind}>
          <div><strong><FiFileText aria-hidden="true" /> {declarationDocumentLabels[document.kind] ?? document.kind}</strong><small>{document.fileName} · {Math.max(1, Math.round(document.size / 1024))} KB</small></div>
          <ImporterDocumentPreview declarationId={d.id} kind={document.kind} label={declarationDocumentLabels[document.kind] ?? document.kind} contentType={document.contentType} fileName={document.fileName} />
        </li>)}</ul>
      </section>
    </div>
  </div>;
}

export default function DeclarationDetailPage() {
  return <Suspense fallback={null}><Detail /></Suspense>;
}
