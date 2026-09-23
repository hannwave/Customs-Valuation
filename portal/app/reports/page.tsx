"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  FiAlertTriangle, FiBarChart2, FiCheckCircle, FiClock, FiDownload, FiFileText,
  FiFilter, FiPrinter, FiRefreshCw, FiShield, FiTrendingUp, FiUsers,
} from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { PlannedModule } from "@/components/PlannedModule";
import { roleLabel, workspaceApi, type CustomsAdminAnalytics, type WorkspaceProfile } from "@/lib/workspace";

type ReportKind = "branch" | "officer" | "pipeline" | "quality" | "hs" | "audit";
type ReportFilters = { from: string; to: string; locationId: string; officerId: string; status: string; hsChapter: string; currency: string };
type CsvValue = string | number | null | undefined;

const reportOptions: Array<{ value: ReportKind; label: string; description: string }> = [
  { value: "branch", label: "Branch performance", description: "Queue, throughput, staffing, and review time by branch." },
  { value: "officer", label: "Officer workload", description: "Case volume, responsibilities, access, and activity by Officer." },
  { value: "pipeline", label: "Decision pipeline", description: "Draft, submitted, returned, approved, and rejected cases." },
  { value: "quality", label: "Quality and compliance", description: "Evidence coverage, outliers, turnaround, and data sources." },
  { value: "hs", label: "HS valuation patterns", description: "The most active HS items and reference-value patterns." },
  { value: "audit", label: "Regional audit activity", description: "Audited access, valuation, and operational events." },
];

function defaultFilters(): ReportFilters {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), locationId: "", officerId: "", status: "", hsChapter: "", currency: "" };
}

