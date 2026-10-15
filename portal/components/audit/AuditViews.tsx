"use client";

import type { ReactNode } from "react";
import { FiActivity, FiArrowRight, FiBookOpen, FiBriefcase, FiFileText, FiGlobe, FiKey, FiLock, FiSearch, FiShield, FiUser, FiUserCheck, FiX } from "react-icons/fi";
import { InvoiceActions } from "@/components/invoice/FinalInvoice";
import { roleLabel, type AuditRecord } from "@/lib/workspace";
import { auditActionLabel } from "@/components/audit/ImporterAudit";

type Json = Record<string, unknown>;
const parse = (value: string | null): Json => { if (!value) return {}; try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Json : {}; } catch { return {}; } };

/** The audit views: which records each one holds and how it is labelled. */
export const auditCategories: { key: string; label: string; hint: string; icon: typeof FiActivity; roles: string[] }[] = [
  { key: "CASE", label: "Cases", hint: "Valuation search and importer-portal declarations", icon: FiFileText, roles: ["CustomsOfficer", "CustomsAdministrator", "SystemAdministrator"] },
  { key: "VERIFICATION", label: "Importer verification", hint: "Registrations, documents and decisions", icon: FiUserCheck, roles: ["CustomsOfficer", "CustomsAdministrator", "SystemAdministrator"] },
  { key: "ACCOUNT", label: "Accounts & changes", hint: "Profile edits and change-of-details requests", icon: FiUser, roles: ["CustomsOfficer", "CustomsAdministrator", "SystemAdministrator"] },
  { key: "STAFF", label: "Personnel", hint: "Registration approvals, access changes and archiving", icon: FiBriefcase, roles: ["CustomsAdministrator", "SystemAdministrator"] },
  { key: "REFERENCE", label: "Reference data", hint: "HS codes, tariff imports, branches and regions", icon: FiBookOpen, roles: ["CustomsAdministrator", "SystemAdministrator"] },
  { key: "SECURITY", label: "Security", hint: "Sign-ins, failed sign-ins, passwords and document access", icon: FiLock, roles: ["CustomsOfficer", "CustomsAdministrator", "SystemAdministrator"] },
];
export const categoryOf = (record: AuditRecord) => record.category || (record.importerDeclaration || record.valuation ? "CASE" : "STAFF");
export const categoryIcon = (record: AuditRecord) => auditCategories.find(item => item.key === categoryOf(record))?.icon ?? FiActivity;
export const sourceLabels: Record<string, string> = { IMPORTER_PORTAL: "Importer portal", VALUATION_SEARCH: "Valuation search", ADMINISTRATION: "Administration", SYSTEM: "System" };
export const actorLine = (record: AuditRecord) => [record.username || record.userId, record.actorRole ? roleLabel(record.actorRole) : "", record.branchName || record.regionName || ""].filter(Boolean).join(" · ");

const hidden = /^(id|revisionid|recordid|version|officialletterbase64|receiptdata|sha256|documentsha256)$/i;
const secret = /base64|receiptdata|password|token|hash/i;
function readable(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(item => typeof item === "object" && item ? Object.values(item as Json).filter(v => typeof v === "string").join(" ") : String(item)).join(", ") : "—";
  if (typeof value === "object") return Object.entries(value as Json).filter(([key]) => !secret.test(key)).map(([key, item]) => `${key}: ${readable(item)}`).join(" · ");
  return String(value);
}
const fieldLabel = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());

/** Field-by-field before → after for account, personnel and reference changes. */
export function changeRows(record: AuditRecord) {
  const before = parse(record.previousValueJson), after = parse(record.newValueJson);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(key => !hidden.test(key) && !secret.test(key));
  return keys.map(key => ({ key, label: fieldLabel(key), before: key in before ? readable(before[key]) : null, after: key in after ? readable(after[key]) : null, changed: JSON.stringify(before[key]) !== JSON.stringify(after[key]) }));
}

