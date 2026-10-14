"use client";

import { useCallback, useEffect, useState } from "react";
import { FiAlertTriangle, FiCheck, FiChevronRight, FiPauseCircle, FiPlayCircle, FiRefreshCw, FiSearch, FiSlash, FiX, FiMessageSquare } from "react-icons/fi";
import { ImporterDocumentPreview } from "@/components/ImporterDocumentPreview";
import {
  documentLabels, idTypeLabels, importerApi, importerTypes, residencyLabels, verificationLabels,
  type ImporterProfile, type ImporterType, type VerificationStatus,
} from "@/lib/importer";

type Row = { id: string; importerType: ImporterType; verificationStatus: VerificationStatus; legalName: string; tradeName: string; tin: string; city: string; phone: string; submittedAt: string; reviewedAt: string | null; applicant: string; email: string };
type Listing = { region: string; counts: Record<VerificationStatus, number>; items: Row[] };
type HistoryEntry = { occurredAt: string; action: string; username: string; decision: string | null; note: string | null };
type Detail = { profile: ImporterProfile; account: { fullName: string; email: string; createdAt: string }; duplicates: { tinMatches: number; idMatches: number }; history: HistoryEntry[]; allowedActions: string[] };
type Action = "VERIFY" | "REQUEST_INFORMATION" | "REJECT" | "SUSPEND" | "REINSTATE";

