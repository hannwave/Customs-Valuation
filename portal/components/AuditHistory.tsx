"use client";

import { useEffect, useRef, useState } from "react";
import { FiActivity, FiEye, FiFileText, FiGlobe, FiImage, FiRefreshCw, FiSearch, FiShield, FiX } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { getSessionAccessToken } from "@/lib/auth/session";
import { roleLabel, workspaceApi, type AuditRecord, type ValuationAuditDetails, type ValuationAuditTaxLine, type WorkspaceProfile } from "@/lib/workspace";

type AuditJson = Record<string, unknown>;

function parseAuditValue(value: string | null): AuditJson | null {
  if (!value) return null;
  try { return JSON.parse(value) as AuditJson; } catch { return null; }
}

function asObject(value: unknown): AuditJson {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AuditJson : {};
}

function firstString(...values: unknown[]) {
  const value = values.find(item => typeof item === "string" && item.trim());
  return typeof value === "string" ? value : "";
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function legacyTaxLine(value: unknown): ValuationAuditTaxLine {
  const line = asObject(value);
  return {
    name: firstString(line.Name, line.name, "Tax"),
    calculationType: firstString(line.CalculationType, line.calculationType),
    value: firstNumber(line.Value, line.value) ?? 0,
    currency: firstString(line.Currency, line.currency),
    calculationBasis: firstString(line.CalculationBasis, line.calculationBasis),
    baseAmount: firstNumber(line.BaseAmount, line.baseAmount) ?? 0,
    calculatedAmount: firstNumber(line.CalculatedAmount, line.calculatedAmount) ?? 0,
    status: firstString(line.Status, line.status),
    sourceReference: firstString(line.SourceReference, line.sourceReference),
    isApplicable: (line.IsApplicable ?? line.isApplicable) !== false,
  };
}

function legacyValuation(record: AuditRecord): ValuationAuditDetails {
  const payload = parseAuditValue(record.newValueJson) ?? {};
  const phase1 = asObject(payload.phase1);
  const phase2 = asObject(payload.phase2);
  const notesValue = payload.EvidenceNotes ?? payload.evidenceNotes;
  const notes = typeof notesValue === "string" ? parseAuditValue(notesValue) ?? {} : asObject(notesValue);
  const linesValue = phase2.applicableDutiesTaxes ?? payload.TaxLines ?? payload.taxLines;
  const taxBreakdown = Array.isArray(linesValue) ? linesValue.map(legacyTaxLine) : [];
  const receiptFileName = firstString(phase1.receiptFileName, payload.ReceiptFileName, payload.receiptFileName, notes.receiptFileName);
  return {
    valuationDecisionId: firstString(payload.ValuationDecisionId, payload.valuationDecisionId, record.recordId),
    valuationPhase2Id: record.module === "EthiopianImportTaxAssessment" ? record.recordId : null,
    productId: null,
    productName: firstString(payload.itemName, payload.ProductName, payload.product, notes.product),
    hsCode: firstString(phase2.selectedHsCode, phase1.hsCode, payload.HsCode, notes.hsCode),
    hsDescription: firstString(phase2.selectedHsDescription, phase1.hsDescription, payload.itemDescription),
    purchaseCountryCode: firstString(payload.purchaseCountryCode, payload.PurchaseCountryCode, phase1.purchaseCountryCode, notes.purchaseCountryCode),
    purchaseCountryName: firstString(payload.purchaseCountryName, payload.PurchaseCountryName, phase1.purchaseCountryName, notes.purchaseCountryName),
    originCountry: firstString(phase2.originCountry, payload.OriginCountry),
    selectedPriceAmount: firstNumber(phase1.selectedCustomsValue, payload.SelectedReferenceValue, payload.phase1SelectedReferenceValue) ?? 0,
    selectedPriceCurrency: firstString(phase1.currency, payload.Currency),
    selectedPriceSource: firstString(payload.selectedPriceSource, payload.SelectedPriceSource, notes.supportingSource),
    valuationMethod: firstString(payload.valuationMethod, payload.ValuationMethod, notes.valuationMethod),
    totalTaxDue: firstNumber(phase2.totalTax, payload.TotalTax),
    customsDutyAmount: taxBreakdown.find(line => line.name === "Customs Duty")?.calculatedAmount ?? null,
    exciseAdValoremAmount: taxBreakdown.find(line => line.name === "Excise Tax")?.calculatedAmount ?? null,
    exciseSpecificAmount: taxBreakdown.find(line => line.name === "Excise Tax (specific)")?.calculatedAmount ?? null,
    exciseTotalAmount: null,
    vatAmount: taxBreakdown.find(line => line.name === "VAT")?.calculatedAmount ?? null,
    surtaxAmount: taxBreakdown.find(line => line.name === "Surtax")?.calculatedAmount ?? null,
    otherTaxAmount: null,
    taxCurrency: firstString(phase2.customsValueCurrency, payload.CustomsValueCurrency, phase1.currency, payload.Currency),
    taxBreakdown,
    officerAccountId: null,
    officerName: record.username || record.userId,
    officerLocationId: record.locationId,
    officerLocationName: record.branchName ?? record.regionName ?? "",
    productPhotoUrl: firstString(payload.productPhoto, payload.ProductPhotoUrl, notes.productPhoto),
    receiptAvailable: Boolean(receiptFileName),
    receiptFileName,
    receiptContentType: firstString(phase1.receiptContentType, payload.ReceiptContentType),
    decisionDetails: { justification: record.justification },
  };
}

function valuationDetails(record: AuditRecord) {
  return record.valuation ?? legacyValuation(record);
}

function countryFlag(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return <FiGlobe aria-hidden="true" />;
  return <span className={`flag:${normalized}`} aria-hidden="true" />;
}

function money(value: number | null, currency: string, empty = "Not recorded") {
  if (value == null || !Number.isFinite(value)) return empty;
  if (!currency || currency.length !== 3) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  try { return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
}

function sourceLabel(value: string) {
  if (!value) return "Source not recorded";
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

function documentName(record: AuditRecord) {
  const after = parseAuditValue(record.newValueJson);
  const before = parseAuditValue(record.previousValueJson);
  return firstString(after?.OfficialLetterFileName, before?.OfficialLetterFileName);
}

function readableAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, (key, item) => /base64|receiptdata|password|token/i.test(key) ? "[omitted]" : item, 2);
  return String(value);
}

const hiddenAuditFields = new Set(["Id", "RevisionId", "RecordId", "Version", "OfficialLetterBase64", "ReceiptData"]);

function auditChanges(record: AuditRecord) {
  const before = parseAuditValue(record.previousValueJson) ?? {};
  const after = parseAuditValue(record.newValueJson) ?? {};
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter(key => !hiddenAuditFields.has(key) && !/base64|receiptdata|password|token/i.test(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(key => ({ label: key.replace(/([a-z])([A-Z])/g, "$1 $2"), before: readableAuditValue(before[key]), after: readableAuditValue(after[key]) }));
}

async function openOfficialLetter(record: AuditRecord) {
  const token = getSessionAccessToken();
  try {
    if (!record.recordId || !token) throw new Error("Sign in again to open this document.");
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080"}/api/hs-codes/${record.recordId}/official-letter`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Document unavailable (${response.status}). Refresh the record or contact your administrator.`);
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = documentName(record) || "official-letter"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (reason) {
    throw new Error(reason instanceof Error ? reason.message : "The document could not be downloaded. Check your connection and retry.");
  }
}

function AuditDialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { ref.current?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="audit-native-dialog" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="audit-detail-title">{children}</dialog>;
}

function EventChanges({ record }: { record: AuditRecord }) {
  const changes = auditChanges(record).filter(change => !/tax lines/i.test(change.label));
  const before = parseAuditValue(record.previousValueJson);
  const after = parseAuditValue(record.newValueJson);
  const oldTax = firstNumber(before?.TotalTax, before?.totalTax);
  const oldCurrency = firstString(before?.TargetCurrency, before?.targetCurrency, before?.CustomsValueCurrency);
  const newCurrency = valuationDetails(record).taxCurrency;
  const newTax = record.valuation?.totalTaxDue ?? firstNumber(after?.TotalTax, after?.totalTax);
  const beforeLinesValue = before?.TaxLines ?? before?.taxLines;
  const beforeLines = Array.isArray(beforeLinesValue) ? beforeLinesValue.map(legacyTaxLine) : [];
  const afterLines = valuationDetails(record).taxBreakdown;
  return <section className="audit-compact-section"><h3>Recorded changes</h3>
    <p>Reason: {record.justification || "Not recorded"}</p>
    <p>Tax effect: {oldTax != null && newTax != null && oldCurrency === newCurrency ? money(newTax - oldTax, newCurrency) : "No comparable before and after tax totals were recorded."}</p>
    {afterLines.length > 0 && <div className="table-wrap"><table className="audit-event-table"><thead><tr><th>Tax</th><th>Original rate / apply</th><th>Revised rate / apply</th><th>Tax difference</th></tr></thead><tbody>{afterLines.map((line, index) => {
      const original = beforeLines.find(item => item.name === line.name);
      const rate = (item: ValuationAuditTaxLine) => `${item.value}${item.calculationType === "Percentage" ? "%" : ` ${item.currency}${item.calculationType === "PerUnit" ? "/unit" : ""}`} · ${item.isApplicable ? "Applied" : "Not applied"}`;
      return <tr key={`${line.name}-${index}`}><td>{line.name}</td><td>{original ? rate(original) : "Not recorded"}</td><td>{rate(line)}</td><td className="amount-cell">{original && original.currency === line.currency ? money(line.calculatedAmount - original.calculatedAmount, line.currency) : "Not comparable"}</td></tr>;
    })}</tbody></table></div>}
    {changes.length ? <div className="audit-change-list">{changes.map(change => <div key={change.label}><strong>{change.label}</strong><pre>{change.before}</pre><b>→</b><pre>{change.after}</pre></div>)}</div> : <p>No field changes were recorded.</p>}
  </section>;
}

function ReceiptPreview({ record, details }: { record: AuditRecord; details: ValuationAuditDetails }) {
  const [url, setUrl] = useState("");
  const [contentType, setContentType] = useState(details.receiptContentType);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(details.receiptAvailable));

  useEffect(() => {
    if (!details.receiptAvailable) { setLoading(false); return; }
    const token = getSessionAccessToken();
    if (!token) { setError("Sign in again to view this receipt."); setLoading(false); return; }
    const abort = new AbortController();
    let objectUrl = "";
    void fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080"}/api/workspace/audit/${record.id}/receipt`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message ?? "Receipt preview is unavailable.");
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        setContentType(blob.type || details.receiptContentType);
        setUrl(objectUrl);
      })
      .catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Receipt preview is unavailable."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [record.id, details.receiptAvailable, details.receiptContentType]);

  if (!details.receiptAvailable) return <div className="audit-media-empty"><FiFileText /><span>No receipt was recorded</span></div>;
  if (loading) return <div className="audit-media-empty"><FiFileText /><span>Loading receipt…</span></div>;
  if (error || !url) return <div className="audit-media-empty is-error"><FiFileText /><span>{error || "Receipt preview is unavailable."}</span></div>;
  const isImage = contentType.startsWith("image/");
  const isPdf = contentType === "application/pdf";
  return <div className="audit-receipt-preview">
    {isImage ? <img src={url} alt={`Receipt ${details.receiptFileName}`} /> : isPdf ? <object data={url} type="application/pdf" aria-label={`Receipt ${details.receiptFileName}`}><span>PDF preview is not supported by this browser.</span></object> : <div className="audit-media-empty"><FiFileText /><span>Preview is unavailable for this file type.</span></div>}
    <div><span title={details.receiptFileName}>{details.receiptFileName || "Receipt"}</span><a href={url} target="_blank" rel="noreferrer">Open</a><a href={url} download={details.receiptFileName || "receipt"}>Download</a></div>
  </div>;
}

function ProductPhoto({ details }: { details: ValuationAuditDetails }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [details.productPhotoUrl]);
  return details.productPhotoUrl && !failed
    ? <img className="audit-product-photo" src={details.productPhotoUrl} alt={details.productName || "Valued product"} onError={() => setFailed(true)} />
    : <div className="audit-media-empty"><FiImage /><span>No product photo was captured</span></div>;
}

function ValuationDetailModal({ record, onClose }: { record: AuditRecord; onClose: () => void }) {
  const details = valuationDetails(record);
  const lines = details.taxBreakdown;
  return <AuditDialog onClose={onClose}>
    <section className="audit-detail-modal audit-detail-modal--compact" aria-labelledby="audit-detail-title">
      <header className="audit-detail-header"><div><span>{record.action.replaceAll("_", " ")}</span><h2 id="audit-detail-title">{record.action.replaceAll("_", " ")}</h2><p>{new Date(record.occurredAt).toLocaleString()} · {record.username || record.userId}</p></div><button type="button" onClick={onClose} aria-label="Close audit details"><FiX /></button></header>
      <div className="audit-detail-body">
        <p>Case <a href={`/audit/cases/${record.caseReference || details.valuationDecisionId}`}>{record.caseReference || details.valuationDecisionId}</a> · {details.productName}</p>
        <EventChanges record={record} />
        <div className="audit-detail-summary">
          <span><small>HS code</small><strong>{details.hsCode || "Not recorded"}</strong></span>
          <span><small>Country where bought</small><strong>{countryFlag(details.purchaseCountryCode)} {details.purchaseCountryName || "Not recorded"}</strong></span>
          <span><small>Selected price</small><strong>{money(details.selectedPriceAmount || null, details.selectedPriceCurrency)}</strong><em>{sourceLabel(details.valuationMethod || details.selectedPriceSource)}</em></span>
          <span><small>Total tax due</small><strong>{money(details.totalTaxDue, details.taxCurrency, "Pending assessment")}</strong></span>
          <span><small>Officer</small><strong>{details.officerName || "Not recorded"}</strong><em>{details.officerLocationName || "Office not recorded"}</em></span>
          <span><small>Product origin</small><strong>{details.originCountry || "Not recorded"}</strong></span>
        </div>
        {details.hsDescription && <p className="audit-hs-description">{details.hsDescription}</p>}

        <section className="audit-compact-section"><div className="audit-section-title"><h3>Tax calculation</h3><strong>{money(details.totalTaxDue, details.taxCurrency, "Not assessed")}</strong></div>{lines.length ? <div className="audit-tax-breakdown">{lines.map((line, index) => <div key={`${line.name}-${index}`}><span><strong>{line.name}{!line.isApplicable ? " · Not applied" : ""}</strong><small>{line.calculationType === "Percentage" ? `${line.value}% × ${line.baseAmount} / 100` : `${line.value} × ${line.baseAmount}`} · {sourceLabel(line.calculationBasis)} · {line.sourceReference || "Source not recorded"}</small></span><b>{money(line.calculatedAmount, line.currency || details.taxCurrency)}</b></div>)}</div> : <p className="audit-empty-copy">Tax lines have not been recorded for this event.</p>}</section>
        <section className="audit-compact-section"><div className="audit-section-title"><h3>Decision record</h3><span>{record.recordId.slice(0, 8)}</span></div><dl className="audit-decision-meta"><div><dt>Valuation method</dt><dd>{sourceLabel(details.valuationMethod)}</dd></div><div><dt>Price source</dt><dd>{sourceLabel(details.selectedPriceSource)}</dd></div><div><dt>Reason</dt><dd>{record.justification || firstString(details.decisionDetails.justification) || "Not recorded"}</dd></div><div><dt>Supervisor</dt><dd>{record.supervisorName || "Not assigned"}</dd></div></dl></section>
        <section className="audit-media-section"><div><h3>Product photo</h3><ProductPhoto details={details} /></div><div><h3>Customer receipt</h3><ReceiptPreview record={record} details={details} /></div></section>
      </div>
    </section>
  </AuditDialog>;
}

function GenericDetailModal({ record, onClose }: { record: AuditRecord; onClose: () => void }) {
  const [documentError, setDocumentError] = useState("");
  const changes = auditChanges(record);
  const document = documentName(record);
  return <AuditDialog onClose={onClose}><section className="audit-detail-modal audit-detail-modal--compact" aria-labelledby="audit-detail-title"><header className="audit-detail-header"><div><span>{record.module}</span><h2 id="audit-detail-title">{record.action.replaceAll("_", " ")}</h2><p>{new Date(record.occurredAt).toLocaleString()} · {record.username || record.userId}</p></div><button type="button" onClick={onClose} aria-label="Close audit details"><FiX /></button></header><div className="audit-detail-body"><div className="audit-detail-summary"><span><small>Record</small><strong>{record.recordId.slice(0, 8)}</strong></span><span><small>Reason</small><strong>{record.justification || record.decision || "Not recorded"}</strong></span>{document && <span><small>Document</small><button className="audit-file-link" type="button" onClick={() => { setDocumentError(""); void openOfficialLetter(record).catch(reason => setDocumentError(reason.message)); }}>{document}</button>{documentError && <p role="alert">{documentError}</p>}</span>}</div><section className="audit-compact-section"><h3>What changed</h3>{changes.length ? <div className="audit-change-list">{changes.map(change => <div key={change.label}><strong>{change.label}</strong><span>{change.before}</span><b>→</b><span>{change.after}</span></div>)}</div> : <p className="audit-empty-copy">No field changes were recorded.</p>}</section></div></section></AuditDialog>;
}

type AuditPageResult = { items: AuditRecord[]; total: number; availableTotal: number; page: number; pageSize: number };

export function AuditHistory({ caseId = "" }: { caseId?: string }) {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [result, setResult] = useState<AuditPageResult>({ items: [], total: 0, availableTotal: 0, page: 1, pageSize: 20 });
  const [filters, setFilters] = useState({ search: "", category: "", eventType: "", caseId, from: "", to: "", officer: "", region: "", branch: "" });
  const [comparison, setComparison] = useState<AuditRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [documentError, setDocumentError] = useState("");
  useEffect(() => {
    const showError = (event: Event) => setDocumentError((event as CustomEvent<string>).detail);
    window.addEventListener("audit-document-error", showError);
    return () => window.removeEventListener("audit-document-error", showError);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
      if (filters.to) { const end = new Date(`${filters.to}T00:00:00`); end.setDate(end.getDate() + 1); params.set("to", end.toISOString()); }
      void Promise.all([workspaceApi<WorkspaceProfile>("/me"), workspaceApi<AuditPageResult>(`/audit?${params}`)])
        .then(([current, records]) => { if (active) { setProfile(current); setResult(records); } })
        .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Audit history could not be loaded."); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [filters, page, revision]);
  useEffect(() => {
    const eventId = new URLSearchParams(window.location.search).get("event");
    if (!eventId) return;
    let active = true;
    void workspaceApi<AuditPageResult>(`/audit?eventId=${encodeURIComponent(eventId)}${caseId ? `&caseId=${encodeURIComponent(caseId)}` : ""}`)
      .then(data => { if (active) { setSelectedRecord(data.items[0] ?? null); if (!data.items.length) setDocumentError("This event was not found or is outside your authorized history."); } })
      .catch(reason => { if (active) setDocumentError(String(reason)); });
    return () => { active = false; };
  }, [caseId]);
  const updateFilter = (key: keyof typeof filters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); };
  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  const isValuation = (record: AuditRecord) => Boolean(record.valuation) || ["Valuation", "Valuations", "EthiopianImportTaxAssessment"].includes(record.module);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return <div className="management-page audit-page">
    <div className="page-heading"><div><h1>{caseId ? "Case history" : "Audit trail"}</h1><p className="lead">{caseId || "Recorded decisions, adjustments, reviews, and supporting evidence."}</p>{caseId && <a href="/audit">All audit records</a>}</div><button className="secondary-button" type="button" onClick={() => setRevision(value => value + 1)}><FiRefreshCw />Refresh</button></div>
    {profile && <div className="role-banner"><FiShield /><strong>{roleLabel(profile.user.role)}</strong><span>{result.total} matching events</span></div>}
    {documentError && <p role="alert">{documentError} <button onClick={() => setDocumentError("")}>Dismiss</button></p>}
    <div className="audit-filters">
      <label><span>Search</span><input type="search" value={filters.search} onChange={event => updateFilter("search", event.target.value)} placeholder="Product, HS code, officer, reason" /></label>
      <label><span>Category</span><select value={filters.category} onChange={event => updateFilter("category", event.target.value)}><option value="">All events</option><option value="valuations">Valuations — all phases and reviews</option><option value="changes">Other changes</option></select></label>
      {!caseId && <label><span>Case reference</span><input value={filters.caseId} onChange={event => updateFilter("caseId", event.target.value)} placeholder="Full case ID" /></label>}
      <label><span>Event type (exact)</span><input value={filters.eventType} onChange={event => updateFilter("eventType", event.target.value)} placeholder="VALUATION_REVIEWED" /></label>
      <label><span>From date</span><input type="date" value={filters.from} onChange={event => updateFilter("from", event.target.value)} /></label>
      <label><span>Through date</span><input type="date" min={filters.from} value={filters.to} onChange={event => updateFilter("to", event.target.value)} /></label>
      {(["officer", "region", "branch"] as const).map(key => <label key={key}><span>{key}</span><input value={filters[key]} onChange={event => updateFilter(key, event.target.value)} /></label>)}
    </div>
    {activeFilters.length > 0 && <div className="audit-active-filters">{activeFilters.map(([key, value]) => <span className="badge" key={key}>{key}: {value}</span>)}<button type="button" onClick={() => { setFilters({ search: "", category: "", eventType: "", caseId, from: "", to: "", officer: "", region: "", branch: "" }); setPage(1); }}>Clear filters</button></div>}
    {caseId && <section className="assessment-change-summary"><h2>Compare recorded events ({comparison.length}/2)</h2><p>Select two events, including events on different pages.</p>
      {comparison.map(record => <p key={record.id}>{new Date(record.occurredAt).toLocaleString()} · {record.action.replaceAll("_", " ")} · {money(valuationDetails(record).totalTaxDue, valuationDetails(record).taxCurrency)}</p>)}
      {comparison.length === 2 && <EventChanges record={{ ...comparison[1], previousValueJson: comparison[0].newValueJson }} />}
      {comparison.length > 0 && <button onClick={() => setComparison([])}>Clear comparison</button>}
    </section>}
    <section className="admin-panel audit-panel" aria-busy={loading}>
      {loading ? <DataState kind="loading" compact title="Loading events" description="Searching your authorized history." /> : error ? <DataState kind="error" compact title="Audit history unavailable" description={error} onRetry={() => setRevision(value => value + 1)} /> : result.total === 0 ? <DataState kind="empty" compact title={result.availableTotal === 0 ? "No records exist" : "No records match"} description={result.availableTotal === 0 ? "Events will appear when activity is recorded in your authorized scope." : "Change or clear the filters to see other events."} /> : <>
      <p>{caseId ? "Chronological history · oldest first" : "Most recent events first"}</p>
      <div className="table-wrap"><table className="audit-event-table"><thead><tr><th>Action / reason</th><th>Officer / recorded</th><th>Case reference</th><th>Recorded tax due</th><th>Details</th></tr></thead><tbody>{result.items.map(record => {
        const details = valuationDetails(record);
        const reference = record.caseReference;
        return <tr key={record.id}><td><strong>{record.action.replaceAll("_", " ")}</strong><small>{record.justification || "Reason not recorded"}</small></td><td>{record.username || record.userId}<small>{new Date(record.occurredAt).toLocaleString()}</small></td><td>{reference ? <a href={`/audit/cases/${reference}`}>{reference}</a> : <span>{record.recordId}</span>}</td><td className="amount-cell">{isValuation(record) ? money(details.totalTaxDue, details.taxCurrency) : "—"}</td><td>{caseId && <label><input type="checkbox" checked={comparison.some(item => item.id === record.id)} disabled={comparison.length === 2 && !comparison.some(item => item.id === record.id)} onChange={event => setComparison(current => event.target.checked ? [...current, record].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)) : current.filter(item => item.id !== record.id))} /> Compare</label>}<button className="audit-view-button" onClick={() => setSelectedRecord(record)} aria-label={`Inspect ${record.action}`}><FiEye /></button><a href={`${reference ? `/audit/cases/${reference}` : "/audit"}?event=${record.id}`}>Event link</a></td></tr>;
      })}</tbody></table></div>
      <div className="audit-pagination"><span>Showing {(result.page - 1) * result.pageSize + 1}–{Math.min(result.page * result.pageSize, result.total)} of {result.total}</span><button disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>Previous</button><strong>Page {result.page} of {pages}</strong><button disabled={result.page >= pages} onClick={() => setPage(result.page + 1)}>Next</button></div></>}
    </section>
    {selectedRecord && (isValuation(selectedRecord) ? <ValuationDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} /> : <GenericDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />)}
  </div>;
}
