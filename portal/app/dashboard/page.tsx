"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiActivity, FiArrowRight, FiCheckCircle, FiMapPin, FiShield, FiUserPlus, FiUsers } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { ValuationSearch } from "@/components/valuation/ValuationSearch";
import { loadPhase2 } from "@/lib/phase2Api";
import { type ImporterDeclaration } from "@/lib/importer";
import type { Phase2Response } from "@/lib/types/customs";
import { roleLabel, workspaceApi, type DashboardLocation, type WorkspaceDashboard, type WorkspaceProfile } from "@/lib/workspace";
import { readValuationSession } from "@/lib/valuation-session";
import { HsItem } from "@/components/hs/HsItem";
import { ToastMessage } from "@/components/Toaster";

function KpiGrid({ data }: { data: WorkspaceDashboard }) {
  return <section className="dashboard-kpis" aria-label="Dashboard summary">{data.kpis.map(kpi => <article className={`dashboard-kpi dashboard-kpi--${kpi.tone}`} key={kpi.key}><span>{kpi.label}</span><strong>{kpi.value}</strong><small>{kpi.detail}</small></article>)}</section>;
}

function LocationTree({ locations }: { locations: DashboardLocation[] }) {
  const children = useMemo(() => {
    const map = new Map<string, DashboardLocation[]>();
    for (const location of locations) { const key = location.parentLocationId ?? "root"; map.set(key, [...(map.get(key) ?? []), location]); }
    return map;
  }, [locations]);
  function Branch({ parent = "root", depth = 0 }: { parent?: string; depth?: number }) {
    return <>{(children.get(parent) ?? []).map(location => <div key={location.id}>
      <div className="location-node" style={{ paddingLeft: `${12 + depth * 20}px` }}><span className="location-node-icon"><FiMapPin /></span><span><strong>{location.displayName || location.name}</strong><small>{location.officialCode} · {location.locationType.replaceAll("_", " ")}</small></span><em className={location.status === "ACTIVE" ? "is-online" : "is-muted"}>{location.status}</em></div>
      {depth < 4 && <Branch parent={location.id} depth={depth + 1} />}
    </div>)}</>;
  }
  return locations.length ? <div className="location-tree"><Branch /></div> : <DataState kind="empty" compact title="No locations configured" description="Create the official Customs hierarchy to activate location-based operations." />;
}

