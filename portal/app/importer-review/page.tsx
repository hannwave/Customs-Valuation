"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FiChevronRight, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import { FeedbackToast } from "@/components/FeedbackToast";
import { formatMoney, importerApi } from "@/lib/importer";
import { StatusBadge } from "@/components/officer/StatusBadge";
import { type Queue } from "@/lib/officer-case";

type Tab = { key: string; label: string; statuses: string[]; hint: string };
const tabs: Tab[] = [
  { key: "review", label: "Needs review", statuses: ["SUBMITTED"], hint: "New and resubmitted" },
  { key: "valuation", label: "Valuation", statuses: ["VERIFIED", "ASSESSMENT_READY"], hint: "Set the customs value" },
  { key: "tax", label: "Tax assessment", statuses: ["IN_ASSESSMENT"], hint: "Confirm duties and taxes" },
  { key: "waiting", label: "Awaiting importer", statuses: ["INFORMATION_REQUESTED"], hint: "Information requested" },
  { key: "assessed", label: "Assessed", statuses: ["ASSESSED"], hint: "Notice issued" },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"], hint: "Closed" },
  { key: "all", label: "All", statuses: [], hint: "Every submission" },
];
const REFRESH_MS = 60_000;

function age(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 14 ? `${days} d ago` : new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ImporterSubmissionsPage() {
  const router = useRouter();
  const [tab, setTab] = useState("review");
  const [search, setSearch] = useState(""); const [query, setQuery] = useState("");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  const current = tabs.find(item => item.key === tab) ?? tabs[0];

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (current.statuses.length) params.set("status", current.statuses.join(","));
      if (query) params.set("q", query);
      setQueue(await importerApi<Queue>(`/importer-declarations/queue?${params}`)); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Submissions could not be loaded."); }
    finally { setLoading(false); }
  }, [current, query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const count = (item: Tab) => queue ? item.statuses.length ? item.statuses.reduce((sum, status) => sum + (queue.counts[status] ?? 0), 0) : queue.total : null;

  return <div className="oc-page">
    <header className="oc-page-head">
      <div><p className="oc-eyebrow">Customs officer · importer declarations</p><h1>Importer submissions</h1>
        <p>Review, value, tax and finalise each declaration in one place. The importer is notified in their portal at every decision.</p></div>
      <button type="button" className="oc-icon-button" onClick={() => void load()} aria-label="Refresh submissions" title="Refresh"><FiRefreshCw aria-hidden="true" className={loading ? "oc-spin" : ""} /></button>
    </header>

    <div className="oc-tabs" role="tablist" aria-label="Filter submissions by stage">
      {tabs.map(item => { const value = count(item);
        return <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`oc-tab is-${item.key}${tab === item.key ? " is-active" : ""}`} onClick={() => setTab(item.key)}>
          <span>{item.label}</span><strong>{value ?? "–"}</strong><small>{item.hint}</small>
        </button>; })}
    </div>

    <section className="iv-table-card">
      <div className="iv-table-toolbar">
        <h2>{current.label} <small>{queue ? `${queue.items.length} shown` : ""}</small></h2>
        <label className="iv-search"><FiSearch aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} maxLength={100} placeholder="Reference, product, importer, TIN or HS code" aria-label="Search submissions" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><FiX /></button>}</label>
      </div>
      <div className="iv-table-scroll">
        <table className="iv-table oc-queue-table">
          <thead><tr><th scope="col">Declaration</th><th scope="col">Importer</th><th scope="col">HS code</th><th scope="col">Declared value</th><th scope="col">Origin</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
          <tbody>
            {loading && !queue ? Array.from({ length: 4 }, (_, index) => <tr key={index} className="oc-skeleton-row"><td colSpan={8}><span /></td></tr>)
              : queue?.items.length ? queue.items.map(row => <tr key={row.id} onClick={() => router.push(`/importer-review/${row.id}`)}>
                <td data-label="Declaration"><strong>{row.productName}</strong><small className="iv-mono">{row.reference}{row.brand ? ` · ${[row.brand, row.model].filter(Boolean).join(" ")}` : ""}</small></td>
                <td data-label="Importer"><strong>{row.importerName || "—"}</strong><small>{row.importerTin ? <>TIN <span className="iv-mono">{row.importerTin}</span></> : "No TIN"}</small></td>
                <td data-label="HS code"><span className={`oc-hs-chip${row.hsConfirmed ? " is-confirmed" : ""}`} title={row.hsConfirmed ? "Confirmed by an officer" : "Suggested by the importer"}>{row.hsCode || "—"}</span><small>{row.hsConfirmed ? "Confirmed" : "Importer's choice"}</small></td>
                <td data-label="Declared value"><strong>{formatMoney(row.invoiceAmount, row.invoiceCurrency)}</strong><small>{row.quantity} {row.unit}{row.assessedPayable != null ? ` · payable ${formatMoney(row.assessedPayable, row.assessmentCurrency)}` : ""}</small></td>
                <td data-label="Origin">{row.originCountryName}<small>{row.branch}</small></td>
                <td data-label="Status"><StatusBadge status={row.status} /></td>
                <td data-label="Updated" title={new Date(row.updatedAt).toLocaleString()}>{age(row.updatedAt)}</td>
                <td className="iv-table-action"><Link className="iv-open" href={`/importer-review/${row.id}`} onClick={event => event.stopPropagation()}>Open<FiChevronRight aria-hidden="true" /></Link></td>
              </tr>)
              : <tr><td colSpan={8} className="iv-table-empty">{query ? `No submissions match “${query}”.` : `No submissions in “${current.label.toLowerCase()}”.`}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
    <FeedbackToast error={error} onDismissError={() => setError("")} onRetry={() => void load()} />
  </div>;
}
