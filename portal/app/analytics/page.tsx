"use client";

import { useCallback, useEffect, useState } from "react";
import { FiActivity, FiBarChart2, FiMapPin, FiRefreshCw, FiShield, FiUsers } from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { PlannedModule } from "@/components/PlannedModule";
import { roleLabel, workspaceApi, type DashboardEmployee, type DashboardLocation, type WorkspaceDashboard, type WorkspaceProfile } from "@/lib/workspace";

function MetricCard({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: React.ReactNode }) {
  return <article className={`analytics-metric analytics-metric--${tone}`}><span className="analytics-metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function kpi(data: WorkspaceDashboard, key: string) {
  return data.kpis.find(item => item.key === key);
}

function branchLabel(location: DashboardLocation) {
  return location.displayName || location.name;
}

function isActive(employee: DashboardEmployee) {
  return employee.user.active && employee.user.status === "ACTIVE";
}

function isAccessIssue(employee: DashboardEmployee) {
  return employee.user.status === "SUSPENDED" || employee.user.status === "LOCKED";
}

export default function AnalyticsPage() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [dashboard, setDashboard] = useState<WorkspaceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [current, data] = await Promise.all([
        workspaceApi<WorkspaceProfile>("/me"),
        workspaceApi<WorkspaceDashboard>("/dashboard"),
      ]);
      setProfile(current);
      setDashboard(data);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Analytics could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !dashboard) return <DataState kind="loading" title="Loading staff analytics" description="Preparing branch staffing and account activity." />;
  if (!profile || !dashboard) return <DataState kind="error" title="Analytics are unavailable" description={error} onRetry={() => void load()} />;
  if (profile.user.role !== "CustomsAdministrator") return <PlannedModule titleKey="analytics" />;

  const officers = dashboard.employees.filter(employee => employee.user.role === "CustomsOfficer");
  const branches = dashboard.locations.filter(location => location.locationType === "BRANCH");
  const branchRows = branches.map(branch => {
    const staff = officers.filter(employee => employee.locationId === branch.id);
    return {
      branch,
      total: staff.length,
      active: staff.filter(isActive).length,
      accessIssues: staff.filter(isAccessIssue).length,
      other: staff.length - staff.filter(isActive).length - staff.filter(isAccessIssue).length,
    };
  }).sort((left, right) => right.accessIssues - left.accessIssues || left.branch.name.localeCompare(right.branch.name));
  const maxBranchStaff = Math.max(1, ...branchRows.map(row => row.total));
  const administrativeActivity = dashboard.audit.filter(item => !item.module.toLowerCase().includes("valuation") && !item.action.toLowerCase().includes("valuation")).slice(0, 6);
  const metrics = [
    { key: "locations", label: "Assigned branches", tone: "blue", icon: <FiMapPin /> },
    { key: "officers", label: "Active Officers", tone: "teal", icon: <FiUsers /> },
    { key: "officerApplications", label: "Pending applications", tone: "gold", icon: <FiBarChart2 /> },
    { key: "suspended", label: "Suspended accounts", tone: "red", icon: <FiShield /> },
  ];

  return <div className="management-page analytics-page">
    <div className="page-heading">
      <div><p className="eyebrow">Monitoring</p><h1>Staff analytics</h1><p className="lead">A focused view of branch coverage, Officer access, and recent administrative activity.</p></div>
      <div className="analytics-heading-actions"><span className="workspace-tag"><FiShield />{roleLabel(profile.user.role)}</span><button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}><FiRefreshCw />{loading ? "Refreshing…" : "Refresh"}</button></div>
    </div>

    <section className="analytics-metric-grid" aria-label="Staff analytics summary">
      {metrics.map(metric => { const item = kpi(dashboard, metric.key); return <MetricCard key={metric.key} label={metric.label} value={item?.value ?? "0"} detail={item?.detail ?? "No data"} tone={metric.tone} icon={metric.icon} />; })}
    </section>

    <div className="analytics-content-grid">
      <section className="admin-panel analytics-panel analytics-panel--wide">
        <div className="panel-heading"><div><p className="eyebrow">Branch coverage</p><h2>Officer staffing by branch</h2><p>See where assigned Officers are active and where account access needs attention.</p></div><FiMapPin aria-hidden="true" /></div>
        {branchRows.length ? <div className="staffing-chart" aria-label="Officer staffing by branch chart">{branchRows.map(row => { const totalWidth = row.total ? Math.max((row.total / maxBranchStaff) * 100, 4) : 0; const activeWidth = row.total ? row.active / row.total * 100 : 0; const accessWidth = row.total ? row.accessIssues / row.total * 100 : 0; const otherWidth = row.total ? row.other / row.total * 100 : 0; return <div className="staffing-chart-row" key={`chart-${row.branch.id}`}><div className="staffing-chart-label"><strong>{branchLabel(row.branch)}</strong><small>{row.total ? `${row.total.toLocaleString()} Officer${row.total === 1 ? "" : "s"}` : "No Officers assigned"}</small></div><div className={`staffing-chart-bar${row.total ? "" : " is-empty"}`} role="img" aria-label={`${branchLabel(row.branch)}: ${row.active} active, ${row.accessIssues} access issues, ${row.other} other inactive`}><span className="staffing-chart-bar-total" style={{ width: `${totalWidth}%` }}><i className="staffing-chart-segment staffing-chart-segment--active" style={{ width: `${activeWidth}%` }} /><i className="staffing-chart-segment staffing-chart-segment--access" style={{ width: `${accessWidth}%` }} /><i className="staffing-chart-segment staffing-chart-segment--other" style={{ width: `${otherWidth}%` }} /></span></div></div>; })}<div className="staffing-chart-legend" aria-hidden="true"><span><i className="staffing-chart-key staffing-chart-key--active" />Active</span><span><i className="staffing-chart-key staffing-chart-key--access" />Access issues</span><span><i className="staffing-chart-key staffing-chart-key--other" />Other inactive</span></div></div> : null}
        {branchRows.length ? <div className="table-wrap"><table className="analytics-table"><thead><tr><th>Branch</th><th>Status</th><th>Officers</th><th>Active</th><th>Access issues</th></tr></thead><tbody>{branchRows.map(row => <tr key={row.branch.id}><td><strong>{branchLabel(row.branch)}</strong><small>{row.branch.officialCode}</small></td><td><span className={row.branch.status === "ACTIVE" ? "status-active" : "status-pending"}>{row.branch.status}</span></td><td>{row.total.toLocaleString()}</td><td>{row.active.toLocaleString()}</td><td><span className={row.accessIssues ? "analytics-number-alert" : "status-active"}>{row.accessIssues.toLocaleString()}</span></td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No assigned branches" description="Branch staffing appears after branches are assigned to your region." />}
      </section>

      <section className="admin-panel analytics-panel">
        <div className="panel-heading"><div><p className="eyebrow">Administrative activity</p><h2>Recent activity</h2></div><FiActivity aria-hidden="true" /></div>
        {administrativeActivity.length ? <div className="analytics-activity-list">{administrativeActivity.map(item => <article key={item.id}><span className="activity-icon"><FiActivity /></span><div><strong>{item.action.replaceAll("_", " ")}</strong><p>{item.justification || `${item.module} record updated`}</p><small>{item.username || "System"} · {new Date(item.occurredAt).toLocaleString()}</small></div></article>)}</div> : <DataState kind="empty" compact title="No recent activity" description="Employee and assignment activity will appear here." />}
      </section>
    </div>
  </div>;
}
