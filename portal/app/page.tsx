"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiActivity, FiAlertTriangle, FiArrowRight, FiBookOpen, FiCheckCircle,
  FiFileText, FiGlobe, FiMapPin, FiSearch, FiShield,
  FiShoppingBag, FiTrendingUp, FiUserPlus, FiUsers,
} from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { roleLabel, workspaceApi, type DashboardLocation, type WorkspaceDashboard, type WorkspaceProfile } from "@/lib/workspace";

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
  return locations.length ? <div className="location-tree"><Branch /></div> : <DataState kind="empty" compact title="No locations configured" description="Create the official Customs hierarchy to activate scoped operations." />;
}

function DashboardHeader({ profile, eyebrow, title, description, actions }: { profile: WorkspaceProfile; eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="dashboard-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lead">{description}</p></div><div className="dashboard-heading-side"><span className="workspace-tag"><FiShield />{roleLabel(profile.user.role)}</span>{actions}</div></div>;
}

function SystemDashboard({ data, profile }: { data: WorkspaceDashboard; profile: WorkspaceProfile }) {
  return <>
    <DashboardHeader profile={profile} eyebrow="National control center" title="System overview" description="Organization, master data, integrations, and security across the Customs valuation platform." actions={<div className="dashboard-quick-actions"><Link href="/administration/locations"><FiMapPin />Add location</Link><Link href="/administration"><FiUserPlus />Create administrator</Link><Link href="/audit"><FiActivity />Audit logs</Link></div>} />
    <KpiGrid data={data} />
    <div className="dashboard-main-grid">
      <section className="dashboard-panel dashboard-panel--wide"><div className="dashboard-panel-heading"><div><p className="eyebrow">Organization</p><h2>Customs structure</h2><span>Official hierarchy and operational status</span></div><Link href="/administration/locations">Manage <FiArrowRight /></Link></div><LocationTree locations={data.locations} /></section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Data & integrations</p><h2>Source readiness</h2><span>Approved sources available to evidence workflows</span></div><Link href="/integrations">Configure <FiArrowRight /></Link></div><div className="health-list">{data.sources.length ? data.sources.map(source => <div key={source.id}><span className={`health-dot ${source.isApproved ? "is-online" : "is-error"}`} /><span><strong>{source.name}</strong><small>{source.pool}</small></span><em>{source.isApproved ? "Approved" : "Review"}</em></div>) : <DataState kind="empty" compact title="No source registry entries" description="Provider searches can run, but approved source master data has not been configured." />}</div></section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Master data</p><h2>Active HS revision</h2></div><Link href="/hs-codes">Open catalogue <FiArrowRight /></Link></div>{data.activeRevision ? <div className="revision-card"><FiBookOpen /><div><strong>{data.activeRevision.name}</strong><span>{data.activeRevision.codeCount.toLocaleString()} HS headings</span><small>Effective {new Date(data.activeRevision.effectiveDate).toLocaleDateString()} · {data.activeRevision.status}</small></div></div> : <DataState kind="empty" compact title="No HS revision" description="Import the approved Ethiopian tariff dataset." />}</section>
      <section className="dashboard-panel dashboard-panel--wide"><div className="dashboard-panel-heading"><div><p className="eyebrow">Security & administration</p><h2>Recent administrative activity</h2><span>Latest audited actions across the platform</span></div><Link href="/audit">Full audit <FiArrowRight /></Link></div><AuditList data={data} /></section>
    </div>
  </>;
}

function AdminDashboard({ data, profile }: { data: WorkspaceDashboard; profile: WorkspaceProfile }) {
  const root = data.locations.find(location => !location.parentLocationId) ?? data.locations[0];
  const statusCounts = ["Submitted", "Draft", "Returned", "Approved"].map(status => ({ status, count: data.decisions.filter(decision => decision.status === status).length }));
  return <>
    <DashboardHeader profile={profile} eyebrow="Branch and district management" title={root?.displayName || root?.name || "My operational scope"} description="People, office assignments, valuation workload, and cases requiring attention." actions={<div className="dashboard-quick-actions"><Link href="/administration"><FiUsers />Manage Officers</Link><Link href="/valuation-decisions"><FiCheckCircle />Review valuations</Link></div>} />
    <KpiGrid data={data} />
    <div className="dashboard-main-grid">
      <section className="dashboard-panel dashboard-panel--wide"><div className="dashboard-panel-heading"><div><p className="eyebrow">My organizational scope</p><h2>Authorized offices</h2><span>Only locations granted by System Administration are shown</span></div></div><LocationTree locations={data.locations} /></section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Operational monitoring</p><h2>Valuation workload</h2></div><Link href="/valuation-decisions">Review queue <FiArrowRight /></Link></div><div className="workload-list">{statusCounts.map(item => <div key={item.status}><span>{item.status}</span><div><i style={{ width: `${Math.max(4, Math.min(100, item.count * 12))}%` }} /></div><strong>{item.count}</strong></div>)}</div></section>
      <section className="dashboard-panel dashboard-panel--full"><div className="dashboard-panel-heading"><div><p className="eyebrow">Employee management</p><h2>Officers in my scope</h2><span>Current office, access status, and most recent account activity</span></div><Link href="/administration">Assignments <FiArrowRight /></Link></div>{data.employees.length ? <div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Officer</th><th>Employee number</th><th>Office</th><th>Responsibilities</th><th>Status</th><th>Last activity</th></tr></thead><tbody>{data.employees.map(employee => <tr key={employee.user.id}><td><strong>{employee.user.fullName}</strong><small>@{employee.user.username}</small></td><td>{employee.user.employeeNumber || "—"}</td><td>{data.locations.find(location => location.id === employee.user.primaryLocationId)?.displayName ?? "Unassigned"}</td><td>{employee.assignments.map(item => item.responsibilities).filter(Boolean).join(", ") || "General valuation"}</td><td><span className={employee.user.active ? "status-active" : "status-pending"}>{employee.user.status}</span></td><td>{employee.user.lastLoginAt ? new Date(employee.user.lastLoginAt).toLocaleString() : "No sign-in recorded"}</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No Officers in scope" description="Create or assign an Officer to an authorized office." />}</section>
      <section className="dashboard-panel dashboard-panel--full"><div className="dashboard-panel-heading"><div><p className="eyebrow">Requires attention</p><h2>Submitted and returned valuations</h2></div><Link href="/valuation-decisions">Open all <FiArrowRight /></Link></div><DecisionTable data={data} filter={decision => decision.status === "Submitted" || decision.status === "Returned"} /></section>
    </div>
  </>;
}

function OfficerDashboard({ data, profile }: { data: WorkspaceDashboard; profile: WorkspaceProfile }) {
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const query = String(new FormData(event.currentTarget).get("search") ?? "").trim(); if (query) window.location.assign(`/hs-codes?search=${encodeURIComponent(query)}`); }
  const recent = data.decisions[0];
  return <>
    <DashboardHeader profile={profile} eyebrow="Officer operations" title={`Welcome, ${profile.user.fullName.split(" ")[0]}`} description="Find the product, examine price evidence, investigate anomalies, and record a defensible valuation decision." />
    <section className="officer-search-hero"><div><span>CLASSIFICATION STARTS HERE</span><h2>What are you valuing today?</h2><p>Search by HS code, product description, model, or declaration reference.</p></div><form onSubmit={search}><FiSearch /><input name="search" aria-label="Search HS code or product" placeholder="Search HS code, product description, declaration…" required /><button type="submit">Search <FiArrowRight /></button></form><div className="officer-search-links"><Link href="/international-prices"><FiGlobe />International prices</Link><Link href="/local-prices"><FiShoppingBag />Ethiopian prices</Link><Link href="/valuation-decisions"><FiFileText />New decision</Link></div></section>
    <KpiGrid data={data} />
    <div className="dashboard-main-grid officer-dashboard-grid">
      <section className="dashboard-panel dashboard-panel--wide"><div className="dashboard-panel-heading"><div><p className="eyebrow">Operational workload</p><h2>My valuation cases</h2><span>Saved, submitted, returned, and approved decisions</span></div><Link href="/valuation-decisions">Open workspace <FiArrowRight /></Link></div><DecisionTable data={data} /></section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Reference snapshot</p><h2>{recent?.hsCode ? `HS ${recent.hsCode}` : "Recent evidence"}</h2></div></div>{recent ? <div className="reference-snapshot"><div className="snapshot-product"><FiTrendingUp /><span><strong>{recent.product}</strong><small>Most recent decision</small></span></div><dl><div><dt>Selected value</dt><dd>{recent.currency} {recent.selectedReferenceValue.toLocaleString()}</dd></div><div><dt>Status</dt><dd><span className={`decision-status decision-status--${recent.status.toLowerCase()}`}>{recent.status}</span></dd></div><div><dt>Recorded</dt><dd>{new Date(recent.recordedAt).toLocaleDateString()}</dd></div></dl><p><FiAlertTriangle />Reference indicators support professional judgment; they never automatically invalidate a declared value.</p></div> : <DataState kind="empty" compact title="No recent decision" description="Search an HS code and create a valuation draft to build your history." />}</section>
      <section className="dashboard-panel dashboard-panel--wide"><div className="dashboard-panel-heading"><div><p className="eyebrow">My recent activity</p><h2>Audit and decision history</h2></div><Link href="/audit">View history <FiArrowRight /></Link></div><AuditList data={data} /></section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">My assignment</p><h2>Operational office</h2></div></div><div className="assignment-card"><FiMapPin /><strong>{data.locations.find(location => location.id === profile.user.primaryLocationId)?.displayName ?? "No primary office"}</strong><span>{data.locations.length} authorized location{data.locations.length === 1 ? "" : "s"}</span><small>{profile.user.employeeNumber || "Employee number not recorded"}</small></div></section>
    </div>
  </>;
}

function DecisionTable({ data, filter = () => true }: { data: WorkspaceDashboard; filter?: (decision: WorkspaceDashboard["decisions"][number]) => boolean }) {
  const rows = data.decisions.filter(filter).slice(0, 8);
  return rows.length ? <div className="table-wrap"><table className="dashboard-table"><thead><tr><th>HS code / product</th><th>Office</th><th>Reference value</th><th>Status</th><th>Recorded</th></tr></thead><tbody>{rows.map(decision => <tr key={decision.id}><td><strong>{decision.hsCode || "—"}</strong><small>{decision.product}</small></td><td>{data.locations.find(location => location.id === decision.locationId)?.officialCode ?? "—"}</td><td>{decision.currency} {decision.selectedReferenceValue.toLocaleString()}</td><td><span className={`decision-status decision-status--${decision.status.toLowerCase()}`}>{decision.status}</span></td><td>{new Date(decision.recordedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No valuation cases" description="Cases appear here as the valuation workflow is used." />;
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
    try { const [current, dashboard] = await Promise.all([workspaceApi<WorkspaceProfile>("/me"), workspaceApi<WorkspaceDashboard>("/dashboard")]); setProfile(current); setData(dashboard); }
    catch (ex) { setError(ex instanceof Error ? ex.message : "The dashboard could not be loaded."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading) return <DataState kind="loading" title="Preparing your dashboard" description="Loading the system, location, and work information authorized for your account." />;
  if (!profile || !data) return <DataState kind="error" title="Dashboard unavailable" description={error} onRetry={() => void load()} />;
  if (data.role === "SystemAdministrator") return <SystemDashboard data={data} profile={profile} />;
  if (data.role === "CustomsAdministrator") return <AdminDashboard data={data} profile={profile} />;
  return <OfficerDashboard data={data} profile={profile} />;
}
