"use client";

import Link from "next/link";
import { FiArrowRight, FiCheck, FiClock, FiFileText, FiMapPin, FiPackage, FiPlusCircle, FiUserCheck } from "react-icons/fi";
import { ImporterLanding } from "@/components/ImporterOnboarding";
import { usePortal, usePortalOptional } from "@/components/importer/ImporterShell";
import { DeclarationPill, PageHeader, StatCard, VerificationBanner, shortDate } from "@/components/importer/PortalParts";
import { declarationStatus, importerTypes, verificationLabels, declarationTitle, tariffSummary } from "@/lib/importer";

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { account, profile, declarations, verified } = usePortal();
  const all = declarations ?? [];
  const count = (...statuses: string[]) => all.filter(item => statuses.includes(item.status)).length;
  const actionNeeded = all.filter(item => item.status === "INFORMATION_REQUESTED");
  const firstName = account?.fullName.split(/\s+/)[0] ?? "";

  return <div className="ip-page">
    <PageHeader eyebrow="IMPORTER DASHBOARD" title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
      description="Track your declarations, respond to officer requests and keep your importer verification up to date."
      actions={verified ? <Link className="iv-primary" href="/importer/declarations/new"><FiPlusCircle aria-hidden="true" />New declaration</Link>
        : <span className="iv-primary ip-disabled" aria-disabled="true" title="Available after verification"><FiPlusCircle aria-hidden="true" />New declaration</span>} />
    <VerificationBanner profile={profile} />

    <div className="ip-stats is-six">
      <StatCard label="Total declarations" value={declarations ? all.length : "–"} tone="neutral" href="/importer/declarations" hint="Everything you registered" />
      <StatCard label="In review" value={declarations ? count("SUBMITTED") : "–"} tone="info" href="/importer/declarations?status=SUBMITTED" hint="With a Customs Officer" />
      <StatCard label="Action needed" value={declarations ? actionNeeded.length : "–"} tone="warning" href="/importer/declarations?status=INFORMATION_REQUESTED" hint="Officer requested information" />
      <StatCard label="Being valued" value={declarations ? count("VERIFIED", "ASSESSMENT_READY", "IN_ASSESSMENT") : "–"} tone="info" href="/importer/declarations?status=VALUATION" hint="Verified, value and taxes in progress" />
      <StatCard label="Assessed" value={declarations ? count("ASSESSED") : "–"} tone="success" href="/importer/declarations?status=ASSESSED" hint="Amount payable issued" />
      <StatCard label="Rejected" value={declarations ? count("REJECTED") : "–"} tone="danger" href="/importer/declarations?status=REJECTED" hint="Not accepted by the officer" />
    </div>

    <div className="ip-dashboard-grid">
      <section className="ip-card">
        <header className="ip-card-head"><h2>Recent declarations</h2><Link href="/importer/declarations">View all<FiArrowRight aria-hidden="true" /></Link></header>
        {declarations === null ? <p className="ip-empty">Loading declarations…</p> : all.length === 0
          ? <div className="ip-empty-state"><FiFileText aria-hidden="true" /><strong>No declarations yet</strong><p>{verified ? "Register your first imported goods to start officer review." : "Once you are verified you can register imported goods here."}</p>{verified && <Link className="iv-primary" href="/importer/declarations/new">Create a declaration</Link>}</div>
          : <ul className="rd-list">{all.slice(0, 6).map(item => {
            const tone = declarationStatus[item.status]?.tone ?? "neutral";
            const urgent = item.status === "INFORMATION_REQUESTED";
            const summary = tariffSummary(item.suggestedTariffDescription);
            return <li key={item.id} className={`rd-row is-${tone}`}>
              <Link href={`/importer/declarations/${item.id}`} title={`${item.productName} · ${item.reference}`}>
                <span className="rd-icon" aria-hidden="true"><FiPackage /></span>
                <span className="rd-main"><strong>{declarationTitle(item)}</strong>{summary && <small>{summary}</small>}</span>
                <span className="rd-origin"><FiMapPin aria-hidden="true" />{item.originCountryName}</span>
                <span className="rd-status"><DeclarationPill status={item.status} /><small>{shortDate(item.updatedAt)}</small></span>
                <span className={`rd-go${urgent ? " is-urgent" : ""}`} aria-hidden="true">{urgent ? <em>Respond</em> : null}<FiArrowRight /></span>
              </Link>
            </li>;
          })}</ul>}
      </section>

      <div className="ip-side">
        {actionNeeded.length > 0 && <section className="ip-card is-attention"><header className="ip-card-head"><h2>Needs your attention</h2></header>
          <ul className="ip-task-list">{actionNeeded.slice(0, 4).map(item => <li key={item.id}><Link href={`/importer/declarations/${item.id}`}><strong>{declarationTitle(item)}</strong><small>{item.reference} · officer requested information</small><FiArrowRight aria-hidden="true" /></Link></li>)}</ul></section>}

        <section className="ip-card">
          <header className="ip-card-head"><h2>Your importer account</h2><Link href="/importer/account">Manage<FiArrowRight aria-hidden="true" /></Link></header>
          {profile ? <dl className="ip-facts">
            <div><dt><FiUserCheck aria-hidden="true" />Status</dt><dd>{verificationLabels[profile.verificationStatus]}</dd></div>
            <div><dt><FiFileText aria-hidden="true" />Registered as</dt><dd>{importerTypes.find(type => type.value === profile.importerType)?.title}</dd></div>
            <div><dt><FiMapPin aria-hidden="true" />Region</dt><dd>{profile.regionName ?? "—"}</dd></div>
            <div><dt><FiCheck aria-hidden="true" />Documents</dt><dd>{profile.documents.length} on file</dd></div>
          </dl> : <p className="ip-empty">{profile === undefined ? "Loading…" : "Not verified yet."}</p>}
        </section>

        <section className="ip-card">
          <header className="ip-card-head"><h2>Before you declare</h2></header>
          <ul className="ip-checks-list">
            <li><FiCheck aria-hidden="true" />Commercial invoice from the seller</li>
            <li><FiCheck aria-hidden="true" />Packing list for the shipment</li>
            <li><FiCheck aria-hidden="true" />Certificate of origin</li>
            <li><FiCheck aria-hidden="true" />Brand, model and a clear product description</li>
          </ul>
          <p className="ip-note"><FiClock aria-hidden="true" />Average shipment time is about 7 days; allow up to 10–15 days.</p>
        </section>
      </div>
    </div>
  </div>;
}

export default function ImporterHome() {
  return usePortalOptional() ? <Dashboard /> : <ImporterLanding />;
}
