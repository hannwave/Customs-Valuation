"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiArrowRight, FiCheck, FiClock, FiFileText, FiMapPin, FiPlusCircle, FiUserCheck } from "react-icons/fi";
import { ImporterLanding } from "@/components/ImporterOnboarding";
import { usePortal, usePortalOptional } from "@/components/importer/ImporterShell";
import { DeclarationPill, PageHeader, StatCard, VerificationBanner, shortDate } from "@/components/importer/PortalParts";
import { importerTypes, verificationLabels } from "@/lib/importer";

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const router = useRouter();
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

    <div className="ip-stats">
      <StatCard label="Total declarations" value={declarations ? all.length : "–"} tone="neutral" href="/importer/declarations" />
      <StatCard label="In review" value={declarations ? count("SUBMITTED") : "–"} tone="info" href="/importer/declarations?status=SUBMITTED" hint="With a Customs Officer" />
      <StatCard label="Action needed" value={declarations ? actionNeeded.length : "–"} tone="warning" href="/importer/declarations?status=INFORMATION_REQUESTED" hint="Officer requested information" />
      <StatCard label="Verified & in assessment" value={declarations ? count("VERIFIED", "ASSESSMENT_READY") : "–"} tone="success" href="/importer/declarations?status=VERIFIED" />
      <StatCard label="Rejected" value={declarations ? count("REJECTED") : "–"} tone="danger" href="/importer/declarations?status=REJECTED" />
    </div>

    <div className="ip-dashboard-grid">
      <section className="ip-card">
        <header className="ip-card-head"><h2>Recent declarations</h2><Link href="/importer/declarations">View all<FiArrowRight aria-hidden="true" /></Link></header>
        {declarations === null ? <p className="ip-empty">Loading declarations…</p> : all.length === 0
          ? <div className="ip-empty-state"><FiFileText aria-hidden="true" /><strong>No declarations yet</strong><p>{verified ? "Register your first imported goods to start officer review." : "Once you are verified you can register imported goods here."}</p>{verified && <Link className="iv-primary" href="/importer/declarations/new">Create a declaration</Link>}</div>
          : <div className="iv-table-scroll"><table className="iv-table ip-table">
            <thead><tr><th scope="col">Reference</th><th scope="col">Product</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{all.slice(0, 6).map(item => <tr key={item.id} onClick={() => router.push(`/importer/declarations/${item.id}`)}>
              <td data-label="Reference" className="iv-mono">{item.reference}</td><td data-label="Product"><strong>{item.productName}</strong><small>{item.originCountryName}</small></td>
              <td data-label="Status"><DeclarationPill status={item.status} /></td><td data-label="Updated">{shortDate(item.updatedAt)}</td>
              <td className="iv-table-action"><Link className="iv-open" href={`/importer/declarations/${item.id}`} onClick={event => event.stopPropagation()}>Open<FiArrowRight aria-hidden="true" /></Link></td></tr>)}</tbody>
          </table></div>}
      </section>

      <div className="ip-side">
        {actionNeeded.length > 0 && <section className="ip-card is-attention"><header className="ip-card-head"><h2>Needs your attention</h2></header>
          <ul className="ip-task-list">{actionNeeded.slice(0, 4).map(item => <li key={item.id}><Link href={`/importer/declarations/${item.id}`}><strong>{item.productName}</strong><small>{item.reference} · officer requested information</small><FiArrowRight aria-hidden="true" /></Link></li>)}</ul></section>}

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