function Dialog({ title, eyebrow, meta, onClose, children }: { title: string; eyebrow: string; meta: string; onClose: () => void; children: ReactNode }) {
  return <div className="au-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="au-modal" role="dialog" aria-modal="true" aria-labelledby="au-modal-title">
      <header className="au-modal-head"><div><span>{eyebrow}</span><h2 id="au-modal-title">{title}</h2><p>{meta}</p></div>
        <button type="button" className="iv-icon-button" onClick={onClose} aria-label="Close"><FiX aria-hidden="true" /></button></header>
      <div className="au-modal-body">{children}</div>
    </section>
  </div>;
}

function Person({ label, name, lines, icon }: { label: string; name: string; lines: string[]; icon: ReactNode }) {
  return <div className="au-person"><span className="au-person-icon" aria-hidden="true">{icon}</span><div><small>{label}</small><strong>{name || "—"}</strong>{lines.filter(Boolean).map(line => <span key={line}>{line}</span>)}</div></div>;
}

/** Account, personnel and security events: who acted, who it affected, and what changed. */
export function ChangeDetailModal({ record, onClose, extra }: { record: AuditRecord; onClose: () => void; extra?: ReactNode }) {
  const rows = changeRows(record);
  const changed = rows.filter(row => row.changed || row.before === null);
  const category = auditCategories.find(item => item.key === categoryOf(record));
  return <Dialog onClose={onClose} eyebrow={`${category?.label ?? "Change"} · ${sourceLabels[record.source ?? ""] ?? "Workspace"}`} title={auditActionLabel(record.action)} meta={new Date(record.occurredAt).toLocaleString()}>
    <div className="au-people">
      <Person label="Done by" name={record.username || record.userId} lines={[record.actorRole ? roleLabel(record.actorRole) : "", record.branchName || record.regionName || ""]} icon={<FiShield />} />
      {record.subject && record.subject.id !== record.userId && <><FiArrowRight className="au-people-arrow" aria-hidden="true" />
        <Person label="Affecting" name={record.subject.name || record.subject.username} lines={[roleLabel(record.subject.role), record.subject.email]} icon={<FiUser />} /></>}
    </div>
    {(record.justification || record.decision) && <section className="au-block"><h3>Reason recorded</h3><p>{record.justification || record.decision}</p></section>}
    {extra}
    <section className="au-block"><h3>{changed.length ? "What changed" : "Recorded values"}</h3>
      {rows.length ? <table className="au-diff"><thead><tr><th>Field</th><th>Before</th><th aria-hidden="true" /><th>After</th></tr></thead>
        <tbody>{(changed.length ? changed : rows).map(row => <tr key={row.key} className={row.changed ? "is-changed" : ""}><th scope="row">{row.label}</th><td>{row.before ?? "—"}</td><td aria-hidden="true"><FiArrowRight /></td><td>{row.after ?? "—"}</td></tr>)}</tbody></table>
        : <p className="au-empty">No field values were recorded for this event.</p>}
    </section>
    <dl className="au-facts"><div><dt>Record</dt><dd>{record.module} · {record.recordId.slice(0, 8)}</dd></div><div><dt>Event</dt><dd>{record.action}</dd></div>
      {record.ipDeviceInformation && <div><dt>Device</dt><dd>{record.ipDeviceInformation}</dd></div>}</dl>
  </Dialog>;
}

const verificationStatus: Record<string, string> = { PENDING: "Pending review", INFORMATION_REQUESTED: "Information requested", VERIFIED: "Verified", SUSPENDED: "Suspended", REJECTED: "Rejected" };

