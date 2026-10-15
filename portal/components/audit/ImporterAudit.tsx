import { FiFileText, FiGlobe, FiSearch } from "react-icons/fi";
import type { AuditImporterDeclaration, AuditRecord, AuditTariffLines } from "@/lib/workspace";
import { HsItem } from "@/components/hs/HsItem";

type Json = Record<string, unknown>;

function parse(value: string | null): Json {
  if (!value) return {};
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Json : {}; } catch { return {}; }
}

const text = (value: unknown) => typeof value === "string" ? value : "";
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

const actionLabels: Record<string, string> = {
  IMPORTER_DECLARATION_SUBMITTED: "Importer submitted a declaration",
  IMPORTER_DECLARATION_RESUBMITTED: "Importer resubmitted the declaration",
  IMPORTER_DECLARATION_EDITED: "Importer edited the declaration before review",
  IMPORTER_DECLARATION_REVIEW_STARTED: "Officer opened the declaration for review",
  IMPORTER_DECLARATION_VERIFIED: "Documents verified",
  IMPORTER_DECLARATION_ASSESSMENT_READY: "Approved for valuation",
  IMPORTER_DECLARATION_INFORMATION_REQUESTED: "Information requested from the importer",
  IMPORTER_DECLARATION_REJECTED: "Declaration rejected",
  IMPORTER_DECLARATION_RECLASSIFIED: "HS classification changed",
  IMPORTER_DECLARATION_ASSESSED: "Assessment finalised and importer notified",
  VALUATION_CREATED: "Valuation recorded",
  VALUATION_UPDATED: "Valuation updated",
  VALUATION_SUBMITTED: "Valuation submitted",
  VALUATION_REVIEWED: "Valuation reviewed",
  ETHIOPIAN_IMPORT_TAX_ASSESSMENT_SAVED: "Tax assessment saved",
  ETHIOPIAN_IMPORT_TAX_ASSESSMENT_COMPLETED: "Tax assessment completed",
  IMPORTER_VERIFICATION_SUBMITTED: "Importer registered for verification",
  IMPORTER_VERIFICATION_RESUBMITTED: "Importer resubmitted verification details",
  IMPORTER_VERIFICATION_VERIFY: "Importer account verified",
  IMPORTER_VERIFICATION_REJECT: "Importer account rejected",
  IMPORTER_VERIFICATION_REQUEST_INFORMATION: "Information requested for importer account",
  IMPORTER_VERIFICATION_SUSPEND: "Importer account suspended",
  IMPORTER_VERIFICATION_REINSTATE: "Importer account reinstated",
  USER_SIGNED_IN: "Signed in",
  SIGN_IN_FAILED: "Failed sign-in attempt",
  PASSWORD_CHANGED: "Password changed",
  DOCUMENT_OPENED: "Document opened",
  DOCUMENT_RESCAN_REQUESTED: "Document scan requested again",
  IMPORTER_DECLARATION_DOCUMENT_SCANNED: "Declaration document scanned",
  IMPORTER_VERIFICATION_DOCUMENT_SCANNED: "Verification document scanned",
  INVOICE_OPENED: "Final invoice opened",
  IMPORTER_ACCOUNT_UPDATED: "Importer updated contact details",
  PROFILE_UPDATED: "Profile details updated",
  PROFILE_PHOTO_UPDATED: "Profile picture changed",
  PROFILE_PHOTO_REMOVED: "Profile picture removed",
  IDENTITY_CHANGE_REQUESTED: "Change of details requested",
  IDENTITY_CHANGE_CANCELLED: "Change request cancelled",
  IDENTITY_CHANGE_APPROVED: "Change of details approved",
  IDENTITY_CHANGE_REJECTED: "Change of details rejected",
  USER_CREATED: "Account created",
  USER_ARCHIVED: "Account archived",
  REGISTRATION_APPROVED: "Staff registration approved",
  REGISTRATION_DENIED: "Staff registration denied",
  OFFICER_ACCESS_CHANGED: "Officer status or assignment changed",
  LOCATION_CREATED: "Branch or region created",
  LOCATION_UPDATED: "Branch or region updated",
  HS_CODE_CREATED: "HS code created",
  HS_CODE_UPDATED: "HS code updated",
  ERCA_TARIFF_IMPORTED: "ERCA tariff imported",
  PHASE_1_SAVED: "Valuation draft saved",
};