function DashboardHeader({ profile, eyebrow, title, description, actions }: { profile: WorkspaceProfile; eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="dashboard-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lead">{description}</p></div><div className="dashboard-heading-side"><span className="workspace-tag"><FiShield />{roleLabel(profile.user.role)}</span>{actions}</div></div>;
}

function money(value: number | null | undefined, currency: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function SystemDashboard({ data, profile }: { data: WorkspaceDashboard; profile: WorkspaceProfile }) {
  const regions = data.locations.filter(location => location.locationType === "REGION");
  const branches = data.locations.filter(location => location.locationType === "BRANCH");
  const administrators = data.employees.filter(employee => employee.user.role === "CustomsAdministrator");
  return <>
    <DashboardHeader profile={profile} eyebrow="System administration" title="Overview" description="Manage the Customs regions, branches, and administrator accounts from one place." actions={<div className="dashboard-quick-actions"><Link href="/administration/regions"><FiMapPin />Manage regions</Link><Link href="/administration/branches"><FiMapPin />Manage branches</Link><Link href="/administration"><FiUserPlus />Manage administrators</Link></div>} />
    <KpiGrid data={data} />
    <div className="system-overview-grid system-overview-grid--simple">
      <section className="dashboard-panel system-overview-structure"><div className="dashboard-panel-heading"><div><p className="eyebrow">Location management</p><h2>Regions and branches</h2><span>Keep the official two-level Customs hierarchy accurate.</span></div><Link href="/administration/organization">Open structure <FiArrowRight /></Link></div><div className="system-location-counts"><Link href="/administration/regions"><strong>{regions.length}</strong><span>Regions</span><small>Add or update regions</small></Link><Link href="/administration/branches"><strong>{branches.length}</strong><span>Branches</span><small>Manage branch offices</small></Link></div><LocationTree locations={data.locations} /></section>
      <section className="dashboard-panel system-overview-admins"><div className="dashboard-panel-heading"><div><p className="eyebrow">Access management</p><h2>Customs Administrators</h2><span>Administrator accounts responsible for branch operations.</span></div><Link href="/administration">Open administration <FiArrowRight /></Link></div>{administrators.length ? <div className="system-admin-list">{administrators.map(employee => <Link href="/administration" key={employee.user.id}><span className="system-admin-avatar"><FiUsers /></span><span><strong>{employee.user.fullName}</strong><small>{employee.user.email}</small></span><em className={employee.user.active ? "status-active" : "status-pending"}>{employee.user.status}</em></Link>)}</div> : <DataState kind="empty" compact title="No Customs Administrators" description="Approved Customs Administrator accounts will appear here." />}</section>
    </div>
  </>;
}

function AdminDashboard({ data, profile }: { data: WorkspaceDashboard; profile: WorkspaceProfile }) {
  const root = data.locations.find(location => !location.parentLocationId) ?? data.locations[0];
  const statusCounts = ["Submitted", "Draft", "Returned", "Approved"].map(status => ({ status, count: data.decisions.filter(decision => decision.status === status).length }));
  return <>
    <DashboardHeader profile={profile} eyebrow="Branch and district management" title={root?.displayName || root?.name || "My operational location"} description="People, office assignments, valuation workload, and cases requiring attention." actions={<div className="dashboard-quick-actions"><Link href="/administration"><FiUsers />Manage Officers</Link><Link href="/valuation-decisions"><FiCheckCircle />Review valuations</Link></div>} />
    <KpiGrid data={data} />
    <div className="dashboard-main-grid">
      <section className="dashboard-panel dashboard-panel--wide"><div className="dashboard-panel-heading"><div><p className="eyebrow">My assigned organization</p><h2>Assigned offices</h2><span>Locations available for your operational responsibilities</span></div></div><LocationTree locations={data.locations} /></section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Operational monitoring</p><h2>Valuation workload</h2></div><Link href="/valuation-decisions">Review queue <FiArrowRight /></Link></div><div className="workload-list">{statusCounts.map(item => <div key={item.status}><span>{item.status}</span><div><i style={{ width: `${Math.max(4, Math.min(100, item.count * 12))}%` }} /></div><strong>{item.count}</strong></div>)}</div></section>
      <section className="dashboard-panel dashboard-panel--full"><div className="dashboard-panel-heading"><div><p className="eyebrow">Employee management</p><h2>Officers in my location</h2><span>Current office, access status, and most recent account activity</span></div><Link href="/administration">Assignments <FiArrowRight /></Link></div>{data.employees.length ? <div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Officer</th><th>Employee number</th><th>Office</th><th>Responsibilities</th><th>Status</th><th>Last activity</th></tr></thead><tbody>{data.employees.map(employee => <tr key={employee.user.id}><td><strong>{employee.user.fullName}</strong><small>{employee.user.email}</small></td><td>{employee.user.employeeNumber || "—"}</td><td>{data.locations.find(location => location.id === employee.locationId)?.displayName ?? "Unassigned"}</td><td>General valuation</td><td><span className={employee.user.active ? "status-active" : "status-pending"}>{employee.user.status}</span></td><td>{employee.user.lastLoginAt ? new Date(employee.user.lastLoginAt).toLocaleString() : "No sign-in recorded"}</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No Officers in this location" description="Create or assign an Officer to a location." />}</section>
      <section className="dashboard-panel dashboard-panel--full"><div className="dashboard-panel-heading"><div><p className="eyebrow">Requires attention</p><h2>Submitted and returned valuations</h2></div><Link href="/valuation-decisions">Open all <FiArrowRight /></Link></div><DecisionTable data={data} filter={decision => decision.status === "Submitted" || decision.status === "Returned"} /></section>
    </div>
  </>;
}

function RecordedPriceReview({ caseId }: { caseId: string }) {
  const [record, setRecord] = useState<Phase2Response | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void loadPhase2(caseId).then(value => { if (active) setRecord(value); }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [caseId]);
  if (error) return <DataState kind="error" title="Case unavailable" description={error} />;
  if (!record) return <DataState kind="loading" title="Loading recorded price review" />;
  return <section className="assessment-change-summary"><h1>Recorded price review</h1><p>Case: {caseId} · Saved</p><h2>{record.phase1.productName}</h2><p>Selected customs value: {money(record.phase1.initialDuty, record.phase1.initialDutyCurrency)}</p><p>Source: {record.phase1.source}</p><p><a href={`/audit/cases/${caseId}`}>Review the decision, reasons, and evidence in case history</a></p></section>;
}

function OfficerDashboard({ profile }: { profile: WorkspaceProfile }) {
  const [importDeclaration, setImportDeclaration] = useState<ImporterDeclaration | null>(null);
  const [importError, setImportError] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("importDeclarationId");
    if (!id) return;
    // Importer declarations are valued, taxed and finalised in their own case workspace.
    window.location.replace(`/importer-review/${encodeURIComponent(id)}`);
  }, []);
  const [linkedCase, setLinkedCase] = useState("");
  useEffect(() => {
    const sync = () => setLinkedCase(new URLSearchParams(window.location.search).get("case") || "");
    sync(); window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const [activeSession, setActiveSession] = useState<ReturnType<typeof readValuationSession>>(null);
  useEffect(() => {
    const sync = () => setActiveSession(readValuationSession());
    sync(); window.addEventListener("storage", sync); window.addEventListener("focus", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", sync); };
  }, []);
  return <>
    <ToastMessage kind="error" message={importError} onClear={() => setImportError("")} />
    {importDeclaration && <section className="importer-handoff importer-card"><strong>Importer submission {importDeclaration.reference}</strong><p>{importDeclaration.productName} · {importDeclaration.originCountryName} · {importDeclaration.quantity} {importDeclaration.unit}</p><p>Purpose: {importDeclaration.importPurpose.replaceAll("_", " ")}. Requested treatment: {importDeclaration.requestedTreatments.length ? importDeclaration.requestedTreatments.join(", ").replaceAll("_", " ") : "none"}. Officer approval remains required for any exemption.</p><Link href="/importer-review">Review submitted details and documents</Link></section>}
    {/* Price review, documents, duties and taxes are all decided in the valuation search; its review step finalises them. */}
    {linkedCase ? <RecordedPriceReview key={linkedCase} caseId={linkedCase} /> : <ValuationSearch profile={profile} onSubmitted={() => setActiveSession(readValuationSession())} />}
    {activeSession && <section className="dashboard-session-strip"><span><FiCheckCircle />Active valuation session</span><strong>{activeSession.query}</strong><small>Started {new Date(activeSession.createdAt).toLocaleString()} · {activeSession.phase1Submitted ? "Price Review submitted" : "Price Review in progress"}</small></section>}
  </>;
}

function DecisionTable({ data, filter = () => true }: { data: WorkspaceDashboard; filter?: (decision: WorkspaceDashboard["decisions"][number]) => boolean }) {
  const rows = data.decisions.filter(filter).slice(0, 8);
  return rows.length ? <div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Item / HS code</th><th>Office</th><th>Reference value</th><th>Customer paid / invoice</th><th>Status</th><th>Recorded</th></tr></thead><tbody>{rows.map(decision => <tr key={decision.id}><td><strong><HsItem code={decision.hsCode} empty="Not classified" /></strong><small>{decision.product}</small></td><td>{data.locations.find(location => location.id === decision.locationId)?.officialCode ?? "—"}</td><td>{decision.currency} {decision.selectedReferenceValue.toLocaleString()}</td><td>{decision.declaredPriceAmount != null ? <>{decision.declaredPriceCurrency} {decision.declaredPriceAmount.toLocaleString()}<small>→ {decision.declaredPriceConvertedCurrency} {decision.declaredPriceConvertedAmount?.toLocaleString()} · {decision.receiptFileName || "Receipt missing"}</small></> : "Legacy record"}</td><td><span className={`decision-status decision-status--${decision.status.toLowerCase()}`}>{decision.status}</span></td><td>{new Date(decision.recordedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No valuation cases" description="Cases appear here as the valuation workflow is used." />;
}

function AuditList({ data }: { data: WorkspaceDashboard }) {
  return data.audit.length ? <div className="activity-list">{data.audit.map(item => <article key={item.id}><span className="activity-icon"><FiActivity /></span><div><strong>{item.action.replaceAll("_", " ")}</strong><p>{item.justification || `${item.module} record updated`}</p><small>{item.username || "System"} · {new Date(item.occurredAt).toLocaleString()}</small></div></article>)}</div> : <DataState kind="empty" compact title="No recent activity" description="Audited actions will appear here." />;
}

export default function Dashboard() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [data, setData] = useState<WorkspaceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const current = await workspaceApi<WorkspaceProfile>("/me");
      setProfile(current);
      if (current.user.role === "CustomsOfficer") { setData(null); return; }
      const dashboard = await workspaceApi<WorkspaceDashboard>("/dashboard");
      setData(dashboard);
    }
    catch (ex) { setError(ex instanceof Error ? ex.message : "The dashboard could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <DataState kind="loading" title="Preparing your dashboard" description="Loading the system, location, and work information authorized for your account." />;
  if (!profile || (profile.user.role !== "CustomsOfficer" && !data)) return <DataState kind="error" title="Dashboard unavailable" description={error} onRetry={() => void load()} />;
  if (profile.user.role === "CustomsOfficer") return <OfficerDashboard profile={profile} />;
  if (!data) return <DataState kind="error" title="Dashboard unavailable" description={error} onRetry={() => void load()} />;
  if (data.role === "SystemAdministrator") return <SystemDashboard data={data} profile={profile} />;
  if (data.role === "CustomsAdministrator") return <AdminDashboard data={data} profile={profile} />;
  return <DataState kind="error" title="Dashboard unavailable" description="The account role is not supported for this workspace." onRetry={() => void load()} />;
}
