"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiActivity, FiEye, FiFileText, FiImage, FiRefreshCw, FiSearch, FiShield, FiX } from "react-icons/fi";
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
  if (!/^[A-Z]{2}$/.test(normalized)) return "🌐";
  return String.fromCodePoint(...[...normalized].map(character => 127397 + character.charCodeAt(0)));
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
  if (typeof value === "object") return "Updated";
  return String(value);
}

const hiddenAuditFields = new Set(["Id", "RevisionId", "RecordId", "Version", "OfficialLetterBase64", "ReceiptData"]);

function auditChanges(record: AuditRecord) {
  const before = parseAuditValue(record.previousValueJson) ?? {};
  const after = parseAuditValue(record.newValueJson) ?? {};
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter(key => !hiddenAuditFields.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(key => ({ label: key.replace(/([a-z])([A-Z])/g, "$1 $2"), before: readableAuditValue(before[key]), after: readableAuditValue(after[key]) }));
}

async function openOfficialLetter(record: AuditRecord) {
  const token = getSessionAccessToken();
  if (!record.recordId || !token) return;
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080"}/api/hs-codes/${record.recordId}/official-letter`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return;
  const url = URL.createObjectURL(await response.blob());
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
  const lines = details.taxBreakdown.filter(line => line.isApplicable);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className="audit-detail-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="audit-detail-modal audit-detail-modal--compact" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title">
      <header className="audit-detail-header"><div><span>{record.action.replaceAll("_", " ")}</span><h2 id="audit-detail-title">{details.productName || "Valuation record"}</h2><p>{new Date(record.occurredAt).toLocaleString()} · {details.officerName || record.username}</p></div><button type="button" onClick={onClose} aria-label="Close audit details"><FiX /></button></header>
      <div className="audit-detail-body">
        <div className="audit-detail-summary">
          <span><small>HS code</small><strong>{details.hsCode || "Not recorded"}</strong></span>
          <span><small>Country where bought</small><strong>{countryFlag(details.purchaseCountryCode)} {details.purchaseCountryName || "Not recorded"}</strong></span>
          <span><small>Selected price</small><strong>{money(details.selectedPriceAmount || null, details.selectedPriceCurrency)}</strong><em>{sourceLabel(details.valuationMethod || details.selectedPriceSource)}</em></span>
          <span><small>Total tax due</small><strong>{money(details.totalTaxDue, details.taxCurrency, "Pending assessment")}</strong></span>
          <span><small>Officer</small><strong>{details.officerName || "Not recorded"}</strong><em>{details.officerLocationName || "Office not recorded"}</em></span>
          <span><small>Product origin</small><strong>{details.originCountry || "Not recorded"}</strong></span>
        </div>
        {details.hsDescription && <p className="audit-hs-description">{details.hsDescription}</p>}
        <section className="audit-media-section"><div><h3>Product photo</h3><ProductPhoto details={details} /></div><div><h3>Customer receipt</h3><ReceiptPreview record={record} details={details} /></div></section>
        <section className="audit-compact-section"><div className="audit-section-title"><h3>Tax calculation</h3><strong>{money(details.totalTaxDue, details.taxCurrency, "Not assessed")}</strong></div>{lines.length ? <div className="audit-tax-breakdown">{lines.map((line, index) => <div key={`${line.name}-${index}`}><span><strong>{line.name}</strong><small>{line.calculationType === "Percentage" ? `${line.value}% · ` : ""}{sourceLabel(line.calculationBasis)}</small></span><b>{money(line.calculatedAmount, line.currency || details.taxCurrency)}</b></div>)}</div> : <p className="audit-empty-copy">Tax lines have not been recorded for this event.</p>}</section>
        <section className="audit-compact-section"><div className="audit-section-title"><h3>Decision record</h3><span>{record.recordId.slice(0, 8)}</span></div><dl className="audit-decision-meta"><div><dt>Valuation method</dt><dd>{sourceLabel(details.valuationMethod)}</dd></div><div><dt>Price source</dt><dd>{sourceLabel(details.selectedPriceSource)}</dd></div><div><dt>Reason</dt><dd>{record.justification || firstString(details.decisionDetails.justification) || "Not recorded"}</dd></div><div><dt>Supervisor</dt><dd>{record.supervisorName || "Not assigned"}</dd></div></dl></section>
      </div>
    </section>
  </div>;
}

function GenericDetailModal({ record, onClose }: { record: AuditRecord; onClose: () => void }) {
  const changes = auditChanges(record);
  const document = documentName(record);
  return <div className="audit-detail-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="audit-detail-modal audit-detail-modal--compact" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title"><header className="audit-detail-header"><div><span>{record.module}</span><h2 id="audit-detail-title">{record.action.replaceAll("_", " ")}</h2><p>{new Date(record.occurredAt).toLocaleString()} · {record.username || record.userId}</p></div><button type="button" onClick={onClose} aria-label="Close audit details"><FiX /></button></header><div className="audit-detail-body"><div className="audit-detail-summary"><span><small>Record</small><strong>{record.recordId.slice(0, 8)}</strong></span><span><small>Reason</small><strong>{record.justification || record.decision || "Not recorded"}</strong></span>{document && <span><small>Document</small><button className="audit-file-link" type="button" onClick={() => void openOfficialLetter(record)}>{document}</button></span>}</div><section className="audit-compact-section"><h3>What changed</h3>{changes.length ? <div className="audit-change-list">{changes.map(change => <div key={change.label}><strong>{change.label}</strong><span>{change.before}</span><b>→</b><span>{change.after}</span></div>)}</div> : <p className="audit-empty-copy">No field changes were recorded.</p>}</section></div></section></div>;
}

export default function AuditPage() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [category, setCategory] = useState<"submitted" | "changes">("submitted");
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [officerFilter, setOfficerFilter] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<AuditRecord | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [current, rows] = await Promise.all([workspaceApi<WorkspaceProfile>("/me"), workspaceApi<AuditRecord[]>("/audit")]);
      setProfile(current); setRecords(rows);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The audit trail could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const isValuationRecord = useCallback((record: AuditRecord) => Boolean(record.valuation) || ["Valuation", "Valuations", "EthiopianImportTaxAssessment"].includes(record.module), []);
  const submittedRecords = useMemo(() => records.filter(record => isValuationRecord(record) && ["VALUATION_SUBMITTED", "ETHIOPIAN_IMPORT_TAX_ASSESSMENT_SAVED", "ETHIOPIAN_IMPORT_TAX_ASSESSMENT_COMPLETED"].includes(record.action)), [records, isValuationRecord]);
  const changeRecords = useMemo(() => records.filter(record => !isValuationRecord(record) && !record.action.includes("SIGNED_IN") && !record.action.includes("LOGIN")), [records, isValuationRecord]);

  if (loading) return <DataState kind="loading" title="Loading audit trail" description="Retrieving records authorized for your role and assigned location." />;
  if (!profile) return <DataState kind="error" title="Audit trail is unavailable" description={error} onRetry={() => void load()} />;

  const normalizedSearch = search.trim().toLowerCase();
  const visibleRecords = (category === "submitted" ? submittedRecords : changeRecords).filter(record => {
    const valuation = isValuationRecord(record) ? valuationDetails(record) : null;
    const haystack = [record.username, valuation?.officerName, valuation?.productName, valuation?.hsCode, valuation?.purchaseCountryName, record.regionName, record.branchName, record.action, record.module, record.justification].filter(Boolean).join(" ").toLowerCase();
    return (!normalizedSearch || haystack.includes(normalizedSearch)) && (!regionFilter || record.regionName === regionFilter) && (!branchFilter || record.branchName === branchFilter) && (!officerFilter || (valuation?.officerName || record.username) === officerFilter);
  });
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(visibleRecords.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedRecords = visibleRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const scopeText = profile.user.role === "SystemAdministrator" ? "Global audit access" : profile.user.role === "CustomsAdministrator" ? "Assigned location activity" : "Your own actions only";
  const officerNames = Array.from(new Set(records.map(record => record.valuation?.officerName || record.username).filter(Boolean))).sort();

  return <div className="management-page audit-page">
    <div className="page-heading"><div><p className="eyebrow">Oversight</p><h1>Audit trail</h1><p className="lead">Immutable valuation decisions with the selected market, price, taxes, officer, and transaction evidence.</p></div><button className="secondary-button" type="button" onClick={() => void load()}><FiRefreshCw />Refresh</button></div>
    <div className="role-banner"><FiShield /><strong>{roleLabel(profile.user.role)}</strong><span>{scopeText}</span><span className="badge">{submittedRecords.length + changeRecords.length} records</span></div>
    {error && <DataState kind="error" compact title="Audit refresh failed" description={error} onRetry={() => void load()} />}
    <div className="audit-category-tabs" role="tablist" aria-label="Audit categories"><button type="button" className={category === "submitted" ? "is-active" : ""} onClick={() => { setCategory("submitted"); setPage(1); }} role="tab" aria-selected={category === "submitted"}>Valuations <span>{submittedRecords.length}</span></button><button type="button" className={category === "changes" ? "is-active" : ""} onClick={() => { setCategory("changes"); setPage(1); }} role="tab" aria-selected={category === "changes"}>Other changes <span>{changeRecords.length}</span></button></div>
    <div className="audit-filters"><label className="audit-search"><FiSearch /><input type="search" placeholder="Search product, HS code, country, officer…" value={search} onChange={event => { setSearch(event.currentTarget.value); setPage(1); }} /></label>{profile.user.role === "SystemAdministrator" && <><label><span>Region</span><select value={regionFilter} onChange={event => { setRegionFilter(event.currentTarget.value); setPage(1); }}><option value="">All regions</option>{Array.from(new Set(records.map(record => record.regionName).filter((value): value is string => Boolean(value)))).sort().map(value => <option key={value}>{value}</option>)}</select></label><label><span>Branch</span><select value={branchFilter} onChange={event => { setBranchFilter(event.currentTarget.value); setPage(1); }}><option value="">All branches</option>{Array.from(new Set(records.map(record => record.branchName).filter((value): value is string => Boolean(value)))).sort().map(value => <option key={value}>{value}</option>)}</select></label></>}{profile.user.role !== "CustomsOfficer" && <label><span>Officer</span><select value={officerFilter} onChange={event => { setOfficerFilter(event.currentTarget.value); setPage(1); }}><option value="">All officers</option>{officerNames.map(value => <option key={value}>{value}</option>)}</select></label>}</div>
    <section className="admin-panel audit-panel"><div className="panel-heading"><div><h2>{category === "submitted" ? "Valuation events" : "Record changes"}</h2><p>{category === "submitted" ? "Point-in-time valuation snapshots and their supporting evidence." : "Administrative and reference-data changes."}</p></div><FiActivity /></div>{visibleRecords.length === 0 ? <DataState kind="empty" compact title="No matching audit records" description="Authorized events will appear here when they are recorded." /> : <><div className="table-wrap"><table className={category === "submitted" ? "audit-valuation-table" : "audit-change-table"}><thead><tr>{category === "submitted" ? <><th>Product</th><th>HS code</th><th>Country chosen</th><th>Selected price</th><th>Tax due</th><th>Officer</th><th>Recorded</th><th><span className="sr-only">View details</span></th></> : <><th>Date and actor</th><th>Module</th><th>Action</th><th>Document</th><th>Reason</th><th><span className="sr-only">View details</span></th></>}</tr></thead><tbody>{pagedRecords.map(record => {
      const details = valuationDetails(record);
      const document = documentName(record);
      return <tr key={record.id}>{category === "submitted" ? <><td><strong>{details.productName || "Not recorded"}</strong><small>{record.action.replaceAll("_", " ")}</small></td><td><strong>{details.hsCode || "—"}</strong></td><td><span className="audit-country"><b>{countryFlag(details.purchaseCountryCode)}</b>{details.purchaseCountryName || "Not recorded"}</span></td><td><strong>{money(details.selectedPriceAmount || null, details.selectedPriceCurrency)}</strong><small>{sourceLabel(details.valuationMethod || details.selectedPriceSource)}</small></td><td><strong>{money(details.totalTaxDue, details.taxCurrency, "Pending")}</strong></td><td><strong>{details.officerName || record.username || record.userId}</strong><small>{details.officerLocationName || record.branchName || "Office not recorded"}</small></td><td>{new Date(record.occurredAt).toLocaleDateString()}<small>{new Date(record.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></td><td><button type="button" className="audit-view-button" aria-label={`View audit details for ${details.productName || "valuation"}`} title="View details" onClick={() => setSelectedRecord(record)}><FiEye /></button></td></> : <><td>{new Date(record.occurredAt).toLocaleString()}<small>{record.username || record.userId}</small></td><td>{record.module}</td><td><span className="badge">{record.action.replaceAll("_", " ")}</span></td><td>{document ? <button type="button" className="audit-file-link" onClick={() => void openOfficialLetter(record)}>{document}</button> : "—"}</td><td>{record.justification || record.decision || "—"}</td><td><button type="button" className="audit-view-button" aria-label="View audit details" title="View details" onClick={() => setSelectedRecord(record)}><FiEye /></button></td></>}</tr>;
    })}</tbody></table></div><div className="audit-pagination"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visibleRecords.length)} of {visibleRecords.length}</span><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><strong>Page {currentPage} of {pageCount}</strong><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div></>}</section>
    {selectedRecord && (isValuationRecord(selectedRecord) ? <ValuationDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} /> : <GenericDetailModal record={selectedRecord} onClose={() => setSelectedRecord(null)} />)}
  </div>;
}
