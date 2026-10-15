"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FiArrowRight, FiCalendar, FiEdit3, FiFileText, FiMapPin, FiPackage, FiPlusCircle, FiRefreshCw, FiSearch, FiX } from "react-icons/fi";
import { usePortal } from "@/components/importer/ImporterShell";
import { DeclarationPill, PageHeader, VerificationBanner, shortDate } from "@/components/importer/PortalParts";
import { declarationStatus, formatMoney, purposeLabels, type DeclarationSummary, declarationTitle, tariffSummary } from "@/lib/importer";
import { PageSkeleton } from "@/components/PageSkeleton";

/** Status groups shown as filter cards; every declaration status belongs to exactly one group. */
const groups = [
  { key: "", label: "All declarations", hint: "Everything you registered", tone: "neutral", statuses: [] as string[] },
  { key: "SUBMITTED", label: "In review", hint: "With a Customs Officer", tone: "info", statuses: ["SUBMITTED"] },
  { key: "INFORMATION_REQUESTED", label: "Action needed", hint: "Officer requested information", tone: "warning", statuses: ["INFORMATION_REQUESTED"] },
  { key: "VALUATION", label: "Being valued", hint: "Verified, value and taxes in progress", tone: "accent", statuses: ["VERIFIED", "ASSESSMENT_READY", "IN_ASSESSMENT"] },
  { key: "ASSESSED", label: "Assessed", hint: "Amount payable issued", tone: "success", statuses: ["ASSESSED"] },
  { key: "REJECTED", label: "Rejected", hint: "Not accepted by the officer", tone: "danger", statuses: ["REJECTED"] },
];
const groupFor = (status: string | null) => groups.find(group => group.key === status) ?? groups.find(group => status && group.statuses.includes(status)) ?? groups[0];

const sorts = { updated: "Recently updated", submitted: "Recently submitted", oldest: "Oldest first" } as const;
type Sort = keyof typeof sorts;

function amountLine(item: DeclarationSummary) {
  if (item.status === "ASSESSED" && item.assessedPayable != null) return { label: "Payable", value: formatMoney(item.assessedPayable, item.assessmentCurrency) };
  if (item.invoiceAmount != null) return { label: "Invoice", value: formatMoney(item.invoiceAmount, item.invoiceCurrency) };
  return null;
}

