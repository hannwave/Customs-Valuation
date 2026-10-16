"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiBell, FiCheckCircle, FiDollarSign, FiInfo, FiX, FiXCircle } from "react-icons/fi";
import { toast } from "@/lib/toast";
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

/**
 * Header bell: officer decisions on the importer's account and declarations. Only unread notifications are listed;
 * opening or dismissing one (here or from its toast) marks it read and removes it. Calls onChange when something new arrives.
 */
export function NotificationBell({ onChange }: { onChange?: () => void }) {
  const [items, setItems] = useState<ImporterNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const latest = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const listed = useRef(new Set<string>());
  const reload = useRef<() => void>(() => {});

  // Removes the notification at once and tells the API; a failed call reloads the true state.
  const remove = useCallback(async (id: string) => {
    if (listed.current.delete(id)) setUnread(count => Math.max(0, count - 1));
    setItems(current => current.filter(entry => entry.id !== id));
    toast.dismiss(`notification-${id}`, false);
    try { await markNotificationRead(id); } catch { reload.current(); }
  }, []);

  const load = useCallback(async () => {
    try {
      const result = await getImporterNotifications();
      const unreadItems = result.items.filter(item => !item.readAt);
      listed.current = new Set(unreadItems.map(item => item.id));
      setItems(unreadItems); setUnread(result.unread);
      const newest = result.items[0]?.id ?? null;
      if (latest.current !== null && newest !== latest.current) {
        // Pop up everything that arrived since the last check, newest last, with the notification chime.
        const seenAt = result.items.findIndex(item => item.id === latest.current);
        const fresh = (seenAt < 0 ? result.items.slice(0, 3) : result.items.slice(0, seenAt)).filter(item => !item.readAt).slice(0, 3).reverse();
        fresh.forEach((item, index) => {
          const tone = kindIcon(item.kind).tone;
          const kind = tone === "is-danger" ? "error" : tone === "is-warning" ? "warning" : tone === "is-success" ? "success" : "notification";
          toast.show(kind, item.message || item.title, { title: item.message ? item.title : "New notification", href: item.link || "/importer", key: `notification-${item.id}`, silent: index > 0, onOpen: () => void remove(item.id) });
        });
        onChange?.();
      }
      latest.current = newest ?? "";
    } catch { /* the bell stays quiet when the service is unreachable */ }
  }, [onChange, remove]);
  reload.current = () => void load();

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

  async function clearAll() {
    items.forEach(item => toast.dismiss(`notification-${item.id}`, false));
    listed.current.clear(); setItems([]); setUnread(0);
    try { await markAllNotificationsRead(); } catch { void load(); }
  }

  return <div className="ip-bell" ref={root}>
    <button type="button" className={`ip-bell-button${open ? " is-open" : ""}`} aria-haspopup="true" aria-expanded={open} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} onClick={() => setOpen(value => !value)}>
      <FiBell aria-hidden="true" />{unread > 0 && <span className="ip-bell-count">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <div className="ip-bell-panel" role="dialog" aria-label="Notifications">
      <header>
        <div><strong>Notifications</strong>{unread > 0 && <span className="ip-bell-pill">{unread} new</span>}</div>
        {items.length > 0 && <button type="button" onClick={() => void clearAll()}>Clear all</button>}
      </header>
      {items.length === 0
        ? <div className="ip-bell-empty"><span aria-hidden="true"><FiCheckCircle /></span><strong>You&apos;re all caught up</strong><p>Officer decisions on your account and declarations will appear here.</p></div>
        : <ul>{items.map(item => { const { Icon, tone } = kindIcon(item.kind);
          return <li key={item.id}>
            <Link href={item.link || "/importer"} onClick={() => { setOpen(false); void remove(item.id); }}>
              <span className={`ip-bell-icon ${tone}`}><Icon aria-hidden="true" /></span>
              <span className="ip-bell-copy"><strong>{item.title}</strong>{item.message && <span>{item.message}</span>}<small>{ago(item.createdAt)}</small></span>
            </Link>
            <button type="button" className="ip-bell-dismiss" aria-label={`Dismiss “${item.title}”`} title="Dismiss" onClick={() => void remove(item.id)}><FiX aria-hidden="true" /></button>
          </li>; })}</ul>}
    </div>}
  </div>;
}
