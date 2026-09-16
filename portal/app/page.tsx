"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiActivity, FiAlertTriangle, FiArrowRight, FiBookOpen, FiCheckCircle,
  FiFileText, FiGlobe, FiMapPin, FiSearch, FiShield,
  FiShoppingBag, FiTrendingUp, FiUserPlus, FiUsers,
} from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
import type { InternationalPriceSearch, LocalMarketPriceSearch, PriceStatistics } from "@/lib/types/customs";
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

type EvidenceSource = "internationalMedian" | "internationalMean" | "localMedian" | "custom";

function money(value: number | null | undefined, currency: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function StatisticCard({ title, icon, stats, currency, tone, href }: { title: string; icon: React.ReactNode; stats: PriceStatistics | null; currency: string; tone: "international" | "local"; href: string }) {
  return <Link href={href} className={`valuation-stat-card valuation-stat-card--${tone} valuation-stat-card--link`} aria-label={`Open ${title.toLowerCase()} details`}>
    <div className="valuation-card-title"><span>{icon}</span><strong>{title}</strong><em>n = {stats?.observationCount ?? 0}</em></div>
    <span className="valuation-label">Median unit price</span>
    <b>{money(stats?.median, currency)}</b>
    <dl>
      <div><dt>Mean</dt><dd>{money(stats?.mean, currency)}</dd></div>
      <div><dt>Minimum</dt><dd>{money(stats?.minimum, currency)}</dd></div>
      <div><dt>Maximum</dt><dd>{money(stats?.maximum, currency)}</dd></div>
    </dl>
  </Link>;
}

function EvidenceTrend({ international, local, internationalCurrency }: { international: PriceStatistics | null; local: PriceStatistics | null; internationalCurrency: string }) {
  const internationalValue = international?.median;
  const localValue = local?.median;
  const sharedCurrency = internationalCurrency === "ETB";
  const toPoints = (value: number | undefined, offset: number) => value == null ? "" : Array.from({ length: 6 }, (_, index) => `${8 + index * 17},${68 - Math.min(42, Math.max(0, value / Math.max(value, localValue ?? value) * 34) + ((index % 2) * 2) + offset)}`).join(" ");
  return <section className="valuation-trend"><div className="valuation-trend-heading"><div><h3>Price evidence snapshot</h3><p>{sharedCurrency ? "International median vs. Ethiopian local median" : `Source-currency medians · ${internationalCurrency} and ETB`}</p></div><span>Current search</span></div>
    <div className="valuation-chart" aria-label="Current price evidence comparison"><svg viewBox="0 0 100 80" preserveAspectRatio="none" role="img"><path className="chart-grid" d="M0 15H100M0 40H100M0 65H100" />{internationalValue != null && <polyline className="chart-line chart-line--international" points={toPoints(internationalValue, 5)} />}{localValue != null && <polyline className="chart-line chart-line--local" points={toPoints(localValue, -5)} />}</svg><div className="chart-legend"><span><i className="chart-key chart-key--international" />International median {money(internationalValue, internationalCurrency)}</span><span><i className="chart-key chart-key--local" />Local median {money(localValue, "ETB")}</span></div></div>
  </section>;
}

function OfficerEvidenceWorkspace({ profile }: { profile: WorkspaceProfile }) {
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("us");
  const [international, setInternational] = useState<InternationalPriceSearch | null>(null);
  const [local, setLocal] = useState<LocalMarketPriceSearch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<EvidenceSource>("internationalMedian");
  const [customValue, setCustomValue] = useState("");
  const [hsCode, setHsCode] = useState("");
  const [justification, setJustification] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordNotice, setRecordNotice] = useState("");
  const currency = ({ us: "USD", gb: "GBP", de: "EUR", ae: "AED", za: "ZAR" } as Record<string, string>)[market] ?? "USD";

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) { setError("Enter a product description with at least two characters."); return; }
    setBusy(true); setError(""); setInternational(null); setLocal(null);
    const token = getSessionAccessToken();
    if (!token) { window.location.assign("/login?next=%2F"); return; }
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
    const request = async <T,>(url: string) => {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401) { setSessionAccessToken(null); throw new Error("Your session expired. Please sign in again."); }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? body.message ?? "Evidence source could not be searched.");
      return body as T;
    };
    const [internationalResult, localResult] = await Promise.allSettled([
      request<InternationalPriceSearch>(`${base}/api/international-prices/search?${new URLSearchParams({ q: term, market })}`),
      request<LocalMarketPriceSearch>(`${base}/api/local-prices/search?${new URLSearchParams({ q: term, sources: "jiji,ethioshop" })}`),
    ]);
    if (internationalResult.status === "fulfilled") setInternational(internationalResult.value);
    if (localResult.status === "fulfilled") setLocal(localResult.value);
    if (internationalResult.status === "fulfilled" && internationalResult.value.statistics) setSelected("internationalMedian");
    else if (localResult.status === "fulfilled" && localResult.value.statistics) setSelected("localMedian");
    else setSelected("custom");
    if (internationalResult.status === "rejected" && localResult.status === "rejected") setError(internationalResult.reason instanceof Error ? internationalResult.reason.message : "Price evidence could not be loaded.");
    else if (internationalResult.status === "rejected") setError("International evidence is unavailable. Local results are shown below.");
    else if (localResult.status === "rejected") setError("Local-market evidence is unavailable. International results are shown below.");
    setBusy(false);
  }

  const selectedValue = selected === "internationalMedian" ? international?.statistics?.median : selected === "internationalMean" ? international?.statistics?.mean : selected === "localMedian" ? local?.statistics?.median : Number(customValue);
  const selectedCurrency = selected === "localMedian" ? "ETB" : currency;
  const hasResults = international || local;
  const operationalLocation = profile.locations.find(location => location.id === profile.user.primaryLocationId && location.status === "ACTIVE" && (location.supportsValuation || location.supportsInspection)) ?? profile.locations.find(location => location.status === "ACTIVE" && (location.supportsValuation || location.supportsInspection));

  async function recordDecision() {
    const normalizedHsCode = hsCode.replace(/\D/g, "");
    if (!selectedValue || selectedValue <= 0) { setError("Select a valid reference value before recording the decision."); return; }
    if (![6, 8].includes(normalizedHsCode.length)) { setError("Enter the six-digit HS code for this product before recording the decision."); return; }
    if (!operationalLocation) { setError("No active valuation or inspection office is assigned to your account."); return; }
    if (justification.trim().length < 10) { setError("Enter at least 10 characters of valuation justification."); return; }
    setRecording(true); setError(""); setRecordNotice("");
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
      const response = await fetch(`${base}/api/hs-codes?search=${encodeURIComponent(normalizedHsCode)}&page=1&pageSize=20`, { headers: { Authorization: `Bearer ${getSessionAccessToken()}` } });
      if (!response.ok) throw new Error("HS code lookup failed. Check the code and API connection.");
      const hsResults = await response.json() as { items: { id: string; code: string }[] };
      const hs = hsResults.items.find(item => item.code.replaceAll(".", "") === normalizedHsCode.slice(0, 6));
      if (!hs) throw new Error("Select an exact HS code from the Ethiopian tariff catalogue.");
      await workspaceApi("/decisions", { method: "POST", body: JSON.stringify({
        hsCodeId: hs.id,
        locationId: operationalLocation.id,
        selectedReferenceValue: selectedValue,
        currency: selectedCurrency,
        decision: `Reference value selected from Overview search: ${query.trim()}`,
        justification: justification.trim(),
        evidence: `Overview evidence search for “${query.trim()}”; selected ${selected.replace(/([A-Z])/g, " $1").trim()}.`,
        version: null,
      }) });
      setRecordNotice("Valuation draft saved. Opening your valuation decisions…");
      window.setTimeout(() => window.location.assign("/valuation-decisions"), 700);
    } catch (exception) { setError(exception instanceof Error ? exception.message : "The valuation decision could not be saved."); }
    finally { setRecording(false); }
  }
  return <section className="overview-evidence-workspace">
    <section className="officer-search-hero"><div><span>VALUATION EVIDENCE SEARCH</span><h2>What product are you valuing?</h2><p>Search international and Ethiopian market evidence together, then select the reference basis for your decision.</p></div><form onSubmit={search}><FiSearch /><input aria-label="Product description" placeholder="e.g. Apple iPhone 13 128GB" value={query} onChange={event => setQuery(event.currentTarget.value)} required /><select aria-label="International market" value={market} onChange={event => setMarket(event.currentTarget.value)}><option value="us">US · USD</option><option value="gb">UK · GBP</option><option value="de">Germany · EUR</option><option value="ae">UAE · AED</option><option value="za">South Africa · ZAR</option></select><button type="submit" disabled={busy}>{busy ? "Searching…" : <>Search <FiArrowRight /></>}</button></form><div className="officer-search-links"><Link href="/international-prices"><FiGlobe />International details</Link><Link href="/local-prices"><FiShoppingBag />Ethiopian details</Link></div></section>
    {error && <p className="evidence-search-notice" role="status">{error}</p>}
    {hasResults && <div className="valuation-workspace-grid"><div className="valuation-evidence-area"><div className="valuation-stat-grid"><StatisticCard title="International statistics" icon={<FiGlobe />} stats={international?.statistics ?? null} currency={currency} tone="international" href={`/international-prices?q=${encodeURIComponent(query.trim())}&market=${market}`} /><StatisticCard title="Local Ethiopian statistics" icon={<FiMapPin />} stats={local?.statistics ?? null} currency="ETB" tone="local" href={`/local-prices?q=${encodeURIComponent(query.trim())}`} /><section className="valuation-variance"><span>Local vs. international</span>{international?.statistics && local?.statistics && currency === "ETB" ? <><b>{(((local.statistics.median - international.statistics.median) / international.statistics.median) * 100).toFixed(1)}%</b><p>Local median compared with the international median.</p></> : <><b>Source currencies differ</b><p>Use an approved exchange rate before comparing {currency} with ETB.</p></>}</section></div><EvidenceTrend international={international?.statistics ?? null} local={local?.statistics ?? null} internationalCurrency={currency} /></div><aside className="valuation-decision-panel"><div className="valuation-decision-title"><FiCheckCircle /><div><h3>Valuation decision</h3><p>Select the reference price basis, then record a justified decision.</p></div></div><div className="reference-options"><label className={selected === "internationalMedian" ? "is-selected" : ""}><input type="radio" checked={selected === "internationalMedian"} onChange={() => setSelected("internationalMedian")} /><span><strong>International median</strong><small>{international?.statistics?.observationCount ?? 0} observations</small></span><b>{money(international?.statistics?.median, currency)}</b></label><label className={selected === "internationalMean" ? "is-selected" : ""}><input type="radio" checked={selected === "internationalMean"} onChange={() => setSelected("internationalMean")} /><span><strong>International mean</strong><small>{international?.statistics?.observationCount ?? 0} observations</small></span><b>{money(international?.statistics?.mean, currency)}</b></label><label className={selected === "localMedian" ? "is-selected" : ""}><input type="radio" checked={selected === "localMedian"} onChange={() => setSelected("localMedian")} /><span><strong>Local market median</strong><small>{local?.statistics?.observationCount ?? 0} local records</small></span><b>{money(local?.statistics?.median, "ETB")}</b></label><label className={selected === "custom" ? "is-selected" : ""}><input type="radio" checked={selected === "custom"} onChange={() => setSelected("custom")} /><span><strong>Enter a different reference value</strong><small>Requires documented evidence</small></span></label>{selected === "custom" && <input className="custom-reference-input" type="number" min="0.01" step="0.01" placeholder="Reference value" value={customValue} onChange={event => setCustomValue(event.target.value)} />}</div><div className="overview-decision-fields"><label>HS code<input value={hsCode} onChange={event => setHsCode(event.target.value)} placeholder="e.g. 851713" inputMode="numeric" /></label><label>Decision justification<textarea value={justification} onChange={event => setJustification(event.target.value)} placeholder="Explain why this reference value is appropriate…" rows={3} /></label></div><div className="selected-reference"><span>Selected reference value</span><b>{money(selectedValue, selectedCurrency)}</b></div><button className="valuation-record-link" type="button" disabled={recording} onClick={() => void recordDecision()}><FiFileText />{recording ? "Saving valuation decision…" : "Record valuation decision"}</button>{recordNotice && <small className="decision-save-notice">{recordNotice}</small>}<small className="decision-disclaimer">The decision is saved as a draft under your assigned valuation office, with an audited justification.</small></aside></div>}
  </section>;
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
  const recent = data.decisions[0];
  return <>
    <DashboardHeader profile={profile} eyebrow="Officer operations" title={`Welcome, ${profile.user.fullName.split(" ")[0]}`} description="Find the product, examine price evidence, investigate anomalies, and record a defensible valuation decision." />
    <OfficerEvidenceWorkspace profile={profile} />
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
