"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  FiActivity, FiArrowRight, FiArchive, FiBarChart2, FiBookOpen, FiCheckCircle,
  FiChevronRight, FiFileText, FiGlobe, FiMapPin, FiSearch, FiShield,
  FiShoppingBag, FiUserPlus, FiUsers, FiX,
} from "react-icons/fi";
import { DataState } from "@/components/DataState";
import { FeedbackToast } from "@/components/FeedbackToast";
import { PhaseTwoOverview } from "@/components/PhaseTwoOverview";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
import type { InternationalPriceSearch, LocalMarketPriceSearch, PriceStatistics } from "@/lib/types/customs";
import { roleLabel, workspaceApi, type DashboardLocation, type WorkspaceDashboard, type WorkspaceProfile } from "@/lib/workspace";
import { readValuationSession, updateValuationSession, writeValuationSession } from "@/lib/valuation-session";

type Phase = "one" | "two";

function PhaseBar({ phase, onChange, phase2Ready }: { phase: Phase; onChange: (next: Phase) => void; phase2Ready: boolean }) {
  return <nav className={`phase-bar phase-bar--${phase}`} aria-label="Officer valuation phases">
    <button type="button" aria-pressed={phase === "one"} className={phase === "one" ? "is-active" : "is-collapsed"} onClick={() => onChange("one")}><span>01</span><strong>Price Review</strong><small>Evidence and value</small></button>
    <FiChevronRight aria-hidden="true" />
    <button type="button" aria-pressed={phase === "two"} className={phase === "two" ? "is-active" : "is-collapsed"} disabled={!phase2Ready} onClick={() => phase2Ready && onChange("two")}><span>02</span><strong>Duty &amp; Tax Assessment</strong><small>{phase2Ready ? "Calculate duties and taxes" : "Submit Price Review first"}</small></button>
  </nav>;
}

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

type EvidenceSource = "internationalMedian" | "internationalMean" | "localMedian" | "custom";

function money(value: number | null | undefined, currency: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function convertStatistics(stats: PriceStatistics | null, rate: number): PriceStatistics | null {
  if (!stats) return null;
  const convert = (value: number) => value * rate;
  return { ...stats, minimum: convert(stats.minimum), maximum: convert(stats.maximum), mean: convert(stats.mean), median: convert(stats.median), standardDeviation: convert(stats.standardDeviation), percentiles: { p25: convert(stats.percentiles.p25), p50: convert(stats.percentiles.p50), p75: convert(stats.percentiles.p75) }, potentialOutliers: stats.potentialOutliers.map(item => ({ ...item, price: convert(item.price) })) };
}

function StatisticCard({ title, icon, stats, currency, tone, href, rateNote }: { title: string; icon: React.ReactNode; stats: PriceStatistics | null; currency: string; tone: "international" | "local"; href: string; rateNote?: string }) {
  return <Link href={href} className={`valuation-stat-card valuation-stat-card--${tone} valuation-stat-card--link`} aria-label={`Open ${title.toLowerCase()} details`}>
    <div className="valuation-card-title"><span>{icon}</span><strong>{title}</strong><em>n = {stats?.observationCount ?? 0}</em></div>
    <span className="valuation-label">Median unit price</span>
    <b>{money(stats?.median, currency)}</b>
    {rateNote && <small style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginTop: "2px", marginBottom: "6px" }}>{rateNote}</small>}
    <dl>
      <div><dt>Mean</dt><dd>{money(stats?.mean, currency)}</dd></div>
      <div><dt>Minimum</dt><dd>{money(stats?.minimum, currency)}</dd></div>
      <div><dt>Maximum</dt><dd>{money(stats?.maximum, currency)}</dd></div>
    </dl>
  </Link>;
}