const statusOrder: VerificationStatus[] = ["PENDING", "INFORMATION_REQUESTED", "VERIFIED", "SUSPENDED", "REJECTED"];
const tabLabels: Record<VerificationStatus, string> = { PENDING: "Pending", INFORMATION_REQUESTED: "Info requested", VERIFIED: "Active", SUSPENDED: "Suspended", REJECTED: "Rejected" };
const actionConfig: Record<Action, { label: string; icon: typeof FiCheck; tone: string; needsReason: boolean; done: string }> = {
  VERIFY: { label: "Approve importer", icon: FiCheck, tone: "is-primary", needsReason: false, done: "approved" },
  REQUEST_INFORMATION: { label: "Request information", icon: FiMessageSquare, tone: "", needsReason: true, done: "asked for more information" },
  REJECT: { label: "Reject", icon: FiSlash, tone: "is-danger", needsReason: true, done: "rejected" },
  SUSPEND: { label: "Suspend importer", icon: FiPauseCircle, tone: "is-danger", needsReason: true, done: "suspended" },
  REINSTATE: { label: "Reinstate importer", icon: FiPlayCircle, tone: "is-primary", needsReason: false, done: "reinstated" },
};
const checksByType: Record<ImporterType, string[]> = {
  BUSINESS: ["TIN on the certificate matches the TIN entered", "Trade licence is renewed, unexpired and lists import activity", "Business name matches the licence and commercial registration", "Identity document matches the applicant and their stated role"],
  CUSTOMS_AGENT: ["Agent licence is valid and issued by the Customs Commission", "TIN on the certificate matches the TIN entered", "Identity document matches the applicant"],
  INDIVIDUAL: ["Identity document is genuine, unexpired and matches the applicant", "Residency status is supported by the documents provided"],
};
const typeTitle = (type: ImporterType) => importerTypes.find(item => item.value === type)?.title ?? type;
const shortDate = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
const historyLabel = (action: string) => action.replace("IMPORTER_VERIFICATION_", "").replaceAll("_", " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());

function StatusPill({ status }: { status: VerificationStatus }) {
  return <span className={`iv-pill is-${status.toLowerCase().replaceAll("_", "-")}`}>{tabLabels[status]}</span>;
}

export default function ImporterVerificationsPage() {
  const [filter, setFilter] = useState<VerificationStatus | "">("PENDING");
  const [search, setSearch] = useState(""); const [query, setQuery] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [opening, setOpening] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [panelError, setPanelError] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(); if (filter) params.set("status", filter); if (query) params.set("q", query);
      setListing(await importerApi<Listing>(`/importer-verifications?${params}`)); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Importers could not be loaded."); }
    finally { setLoading(false); }
  }, [filter, query]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!detail) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDetail(null); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  async function open(id: string, keepNotice = false) {
    setOpening(id); setPanelError(""); if (!keepNotice) setNotice(""); setChecks({}); setNote("");
    try { setDetail(await importerApi<Detail>(`/importer-verifications/${id}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This importer could not be opened."); }
    finally { setOpening(""); }
  }

  async function decide(action: Action) {
    if (!detail) return;
    const config = actionConfig[action];
    if (config.needsReason && note.trim().length < 10) { setPanelError(`Write a reason of at least 10 characters to ${config.label.toLowerCase()}.`); return; }
    if ((action === "REJECT" || action === "SUSPEND") && !window.confirm(`${config.label} ${detail.profile.legalName}? The importer will be notified of your reason.`)) return;
    setBusy(true); setPanelError("");
    try {
      await importerApi<ImporterProfile>(`/importer-verifications/${detail.profile.id}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim(), expectedVersion: detail.profile.version }),
      });
      setNotice(`${detail.profile.legalName} was ${config.done}.`);
      await Promise.all([open(detail.profile.id, true), load()]);
    } catch (reason) { setPanelError(reason instanceof Error ? reason.message : "The decision could not be saved."); }
    finally { setBusy(false); }
  }

  const counts = listing?.counts;
  const total = counts ? statusOrder.reduce((sum, status) => sum + (counts[status] ?? 0), 0) : 0;
  const profile = detail?.profile;
  const requiredChecks = profile && detail?.allowedActions.includes("VERIFY") ? checksByType[profile.importerType] : [];
  const allChecked = requiredChecks.every(item => checks[item]);
  const actions = (detail?.allowedActions ?? []) as Action[];

  return <div className="iv-admin">
    <header className="iv-admin-head">
      <div><p className="importer-eyebrow">CUSTOMS OFFICER{listing?.region && ` · ${listing.region}`}</p><h1>Importer verification</h1>
        <p>Every importer registered in your region. Open an importer to check their documents, then approve, reject, suspend or reinstate them.</p></div>
      <button type="button" className="iv-icon-button" onClick={() => void load()} aria-label="Refresh"><FiRefreshCw aria-hidden="true" /></button>
    </header>

    <div className="iv-stats" role="tablist" aria-label="Filter importers by status">
      {statusOrder.map(status => <button key={status} type="button" role="tab" aria-selected={filter === status} className={`iv-stat is-${status.toLowerCase().replaceAll("_", "-")}${filter === status ? " is-active" : ""}`} onClick={() => setFilter(status)}>
        <span>{tabLabels[status]}</span><strong>{counts?.[status] ?? "–"}</strong></button>)}
      <button type="button" role="tab" aria-selected={filter === ""} className={`iv-stat is-all${filter === "" ? " is-active" : ""}`} onClick={() => setFilter("")}><span>All importers</span><strong>{counts ? total : "–"}</strong></button>
    </div>

    {error && <div className="importer-error" role="alert">{error}</div>}
    {notice && !detail && <div className="importer-success" role="status">{notice}</div>}

    <section className="iv-table-card">
      <div className="iv-table-toolbar">
        <h2>{filter ? tabLabels[filter] : "All importers"} <small>{listing ? `${listing.items.length} shown` : ""}</small></h2>
        <label className="iv-search"><FiSearch aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} maxLength={100} placeholder="Search name, TIN, email or city" aria-label="Search importers" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><FiX /></button>}</label>
      </div>
      <div className="iv-table-scroll">
        <table className="iv-table">
          <thead><tr><th scope="col">Importer</th><th scope="col">Type</th><th scope="col">TIN</th><th scope="col">City</th><th scope="col">Status</th><th scope="col">Registered</th><th scope="col">Last decision</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {loading && !listing ? <tr><td colSpan={8} className="iv-table-empty">Loading importers…</td></tr>
              : listing?.items.length ? listing.items.map(row => <tr key={row.id} className={detail?.profile.id === row.id ? "is-selected" : ""} onClick={() => void open(row.id)}>
                <td data-label="Importer"><strong>{row.legalName}</strong><small>{row.applicant !== row.legalName ? `${row.applicant} · ` : ""}{row.email}</small></td>
                <td data-label="Type">{typeTitle(row.importerType)}</td>
                <td data-label="TIN" className="iv-mono">{row.tin || "—"}</td>
                <td data-label="City">{row.city}</td>
                <td data-label="Status"><StatusPill status={row.verificationStatus} /></td>
                <td data-label="Registered">{shortDate(row.submittedAt)}</td>
                <td data-label="Last decision">{shortDate(row.reviewedAt)}</td>
                <td className="iv-table-action"><button type="button" className="iv-open" onClick={event => { event.stopPropagation(); void open(row.id); }} disabled={opening === row.id}>{opening === row.id ? "Opening…" : "Open"}<FiChevronRight aria-hidden="true" /></button></td>
              </tr>)
              : <tr><td colSpan={8} className="iv-table-empty">{query ? `No importers match “${query}”.` : `No ${filter ? tabLabels[filter].toLowerCase() : ""} importers in ${listing?.region ?? "your region"}.`}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    {detail && profile && <>
      <div className="iv-drawer-backdrop" onClick={() => setDetail(null)} />
      <aside className="iv-drawer" role="dialog" aria-modal="true" aria-labelledby="iv-drawer-title">
        <header className="iv-drawer-head">
          <div><p className="importer-eyebrow">{typeTitle(profile.importerType).toUpperCase()}</p><h2 id="iv-drawer-title">{profile.legalName}</h2>
            <p><StatusPill status={profile.verificationStatus} /> {detail.account.fullName} · {detail.account.email}</p></div>
          <button type="button" className="iv-icon-button" onClick={() => setDetail(null)} aria-label="Close"><FiX aria-hidden="true" /></button>
        </header>
        <div className="iv-drawer-body">
          {notice && <div className="importer-success" role="status">{notice}</div>}
          {(detail.duplicates.tinMatches > 0 || detail.duplicates.idMatches > 0) && <div className="iv-callout is-warning"><FiAlertTriangle aria-hidden="true" /> <strong>Possible duplicate.</strong> {detail.duplicates.tinMatches > 0 && `${detail.duplicates.tinMatches} other account(s) registered this TIN. `}{detail.duplicates.idMatches > 0 && `${detail.duplicates.idMatches} other account(s) used this identity document.`} Confirm the applicant is authorised.</div>}

          <section><h3>Registration details</h3>
            <dl className="iv-detail-grid">
              {profile.tradeName && <div><dt>Trade name</dt><dd>{profile.tradeName}</dd></div>}
              <div><dt>TIN</dt><dd className="iv-mono">{profile.tin || "Not provided"}</dd></div>
              {profile.importerType === "BUSINESS" && <><div><dt>Trade licence</dt><dd>{profile.tradeLicenseNumber}<small>valid to {shortDate(profile.tradeLicenseExpiry)}</small></dd></div><div><dt>Commercial registration</dt><dd>{profile.businessRegistrationNumber}</dd></div><div><dt>VAT number</dt><dd>{profile.vatNumber || "—"}</dd></div></>}
              {profile.importerType === "CUSTOMS_AGENT" && <div><dt>Agent licence</dt><dd>{profile.agentLicenseNumber}<small>valid to {shortDate(profile.agentLicenseExpiry)}</small></dd></div>}
              {profile.representativeRole && <div><dt>Applicant role</dt><dd>{profile.representativeRole}</dd></div>}
              {profile.residencyStatus && <div><dt>Residency</dt><dd>{residencyLabels[profile.residencyStatus] ?? profile.residencyStatus}</dd></div>}
              <div><dt>Identity document</dt><dd>{idTypeLabels[profile.idType] ?? profile.idType}<small className="iv-mono">{profile.idNumber}</small></dd></div>
              <div><dt>Nationality</dt><dd>{new Intl.DisplayNames(["en"], { type: "region" }).of(profile.nationality) ?? profile.nationality}</dd></div>
              <div><dt>Phone</dt><dd className="iv-mono">{profile.phone}</dd></div>
              <div><dt>Address</dt><dd>{[profile.addressLine, profile.woreda, profile.city, profile.regionName].filter(Boolean).join(", ")}</dd></div>
              <div><dt>Registered</dt><dd>{new Date(profile.submittedAt).toLocaleString()}</dd></div>
            </dl>
          </section>

          <section><h3>Documents <small>{profile.documents.length}</small></h3>
            <ul className="iv-doc-list">{profile.documents.map(document => <li key={document.kind}>
              <div><strong>{documentLabels[document.kind]?.label ?? document.kind}</strong><small>{document.fileName} · {Math.max(1, Math.round(document.size / 1024))} KB</small></div>
              <ImporterDocumentPreview path={`/importer-verifications/${profile.id}/documents/${document.kind}`} kind={document.kind} label={documentLabels[document.kind]?.label ?? document.kind} contentType={document.contentType} fileName={document.fileName} />
            </li>)}</ul>
          </section>

          {detail.history.length > 0 && <section><h3>History</h3>
            <ol className="iv-history">{detail.history.map((entry, index) => <li key={index}><strong>{historyLabel(entry.action)}</strong><small>{new Date(entry.occurredAt).toLocaleString()} · {entry.username}</small>{entry.note && <p>{entry.note}</p>}</li>)}</ol>
          </section>}
        </div>

        <footer className="iv-drawer-actions">
          {actions.length === 0 ? <p className="iv-muted">{profile.verificationStatus === "REJECTED" ? "This importer was rejected. No further decisions are available." : "The importer is updating their application. You can decide again once they resubmit."}</p> : <>
            {requiredChecks.length > 0 && <fieldset className="iv-checks"><legend>Before approving, confirm</legend>{requiredChecks.map(item => <label key={item}><input type="checkbox" checked={!!checks[item]} onChange={event => setChecks(current => ({ ...current, [item]: event.target.checked }))} />{item}</label>)}</fieldset>}
            <label className="iv-note-field"><span>Reason / note to importer{actions.some(action => actionConfig[action].needsReason) && <small> required to request information, reject or suspend</small>}</span>
              <textarea rows={3} value={note} onChange={event => { setNote(event.target.value); setPanelError(""); }} maxLength={2000} placeholder="Explain exactly what is missing, wrong or why the account is suspended." /></label>
            {panelError && <p className="iv-error" role="alert">{panelError}</p>}
            <div className="iv-action-row">{actions.map(action => { const config = actionConfig[action]; const Icon = config.icon;
              return <button key={action} type="button" className={`iv-action-btn ${config.tone}`} disabled={busy || (action === "VERIFY" && !allChecked)} onClick={() => void decide(action)}><Icon aria-hidden="true" />{config.label}</button>; })}</div>
            {actions.includes("VERIFY") && !allChecked && <small className="iv-muted">Tick every check to enable approval.</small>}
          </>}
        </footer>
      </aside>
    </>}
  </div>;
}
