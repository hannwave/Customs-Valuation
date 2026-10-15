"use client";

import { useEffect, useState } from "react";
import { importerApi } from "@/lib/importer";

/*
 * Every HS / tariff code in the UI is shown as "description · [code]": the item description first, the code beside it.
 * When a screen only has the code, the description is looked up (batched and cached) from /api/tariff/describe.
 */

const cache = new Map<string, string | null>();
const waiting = new Map<string, Array<(text: string | null) => void>>();
let queued: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  const codes = queued; queued = []; timer = null;
  if (!codes.length) return;
  const settle = (found: Record<string, string>) => codes.forEach(code => {
    const text = found[code] ?? null;
    cache.set(code, text);
    (waiting.get(code) ?? []).forEach(resolve => resolve(text));
    waiting.delete(code);
  });
  importerApi<Record<string, string>>(`/tariff/describe?${new URLSearchParams({ codes: codes.join(",") })}`)
    .then(settle)
    // A failed lookup is not cached, so the next screen tries again.
    .catch(() => codes.forEach(code => { (waiting.get(code) ?? []).forEach(resolve => resolve(null)); waiting.delete(code); }));
}

export function lookupHsDescription(code: string): Promise<string | null> {
  if (cache.has(code)) return Promise.resolve(cache.get(code) ?? null);
  return new Promise(resolve => {
    const list = waiting.get(code);
    if (list) { list.push(resolve); return; }
    waiting.set(code, [resolve]);
    queued.push(code);
    timer ??= setTimeout(flush, 30);
  });
}

const usable = (code: string | null | undefined) => (code ?? "").replace(/\D/g, "").length >= 4;

/** Tariff book text that says nothing on its own ("Other", "Other — other"); the code's real description is looked up instead. */
const generic = (text: string) => /^(others?)(\s*[—–-]\s*others?)?$/i.test(text.replace(/^[-–—\s]+/, "").replace(/[:;.\s]+$/, ""));

/** The description for an HS / tariff code: the one given, else looked up. */
export function useHsDescription(code: string | null | undefined, description?: string | null) {
  const trimmed = description?.trim() || "";
  const given = trimmed && !(generic(trimmed) && usable(code)) ? trimmed : "";
  const key = (code ?? "").trim();
  const [found, setFound] = useState<{ key: string; text: string | null } | null>(() => cache.has(key) ? { key, text: cache.get(key) ?? null } : null);
  useEffect(() => {
    if (given || !usable(key)) return;
    let current = true;
    void lookupHsDescription(key).then(text => { if (current) setFound({ key, text }); });
    return () => { current = false; };
  }, [key, given]);
  if (given) return { text: given, loading: false };
  if (!usable(key)) return { text: "", loading: false };
  const resolved = found?.key === key ? found : null;
  return { text: resolved?.text ?? "", loading: !resolved };
}

type Props = {
  code: string | null | undefined;
  description?: string | null;
  /** Text shown in place of the code when there is none. */
  empty?: string;
  className?: string;
  /** Show the whole description instead of clamping it to two lines. */
  full?: boolean;
  title?: string;
};

/** Item description first, HS / tariff code beside it. */
export function HsItem({ code, description, empty = "Not classified", className = "", full = false, title }: Props) {
  const { text, loading } = useHsDescription(code, description);
  if (!code?.trim()) return <span className={`hs-item is-empty ${className}`}>{description?.trim() || empty}</span>;
  return <span className={`hs-item${full ? " is-full" : ""} ${className}`} title={title ?? (text ? `${text} · ${code}` : code)}>
    <span className="hs-item-desc">{text || (loading ? <span className="hs-item-loading">Loading description…</span> : "Description not in the tariff book")}</span>
    <code className="hs-item-code">{code}</code>
  </span>;
}
