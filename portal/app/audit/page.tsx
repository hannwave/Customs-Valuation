"use client";

import { useCallback, useEffect, useState } from "react";
import { FiActivity, FiRefreshCw, FiShield } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { roleLabel, workspaceApi, type AuditRecord, type WorkspaceProfile } from "@/lib/workspace";

export default function AuditPage() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [records, setRecords] = useState<AuditRecord[]>([]);
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
  if (loading) return <DataState kind="loading" title="Loading audit trail" description="Retrieving records authorized for your role and location scope." />;
  if (!profile) return <DataState kind="error" title="Audit trail is unavailable" description={error} onRetry={() => void load()} />;
  const scopeText = profile.user.role === "SystemAdministrator" ? "Global audit access" : profile.user.role === "CustomsAdministrator" ? "Assigned locations and descendants" : "Your own actions only";
  return <div className="management-page">
    <div className="page-heading"><div><p className="eyebrow">Oversight</p><h1>Audit trail</h1><p className="lead">Immutable operational events with actor, record, location, reason, and before/after evidence.</p></div><button className="secondary-button" type="button" onClick={() => void load()}><FiRefreshCw />Refresh</button></div>
    <div className="role-banner"><FiShield /><strong>{roleLabel(profile.user.role)}</strong><span>{scopeText}</span><span className="badge">{records.length} latest records</span></div>
    {error && <DataState kind="error" compact title="Audit refresh failed" description={error} onRetry={() => void load()} />}
    <section className="admin-panel">
      <div className="panel-heading"><div><h2>Authorized activity</h2><p>The API applies scope before returning any event.</p></div><FiActivity /></div>
      {records.length === 0 ? <DataState kind="empty" compact title="No audit events in scope" description="Audited user, location, and valuation actions will appear here." /> : <div className="table-wrap"><table><thead><tr><th>Date and actor</th><th>Module</th><th>Action</th><th>Location</th><th>Record</th><th>Reason</th></tr></thead><tbody>{records.map(record => <tr key={record.id}><td>{new Date(record.occurredAt).toLocaleString()}<small>{record.username || record.userId}</small></td><td>{record.module}</td><td><span className="badge">{record.action.replaceAll("_", " ")}</span></td><td>{record.locationId ? record.locationId.slice(0, 8) : "Global"}</td><td>{record.recordId.slice(0, 8)}</td><td>{record.justification || record.decision || "—"}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
