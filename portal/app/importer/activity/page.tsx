"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiActivity, FiAlertTriangle, FiArrowRight, FiCheckCircle, FiFileText, FiInfo, FiLock, FiRefreshCw, FiUser, FiUserCheck, FiXCircle } from "react-icons/fi";
import { PageHeader } from "@/components/importer/PortalParts";
import { ToastMessage } from "@/components/Toaster";
import { getImporterActivity, type ImporterActivity, type ImporterActivityItem } from "@/lib/importer";

const filters: { key: string; label: string; icon: typeof FiActivity }[] = [
  { key: "", label: "Everything", icon: FiActivity },
  { key: "CASE", label: "Declarations", icon: FiFileText },
  { key: "VERIFICATION", label: "Verification", icon: FiUserCheck },
  { key: "ACCOUNT", label: "Account", icon: FiUser },
  { key: "SECURITY", label: "Sign-ins", icon: FiLock },
];
const toneIcon = { success: FiCheckCircle, warning: FiAlertTriangle, danger: FiXCircle, info: FiInfo, neutral: FiActivity };

function dayLabel(value: string) {
  const date = new Date(value), today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** The importer's own audit trail: every step on their declarations, verification and account, in plain language. */
export default function ImporterActivityPage() {
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ImporterActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getImporterActivity(category, page)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Your activity could not be loaded."); }
    finally { setLoading(false); }
  }, [category, page]);
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const result: { day: string; items: ImporterActivityItem[] }[] = [];
    for (const item of data?.items ?? []) {
      const day = dayLabel(item.occurredAt);
      const last = result[result.length - 1];
      if (last?.day === day) last.items.push(item); else result.push({ day, items: [item] });
    }
    return result;
  }, [data]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const totalAll = data ? Object.values(data.counts).reduce((sum, value) => sum + value, 0) : 0;

  return <div className="ip-page ia-page">
    <PageHeader eyebrow="ACTIVITY" title="Your activity" description="Every step on your declarations, verification and account — what you did and what Customs decided, with the time it happened."
      actions={<button type="button" className="iv-icon-button" onClick={() => void load()} aria-label="Refresh" disabled={loading}><FiRefreshCw aria-hidden="true" className={loading ? "dc-spin" : ""} /></button>} />
    <ToastMessage kind="error" message={error} onClear={() => setError("")} action={{ label: "Try again", onClick: () => void load() }} />

    <div className="ia-filters" role="tablist" aria-label="Filter activity">
      {filters.map(filter => { const Icon = filter.icon; const count = filter.key ? data?.counts[filter.key] ?? 0 : totalAll;
        return <button key={filter.key || "all"} type="button" role="tab" aria-selected={category === filter.key} className={`ia-filter${category === filter.key ? " is-selected" : ""}`} onClick={() => { setCategory(filter.key); setPage(1); }}>
          <Icon aria-hidden="true" /><span>{filter.label}</span>{data && <em>{count}</em>}</button>; })}
    </div>

    <section className="dc-panel ia-panel">
      {loading && !data ? <ul className="dc-list" aria-busy="true">{[0, 1, 2].map(index => <li key={index} className="dc-case is-skeleton"><span /><span /><span /></li>)}</ul>
        : groups.length === 0 ? <div className="dc-empty"><FiActivity aria-hidden="true" /><strong>No activity yet</strong><p>Your declarations, verification steps and account changes will appear here as they happen.</p></div>
        : groups.map(group => <div key={group.day} className="ia-day">
          <h2>{group.day}</h2>
          <ol className="ia-timeline">{group.items.map(item => { const Icon = toneIcon[item.tone] ?? FiActivity;
            return <li key={item.id} className={`ia-event is-${item.tone}`}>
              <span className="ia-dot" aria-hidden="true"><Icon /></span>
              <div className="ia-body">
                <div className="ia-head"><strong>{item.title}</strong><time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time></div>
                <p className="ia-meta"><span className={`ia-actor${item.byMe ? " is-me" : ""}`}>{item.actor}</span>{item.declaration && <> · <span>{item.declaration.title}</span> <code>{item.declaration.reference}</code></>}</p>
                {item.note && <blockquote>{item.note}</blockquote>}
                {item.link && <Link className="ia-link" href={item.link}>{item.declaration ? "Open declaration" : item.category === "VERIFICATION" ? "Verification & documents" : "My profile"}<FiArrowRight aria-hidden="true" /></Link>}
              </div>
            </li>; })}</ol>
        </div>)}
      {data && pages > 1 && <div className="audit-pagination ia-pages"><span>Page {data.page} of {pages}</span>
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older</button></div>}
    </section>
  </div>;
}
