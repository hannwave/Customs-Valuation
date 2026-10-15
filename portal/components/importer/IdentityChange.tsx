"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FiArrowRight, FiClock, FiEdit3, FiX } from "react-icons/fi";
import { DocumentDrop } from "@/components/importer/declaration/DocumentDrop";
import { cancelIdentityChange, requestIdentityChange, type IdentityChange } from "@/lib/importer";
import { toast } from "@/lib/toast";

const statusText: Record<IdentityChange["status"], string> = { PENDING: "Waiting for a Customs Officer", APPROVED: "Approved", REJECTED: "Not approved", CANCELLED: "Cancelled" };

/** The importer's form to change verified details. An officer in their region checks the document before anything changes. */
export function IdentityChangeDialog({ current, hasProfile, onClose, onSent }: {
  current: { fullName: string; legalName: string; tin: string }; hasProfile: boolean; onClose: () => void; onSent: (request: IdentityChange) => void;
}) {
  const [values, setValues] = useState(current);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const tin = values.tin.replace(/\D/g, "");
  const changed = values.fullName.trim() !== current.fullName || (hasProfile && (values.legalName.trim() !== current.legalName || tin !== current.tin));
  const problem = !changed ? "Change at least one detail." : values.fullName.trim().length < 2 ? "Enter your full name." : hasProfile && values.legalName.trim().length < 2 ? "Enter the registered name."
    : hasProfile && tin !== current.tin && tin.length !== 10 ? "A TIN has 10 digits." : reason.trim().length < 10 ? "Explain why the details changed (at least 10 characters)." : !file ? "Attach a document that proves the change." : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problem) { toast.warning(problem, { title: "Check the request" }); return; }
    const form = new FormData();
    if (values.fullName.trim() !== current.fullName) form.set("FullName", values.fullName.trim());
    if (hasProfile && values.legalName.trim() !== current.legalName) form.set("LegalName", values.legalName.trim());
    if (hasProfile && tin !== current.tin) form.set("Tin", tin);
    form.set("Reason", reason.trim()); form.set("Document", file as File);
    setBusy(true);
    try { onSent(await requestIdentityChange(form)); toast.success("A Customs Officer in your region will check the document and approve the change.", { title: "Change request sent" }); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "The change request could not be sent.", { title: "Request not sent" }); }
    finally { setBusy(false); }
  }

  const field = (label: string, key: "fullName" | "legalName" | "tin", hint: string) => {
    const was = current[key], now = key === "tin" ? tin : values[key].trim();
    return <label className="pf-field ic-field"><span>{label}{now !== was && <em className="ic-changed">changed</em>}</span>
      <div><input value={values[key]} onChange={event => setValues({ ...values, [key]: event.target.value })} maxLength={key === "tin" ? 14 : 200} inputMode={key === "tin" ? "numeric" : undefined} /></div>
      <small>{now !== was ? <>Now: <s>{was || "—"}</s> <FiArrowRight aria-hidden="true" /> <b>{now || "—"}</b></> : hint}</small></label>;
  };

  return <div className="ic-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="ic-dialog" role="dialog" aria-modal="true" aria-labelledby="ic-title" onSubmit={event => void submit(event)} noValidate>
      <header><div><span>Change of verified details</span><h2 id="ic-title">Request a change</h2><p>Your name{hasProfile ? ", registered name and TIN were" : " was"} checked by Customs. A Customs Officer must approve any change after checking your document.</p></div>
        <button type="button" className="iv-icon-button" onClick={onClose} aria-label="Close"><FiX aria-hidden="true" /></button></header>
      <div className="ic-body">
        {field("Full name", "fullName", "Your own name, as on your ID.")}
        {hasProfile && field("Registered name", "legalName", "The business or importer name on your licence.")}
        {hasProfile && field("TIN", "tin", "10-digit Taxpayer Identification Number.")}
        <label className="pf-field ic-field"><span>Why did it change?</span><div className="is-area"><textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} placeholder="e.g. Our trade licence was renewed under the new company name." /></div></label>
        <DocumentDrop label="Supporting document" hint="An ID, renewed trade licence or TIN certificate showing the new details. PDF, JPG or PNG up to 10 MB." kind="CHANGE_EVIDENCE" file={file} onChange={setFile} />
      </div>
      <footer><button type="button" className="iv-secondary" onClick={onClose}>Cancel</button><button type="submit" className="iv-primary" disabled={busy}>{busy ? "Sending…" : "Send for approval"}</button></footer>
    </form>
  </div>;
}

/** The latest change request on the profile: what was asked, its status, and a cancel button while it waits. */
export function IdentityChangeStatus({ request, onChange }: { request: IdentityChange; onChange: (request: IdentityChange) => void }) {
  const [busy, setBusy] = useState(false);
  async function cancel() {
    setBusy(true);
    try { onChange(await cancelIdentityChange(request.id)); toast.info("The change request was cancelled."); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "The request could not be cancelled."); }
    finally { setBusy(false); }
  }
  const tone = request.status === "PENDING" ? "warning" : request.status === "APPROVED" ? "success" : request.status === "REJECTED" ? "danger" : "neutral";
  return <section className={`ic-status is-${tone}`} aria-label="Change request">
    <span className="ic-status-icon" aria-hidden="true">{request.status === "PENDING" ? <FiClock /> : <FiEdit3 />}</span>
    <div className="ic-status-body">
      <strong>{request.status === "PENDING" ? "Change of details waiting for approval" : `Change of details: ${statusText[request.status].toLowerCase()}`}</strong>
      <ul>{request.changes.map(change => <li key={change.field}><span>{change.label}</span><s>{change.current || "—"}</s><FiArrowRight aria-hidden="true" /><b>{change.requested}</b></li>)}</ul>
      <small>Sent {new Date(request.createdAt).toLocaleString()}{request.reviewedAt ? ` · decided ${new Date(request.reviewedAt).toLocaleString()}` : ""}</small>
      {request.reviewNote && <blockquote>{request.reviewNote}</blockquote>}
    </div>
    {request.status === "PENDING" && <button type="button" className="iv-secondary" onClick={() => void cancel()} disabled={busy}>{busy ? "Cancelling…" : "Cancel request"}</button>}
  </section>;
}
