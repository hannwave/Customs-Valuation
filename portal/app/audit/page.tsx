"use client";

import { useCallback, useEffect, useState } from "react";
import { FiActivity, FiRefreshCw, FiSearch, FiShield } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { getSessionAccessToken } from "@/lib/auth/session";
import { roleLabel, workspaceApi, type AuditRecord, type WorkspaceProfile } from "@/lib/workspace";

function parseAuditValue(value: string | null) {
  if (!value) return null;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
}
function documentName(record: AuditRecord) {
  const after = parseAuditValue(record.newValueJson);
  const before = parseAuditValue(record.previousValueJson);
  return String(after?.OfficialLetterFileName ?? before?.OfficialLetterFileName ?? "—");
}

function formattedValue(value: string | null) {
  if (!value) return "—";
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

const auditLabels: Record<string, string> = { DescriptionEn: "Description", DescriptionAm: "Amharic description", OfficialLetterFileName: "Official letter", OfficialLetterContentType: "Document type", TariffItemNo: "Tariff item", TariffDescription: "Tariff description", SourceReference: "Source reference", EffectiveDate: "Effective date", Duty: "Duty rate", Unit: "Standard unit", Status: "Status", Name: "Name", DisplayName: "Display name", OfficialCode: "Official code", ParentLocationId: "Parent location", Role: "Role", Active: "Active" };
const hiddenAuditFields = new Set(["Id", "RevisionId", "RecordId", "Version", "OfficialLetterBase64"]);

function readableAuditValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "Updated";
  return String(value);
}

type AuditJson = Record<string, unknown>;

function asAuditJson(value: unknown): AuditJson {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AuditJson : {};
}

function valuationValue(record: AuditRecord, ...keys: string[]) {
  const value = parseAuditValue(record.newValueJson) ?? {};
  const found = keys.find(key => value[key] !== undefined && value[key] !== null && value[key] !== "");
  return found ? readableAuditValue(value[found]) : "Not recorded";
}

function auditPath(record: AuditRecord, path: string[], ...fallbackKeys: string[]) {
  const payload = asAuditJson(parseAuditValue(record.newValueJson));
  let value: unknown = payload;
  for (const key of path) value = asAuditJson(value)[key];
  if (value !== undefined && value !== null && value !== "") return readableAuditValue(value);
  return valuationValue(record, ...fallbackKeys);
}

function auditArrayPath(record: AuditRecord, path: string[]) {
  const payload = asAuditJson(parseAuditValue(record.newValueJson));
  let value: unknown = payload;
  for (const key of path) value = asAuditJson(value)[key];
  return Array.isArray(value) ? value.map(asAuditJson) : [];
}

function transactionEvidence(record: AuditRecord) {
  const payload = asAuditJson(parseAuditValue(record.newValueJson));
  const notesValue = payload.EvidenceNotes ?? payload.evidenceNotes;
  const notes = typeof notesValue === "string" ? asAuditJson(parseAuditValue(notesValue)) : asAuditJson(notesValue);
  const phase1 = asAuditJson(payload.phase1);
  const pick = (...values: unknown[]) => values.find(value => value !== undefined && value !== null && value !== "");
  const amount = pick(payload.DeclaredPriceAmount, payload.declaredPriceAmount, phase1.declaredPriceAmount, notes.originalPrice, payload.originalPrice);
  const currency = pick(payload.DeclaredPriceCurrency, payload.declaredPriceCurrency, phase1.declaredPriceCurrency, notes.originalPriceCurrency, payload.originalPriceCurrency);
  const convertedAmount = pick(payload.DeclaredPriceConvertedAmount, payload.declaredPriceConvertedAmount, phase1.declaredPriceConvertedAmount);
  const convertedCurrency = pick(payload.DeclaredPriceConvertedCurrency, payload.declaredPriceConvertedCurrency, phase1.declaredPriceConvertedCurrency);
  const receiptFileName = pick(payload.ReceiptFileName, payload.receiptFileName, phase1.receiptFileName, notes.receiptFileName);
  const decisionId = pick(payload.ValuationDecisionId, payload.valuationDecisionId, record.recordId);
  return {
    amount: amount === undefined ? null : readableAuditValue(amount),
    currency: currency === undefined ? "" : readableAuditValue(currency),
    convertedAmount: convertedAmount === undefined ? null : readableAuditValue(convertedAmount),
    convertedCurrency: convertedCurrency === undefined ? "" : readableAuditValue(convertedCurrency),
    receiptFileName: receiptFileName === undefined ? null : readableAuditValue(receiptFileName),
    decisionId: readableAuditValue(decisionId),
  };
}