function formatNumber(value: number) { return value.toLocaleString(); }
function formatHours(value: number | null) { return value == null ? "—" : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} h`; }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleDateString() : "No activity"; }
function formatDateTime(value: string) { return new Date(value).toLocaleString(); }

function csvCell(value: CsvValue) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: CsvValue[][]) {
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function reportTitle(kind: ReportKind) {
  return reportOptions.find(option => option.value === kind)?.label ?? "Operational report";
}

function ReportMetric({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: string; icon: React.ReactNode }) {
  return <article className={`analytics-metric analytics-metric--${tone}`}><span className="analytics-metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function queryFor(filters: ReportFilters) {
  const params = new URLSearchParams({ dateFrom: `${filters.from}T00:00:00.000Z`, dateTo: `${filters.to}T23:59:59.999Z` });
  if (filters.locationId) params.set("locationId", filters.locationId);
  if (filters.officerId) params.set("officerId", filters.officerId);
  if (filters.status) params.set("status", filters.status);
  if (filters.hsChapter) params.set("hsChapter", filters.hsChapter);
  if (filters.currency) params.set("currency", filters.currency);
  return params.toString();
}

export default function ReportsPage() {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [analytics, setAnalytics] = useState<CustomsAdminAnalytics | null>(null);
  const [filters, setFilters] = useState<ReportFilters>(() => defaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(() => defaultFilters());
  const [kind, setKind] = useState<ReportKind>("branch");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (query: ReportFilters) => {
    setLoading(true); setError("");
    try {
      const current = await workspaceApi<WorkspaceProfile>("/me");
      setProfile(current);
      if (current.user.role !== "CustomsAdministrator") { setAnalytics(null); return; }
      setAnalytics(await workspaceApi<CustomsAdminAnalytics>(`/analytics?${queryFor(query)}`));
    } catch (ex) { setError(ex instanceof Error ? ex.message : "Reports could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(appliedFilters); }, [appliedFilters, load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters({ ...filters });
  }

  if (loading && !profile) return <DataState kind="loading" title="Loading operational reports" description="Preparing regional reports and applying your assigned scope." />;
  if (!profile) return <DataState kind="error" title="Reports are unavailable" description={error} onRetry={() => void load(appliedFilters)} />;
  if (profile.user.role !== "CustomsAdministrator") return <PlannedModule titleKey="reports" />;
  if (!analytics) return <DataState kind="error" title="Reports are unavailable" description={error} onRetry={() => void load(appliedFilters)} />;

  const report = analytics;
  const { summary, quality } = analytics;
  const currencies = Array.from(new Set(analytics.topHsCodes.flatMap(row => row.currencies.split(", ").filter(Boolean))));
  const selectedReport = reportOptions.find(option => option.value === kind) ?? reportOptions[0];

  function exportReport() {
    const metadata: CsvValue[][] = [
      ["Report", selectedReport.label],
      ["Region", report.scope.region],
      ["Period", `${appliedFilters.from} to ${appliedFilters.to}`],
      ["Generated", new Date(report.generatedAt).toLocaleString()],
      [],
    ];
    let headers: CsvValue[] = [];
    let rows: CsvValue[][] = [];
    if (kind === "branch") {
      headers = ["Branch", "Official code", "Status", "Officers", "Decisions", "Queue", "Submitted", "Approved", "Returned", "Rejected", "Average review hours", "Last decision"];
      rows = report.branchPerformance.map(branch => [branch.name, branch.officialCode, branch.status, branch.officers, branch.decisions, branch.pending, branch.submitted, branch.approved, branch.returned, branch.rejected, branch.averageReviewHours, branch.lastDecisionAt ?? ""]);
    } else if (kind === "officer") {
      headers = ["Officer", "Employee number", "Branch", "Responsibilities", "Status", "Cases", "Queue", "Submitted", "Approved", "Returned", "Rejected", "Average review hours", "Last sign-in"];
      rows = report.officerPerformance.map(officer => [officer.name, officer.employeeNumber, officer.branch, officer.responsibilities, officer.status, officer.decisions, officer.pending, officer.submitted, officer.approved, officer.returned, officer.rejected, officer.averageReviewHours, officer.lastLoginAt ?? ""]);
    } else if (kind === "pipeline") {
      headers = ["Status", "Cases", "Percentage"];
      rows = report.statusBreakdown.map(row => [row.status, row.count, row.percentage]);
    } else if (kind === "quality") {
      headers = ["Measure", "Value", "Detail"];
      rows = [
        ["Missing evidence", quality.missingEvidence, `${summary.evidenceCoverage}% coverage`],
        ["Missing justification", quality.missingJustification, `${summary.justificationCoverage}% coverage`],
        ["Potential outliers", quality.potentialOutliers, `${quality.unreviewedOutliers} unreviewed`],
        ["Confirmed outliers", quality.confirmedOutliers, "Retained for audit"],
        ["Rejected outliers", quality.rejectedOutliers, "Retained for audit"],
        ["Local observations", quality.localObservationCount, "Valid observations"],
        ["International observations", quality.internationalObservationCount, "ETB-converted observations"],
        ["Local vs international variance", quality.localVsInternationalVariancePercent == null ? "—" : `${quality.localVsInternationalVariancePercent}%`, "ETB median comparison"],
      ];
    } else if (kind === "hs") {
      headers = ["HS code", "Description", "Decisions", "Approved", "Returned", "Currencies", "Average reference value"];
      rows = report.topHsCodes.map(row => [row.hsCode, row.description, row.decisions, row.approved, row.returned, row.currencies, row.averageReferenceValue]);
    } else {
      headers = ["Date", "Actor", "Action", "Module", "Location", "Record", "Justification"];
      rows = report.auditActivity.map(activity => [activity.occurredAt, activity.actor, activity.action, activity.module, activity.location, activity.recordId, activity.justification]);
    }
    downloadCsv(`customs-${kind}-report-${appliedFilters.from}-${appliedFilters.to}.csv`, [...metadata, headers, ...rows]);
  }

  return <div className="management-page reports-page">
    <div className="page-heading"><div><p className="eyebrow">Reporting</p><h1>Regional operational reports</h1><p className="lead">Generate filtered branch, Officer, valuation, quality, HS-pattern, and audit reports from your assigned regional scope.</p></div><div className="reports-actions"><span className="workspace-tag"><FiShield />{roleLabel(profile.user.role)}</span><button className="secondary-button" type="button" onClick={() => window.print()}><FiPrinter />Print / Save PDF</button><button className="primary-button" type="button" onClick={exportReport}><FiDownload />Download CSV</button></div></div>
    <div className="role-banner"><span className="badge">{analytics.scope.region}</span><strong>{analytics.scope.branchCount} branch{analytics.scope.branchCount === 1 ? "" : "es"}</strong><span>{analytics.scope.activeBranches} active in the selected regional scope.</span></div>
    <p className="analytics-scope-note"><FiShield />Reports use the same regional access boundary as Analytics. Shared reference-data quality measures are identified separately because the underlying observations are not stored against individual branches.</p>

    <section className="admin-panel analytics-filter-panel"><div className="panel-heading"><div><p className="eyebrow">Report parameters</p><h2>Choose a report and period</h2><p>Filters are applied together so the preview and CSV export use the same dataset.</p></div><FiFilter aria-hidden="true" /></div><form className="analytics-filter-grid" onSubmit={applyFilters}><label>Report<select value={kind} onChange={event => setKind(event.target.value as ReportKind)}>{reportOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>From<input type="date" value={filters.from} max={filters.to} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} /></label><label>To<input type="date" value={filters.to} min={filters.from} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))} /></label><label>Branch<select value={filters.locationId} onChange={event => setFilters(current => ({ ...current, locationId: event.target.value }))}><option value="">All assigned branches</option>{profile.locations.filter(location => location.locationType === "BRANCH").map(location => <option key={location.id} value={location.id}>{location.displayName || location.name} · {location.officialCode}</option>)}</select></label><label>Officer<select value={filters.officerId} onChange={event => setFilters(current => ({ ...current, officerId: event.target.value }))}><option value="">All Customs Officers</option>{analytics.officerPerformance.map(officer => <option key={officer.userId} value={officer.userId}>{officer.name}{officer.employeeNumber ? ` · ${officer.employeeNumber}` : ""}</option>)}</select></label><label>Status<select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}><option value="">All statuses</option><option value="Draft">Draft</option><option value="Submitted">Submitted</option><option value="Returned">Returned</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option></select></label><label>HS chapter<input inputMode="numeric" maxLength={4} value={filters.hsChapter} onChange={event => setFilters(current => ({ ...current, hsChapter: event.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="e.g. 85 or 8517" /></label><label>Currency<select value={filters.currency} onChange={event => setFilters(current => ({ ...current, currency: event.target.value }))}><option value="">All currencies</option>{currencies.map(value => <option key={value} value={value}>{value}</option>)}</select></label><div className="form-actions"><button className="primary-button" type="submit" disabled={loading}><FiBarChart2 />{loading ? "Generating..." : "Generate report"}</button><button className="secondary-button" type="button" onClick={() => void load(appliedFilters)} disabled={loading}><FiRefreshCw />Refresh</button></div></form></section>

    <section className="analytics-metric-grid reports-summary-grid" aria-label="Report summary"><ReportMetric label="Decisions" value={formatNumber(summary.decisions)} detail={`${formatNumber(summary.decisionsToday)} recorded today`} tone="blue" icon={<FiCheckCircle />} /><ReportMetric label="Review queue" value={formatNumber(summary.pendingValuations + summary.returnedValuations)} detail={`${formatNumber(summary.overdueReviews)} older than 48 hours`} tone={summary.overdueReviews ? "red" : "gold"} icon={<FiClock />} /><ReportMetric label="Active Officers" value={formatNumber(summary.activeOfficers)} detail={`${formatNumber(summary.managedOfficers)} managed in scope`} tone="teal" icon={<FiUsers />} /><ReportMetric label="Approval rate" value={`${summary.approvalRate}%`} detail={`Return ${summary.returnRate}% · Reject ${summary.rejectionRate}%`} tone="green" icon={<FiTrendingUp />} /></section>

    <section className="admin-panel analytics-panel report-preview-panel"><div className="panel-heading"><div><p className="eyebrow">Report preview</p><h2>{reportTitle(kind)}</h2><p>{selectedReport.description}</p></div><span className="workspace-tag"><FiFileText />{appliedFilters.from} → {appliedFilters.to}</span></div>
      {kind === "branch" && (analytics.branchPerformance.length ? <div className="table-wrap"><table className="analytics-table"><thead><tr><th>Branch</th><th>Officers</th><th>Decisions</th><th>Queue</th><th>Approved</th><th>Returned</th><th>Rejected</th><th>Review time</th><th>Last decision</th></tr></thead><tbody>{analytics.branchPerformance.map(branch => <tr key={branch.locationId}><td><strong>{branch.name}</strong><small>{branch.officialCode} · {branch.active ? "Active" : branch.status}</small></td><td>{formatNumber(branch.officers)}</td><td>{formatNumber(branch.decisions)}</td><td className={branch.pending ? "analytics-number-alert" : ""}>{formatNumber(branch.pending)}</td><td>{formatNumber(branch.approved)}</td><td>{formatNumber(branch.returned)}</td><td>{formatNumber(branch.rejected)}</td><td>{formatHours(branch.averageReviewHours)}</td><td>{formatDate(branch.lastDecisionAt)}</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No branch data" description="No branches match the selected reporting period and filters." />)}
      {kind === "officer" && (analytics.officerPerformance.length ? <div className="table-wrap"><table className="analytics-table"><thead><tr><th>Officer</th><th>Branch</th><th>Responsibilities</th><th>Status</th><th>Cases</th><th>Queue</th><th>Approved</th><th>Returned</th><th>Review time</th><th>Last sign-in</th></tr></thead><tbody>{analytics.officerPerformance.map(officer => <tr key={officer.userId}><td><strong>{officer.name}</strong><small>{officer.employeeNumber || "No staff ID"}</small></td><td>{officer.branch}</td><td>{officer.responsibilities || "Not recorded"}</td><td><span className={officer.active && officer.status === "ACTIVE" ? "status-active" : "status-pending"}>{officer.status}</span></td><td>{formatNumber(officer.decisions)}</td><td>{formatNumber(officer.pending)}</td><td>{formatNumber(officer.approved)}</td><td>{formatNumber(officer.returned)}</td><td>{formatHours(officer.averageReviewHours)}</td><td>{formatDate(officer.lastLoginAt)}</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No Officer data" description="No Customs Officers match the selected reporting period and filters." />)}
      {kind === "pipeline" && <div className="reports-pipeline-grid"><div>{analytics.statusBreakdown.length ? <div className="table-wrap"><table className="analytics-table"><thead><tr><th>Status</th><th>Cases</th><th>Share</th></tr></thead><tbody>{analytics.statusBreakdown.map(row => <tr key={row.status}><td><strong>{row.status}</strong></td><td>{formatNumber(row.count)}</td><td>{row.percentage}%</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No valuation cases" description="No decisions match the selected reporting period and filters." />}</div><dl className="analytics-stat-list"><div><dt>Approved</dt><dd>{formatNumber(summary.approvedValuations)}</dd></div><div><dt>Returned</dt><dd>{formatNumber(summary.returnedValuations)}</dd></div><div><dt>Rejected</dt><dd>{formatNumber(summary.rejectedValuations)}</dd></div><div><dt>Average review</dt><dd>{formatHours(summary.averageReviewHours)}</dd></div><div><dt>Evidence coverage</dt><dd>{summary.evidenceCoverage}%</dd></div></dl></div>}
      {kind === "quality" && <div className="reports-quality-grid"><div className="analytics-quality-grid"><div><span>Missing evidence</span><strong>{formatNumber(quality.missingEvidence)}</strong><small>{summary.evidenceCoverage}% coverage</small></div><div><span>Missing justification</span><strong>{formatNumber(quality.missingJustification)}</strong><small>{summary.justificationCoverage}% coverage</small></div><div><span>Potential outliers</span><strong>{formatNumber(quality.potentialOutliers)}</strong><small>{formatNumber(quality.unreviewedOutliers)} unreviewed</small></div><div><span>Local vs international</span><strong>{quality.localVsInternationalVariancePercent == null ? "—" : `${quality.localVsInternationalVariancePercent}%`}</strong><small>ETB median variance</small></div></div><div className="table-wrap"><table className="analytics-table"><thead><tr><th>Reference source</th><th>Pool</th><th>Approval</th><th>Records</th></tr></thead><tbody>{analytics.sourceCoverage.map(source => <tr key={source.sourceId}><td>{source.name}</td><td>{source.pool}</td><td>{source.approved ? "Approved" : "Review"}</td><td>{formatNumber(source.records)}</td></tr>)}</tbody></table></div></div>}
      {kind === "hs" && (analytics.topHsCodes.length ? <div className="table-wrap"><table className="analytics-table"><thead><tr><th>HS code</th><th>Description</th><th>Decisions</th><th>Approved</th><th>Returned</th><th>Currency</th><th>Average reference</th></tr></thead><tbody>{analytics.topHsCodes.map(row => <tr key={row.hsCode}><td><strong>{row.hsCode}</strong></td><td>{row.description}</td><td>{formatNumber(row.decisions)}</td><td>{formatNumber(row.approved)}</td><td>{formatNumber(row.returned)}</td><td>{row.currencies || "—"}</td><td>{row.averageReferenceValue == null ? "Mixed / unavailable" : row.averageReferenceValue.toLocaleString()}</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No HS activity" description="No HS patterns match the selected reporting period and filters." />)}
      {kind === "audit" && (analytics.auditActivity.length ? <div className="analytics-activity-list">{analytics.auditActivity.map(activity => <article key={activity.id}><span className="activity-icon"><FiShield /></span><div><strong>{activity.action.replaceAll("_", " ")}</strong><p>{activity.justification || `${activity.module} record updated`}</p><small>{activity.actor} · {activity.location} · {formatDateTime(activity.occurredAt)}</small></div></article>)}</div> : <DataState kind="empty" compact title="No audit activity" description="No audited events match the selected reporting period and filters." />)}
    </section>
    <p className="reports-footer-note"><FiAlertTriangle />Reports are decision-support summaries. Source observations, justifications, and audit events remain the authoritative evidence record. <Link href="/analytics">Open full analytics</Link></p>
  </div>;
}