/** Importer verification events: the importer, the decision and the documents on file at that moment. */
export function VerificationDetailModal({ record, onClose }: { record: AuditRecord; onClose: () => void }) {
  const after = parse(record.newValueJson);
  const documents = Array.isArray(after.documents) ? after.documents as Json[] : [];
  const profile = record.importerProfile;
  const decided = typeof after.VerificationStatus === "string" ? after.VerificationStatus : record.decision ?? "";
  return <Dialog onClose={onClose} eyebrow="Importer verification" title={auditActionLabel(record.action)} meta={`${new Date(record.occurredAt).toLocaleString()} · ${actorLine(record)}`}>
    <div className="au-people">
      <Person label="Importer" name={profile?.legalName ?? record.subject?.name ?? "Importer"} lines={[profile?.tin ? `TIN ${profile.tin}` : "", profile?.importerType ? profile.importerType.replaceAll("_", " ").toLowerCase() : "", record.subject?.email ?? ""]} icon={<FiUserCheck />} />
      <Person label="Decision recorded" name={verificationStatus[decided] ?? (decided || "—")} lines={[profile?.currentStatus && profile.currentStatus !== decided ? `Now: ${verificationStatus[profile.currentStatus] ?? profile.currentStatus}` : "", record.regionName ?? ""]} icon={<FiShield />} />
    </div>
    {record.justification && <section className="au-block"><h3>Note to the importer</h3><p>{record.justification}</p></section>}
    <section className="au-block"><h3>Documents on file at this moment</h3>
      {documents.length ? <ul className="au-docs">{documents.map((document, index) => <li key={index}><FiFileText aria-hidden="true" /><strong>{String(document.Kind ?? "Document").replaceAll("_", " ").toLowerCase()}</strong><code title="SHA-256 fingerprint">{String(document.Sha256 ?? "").slice(0, 16)}…</code></li>)}</ul>
        : <p className="au-empty">No document list was recorded with this event.</p>}
    </section>
  </Dialog>;
}

/** The same case card for valuation-search and importer-portal events: goods, tariff, values and the final invoice. */
export function CaseSummaryCard({ record }: { record: AuditRecord }) {
  const declaration = record.importerDeclaration, valuation = record.valuation;
  const portal = record.source === "IMPORTER_PORTAL" || Boolean(declaration);
  const assessed = declaration?.currentStatus === "ASSESSED" ? { kind: "declaration" as const, id: declaration.id }
    : record.action === "ETHIOPIAN_IMPORT_TAX_ASSESSMENT_COMPLETED" && valuation?.valuationDecisionId ? { kind: "valuation" as const, id: valuation.valuationDecisionId } : null;
  const title = declaration ? [declaration.brand !== "Generic" ? declaration.brand : "", declaration.model !== "Generic" ? declaration.model : ""].filter(Boolean).join(" ") || declaration.productName : valuation?.productName ?? "Case";
  return <section className={`au-case-card${portal ? " is-portal" : ""}`}>
    <div className="au-case-card-head"><span className="au-source">{portal ? <FiGlobe aria-hidden="true" /> : <FiSearch aria-hidden="true" />}{portal ? "Importer portal" : "Valuation search"}</span>
      {(declaration?.reference || record.caseReference) && <a href={`/audit/cases/${record.caseReference ?? declaration?.id}`}>{declaration?.reference ?? `VAL-${(record.caseReference ?? "").slice(0, 8).toUpperCase()}`} · full history</a>}</div>
    <strong>{title}</strong>
    <dl>
      {declaration && <div><dt>Importer</dt><dd>{declaration.importerName || "—"}{declaration.importerTin ? ` · TIN ${declaration.importerTin}` : ""}</dd></div>}
      <div><dt>Origin</dt><dd>{declaration?.originCountryName || valuation?.purchaseCountryName || "—"}</dd></div>
      <div><dt>Quantity</dt><dd>{declaration ? `${declaration.quantity} ${declaration.unit}` : "—"}</dd></div>
      {valuation?.hsCode && <div><dt>HS code</dt><dd>{valuation.hsCode}</dd></div>}
      {valuation?.totalTaxDue != null && <div><dt>Tax due</dt><dd>{valuation.taxCurrency} {valuation.totalTaxDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>}
    </dl>
    {assessed && <div className="au-case-invoice"><FiKey aria-hidden="true" /><span>Final invoice</span><InvoiceActions kind={assessed.kind} id={assessed.id} compact /></div>}
  </section>;
}