function EvidenceTrend({ international, local, currency }: { international: PriceStatistics | null; local: PriceStatistics | null; currency: string }) {
  const internationalValue = international?.median;
  const localValue = local?.median;
  const toPoints = (value: number | undefined, offset: number) => value == null ? "" : Array.from({ length: 6 }, (_, index) => `${8 + index * 17},${68 - Math.min(42, Math.max(0, value / Math.max(value, localValue ?? value) * 34) + ((index % 2) * 2) + offset)}`).join(" ");
  return <section className="valuation-trend"><div className="valuation-trend-heading"><div><h3>Price evidence snapshot</h3><p>International and Ethiopian local medians in {currency}</p></div><span>Current search</span></div>
    <div className="valuation-chart" aria-label="Current price evidence comparison"><svg viewBox="0 0 100 80" preserveAspectRatio="none" role="img"><path className="chart-grid" d="M0 15H100M0 40H100M0 65H100" />{internationalValue != null && <polyline className="chart-line chart-line--international" points={toPoints(internationalValue, 5)} />}{localValue != null && <polyline className="chart-line chart-line--local" points={toPoints(localValue, -5)} />}</svg><div className="chart-legend"><span><i className="chart-key chart-key--international" />International median {money(internationalValue, currency)}</span><span><i className="chart-key chart-key--local" />Local median {money(localValue, currency)}</span></div></div>
  </section>;
}

