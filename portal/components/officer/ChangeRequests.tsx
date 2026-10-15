"use client";

import { useCallback, useEffect, useState } from "react";
import { FiAlertTriangle, FiArrowRight, FiCalendar, FiCheck, FiEdit3, FiFileText, FiSlash, FiX } from "react-icons/fi";
import { ImporterDocumentPreview } from "@/components/ImporterDocumentPreview";
import { importerApi, importerTypes, type IdentityChange } from "@/lib/importer";
import { toast } from "@/lib/toast";

type Listing = { counts: Record<string, number>; items: IdentityChange[] };
type Detail = { request: IdentityChange; profile: { id: string; legalName: string; importerType: string; tin: string; verificationStatus: string } | null; tinTaken: number };

const tabs: { key: string; label: string; tone: string }[] = [
  { key: "PENDING", label: "Waiting", tone: "warning" }, { key: "APPROVED", label: "Approved", tone: "success" },
  { key: "REJECTED", label: "Rejected", tone: "danger" }, { key: "ALL", label: "All", tone: "neutral" },
];
const checks = ["The document shows the requested details", "The document is genuine, current and readable", "The person or business matches this importer account"];
const typeTitle = (type?: string | null) => importerTypes.find(item => item.value === type)?.title ?? "Importer";
const shortDate = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/** Officers review importers' requests to change verified details: compare current and requested values against the document, then decide. */
export function ChangeRequestsPanel({ onCount }: { onCount?: (pending: number) => void }) {
  const [status, setStatus] = useState("PENDING");
  const [listing, setListing] = useState<Listing | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const result = await importerApi<Listing>(`/importer-verifications/change-requests?status=${status}`); setListing(result); onCount?.(result.counts.PENDING ?? 0); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "Change requests could not be loaded."); }
  }, [status, onCount]);
  useEffect(() => { void load(); }, [load]);

  async function open(id: string) {
    try { setDetail(await importerApi<Detail>(`/importer-verifications/change-requests/${id}`)); setTicks({}); setNote(""); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "The request could not be opened."); }
  }
  async function decide(action: "APPROVE" | "REJECT") {
    if (!detail) return;
    if (action === "REJECT" && note.trim().length < 10) { toast.warning("Tell the importer why, in at least 10 characters.", { title: "Reason needed" }); return; }
    setBusy(true);
    try {
      await importerApi(`/importer-verifications/change-requests/${detail.request.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim(), expectedVersion: detail.request.version }) });
      toast.success(action === "APPROVE" ? "The importer's details were updated and they were notified." : "The importer was told why the change was not approved.", { title: action === "APPROVE" ? "Change approved" : "Change rejected" });
      setDetail(null); void load();
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "The decision could not be saved."); }
    finally { setBusy(false); }
  }

  const rows = listing?.items ?? [];
  const request = detail?.request;
  const allTicked = checks.every(item => ticks[item]);

  return <>
    <div className="ip-stats dc-filters is-four" role="tablist" aria-label="Filter change requests">
      {tabs.map(tab => <button key={tab.key} type="button" role="tab" aria-selected={status === tab.key} className={`ip-stat is-${tab.tone}${status === tab.key ? " is-selected" : ""}`} onClick={() => setStatus(tab.key)}>
        <span>{tab.label}</span><strong>{listing ? tab.key === "ALL" ? Object.values(listing.counts).reduce((sum, value) => sum + value, 0) : listing.counts[tab.key] ?? 0 : "–"}</strong></button>)}
    </div>
    <section className="dc-panel">
      {!listing ? <ul className="dc-list" aria-busy="true">{[0, 1].map(index => <li key={index} className="dc-case is-skeleton"><span /><span /><span /></li>)}</ul>
        : rows.length === 0 ? <div className="dc-empty"><FiEdit3 aria-hidden="true" /><strong>No change requests here</strong><p>Importers in your region who ask to change their verified name, registered name or TIN appear here.</p></div>
        : <ul className="dc-list">{rows.map(row => <li key={row.id} className={`dc-case is-${row.status === "PENDING" ? "warning" : row.status === "APPROVED" ? "success" : row.status === "REJECTED" ? "danger" : "neutral"}`} onClick={() => void open(row.id)}>
          <span className="dc-case-icon" aria-hidden="true"><FiEdit3 /></span>
          <div className="dc-case-main"><strong>{row.importerName || "Importer"}</strong>
            <span className="dc-tariff">{row.changes.map(change => `${change.label}: ${change.current || "—"} → ${change.requested}`).join(" · ")}</span>
            <span className="dc-tags"><span>{typeTitle(row.importerType)}</span>{row.email && <span>{row.email}</span>}</span></div>
          <div className="dc-case-status"><span className={`iv-pill is-${row.status.toLowerCase()}`}>{row.status === "PENDING" ? "Waiting" : row.status.charAt(0) + row.status.slice(1).toLowerCase()}</span></div>
          <dl className="dc-case-dates"><div><dt><FiCalendar aria-hidden="true" />Requested</dt><dd>{shortDate(row.createdAt)}</dd></div><div><dt><FiCheck aria-hidden="true" />Decided</dt><dd>{shortDate(row.reviewedAt)}</dd></div></dl>
          <div className="dc-actions"><button type="button" className={`dc-open${row.status === "PENDING" ? " is-urgent" : ""}`} onClick={event => { event.stopPropagation(); void open(row.id); }}><span>{row.status === "PENDING" ? "Review" : "Open"}</span><i aria-hidden="true"><FiArrowRight /></i></button></div>
        </li>)}</ul>}
    </section>

    {detail && request && <>
      <div className="iv-drawer-backdrop" onClick={() => setDetail(null)} />
      <aside className="iv-drawer cr-drawer" role="dialog" aria-modal="true" aria-labelledby="cr-title">
        <header className="iv-drawer-head"><div><p className="importer-eyebrow">CHANGE OF VERIFIED DETAILS</p><h2 id="cr-title">{request.importerName}</h2><p>{typeTitle(request.importerType)} · {request.email} · requested {new Date(request.createdAt).toLocaleString()}</p></div>
          <button type="button" className="iv-icon-button" onClick={() => setDetail(null)} aria-label="Close"><FiX aria-hidden="true" /></button></header>
        <div className="iv-drawer-body">
          {detail.tinTaken > 0 && <div className="iv-callout is-warning"><FiAlertTriangle aria-hidden="true" /> <strong>TIN already registered.</strong> {detail.tinTaken} other importer account(s) use the requested TIN.</div>}
          <section><h3>Requested change</h3>
            <table className="cr-compare"><thead><tr><th>Detail</th><th>Current</th><th aria-hidden="true" /><th>Requested</th></tr></thead>
              <tbody>{request.changes.map(change => <tr key={change.field}><th scope="row">{change.label}</th><td>{change.current || "—"}</td><td aria-hidden="true"><FiArrowRight /></td><td><b>{change.requested}</b></td></tr>)}</tbody></table></section>
          <section><h3>Reason given</h3><p className="cr-reason">{request.reason}</p></section>
          <section><h3>Supporting document</h3>
            <div className="cr-document"><FiFileText aria-hidden="true" /><div><strong>{request.document.fileName}</strong><small>{Math.max(1, Math.round(request.document.size / 1024))} KB · SHA-256 {request.document.sha256.slice(0, 12)}…</small></div>
              <ImporterDocumentPreview path={`/importer-verifications/change-requests/${request.id}/document`} kind="CHANGE_EVIDENCE" label="Supporting document" contentType={request.document.contentType} fileName={request.document.fileName} /></div></section>
          {request.status !== "PENDING" && <section><h3>Decision</h3><p className="cr-reason">{request.status === "APPROVED" ? "Approved" : request.status === "REJECTED" ? "Rejected" : "Cancelled by the importer"}{request.reviewedAt ? ` on ${new Date(request.reviewedAt).toLocaleString()}` : ""}{request.reviewNote ? ` — ${request.reviewNote}` : ""}</p></section>}
        </div>
        {request.status === "PENDING" && <footer className="iv-drawer-actions">
          <fieldset className="iv-checks"><legend>Before approving, confirm against the document</legend>{checks.map(item => <label key={item}><input type="checkbox" checked={!!ticks[item]} onChange={event => setTicks(current => ({ ...current, [item]: event.target.checked }))} />{item}</label>)}</fieldset>
          <label className="iv-note-field"><span>Note to the importer<small> required to reject</small></span>
            <textarea rows={3} value={note} onChange={event => setNote(event.target.value)} maxLength={2000} placeholder="e.g. The licence shows a different company name. Upload the renewed licence." /></label>
          <div className="iv-action-row">
            <button type="button" className="iv-action-btn is-primary" disabled={busy || !allTicked} onClick={() => void decide("APPROVE")}><FiCheck aria-hidden="true" />Approve change</button>
            <button type="button" className="iv-action-btn is-danger" disabled={busy} onClick={() => void decide("REJECT")}><FiSlash aria-hidden="true" />Reject</button>
          </div>
          {!allTicked && <small className="iv-muted">Tick every check to enable approval.</small>}
        </footer>}
      </aside>
    </>}
  </>;
}
