"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { FiCheck, FiFileText, FiSend, FiRotateCcw, FiXCircle } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { getSessionAccessToken } from "@/lib/auth/session";
import type { HsCode, PagedResult } from "@/lib/types/customs";
import { locationLabel, roleLabel, workspaceApi, type ValuationDecision, type WorkspaceProfile } from "@/lib/workspace";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
async function findHsCode(code: string): Promise<HsCode> {
  const response = await fetch(`${apiBase}/api/hs-codes?search=${encodeURIComponent(code)}&page=1&pageSize=20`, { headers: { Authorization: `Bearer ${getSessionAccessToken()}` } });
  if (!response.ok) throw new Error("HS code lookup failed. Check the code and API connection.");
  const data = await response.json() as PagedResult<HsCode>;
  const normalized = code.replaceAll(".", "").trim().toLowerCase();
  const item = data.items.find(row => row.code.replaceAll(".", "").toLowerCase() === normalized);
  if (!item) throw new Error("Select an exact HS code from the Ethiopian tariff catalogue.");
  return item;
}

export default function ValuationDecisionsPage() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [decisions, setDecisions] = useState<ValuationDecision[]>([]);
  const [hsCodes, setHsCodes] = useState<Record<string, HsCode>>({});
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [current, rows] = await Promise.all([workspaceApi<WorkspaceProfile>("/me"), workspaceApi<ValuationDecision[]>("/decisions")]);
      setProfile(current); setDecisions(rows);
      const unique = [...new Set(rows.map(row => row.hsCodeId))];
      const lookups = await Promise.all(unique.map(async id => {
        const response = await fetch(`${apiBase}/api/hs-codes/${id}`, { headers: { Authorization: `Bearer ${getSessionAccessToken()}` } });
        return [id, response.ok ? await response.json() as HsCode : null] as const;
      }));
      setHsCodes(Object.fromEntries(lookups.filter((entry): entry is readonly [string, HsCode] => Boolean(entry[1]))));
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Valuation decisions could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const hs = await findHsCode(String(form.get("hsCode") ?? ""));
      await workspaceApi("/decisions", { method: "POST", body: JSON.stringify({
        hsCodeId: hs.id, locationId: form.get("locationId"), selectedReferenceValue: Number(form.get("selectedReferenceValue")),
        currency: String(form.get("currency")).toUpperCase(), decision: form.get("decision"), justification: form.get("justification"), evidence: form.get("evidence"), version: null,
      }) });
      event.currentTarget.reset(); setNotice("Draft saved with an immutable location snapshot and audit entry."); await load();
    } catch (ex) { setError(ex instanceof Error ? ex.message : "The draft could not be saved."); }
    finally { setBusy(""); }
  }
  async function submit(decision: ValuationDecision) {
    setBusy(decision.id); setError(""); setNotice("");
    try { await workspaceApi(`/decisions/${decision.id}/submit`, { method: "POST", body: JSON.stringify({ version: decision.version, justification: decision.justification }) }); setNotice("Decision submitted for review."); await load(); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Submission failed."); }
    finally { setBusy(""); }
  }
  async function review(decision: ValuationDecision, outcome: "Approved" | "Returned" | "Rejected") {
    setBusy(decision.id); setError(""); setNotice("");
    try { await workspaceApi(`/decisions/${decision.id}/review`, { method: "POST", body: JSON.stringify({ version: decision.version, justification: reviewReasons[decision.id] ?? "", outcome }) }); setNotice(`Decision ${outcome.toLowerCase()} with reviewer justification.`); await load(); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "Review failed."); }
    finally { setBusy(""); }
  }

  if (loading) return <DataState kind="loading" title="Loading valuation decisions" description="Applying your role and assigned location to the decision register." />;
  if (!profile) return <DataState kind="error" title="Decisions are unavailable" description={error} onRetry={() => void load()} />;
  const isOfficer = profile.user.role === "CustomsOfficer";
  const isCustomsAdministrator = profile.user.role === "CustomsAdministrator";
  const operationalLocations = profile.locations.filter(location => location.status === "ACTIVE" && (location.supportsValuation || location.supportsInspection));
  return <div className="management-page">
    <div className="page-heading"><div><p className="eyebrow">Decision workflow</p><h1>Valuation decisions</h1><p className="lead">{isOfficer ? "Prepare evidence-based determinations and submit them for review." : "Review submitted determinations from your assigned locations."}</p></div><span className="workspace-tag"><FiFileText />{roleLabel(profile.user.role)}</span></div>
    {error && <DataState kind="error" compact title="Decision action failed" description={error} onRetry={() => void load()} />}
    {notice && <p className="management-notice" role="status">{notice}</p>}

    {isOfficer && <section className="admin-panel">
      <div className="panel-heading"><div><h2>Create a valuation draft</h2><p>The source observations remain unchanged; reference them in the evidence record.</p></div></div>
      {operationalLocations.length === 0 ? <DataState kind="empty" compact title="No operational valuation location assigned" description="Ask your Customs Administrator to assign you to an active valuation or inspection office." /> : <form className="management-form" onSubmit={create}>
        <label><span>HS code</span><input name="hsCode" required placeholder="e.g. 847130" /></label>
        <label><span>Decision location</span><select name="locationId" required defaultValue=""><option value="" disabled>Select assigned office</option>{operationalLocations.map(location => <option key={location.id} value={location.id}>{locationLabel(location)}</option>)}</select></label>
        <label><span>Selected reference value</span><input name="selectedReferenceValue" type="number" min="0.01" step="0.01" required /></label>
        <label><span>Currency</span><input name="currency" defaultValue="USD" pattern="[A-Za-z]{3}" maxLength={3} required /></label>
        <label className="wide-field"><span>Decision</span><input name="decision" required placeholder="Accepted, adjusted, or further examination required" /></label>
        <label className="wide-field"><span>Evidence references</span><textarea name="evidence" required minLength={10} rows={4} placeholder="Record observation IDs, source URLs, dates, comparable goods, and exclusions." /></label>
        <label className="wide-field"><span>Officer justification</span><textarea name="justification" required minLength={10} rows={4} placeholder="Explain why the selected value is supported by the evidence." /></label>
        <div className="form-actions"><button className="primary-button" type="submit" disabled={busy === "create"}>{busy === "create" ? "Saving…" : "Save draft"}</button></div>
      </form>}
    </section>}

    <section className="admin-panel">
      <div className="panel-heading"><div><h2>{isOfficer ? "My decisions" : "Assigned-location review queue"}</h2><p>{decisions.length} decision{decisions.length === 1 ? "" : "s"} visible under current access rules.</p></div></div>
      {decisions.length === 0 ? <DataState kind="empty" compact title={isOfficer ? "No decisions recorded" : "No decisions in your assigned locations"} description={isOfficer ? "Create the first draft above." : "Submitted officer decisions will appear here for review."} /> : <div className="decision-list">{decisions.map(decision => {
        const hs = hsCodes[decision.hsCodeId]; const location = profile.locations.find(item => item.id === decision.locationId);
        const canReview = !isOfficer && decision.status === "Submitted"; const reason = reviewReasons[decision.id] ?? "";
        return <article className="decision-card" key={decision.id}><div className="decision-card-heading"><div><span className={`decision-status decision-status--${decision.status.toLowerCase()}`}>{decision.status}</span><h3>{hs ? `${hs.code} · ${hs.descriptionEn}` : `HS record ${decision.hsCodeId.slice(0, 8)}`}</h3><small>{location?.displayName ?? location?.name ?? "Historical location"} · {new Date(decision.recordedAt).toLocaleString()}</small></div><strong>{decision.currency} {decision.selectedReferenceValue.toLocaleString()}</strong></div>
          <dl className="decision-details"><div><dt>Decision</dt><dd>{decision.decision}</dd></div><div><dt>Officer justification</dt><dd>{decision.justification}</dd></div><div><dt>Evidence</dt><dd>{decision.evidenceNotes}</dd></div>{decision.reviewJustification && <div><dt>Review</dt><dd>{decision.reviewJustification}</dd></div>}</dl>
          {isOfficer && decision.status === "Draft" && decision.locationId && <div className="row-actions"><button className="approve-button" type="button" disabled={busy === decision.id} onClick={() => void submit(decision)}><FiSend />{busy === decision.id ? "Submitting…" : "Submit for review"}</button></div>}
          {isOfficer && decision.status === "Draft" && !decision.locationId && <p className="unassigned-decision-note">Personal officer draft. Assign an office before formal submission and review.</p>}
          {canReview && <div className="review-actions"><label><span>Reviewer justification</span><textarea minLength={10} rows={3} value={reason} onChange={event => setReviewReasons(values => ({ ...values, [decision.id]: event.target.value }))} /></label><div className="row-actions"><button className="secondary-button" type="button" disabled={busy === decision.id || reason.length < 10} onClick={() => void review(decision, "Returned")}><FiRotateCcw />Return</button>{isCustomsAdministrator && <button className="secondary-button danger-button" type="button" disabled={busy === decision.id || reason.length < 10} onClick={() => void review(decision, "Rejected")}><FiXCircle />Reject</button>}<button className="approve-button" type="button" disabled={busy === decision.id || reason.length < 10} onClick={() => void review(decision, "Approved")}><FiCheck />Approve</button></div></div>}
        </article>;
      })}</div>}
    </section>
  </div>;
}
