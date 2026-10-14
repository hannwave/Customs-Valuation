"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiBell, FiCheckCircle, FiDollarSign, FiInfo, FiXCircle } from "react-icons/fi";
import { getImporterNotifications, markAllNotificationsRead, markNotificationRead, type ImporterNotification } from "@/lib/importer";

const POLL_MS = 60_000;

function kindIcon(kind: string) {
  if (kind.endsWith("ASSESSED")) return { Icon: FiDollarSign, tone: "is-success" };
  if (kind.endsWith("VERIFIED") || kind.endsWith("VERIFY") || kind.endsWith("REINSTATE")) return { Icon: FiCheckCircle, tone: "is-success" };
  if (kind.endsWith("REJECTED") || kind.endsWith("REJECT") || kind.endsWith("SUSPEND")) return { Icon: FiXCircle, tone: "is-danger" };
  if (kind.includes("INFORMATION")) return { Icon: FiAlertTriangle, tone: "is-warning" };
  return { Icon: FiInfo, tone: "is-info" };
}

function ago(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Header bell: officer decisions on the importer's account and declarations. Calls onChange when something new arrives. */
export function NotificationBell({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<ImporterNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const latest = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const result = await getImporterNotifications();
      setItems(result.items); setUnread(result.unread);
      const newest = result.items[0]?.id ?? null;
      if (latest.current !== null && newest !== latest.current) onChange?.();
      latest.current = newest ?? "";
    } catch { /* the bell stays quiet when the service is unreachable */ }
  }, [onChange]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function read(item: ImporterNotification) {
    setOpen(false);
    if (item.readAt) return;
    setItems(current => current.map(entry => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry));
    setUnread(count => Math.max(0, count - 1));
    try { await markNotificationRead(item.id); } catch { void load(); }
  }

  async function readAll() {
    setItems(current => current.map(entry => ({ ...entry, readAt: entry.readAt ?? new Date().toISOString() }))); setUnread(0);
    try { await markAllNotificationsRead(); } catch { void load(); }
  }

  return <div className="ip-bell" ref={root}>
    <button type="button" className="ip-bell-button" aria-haspopup="true" aria-expanded={open} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} onClick={() => setOpen(value => !value)}>
      <FiBell aria-hidden="true" />{unread > 0 && <span className="ip-bell-count">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="ip-bell-panel" role="dialog" aria-label="Notifications">
      <header><strong>Notifications</strong>{unread > 0 && <button type="button" onClick={() => void readAll()}>Mark all as read</button>}</header>
      {items.length === 0 ? <p className="ip-bell-empty">No notifications yet. Officer decisions on your account and declarations appear here.</p>
        : <ul>{items.map(item => { const { Icon, tone } = kindIcon(item.kind);
          return <li key={item.id} className={item.readAt ? "" : "is-unread"}>
            <Link href={item.link || "/importer"} onClick={() => void read(item)}>
              <span className={`ip-bell-icon ${tone}`}><Icon aria-hidden="true" /></span>
              <span className="ip-bell-copy"><strong>{item.title}</strong>{item.message && <span>{item.message}</span>}<small>{ago(item.createdAt)}</small></span>
            </Link>
          </li>; })}</ul>}
    </div>}
  </div>;
}