/** A readable name for an audit action; unknown actions fall back to their code in sentence case. */
export function auditActionLabel(action: string) {
  if (actionLabels[action]) return actionLabels[action];
  const words = action.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const statusLabels: Record<string, string> = {
  SUBMITTED: "Submitted", INFORMATION_REQUESTED: "Information requested", VERIFIED: "Verified", ASSESSMENT_READY: "Ready for valuation",
  IN_ASSESSMENT: "In assessment", ASSESSED: "Assessed", REJECTED: "Rejected",
};
const statusLabel = (status: string) => statusLabels[status] ?? (status ? status.replaceAll("_", " ").toLowerCase() : "");

const purposeLabels: Record<string, string> = { COMMERCIAL_RESALE: "Commercial resale", PERSONAL: "Personal use", MANUFACTURING: "Manufacturing", INSTITUTIONAL: "Institutional use", OTHER: "Other" };

export function money(value: number | null | undefined, currency: string, empty = "Not recorded") {
  if (value == null || !Number.isFinite(value)) return empty;
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
}

function flag(code: string) {
  return /^[A-Z]{2}$/.test(code) ? <span className={`flag:${code}`} aria-hidden="true" /> : <FiGlobe aria-hidden="true" />;
}

/** Total tax recorded by an importer-portal event, when the event carries one (the finalised assessment). */
export function importerEventTax(record: AuditRecord): { value: number; currency: string } | null {
  if (record.module !== "ImporterDeclarations") return null;
  const after = parse(record.newValueJson);
  const value = amount(after.totalTax);
  return value == null ? null : { value, currency: text(after.currency) };
}

/** Shows which channel produced an event: the importer portal (with the declaration reference) or the officer's valuation search. */
export function AuditSourceTag({ record }: { record: AuditRecord }) {
  if (record.source === "IMPORTER_PORTAL") return <span className="audit-source is-portal" title="Filed by the importer on the portal"><FiFileText aria-hidden="true" />Importer portal{record.importerDeclaration ? ` · ${record.importerDeclaration.reference}` : ""}</span>;
  if (record.source === "VALUATION_SEARCH") return <span className="audit-source is-search" title="Started from the officer's valuation search"><FiSearch aria-hidden="true" />Valuation search</span>;
  return null;
}

function tariffText(id: unknown, lines: AuditTariffLines) {
  const key = text(id);
  if (!key) return null;
  const line = lines[key];
  return line ? { code: line.code, description: line.description } : { code: "", description: "Tariff item no longer listed" };
}

function TariffValue({ label, value, note }: { label: string; value: { code: string; description: string } | null; note?: string }) {
  return <span><small>{label}</small><strong>{value ? <HsItem code={value.code} description={value.description} empty="Not set" full /> : "Not set"}</strong>{note && <em>{note}</em>}</span>;
}

/** The importer's declaration as filed: who, what, and the price they declared. */
export function DeclarationSummary({ declaration, event }: { declaration: AuditImporterDeclaration; event?: Json }) {
  // Prefer what the event recorded; older events only stored the reference and status, so fall back to the declaration.
  const quantity = amount(event?.Quantity) ?? declaration.quantity;
  const unit = text(event?.Unit) || declaration.unit;
  const invoice = amount(event?.InvoiceAmount) ?? declaration.invoiceAmount;
  const currency = text(event?.InvoiceCurrency) || declaration.invoiceCurrency;
  const freight = amount(event?.FreightAmount) ?? declaration.freightAmount;
  const insurance = amount(event?.InsuranceAmount) ?? declaration.insuranceAmount;
  const originCode = text(event?.OriginCountryCode) || declaration.originCountryCode;
  const originName = text(event?.OriginCountryName) || declaration.originCountryName;
  const purpose = text(event?.ImportPurpose) || declaration.importPurpose;
  const product = text(event?.ProductName) || declaration.productName;
  const brandModel = [declaration.brand, declaration.model].filter(Boolean).join(" ");
  return <div className="audit-detail-summary">
    <span><small>Declaration</small><strong>{declaration.reference}</strong><em>Filed {new Date(declaration.submittedAt).toLocaleDateString()}</em></span>
    <span><small>Importer</small><strong>{declaration.importerName || "Not recorded"}</strong><em>{declaration.importerTin ? `TIN ${declaration.importerTin}` : "TIN not recorded"}</em></span>
    <span><small>Goods</small><strong>{product || "Not recorded"}</strong><em>{[brandModel, quantity ? `${quantity.toLocaleString()} ${unit}` : ""].filter(Boolean).join(" · ")}</em></span>
    <span><small>Price paid (invoice)</small><strong>{money(invoice, currency)}</strong><em>Freight {money(freight ?? 0, currency)} · Insurance {money(insurance ?? 0, currency)}</em></span>
    <span><small>Country of origin</small><strong>{flag(originCode)} {originName || "Not recorded"}</strong></span>
    <span><small>Import purpose</small><strong>{purposeLabels[purpose] ?? (purpose ? purpose.replaceAll("_", " ").toLowerCase() : "Not recorded")}</strong></span>
  </div>;
}

const noteLabels: Record<string, string> = {
  IMPORTER_DECLARATION_INFORMATION_REQUESTED: "What the importer was asked to provide",
  IMPORTER_DECLARATION_REJECTED: "Reason for rejection",
  IMPORTER_DECLARATION_RECLASSIFIED: "Reclassification",
  IMPORTER_DECLARATION_ASSESSED: "Assessment note",
};

/** Detail body for an event on an importer-portal declaration (submission, review, reclassification, final assessment). */
export function ImporterEventBody({ record, tariffLines }: { record: AuditRecord; tariffLines: AuditTariffLines }) {
  const before = parse(record.previousValueJson);
  const after = parse(record.newValueJson);
  const declaration = record.importerDeclaration;
  const statusBefore = text(before.Status);
  const statusAfter = text(after.Status) || record.decision || "";
  const suggested = tariffText(after.SuggestedTariffLineId ?? before.SuggestedTariffLineId ?? declaration?.suggestedTariffLineId, tariffLines);
  const confirmed = tariffText(after.ConfirmedTariffLineId, tariffLines);
  const previousConfirmed = tariffText(before.ConfirmedTariffLineId, tariffLines);
  const classificationChanged = Boolean(previousConfirmed && confirmed && previousConfirmed.code !== confirmed.code);
  const hasClassification = "SuggestedTariffLineId" in after || "ConfirmedTariffLineId" in after;
  const assessed = record.action === "IMPORTER_DECLARATION_ASSESSED";
  const currency = text(after.currency);
  const byImporter = record.action === "IMPORTER_DECLARATION_SUBMITTED" || record.action === "IMPORTER_DECLARATION_RESUBMITTED" || record.action === "IMPORTER_DECLARATION_EDITED";
  const caseLink = record.caseReference ? `/audit/cases/${record.caseReference}` : null;
  return <>
    <p className="audit-portal-banner"><FiFileText aria-hidden="true" /><span>Filed on the importer portal{declaration ? <> as <strong>{declaration.reference}</strong></> : null}. {byImporter ? "This event was recorded when the importer sent the declaration." : "This event was recorded by the reviewing officer."}</span></p>
    {declaration ? <DeclarationSummary declaration={declaration} event={after} /> : <p className="audit-empty-copy">The declaration for this event is no longer available.</p>}
    <section className="audit-compact-section"><div className="audit-section-title"><h3>Status</h3>{declaration && declaration.currentStatus !== statusAfter && <span>Now {statusLabel(declaration.currentStatus)}</span>}</div>
      <p className="audit-status-change">{statusBefore && statusBefore !== statusAfter ? <><b>{statusLabel(statusBefore)}</b><span aria-hidden="true">→</span></> : null}<b className="is-current">{statusLabel(statusAfter) || "Not recorded"}</b></p>
    </section>
    {hasClassification && <section className="audit-compact-section"><h3>HS classification at this event</h3>
      <div className="audit-detail-summary audit-detail-summary--two">
        <TariffValue label="Importer's tariff choice" value={suggested} />
        <TariffValue label={classificationChanged ? "Officer's classification (changed)" : "Officer's classification"} value={confirmed} note={classificationChanged ? `Previously ${[previousConfirmed?.description, previousConfirmed?.code].filter(Boolean).join(" · ")}` : confirmed ? undefined : "Not confirmed yet"} />
      </div>
    </section>}
    {assessed && <section className="audit-compact-section"><div className="audit-section-title"><h3>{after.revised === true ? "Revised assessment sent to the importer" : "Assessment sent to the importer"}</h3><strong>{money(amount(after.payable), currency)}</strong></div>
      <div className="audit-detail-summary">
        <span><small>Customs value</small><strong>{money(amount(after.customsValue), currency)}</strong></span>
        <span><small>Total duties and taxes</small><strong>{money(amount(after.totalTax), currency)}</strong></span>
        <span><small>Payable by the importer</small><strong>{money(amount(after.payable), currency)}</strong></span>
      </div>
      <p className="audit-empty-copy">The valuation and the tax lines behind these totals are recorded as separate events in this case's history.</p>
    </section>}
    <section className="audit-compact-section"><h3>{noteLabels[record.action] ?? (byImporter ? "Importer's note" : "Officer's note")}</h3><p className="audit-note">{record.justification || (byImporter ? "No note — the importer's declaration is summarised above." : "No note was recorded.")}</p></section>
    {caseLink && <p className="audit-case-links"><a href={caseLink}>Open the full case history</a>{declaration?.valuationDecisionId ? <span>Includes the valuation and tax assessment</span> : <span>No valuation has been recorded for this declaration yet</span>}</p>}
  </>;
}
