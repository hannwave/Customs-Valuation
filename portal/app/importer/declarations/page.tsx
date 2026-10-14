"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { FiArrowRight, FiFileText, FiPlusCircle, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import { usePortal } from "@/components/importer/ImporterShell";
import { DeclarationPill, PageHeader, VerificationBanner, shortDate } from "@/components/importer/PortalParts";
import { declarationStatus, purposeLabels } from "@/lib/importer";

const tabs = ["", "SUBMITTED", "INFORMATION_REQUESTED", "VERIFIED", "ASSESSMENT_READY", "REJECTED"];

function Declarations() {
  const router = useRouter();
  const params = useSearchParams();
  const { declarations, reloadDeclarations, verified, profile } = usePortal();
  const [filter, setFilter] = useState(params.get("status") ?? "");
  const [search, setSearch] = useState("");
  const all = useMemo(() => declarations ?? [], [declarations]);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter(item => (!filter || item.status === filter) && (!term || `${item.reference} ${item.productName} ${item.originCountryName}`.toLowerCase().includes(term)));
  }, [all, filter, search]);
  const choose = (status: string) => { setFilter(status); router.replace(status ? `/importer/declarations?status=${status}` : "/importer/declarations", { scroll: false }); };

  return <div className="ip-page">
    <PageHeader eyebrow="DECLARATIONS" title="My declarations" description="Every item you have registered and where it stands in officer review."
      actions={<><button type="button" className="iv-icon-button" onClick={() => void reloadDeclarations()} aria-label="Refresh"><FiRefreshCw aria-hidden="true" /></button>
        {verified && <Link className="iv-primary" href="/importer/declarations/new"><FiPlusCircle aria-hidden="true" />New declaration</Link>}</>} />
    <VerificationBanner profile={profile} />
    <section className="iv-table-card">
      <div className="iv-table-toolbar">
        <div className="iv-filter ip-tabs" role="tablist" aria-label="Filter by status">{tabs.map(status => {
          const total = status ? all.filter(item => item.status === status).length : all.length;
          return <button key={status || "all"} type="button" role="tab" aria-selected={filter === status} className={filter === status ? "is-active" : ""} onClick={() => choose(status)}>{status ? declarationStatus[status].label : "All"} <span className="ip-tab-count">{total}</span></button>;
        })}</div>
        <label className="iv-search"><FiSearch aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search reference, product or origin" aria-label="Search declarations" maxLength={100} />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><FiX /></button>}</label>
      </div>
      <div className="iv-table-scroll">
        <table className="iv-table">
          <thead><tr><th scope="col">Reference</th><th scope="col">Product</th><th scope="col">Origin</th><th scope="col">Purpose</th><th scope="col">Status</th><th scope="col">Submitted</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
          <tbody>
            {declarations === null ? <tr><td colSpan={8} className="iv-table-empty">Loading declarations…</td></tr>
              : rows.length ? rows.map(item => <tr key={item.id} onClick={() => router.push(`/importer/declarations/${item.id}`)}>
                <td data-label="Reference" className="iv-mono">{item.reference}</td>
                <td data-label="Product"><strong>{item.productName}</strong></td>
                <td data-label="Origin">{item.originCountryName}</td>
                <td data-label="Purpose">{purposeLabels[item.importPurpose] ?? item.importPurpose}</td>
                <td data-label="Status"><DeclarationPill status={item.status} /></td>
                <td data-label="Submitted">{shortDate(item.submittedAt)}</td>
                <td data-label="Updated">{shortDate(item.updatedAt)}</td>
                <td className="iv-table-action"><Link className="iv-open" href={`/importer/declarations/${item.id}`} onClick={event => event.stopPropagation()}>{item.status === "INFORMATION_REQUESTED" ? "Respond" : "Open"}<FiArrowRight aria-hidden="true" /></Link></td>
              </tr>)
              : <tr><td colSpan={8} className="iv-table-empty"><FiFileText aria-hidden="true" /> {all.length ? "No declarations match this view." : "You have not submitted any declarations yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}

export default function DeclarationsPage() {
  return <Suspense fallback={null}><Declarations /></Suspense>;
}
