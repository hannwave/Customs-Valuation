"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FiArrowRight, FiCalendar, FiFileText, FiMapPin, FiPackage, FiRefreshCw, FiSearch, FiUser, FiX } from "react-icons/fi";
import { FeedbackToast } from "@/components/FeedbackToast";
import { PageHeader } from "@/components/importer/PortalParts";
import { ScanQueueBadge } from "@/components/officer/DocumentScan";
import { StatusBadge } from "@/components/officer/StatusBadge";
import { declarationTitle, formatMoney, importerApi, tariffSummary } from "@/lib/importer";
import { officerStatus, type Queue } from "@/lib/officer-case";

type Tab = { key: string; label: string; statuses: string[]; hint: string; tone: string };
const tabs: Tab[] = [
  { key: "review", label: "Needs review", statuses: ["SUBMITTED"], hint: "New and resubmitted", tone: "info" },
  { key: "valuation", label: "Valuation", statuses: ["VERIFIED", "ASSESSMENT_READY"], hint: "Set the customs value", tone: "info" },
  { key: "tax", label: "Tax assessment", statuses: ["IN_ASSESSMENT"], hint: "Confirm duties and taxes", tone: "info" },
  { key: "waiting", label: "Awaiting importer", statuses: ["INFORMATION_REQUESTED"], hint: "Information requested", tone: "warning" },
  { key: "assessed", label: "Assessed", statuses: ["ASSESSED"], hint: "Notice issued", tone: "success" },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"], hint: "Closed", tone: "danger" },
  { key: "all", label: "All", statuses: [], hint: "Every submission", tone: "neutral" },
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

/** What the officer does next on a declaration in this status. */
const nextAction = (status: string) => status === "SUBMITTED" ? "Review" : status === "VERIFIED" || status === "ASSESSMENT_READY" ? "Value" : status === "IN_ASSESSMENT" ? "Assess" : "Open";

export default function ImporterSubmissionsPage() {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
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
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !target.isContentEditable) { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const count = (item: Tab) => queue ? item.statuses.length ? item.statuses.reduce((sum, status) => sum + (queue.counts[status] ?? 0), 0) : queue.total : null;
  const rows = queue?.items ?? [];

  return <div className="ip-page oc-queue-page">
    <PageHeader eyebrow="CUSTOMS OFFICER · IMPORTER DECLARATIONS" title="Importer submissions"
      description="Review, value, tax and finalise each declaration in one place. The importer is notified in their portal at every decision."
      actions={<button type="button" className="iv-icon-button" onClick={() => void load()} aria-label="Refresh submissions" title="Refresh" disabled={loading}><FiRefreshCw aria-hidden="true" className={loading ? "dc-spin" : ""} /></button>} />

    <div className="ip-stats dc-filters is-seven" role="tablist" aria-label="Filter submissions by stage">
      {tabs.map(item => { const value = count(item);
        return <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`ip-stat is-${item.tone}${tab === item.key ? " is-selected" : ""}`} onClick={() => setTab(item.key)}>
          <span>{item.label}</span><strong>{value ?? "–"}</strong><small>{item.hint}</small>
        </button>; })}
    </div>

    <section className="dc-panel">
      <div className="dc-toolbar">
        <label className="dc-search">
          <span className="dc-search-icon"><FiSearch aria-hidden="true" /></span>
          <input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setSearch(""); }}
            placeholder="Search by reference, product, importer, TIN or HS code" aria-label="Search submissions" maxLength={100} />
          {search ? <button type="button" className="dc-search-clear" onClick={() => { setSearch(""); searchRef.current?.focus(); }} aria-label="Clear search"><FiX aria-hidden="true" /></button>
            : <kbd aria-hidden="true">/</kbd>}
        </label>
        <div className="dc-toolbar-meta"><span className="dc-count" aria-live="polite">{queue ? `${rows.length} ${current.key === "all" ? "submissions" : `in ${current.label.toLowerCase()}`}` : "Loading…"}</span></div>
      </div>

      {loading && !queue ? <ul className="dc-list" aria-busy="true">{[0, 1, 2].map(index => <li key={index} className="dc-case is-skeleton"><span /><span /><span /></li>)}</ul>
        : rows.length ? <ul className="dc-list">{rows.map(row => {
          const tone = officerStatus[row.status]?.tone ?? "neutral";
          const summary = tariffSummary(row.hsDescription);
          const action = nextAction(row.status);
          return <li key={row.id} className={`dc-case oc-queue-case is-${tone}`} onClick={() => router.push(`/importer-review/${row.id}`)}>
            <span className="dc-case-icon" aria-hidden="true"><FiPackage /></span>
            <div className="dc-case-main">
              <strong title={row.productName}>{declarationTitle(row)}</strong>
              <span className="dc-tariff" title={row.hsDescription}><span>{summary || row.productName}</span>{row.hsCode && <code className={`oc-queue-code${row.hsConfirmed ? " is-confirmed" : ""}`} title={row.hsConfirmed ? "Confirmed by an officer" : "Importer's choice"}>{row.hsCode}</code>}</span>
              <span className="dc-tags"><span><FiUser aria-hidden="true" />{row.importerName || "Unknown importer"}{row.importerTin ? ` · TIN ${row.importerTin}` : ""}</span><span><FiMapPin aria-hidden="true" />{row.originCountryName}</span></span>
            </div>
            <div className="dc-case-status"><StatusBadge status={row.status} /><ScanQueueBadge badge={row.documentScan ?? null} />
              <small>{row.assessedPayable != null ? <>Payable <b>{formatMoney(row.assessedPayable, row.assessmentCurrency)}</b></> : <>Declared <b>{formatMoney(row.invoiceAmount, row.invoiceCurrency)}</b></>}</small></div>
            <dl className="dc-case-dates">
              <div><dt><FiFileText aria-hidden="true" />Reference</dt><dd className="oc-queue-ref">{row.reference.replace(/^IMP-\d{8}-/, "")}</dd></div>
              <div><dt><FiCalendar aria-hidden="true" />Updated</dt><dd title={new Date(row.updatedAt).toLocaleString()}>{age(row.updatedAt)}</dd></div>
            </dl>
            <div className="dc-actions">
              <Link className={`dc-open${action === "Review" ? " is-urgent" : ""}`} href={`/importer-review/${row.id}`} onClick={event => event.stopPropagation()} aria-label={`${action} ${row.reference}`}>
                <span>{action}</span><i aria-hidden="true"><FiArrowRight /></i>
              </Link>
            </div>
          </li>;
        })}</ul>
        : <div className="dc-empty"><FiFileText aria-hidden="true" />
          <strong>{query ? "No submissions match" : "Nothing here right now"}</strong>
          <p>{query ? `Nothing matches “${query}” in ${current.label.toLowerCase()}.` : `No submissions in “${current.label.toLowerCase()}”.`}</p>
          {(query || tab !== "all") && <button type="button" className="dc-open" onClick={() => { setSearch(""); setTab("all"); }}><span>Show all submissions</span><i aria-hidden="true"><FiArrowRight /></i></button>}
        </div>}
    </section>
    <FeedbackToast error={error} onDismissError={() => setError("")} onRetry={() => void load()} />
  </div>;
}