function Declarations() {
  const router = useRouter();
  const params = useSearchParams();
  const { declarations, reloadDeclarations, verified, profile } = usePortal();
  const [filter, setFilter] = useState(groupFor(params.get("status")).key);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [refreshing, setRefreshing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const all = useMemo(() => declarations ?? [], [declarations]);
  const active = groupFor(filter);
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const time = (value: string) => new Date(value).getTime() || 0;
    return all
      .filter(item => (!active.statuses.length || active.statuses.includes(item.status))
        && (!term || `${item.reference} ${item.productName} ${item.brand ?? ""} ${item.model ?? ""} ${item.suggestedTariffDescription ?? ""} ${item.originCountryName} ${purposeLabels[item.importPurpose] ?? ""}`.toLowerCase().includes(term)))
      .sort((a, b) => sort === "oldest" ? time(a.submittedAt) - time(b.submittedAt) : sort === "submitted" ? time(b.submittedAt) - time(a.submittedAt) : time(b.updatedAt) - time(a.updatedAt));
  }, [all, active, search, sort]);

  // "/" jumps to the search box, as in most portals.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !target.isContentEditable) { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choose = (key: string) => { setFilter(key); router.replace(key ? `/importer/declarations?status=${key}` : "/importer/declarations", { scroll: false }); };
  const refresh = async () => { setRefreshing(true); try { await reloadDeclarations(); } finally { setRefreshing(false); } };

  return <div className="ip-page">
    <PageHeader eyebrow="DECLARATIONS" title="My declarations" description="Every item you have registered and where it stands in officer review."
      actions={<><button type="button" className="iv-icon-button" onClick={() => void refresh()} aria-label="Refresh" disabled={refreshing}><FiRefreshCw aria-hidden="true" className={refreshing ? "dc-spin" : ""} /></button>
        {verified && <Link className="iv-primary" href="/importer/declarations/new"><FiPlusCircle aria-hidden="true" />New declaration</Link>}</>} />
    <VerificationBanner profile={profile} />

    <div className="ip-stats dc-filters" role="tablist" aria-label="Filter by status">
      {groups.map(group => {
        const total = group.statuses.length ? all.filter(item => group.statuses.includes(item.status)).length : all.length;
        return <button key={group.key || "all"} type="button" role="tab" aria-selected={filter === group.key} className={`ip-stat is-${group.tone}${filter === group.key ? " is-selected" : ""}`} onClick={() => choose(group.key)}>
          <span>{group.label}</span><strong>{declarations ? total : "–"}</strong><small>{group.hint}</small>
        </button>;
      })}
    </div>

    <section className="dc-panel">
      <div className="dc-toolbar">
        <label className="dc-search">
          <span className="dc-search-icon"><FiSearch aria-hidden="true" /></span>
          <input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setSearch(""); }}
            placeholder="Search by reference, product, origin or purpose" aria-label="Search declarations" maxLength={100} />
          {search ? <button type="button" className="dc-search-clear" onClick={() => { setSearch(""); searchRef.current?.focus(); }} aria-label="Clear search"><FiX aria-hidden="true" /></button>
            : <kbd aria-hidden="true">/</kbd>}
        </label>
        <div className="dc-toolbar-meta">
          <span className="dc-count" aria-live="polite">{declarations === null ? "Loading…" : `${rows.length} of ${all.length}${active.key ? ` · ${active.label.toLowerCase()}` : ""}`}</span>
          <select value={sort} onChange={event => setSort(event.target.value as Sort)} aria-label="Sort declarations" className="dc-sort">
            {Object.entries(sorts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {declarations === null ? <ul className="dc-list" aria-busy="true">{[0, 1, 2].map(index => <li key={index} className="dc-case is-skeleton"><span /><span /><span /></li>)}</ul>
        : rows.length ? <ul className="dc-list">{rows.map(item => {
          const tone = declarationStatus[item.status]?.tone ?? "neutral";
          const amount = amountLine(item);
          const respond = item.status === "INFORMATION_REQUESTED";
          const editable = item.status === "SUBMITTED" && item.canEdit;
          return <li key={item.id} className={`dc-case is-${tone}`} onClick={() => router.push(`/importer/declarations/${item.id}`)}>
            <span className="dc-case-icon" aria-hidden="true"><FiPackage /></span>
            <div className="dc-case-main">
              <strong title={item.productName}>{declarationTitle(item)}</strong>
              {tariffSummary(item.suggestedTariffDescription) && <span className="dc-tariff" title={item.suggestedTariffDescription}>{tariffSummary(item.suggestedTariffDescription)}</span>}
              <span className="dc-ref">{item.reference}</span>
              <span className="dc-tags"><span><FiMapPin aria-hidden="true" />{item.originCountryName}</span><span>{purposeLabels[item.importPurpose] ?? item.importPurpose}</span></span>
            </div>
            <div className="dc-case-status"><DeclarationPill status={item.status} />{amount && <small>{amount.label} <b>{amount.value}</b></small>}</div>
            <dl className="dc-case-dates">
              <div><dt><FiCalendar aria-hidden="true" />Submitted</dt><dd>{shortDate(item.submittedAt)}</dd></div>
              <div><dt><FiRefreshCw aria-hidden="true" />Updated</dt><dd>{shortDate(item.updatedAt)}</dd></div>
            </dl>
            <div className="dc-actions">
              {editable && <Link className="dc-edit" href={`/importer/declarations/new?edit=${item.id}`} onClick={event => event.stopPropagation()} aria-label={`Edit ${item.reference}`}><FiEdit3 aria-hidden="true" /><span>Edit</span></Link>}
              <Link className={`dc-open${respond ? " is-urgent" : ""}`} href={`/importer/declarations/${item.id}`} onClick={event => event.stopPropagation()} aria-label={`${respond ? "Respond to" : "Open"} ${item.reference}`}>
                <span>{respond ? "Respond" : item.status === "ASSESSED" ? "View notice" : "Open case"}</span><i aria-hidden="true"><FiArrowRight /></i>
              </Link>
            </div>
          </li>;
        })}</ul>
        : <div className="dc-empty"><FiFileText aria-hidden="true" />
          <strong>{all.length ? "No declarations match this view" : "No declarations yet"}</strong>
          <p>{all.length ? search ? `Nothing matches “${search.trim()}”${active.key ? ` in ${active.label.toLowerCase()}` : ""}.` : `You have no ${active.label.toLowerCase()} declarations.` : verified ? "Register your first imported goods to start officer review." : "Once you are verified you can register imported goods here."}</p>
          {all.length > 0 && (search || active.key) && <button type="button" className="dc-open" onClick={() => { setSearch(""); choose(""); }}><span>Show all declarations</span><i aria-hidden="true"><FiArrowRight /></i></button>}
        </div>}
    </section>
  </div>;
}

export default function DeclarationsPage() {
  return <Suspense fallback={<PageSkeleton variant="table" label="Loading declarations" />}><Declarations /></Suspense>;
}