function OfficerEvidenceWorkspace({ profile, onSubmitted }: { profile: WorkspaceProfile; onSubmitted: () => void }) {
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("us");
  const [international, setInternational] = useState<InternationalPriceSearch | null>(null);
  const [local, setLocal] = useState<LocalMarketPriceSearch | null>(null);
  const [localRate, setLocalRate] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<EvidenceSource>("internationalMedian");
  const [customValue, setCustomValue] = useState("");
  const [justification, setJustification] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordNotice, setRecordNotice] = useState("");
  const [fxMeta, setFxMeta] = useState<{ etbPerUnit?: number; source?: string; date?: string } | null>(null);
  const currency = ({ us: "USD", gb: "GBP", de: "EUR", ae: "AED", za: "ZAR" } as Record<string, string>)[market] ?? "USD";

  useEffect(() => {
    const active = readValuationSession();
    if (!active) return;
    setQuery(active.query); setMarket(active.market); setInternational(active.international); setLocal(active.local);
  }, []);

  useEffect(() => {
    if (currency === "ETB") {
      setLocalRate(1);
      setFxMeta(null);
      return;
    }
    const token = getSessionAccessToken();
    if (!token) return;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
    fetch(`${base}/api/exchange-rates?to=${currency}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && typeof data.rate === "number" && data.rate > 0) {
          setLocalRate(data.rate);
          setFxMeta({
            etbPerUnit: data.etbPerUnit,
            source: data.source,
            date: data.date
          });
        }
      })
      .catch(() => {});
  }, [currency]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) { setError("Enter a product description with at least two characters."); return; }
    setBusy(true); setError(""); setRecordNotice(""); setInternational(null); setLocal(null); setLocalRate(1);
    setSelected("internationalMedian"); setCustomValue(""); setJustification(""); setFxMeta(null);
    // Start a fresh client-side session for this search. Later asynchronous
    // evidence responses merge into this record, so a late response cannot
    // overwrite a decision that was already submitted from Phase 1.
    writeValuationSession({
      id: `valuation-${Date.now()}`,
      query: term,
      market,
      international: null,
      local: null,
      createdAt: new Date().toISOString(),
    });
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
    let internationalValue: InternationalPriceSearch | null = null;
    let localValue: LocalMarketPriceSearch | null = null;
    let completed = 0;
    const persist = () => {
      const current = readValuationSession();
      writeValuationSession({
        ...(current ?? {}),
        id: current?.id ?? `valuation-${Date.now()}`,
        query: term,
        market,
        international: internationalValue ?? current?.international ?? null,
        local: localValue ?? current?.local ?? null,
        createdAt: current?.createdAt ?? new Date().toISOString(),
      });
    };
    const finish = () => { completed += 1; if (completed === 2) setBusy(false); };
    void request<InternationalPriceSearch>(`${base}/api/international-prices/search?${new URLSearchParams({ q: term, market })}`)
      .then(result => { internationalValue = result; setInternational(result); persist(); if (result.statistics) setSelected("internationalMedian"); })
      .catch(reason => { setError(reason instanceof Error ? "International evidence is unavailable. Local results will continue loading." : "International evidence is unavailable. Local results will continue loading."); })
      .finally(finish);
    void request<LocalMarketPriceSearch>(`${base}/api/local-prices/search?${new URLSearchParams({ q: term, sources: "jiji,ethioshop" })}`)
      .then(result => { localValue = result; setLocal(result); persist(); if (!internationalValue && result.statistics) setSelected("localMedian"); })
      .catch(() => { setError(internationalValue ? "Local-market evidence is unavailable. International results are shown." : "Price evidence could not be loaded."); })
      .finally(finish);
    if (currency !== "ETB") {
      void request<{ rate: number; etbPerUnit?: number; source?: string; date?: string }>(`${base}/api/exchange-rates?to=${currency}`)
        .then(result => {
          setLocalRate(result.rate);
          if (result.etbPerUnit) {
            setFxMeta({ etbPerUnit: result.etbPerUnit, source: result.source, date: result.date });
          }
        })
        .catch(() => setError("Local prices loaded, but the ETB exchange rate is unavailable."));
    }
  }

  const localCurrency = currency === "ETB" || localRate !== 1 ? currency : "ETB";
  const displayLocal = local ? { ...local, statistics: localCurrency === currency ? convertStatistics(local.statistics, localRate) : local.statistics } : null;
  const selectedValue = selected === "internationalMedian" ? international?.statistics?.median : selected === "internationalMean" ? international?.statistics?.mean : selected === "localMedian" ? displayLocal?.statistics?.median : Number(customValue);
  const selectedCurrency = selected === "localMedian" ? localCurrency : currency;
  const hasResults = international || local;

  async function recordDecision() {
    const parsedSelectedValue = Number(selectedValue);

    if (!Number.isFinite(parsedSelectedValue) || parsedSelectedValue <= 0) { setError("Select a valid customs value before submitting the valuation."); return; }
    setRecording(true); setError(""); setRecordNotice("");
    try {
      const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
       const assignedLocationId = (
        profile.locations.find(location =>
          location.id === profile.user.primaryLocationId &&
          location.status === "ACTIVE" &&
          (location.supportsValuation || location.supportsInspection)
        ) ??
        profile.locations.find(location =>
          location.status === "ACTIVE" &&
          (location.supportsValuation || location.supportsInspection)
        )
       )?.id ?? null;
       if (!assignedLocationId) throw new Error("Assign an active valuation office before submitting this valuation.");

       const evidenceSnapshot = {
         product: query.trim(), hsCode: null, searchQuery: query.trim(), selectedCustomsValue: parsedSelectedValue,
         selectedCurrency, supportingSource: selected, officer: { id: profile.user.id, name: profile.user.fullName },
         decidedAt: new Date().toISOString(), internationalEvidence: international?.items ?? [], localEvidence: local?.items ?? [],
         statistics: { international: international?.statistics ?? null, local: local?.statistics ?? null },
         outliers: { international: international?.statistics?.potentialOutliers ?? [], local: local?.statistics?.potentialOutliers ?? [] },
         tariff: { rate: null, amount: null, source: "Classification and tariff lookup are completed in Phase 2." },
       };

       const created = await workspaceApi<{ id: string; version: string }>("/decisions", { method: "POST", body: JSON.stringify({
         hsCodeId: null,
         locationId: assignedLocationId,
         selectedReferenceValue: parsedSelectedValue,
         currency: selectedCurrency,
         decision: `Customs value selected for ${query.trim()}`,
         justification: justification.trim(),
         evidence: JSON.stringify(evidenceSnapshot),
         version: null,
       }) });
       const submitted = await workspaceApi<{ status: string }>(`/decisions/${created.id}/submit`, { method: "POST", body: JSON.stringify({ version: created.version, justification: justification.trim() }) });
       updateValuationSession({ hsCode: undefined, selectedValue: parsedSelectedValue, selectedCurrency, decisionId: created.id, phase1Submitted: submitted.status === "Submitted" });
       setRecordNotice("Price Review submitted. Continuing to Final Assessment…");
       onSubmitted();
    } catch (exception) { setError(exception instanceof Error ? exception.message : "The valuation decision could not be saved."); }
    finally { setRecording(false); }
  }
  const internationalOutliers = international?.statistics?.potentialOutliers.length ?? 0;
  const localOutliers = local?.statistics?.potentialOutliers.length ?? 0;
  return <section className="overview-evidence-workspace">
    <section className="officer-search-hero"><div><span>VALUATION SEARCH</span><h2>Search a product to begin valuation</h2><p>Search once to create the active valuation session. The same evidence follows you through Price Review, detail pages, and the final decision.</p></div><form onSubmit={search}><FiSearch /><input aria-label="Product description" placeholder="e.g. Apple iPhone 13 128GB" value={query} onChange={event => setQuery(event.currentTarget.value)} required />{(query || hasResults) && <button type="button" className="phase2-search-clear" aria-label="Clear search" onClick={() => { setQuery(""); setInternational(null); setLocal(null); setSelected("internationalMedian"); setCustomValue(""); setJustification(""); setError(""); setRecordNotice(""); }}><FiX /></button>}<select aria-label="International market" value={market} onChange={event => setMarket(event.currentTarget.value)}><option value="us">US · USD</option><option value="gb">UK · GBP</option><option value="de">Germany · EUR</option><option value="ae">UAE · AED</option><option value="za">South Africa · ZAR</option></select><button type="submit" disabled={busy}>{busy ? "Searching…" : <>Search <FiArrowRight /></>}</button></form>{hasResults && <div className="officer-search-links"><Link href={`/international-prices?q=${encodeURIComponent(query.trim())}&market=${market}`}><FiGlobe />Global market details</Link><Link href={`/local-prices?q=${encodeURIComponent(query.trim())}`}><FiShoppingBag />Local market details</Link><Link href="/historical-customs-prices"><FiArchive />Customs history</Link><Link href="/outlier-analysis"><FiBarChart2 />Price analysis</Link></div>}</section>
    <FeedbackToast error={error} success={recordNotice} onDismissError={() => setError("")} onDismissSuccess={() => setRecordNotice("")} />
    {hasResults && <div className="valuation-workspace-grid"><div className="valuation-evidence-area"><div className="valuation-stat-grid"><StatisticCard title="Global market statistics" icon={<FiGlobe />} stats={international?.statistics ?? null} currency={currency} tone="international" href={`/international-prices?q=${encodeURIComponent(query.trim())}&market=${market}`} /><StatisticCard title="Local market statistics" icon={<FiMapPin />} stats={displayLocal?.statistics ?? null} currency={localCurrency} tone="local" href={`/local-prices?q=${encodeURIComponent(query.trim())}`} rateNote={localCurrency === currency && fxMeta?.etbPerUnit ? `1 ${currency} = ${fxMeta.etbPerUnit.toFixed(2)} ETB · CBE via exchange.et` : undefined} /><section className="valuation-variance"><span>Local vs. international</span>{international?.statistics && displayLocal?.statistics && localCurrency === currency ? <><b>{(((displayLocal.statistics.median - international.statistics.median) / international.statistics.median) * 100).toFixed(1)}%</b><p>Local median converted to {currency} ({fxMeta?.etbPerUnit ? `1 ${currency} = ${fxMeta.etbPerUnit.toFixed(2)} ETB` : "live exchange rate"}) compared with international median.</p></> : <><b>Exchange rate unavailable</b><p>Local prices remain in ETB until an approved exchange rate is available.</p></>}</section></div><EvidenceTrend international={international?.statistics ?? null} local={localCurrency === currency ? displayLocal?.statistics ?? null : null} currency={currency} /><section className="valuation-insight-grid"><Link href="/outlier-analysis"><strong>Price analysis</strong><span>{internationalOutliers + localOutliers} suspected outlier{internationalOutliers + localOutliers === 1 ? "" : "s"}</span><small>Global {internationalOutliers} · Local {localOutliers} · View reasons <FiArrowRight /></small></Link><Link href="/historical-customs-prices"><strong>Customs history</strong><span>Saved history review</span><small>Open the historical comparison <FiArrowRight /></small></Link><Link href={`/international-prices?q=${encodeURIComponent(query.trim())}&market=${market}`}><strong>Global market</strong><span>{international?.items.length ?? 0} offers</span><small>View exact offers <FiArrowRight /></small></Link></section></div><aside className="valuation-decision-panel"><div className="valuation-decision-title"><FiCheckCircle /><div><h3>Selected customs value</h3><p>Review the evidence before submitting Price Review. HS classification and tariff rules are completed in Final Assessment.</p></div></div><div className="reference-options"><label className={selected === "internationalMedian" ? "is-selected" : ""}><input type="radio" checked={selected === "internationalMedian"} onChange={() => setSelected("internationalMedian")} /><span><strong>Global market median</strong><small>{international?.statistics?.observationCount ?? 0} observations</small></span><b>{money(international?.statistics?.median, currency)}</b></label><label className={selected === "internationalMean" ? "is-selected" : ""}><input type="radio" checked={selected === "internationalMean"} onChange={() => setSelected("internationalMean")} /><span><strong>Global market mean</strong><small>{international?.statistics?.observationCount ?? 0} observations</small></span><b>{money(international?.statistics?.mean, currency)}</b></label><label className={selected === "localMedian" ? "is-selected" : ""}><input type="radio" checked={selected === "localMedian"} onChange={() => setSelected("localMedian")} /><span><strong>Local market median</strong><small>{local?.statistics?.observationCount ?? 0} local records {localCurrency === currency && fxMeta?.etbPerUnit ? `· Converted at ${fxMeta.etbPerUnit.toFixed(2)} ETB/${currency}` : ""}</small></span><b>{money(displayLocal?.statistics?.median, localCurrency)}</b></label><label className={selected === "custom" ? "is-selected" : ""}><input type="radio" checked={selected === "custom"} onChange={() => setSelected("custom")} /><span><strong>Enter a different customs value</strong><small>Use an officer-selected amount</small></span></label>{selected === "custom" && <div className="custom-reference-field"><label htmlFor="custom-reference-input">Customs value <span>({currency})</span></label><input id="custom-reference-input" className="custom-reference-input" type="number" min="0.01" step="0.01" placeholder={`Enter amount in ${currency}`} value={customValue} onChange={event => setCustomValue(event.currentTarget.value)} /><small>Enter the amount the officer wants to carry into Final Assessment.</small></div>}</div><div className="overview-decision-fields"><label>Officer note (optional)<textarea value={justification} onChange={event => setJustification(event.currentTarget.value)} placeholder="Add an optional note about this customs value…" rows={3} /></label></div><div className="selected-reference"><span>Selected customs value</span><b>{money(selectedValue, selectedCurrency)}</b></div><button className="valuation-record-link" type="button" disabled={recording} onClick={() => void recordDecision()}><FiFileText />{recording ? "Submitting valuation…" : "Continue to next phase"}</button><small className="decision-disclaimer">The selected customs value and evidence will be carried into Final Assessment.</small></aside></div>}
  </section>;
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
  const statusCounts = ["Submitted", "Draft", "Returned", "Approved", "Rejected"].map(status => ({ status, count: data.decisions.filter(decision => decision.status === status).length }));
  return <>
    <DashboardHeader profile={profile} eyebrow="Customs Administrator · Overview" title="Overview" description="People, office assignments, valuation workload, and cases requiring attention." actions={<div className="dashboard-quick-actions"><Link href="/administration"><FiUsers />Manage Officers</Link><Link href="/valuation-decisions"><FiCheckCircle />Review valuations</Link></div>} />
    <KpiGrid data={data} />
    <div className="dashboard-main-grid">
      <section className="dashboard-panel dashboard-panel--wide"><div className="dashboard-panel-heading"><div><p className="eyebrow">My assigned organization</p><h2>Assigned offices</h2><span>Locations available for your operational responsibilities</span></div></div><LocationTree locations={data.locations} /></section>
      <section className="dashboard-panel"><div className="dashboard-panel-heading"><div><p className="eyebrow">Operational monitoring</p><h2>Valuation workload</h2></div><Link href="/valuation-decisions">Review queue <FiArrowRight /></Link></div><div className="workload-list">{statusCounts.map(item => <div key={item.status}><span>{item.status}</span><div><i style={{ width: `${Math.max(4, Math.min(100, item.count * 12))}%` }} /></div><strong>{item.count}</strong></div>)}</div></section>
       <section className="dashboard-panel dashboard-panel--full"><div className="dashboard-panel-heading"><div><p className="eyebrow">Employee management</p><h2>Officers in my location</h2><span>Current office, access status, and most recent account activity</span></div><Link href="/administration">Assignments <FiArrowRight /></Link></div>{data.employees.length ? <div className="table-wrap"><table className="dashboard-table"><thead><tr><th>Officer</th><th>Employee number</th><th>Office</th><th>Responsibilities</th><th>Status</th><th>Last activity</th></tr></thead><tbody>{data.employees.map(employee => <tr key={employee.user.id}><td><strong>{employee.user.fullName}</strong><small>{employee.user.email}</small></td><td>{employee.user.employeeNumber || "—"}</td><td>{data.locations.find(location => location.id === employee.locationId)?.displayName ?? "Unassigned"}</td><td>{employee.user.responsibilities || "Not recorded"}</td><td><span className={employee.user.active ? "status-active" : "status-pending"}>{employee.user.status}</span></td><td>{employee.user.lastLoginAt ? new Date(employee.user.lastLoginAt).toLocaleString() : "No sign-in recorded"}</td></tr>)}</tbody></table></div> : <DataState kind="empty" compact title="No Officers in this location" description="Create or assign an Officer to a location." />}</section>
      <section className="dashboard-panel dashboard-panel--full"><div className="dashboard-panel-heading"><div><p className="eyebrow">Requires attention</p><h2>Submitted and returned valuations</h2></div><Link href="/valuation-decisions">Open all <FiArrowRight /></Link></div><DecisionTable data={data} filter={decision => decision.status === "Submitted" || decision.status === "Returned"} /></section>
    </div>
  </>;
}

function OfficerDashboard({ profile }: { profile: WorkspaceProfile }) {
  const [phase, setPhase] = useState<Phase>("one");
  const [activeSession, setActiveSession] = useState<ReturnType<typeof readValuationSession>>(null);
  useEffect(() => {
    const sync = () => setActiveSession(readValuationSession());
    sync(); window.addEventListener("storage", sync); window.addEventListener("focus", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", sync); };
  }, []);
  return <>
    {phase === "one" ? <>
      <DashboardHeader profile={profile} eyebrow="Customs Officer · Valuation workspace" title="Valuation search" description="Start with one product search. Price Review opens the evidence workflow, and Duty & Tax Assessment becomes available after the valuation is submitted." />
      <PhaseBar phase={phase} onChange={setPhase} phase2Ready={Boolean(activeSession?.phase1Submitted && activeSession.decisionId)} />
      <OfficerEvidenceWorkspace profile={profile} onSubmitted={() => { setActiveSession(readValuationSession()); setPhase("two"); }} />
    </> : <PhaseTwoOverview onBackToReview={() => setPhase("one")} />}
    {activeSession && <section className="dashboard-session-strip"><span><FiCheckCircle />Active valuation session</span><strong>{activeSession.query}</strong><small>Started {new Date(activeSession.createdAt).toLocaleString()} · {activeSession.phase1Submitted ? "Price Review submitted" : "Price Review in progress"}</small><Link href="/valuation-decisions">Valuation records <FiArrowRight /></Link></section>}
  </>;
}

function DecisionTable({ data, filter = () => true }: { data: WorkspaceDashboard; filter?: (decision: WorkspaceDashboard["decisions"][number]) => boolean }) {
  const rows = data.decisions.filter(filter);
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
  return <OfficerDashboard profile={profile} />;
}