async function downloadCustomerReceipt(record: AuditRecord) {
  const token = getSessionAccessToken();
  if (!token) throw new Error("Sign in to access the customer receipt.");
  const evidence = transactionEvidence(record);
  if (!evidence.receiptFileName) throw new Error("No customer receipt is attached to this audit record.");
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080"}/api/workspace/decisions/${encodeURIComponent(evidence.decisionId)}/receipt`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("The customer receipt could not be downloaded.");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = evidence.receiptFileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rawAuditChanges(record: AuditRecord) {
  const before = parseAuditValue(record.previousValueJson) ?? {};
  const after = parseAuditValue(record.newValueJson) ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(key => !hiddenAuditFields.has(key));
  return keys.filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => ({ label: auditLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2"), before: readableAuditValue(before[key]), after: readableAuditValue(after[key]) }));
}

function auditChanges(record: AuditRecord) {
  const changes = rawAuditChanges(record);
  return changes.length || !record.action.includes("VALUATION_SUBMITTED") ? changes : [{ label: "Valuation submitted", before: "Not recorded", after: "Submitted" }];
}

async function openOfficialLetter(record: AuditRecord) {
  if (!record.recordId) return;
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080"}/api/hs-codes/${record.recordId}/official-letter`, { headers: { Authorization: `Bearer ${getSessionAccessToken() ?? ""}` } });
  if (!response.ok) return;
  const blob = await response.blob();
  window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
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
    } catch (ex) { setError(ex instanceof Error ? ex.message : "The audit trail could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <DataState kind="loading" title="Loading audit trail" description="Retrieving records authorized for your role and assigned location." />;
  if (!profile) return <DataState kind="error" title="Audit trail is unavailable" description={error} onRetry={() => void load()} />;
  const scopeText = profile.user.role === "SystemAdministrator" ? "Global audit access" : profile.user.role === "CustomsAdministrator" ? "Assigned location activity" : "Your own actions only";
  const isLoginRecord = (record: AuditRecord) => record.action.includes("SIGNED_IN") || record.action.includes("LOGIN");
  const isValuationRecord = (record: AuditRecord) => record.module === "Valuations" || record.module === "EthiopianImportTaxAssessment";
  const isSubmittedRecord = (record: AuditRecord) => record.action === "VALUATION_SUBMITTED" || record.action === "ETHIOPIAN_IMPORT_TAX_ASSESSMENT_SAVED" || record.action === "ETHIOPIAN_IMPORT_TAX_ASSESSMENT_COMPLETED";
  const isCustomsValidationRecord = (record: AuditRecord) => isValuationRecord(record);
  const submittedRecords = records.filter(record => !isLoginRecord(record) && isSubmittedRecord(record));
  const changeRecords = records.filter(record => !isLoginRecord(record) && !isValuationRecord(record));
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRecords = (category === "submitted" ? submittedRecords : changeRecords).filter(record => {
    const haystack = [record.username, record.regionName, record.branchName, record.action, record.module, record.decision, record.justification, record.newValueJson].filter(Boolean).join(" ").toLowerCase();
    return (!normalizedSearch || haystack.includes(normalizedSearch)) && (!regionFilter || record.regionName === regionFilter) && (!branchFilter || record.branchName === branchFilter) && (!officerFilter || record.username === officerFilter);
  });
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(visibleRecords.length / pageSize));
  const pagedRecords = visibleRecords.slice((page - 1) * pageSize, page * pageSize);
  const changePage = (next: number) => setPage(Math.min(pageCount, Math.max(1, next)));
  const categoryLabel = category === "submitted" ? "Valuation submitted" : "Record changes";
  return <div className="management-page">
    <div className="page-heading"><div><p className="eyebrow">Oversight</p><h1>Audit trail</h1><p className="lead">Immutable operational events with actor, record, location, reason, and before/after evidence.</p></div><button className="secondary-button" type="button" onClick={() => void load()}><FiRefreshCw />Refresh</button></div>
    <div className="role-banner"><FiShield /><strong>{roleLabel(profile.user.role)}</strong><span>{scopeText}</span><span className="badge">{submittedRecords.length + changeRecords.length} records</span></div>
    {error && <DataState kind="error" compact title="Audit refresh failed" description={error} onRetry={() => void load()} />}
    <div className="audit-category-tabs" role="tablist" aria-label="Audit categories">
      <button type="button" className={category === "submitted" ? "is-active" : ""} onClick={() => { setCategory("submitted"); setPage(1); }} role="tab" aria-selected={category === "submitted"}>Valuation submitted <span>{submittedRecords.length}</span></button>
      <button type="button" className={category === "changes" ? "is-active" : ""} onClick={() => { setCategory("changes"); setPage(1); }} role="tab" aria-selected={category === "changes"}>Record changes <span>{changeRecords.length}</span></button>
    </div>
    <div className="audit-filters"><label className="audit-search"><FiSearch /><input type="search" placeholder="Search officer, action…" value={search} onChange={event => { setSearch(event.currentTarget.value); setPage(1); }} /></label>{profile.user.role === "SystemAdministrator" && <><label><span>Region</span><select value={regionFilter} onChange={event => { setRegionFilter(event.currentTarget.value); setPage(1); }}><option value="">All regions</option>{Array.from(new Set(records.map(record => record.regionName).filter((value): value is string => Boolean(value)))).sort().map(value => <option key={value} value={value}>{value}</option>)}</select></label><label><span>Branch</span><select value={branchFilter} onChange={event => { setBranchFilter(event.currentTarget.value); setPage(1); }}><option value="">All branches</option>{Array.from(new Set(records.map(record => record.branchName).filter((value): value is string => Boolean(value)))).sort().map(value => <option key={value} value={value}>{value}</option>)}</select></label></>}{(profile.user.role === "SystemAdministrator" || profile.user.role === "CustomsAdministrator") && <label><span>Officer</span><select value={officerFilter} onChange={event => { setOfficerFilter(event.currentTarget.value); setPage(1); }}><option value="">All officers</option>{Array.from(new Set(records.map(record => record.username).filter(Boolean))).sort().map(value => <option key={value} value={value}>{value}</option>)}</select></label>}</div>
    <section className="admin-panel">
      <div className="panel-heading"><div><h2>{categoryLabel}</h2><p>{category === "submitted" ? "Valuation decisions submitted for review." : "Other created and updated records with before-and-after evidence."}</p></div><FiActivity /></div>
      {visibleRecords.length === 0 ? <DataState kind="empty" compact title={`No ${category === "submitted" ? "submitted valuations" : "record changes"}`} description="Authorized events will appear here when they are recorded." /> : <><div className="table-wrap"><table><thead><tr>{category === "submitted" ? <><th>Submitted</th><th>Officer</th><th>Region</th><th>Branch</th><th>Money chosen</th><th>Customer-paid price &amp; receipt</th><th>Tax result</th><th>Reasons</th><th>Supervisor</th><th>Details</th></> : <><th>Date and actor</th><th>Module</th><th>Action</th><th>Provided document</th><th>Location / record</th><th>Reason</th><th>Details</th></>}</tr></thead><tbody>{pagedRecords.map(record => { const changes = auditChanges(record); const document = documentName(record); const transaction = transactionEvidence(record); return <tr key={record.id}>{category === "submitted" ? <><td>{new Date(record.occurredAt).toLocaleString()}</td><td>{record.username || record.userId}</td><td>{record.regionName || "Not recorded"}</td><td>{record.branchName || "Not recorded"}</td><td>Reference: {valuationValue(record, "SelectedReferenceValue", "phase1SelectedReferenceValue")}<small>Taxable amount: {valuationValue(record, "CustomsValueAmount")}</small></td><td>{transaction.amount ?? "—"}{transaction.currency ? ` ${transaction.currency}` : ""}{transaction.convertedAmount && <small>Converted: {transaction.convertedAmount} {transaction.convertedCurrency}</small>}<small>{transaction.receiptFileName ? <button type="button" className="audit-file-link" onClick={() => void downloadCustomerReceipt(record)}>{transaction.receiptFileName}</button> : "Receipt unavailable"}</small></td><td>Total tax: {valuationValue(record, "TotalTax")}<small>Final amount: {valuationValue(record, "FinalAmount")}</small></td><td>Phase 1: {valuationValue(record, "Justification", "phase1Reason")}<small>Phase 2: {valuationValue(record, "AdjustmentReason", "Notes")}</small></td><td>{record.supervisorName || "Not assigned"}</td><td>{changes.length > 0 ? <button type="button" className="audit-detail-link" onClick={() => setSelectedRecord(record)}>View more</button> : <span className="audit-no-details">No details</span>}</td></> : <><td>{new Date(record.occurredAt).toLocaleString()}<small>{record.username || record.userId}</small></td><td>{record.module}</td><td><span className="badge">{record.action.replaceAll("_", " ")}</span></td><td>{document !== "—" ? <button type="button" className="audit-file-link" onClick={() => void openOfficialLetter(record)}>{document}</button> : "—"}</td><td>{record.locationId ? record.locationId.slice(0, 8) : "Global"}<small>{record.recordId.slice(0, 8)}</small></td><td>{record.module === "HS Codes" ? "—" : record.justification || record.decision || "—"}</td><td>{changes.length > 0 ? <><button type="button" className="audit-detail-link" onClick={() => setSelectedRecord(record)}>{changes.length} field{changes.length === 1 ? "" : "s"} changed · View details</button><small className="audit-summary-text">{changes.slice(0, 2).map(change => change.label).join(", ")}{changes.length > 2 ? "…" : ""}</small></> : <span className="audit-no-details">No field changes</span>}</td></>}</tr>; })}</tbody></table></div><div className="audit-pagination"><span>Showing {visibleRecords.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, visibleRecords.length)} of {visibleRecords.length}</span><button type="button" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button><strong>Page {page} of {pageCount}</strong><button type="button" disabled={page === pageCount} onClick={() => changePage(page + 1)}>Next</button></div></>}
    </section>
    {selectedRecord && <div className="audit-detail-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedRecord(null); }}><section className="audit-detail-modal" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title"><div className="panel-heading"><div><p className="eyebrow">Audit detail</p><h2 id="audit-detail-title">{selectedRecord.action.replaceAll("_", " ")}</h2><p>{new Date(selectedRecord.occurredAt).toLocaleString()} · {selectedRecord.username || selectedRecord.userId}</p></div><button type="button" className="secondary-button" onClick={() => setSelectedRecord(null)}>Close</button></div>{!isValuationRecord(selectedRecord) && <div className="audit-detail-meta"><span><small>Module</small><strong>{selectedRecord.module}</strong></span><span><small>Provided document</small>{documentName(selectedRecord) !== "—" ? <button type="button" className="audit-file-link" onClick={() => void openOfficialLetter(selectedRecord)}>{documentName(selectedRecord)}</button> : <strong>Not recorded</strong>}</span><span><small>Record</small><strong>{selectedRecord.recordId.slice(0, 8)}</strong></span>{selectedRecord.module !== "HS Codes" && <span><small>Reason</small><strong>{selectedRecord.justification || selectedRecord.decision || "Not recorded"}</strong></span>}</div>}{isValuationRecord(selectedRecord) && <div className="audit-valuation-summary"><h3>Valuation detail</h3><p className="audit-item-description"><span><small>Item name</small><strong>{auditPath(selectedRecord, ["itemName"], "Product")}</strong></span><span><small>HS description</small><strong>{auditPath(selectedRecord, ["itemDescription"], "DescriptionEn")}</strong></span></p><div className="audit-phase-section"><h4>Phase 1 · Selected customs value</h4><div><span><small>Selected customs value</small><strong>{auditPath(selectedRecord, ["phase1", "selectedCustomsValue"], "SelectedReferenceValue", "phase1SelectedReferenceValue")} {auditPath(selectedRecord, ["phase1", "currency"], "Currency")}</strong></span><span><small>Reason</small><strong>{auditPath(selectedRecord, ["phase1", "reason"], "Justification", "phase1Reason")}</strong></span></div></div><div className="audit-phase-section"><h4>Phase 2 · Officer assessment</h4><div><span><small>Customs value used</small><strong>{auditPath(selectedRecord, ["phase2", "customsValue"], "CustomsValueAmount")} {auditPath(selectedRecord, ["phase2", "customsValueCurrency"], "CustomsValueCurrency")}</strong></span></div><div className="audit-tax-lines"><h5>Applicable duties &amp; taxes</h5>{auditArrayPath(selectedRecord, ["phase2", "applicableDutiesTaxes"]).filter(line => line.IsApplicable !== false).map((line, index) => <span key={`${String(line.Name ?? "tax")}-${index}`}><strong>{readableAuditValue(line.Name)}</strong><em>{readableAuditValue(line.CalculatedAmount)} {readableAuditValue(line.Currency)}</em></span>)}{auditArrayPath(selectedRecord, ["phase2", "applicableDutiesTaxes"]).filter(line => line.IsApplicable !== false).length === 0 && <p>Not recorded</p>}</div><div><span><small>Reason</small><strong>{auditPath(selectedRecord, ["phase2", "finalReason"], "AdjustmentReason", "Notes")}</strong></span><span><small>Final money</small><strong>{auditPath(selectedRecord, ["phase2", "finalMoney"], "FinalAmount")} {auditPath(selectedRecord, ["phase2", "customsValueCurrency"], "CustomsValueCurrency")}</strong></span></div></div></div>}{!isValuationRecord(selectedRecord) && <div className="audit-detail-changes"><h3>What changed</h3>{auditChanges(selectedRecord).length ? auditChanges(selectedRecord).map(change => <div className="audit-detail-change" key={change.label}><strong>{change.label}</strong><span>{change.before}</span><b>→</b><span>{change.after}</span></div>) : <p>No field changes recorded.</p>}</div>}</section></div>}
    {selectedRecord && isValuationRecord(selectedRecord) && <AuditValuationEvidence record={selectedRecord} />}
  </div>;
}

function AuditValuationEvidence({ record }: { record: AuditRecord }) {
  const [receiptError, setReceiptError] = useState("");
  const payload = parseAuditValue(record.newValueJson) ?? {};
  const evidence = typeof payload.EvidenceNotes === "string" ? parseAuditValue(payload.EvidenceNotes) ?? {} : {};
  const values = { ...evidence, ...payload };
  const photo = typeof values.productPhoto === "string" ? values.productPhoto : "";
  const receipt = typeof values.receiptPhoto === "string" ? values.receiptPhoto : "";
  const transaction = transactionEvidence(record);
  const originalPrice = transaction.amount ?? "Not recorded";
  return <div className="audit-evidence-attachment"><strong>Customer transaction evidence</strong><div className="audit-evidence-images">{photo ? <img src={photo} alt="Uploaded product" /> : <span>No product photo uploaded</span>}{receipt ? <img src={receipt} alt="Uploaded receipt" /> : <span>No receipt image preview</span>}</div><span><small>Original price paid</small><b>{originalPrice}{transaction.currency ? ` ${transaction.currency}` : ""}</b></span>{transaction.convertedAmount && <span><small>Converted customer-paid price</small><b>{transaction.convertedAmount} {transaction.convertedCurrency}</b></span>}<span><small>Invoice receipt</small>{transaction.receiptFileName ? <button type="button" className="audit-file-link" onClick={() => { setReceiptError(""); void downloadCustomerReceipt(record).catch(error => setReceiptError(error instanceof Error ? error.message : "The receipt could not be opened.")); }}>{transaction.receiptFileName} · Download</button> : <b>Not recorded</b>}</span>{receiptError && <p role="alert">{receiptError}</p>}</div>;
}
