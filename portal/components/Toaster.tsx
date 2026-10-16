"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FiAlertCircle, FiAlertTriangle, FiBell, FiCheckCircle, FiInfo, FiVolume2, FiVolumeX, FiX } from "react-icons/fi";
import { setToastSound, subscribeToasts, toast, toastSoundEnabled, type ToastItem, type ToastKind, type ToastOptions } from "@/lib/toast";

const icons = { error: FiAlertCircle, warning: FiAlertTriangle, success: FiCheckCircle, info: FiInfo, notification: FiBell };
const titles: Record<ToastKind, string> = { error: "Something went wrong", warning: "Check this", success: "Done", info: "For your information", notification: "New notification" };

function ToastCard({ item, sound, onToggleSound }: { item: ToastItem; sound: boolean; onToggleSound: () => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(item.duration);
  const startedAt = useRef(Date.now());

  // The timer pauses while the pointer or keyboard focus is on the toast, so it can be read.
  useEffect(() => {
    if (!item.duration || paused) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => toast.dismiss(item.id), remaining.current);
    return () => { window.clearTimeout(timer); remaining.current -= Date.now() - startedAt.current; };
  }, [item.id, item.duration, paused]);

  const Icon = icons[item.kind];
  const close = () => toast.dismiss(item.id);
  const body = <><p className="feedback-toast-title">{item.title ?? titles[item.kind]}</p><p className="feedback-toast-message">{item.message}</p></>;
  return <div className={`feedback-toast feedback-toast--${item.kind}`} role={item.kind === "error" || item.kind === "warning" ? "alert" : "status"}
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <span className="feedback-toast-icon" aria-hidden="true"><Icon /></span>
    <div className="feedback-toast-copy">
      {item.href ? <Link className="feedback-toast-link" href={item.href} onClick={() => { item.onOpen?.(); close(); }}>{body}</Link> : body}
      {item.action && <button className="feedback-toast-retry" type="button" onClick={() => { item.action?.onClick(); close(); }}>{item.action.label}</button>}
    </div>
    <div className="feedback-toast-tools">
      <button className="feedback-toast-dismiss" type="button" onClick={close} aria-label="Dismiss"><FiX /></button>
      <button className="feedback-toast-dismiss is-sound" type="button" onClick={onToggleSound} aria-label={sound ? "Mute alert sounds" : "Turn alert sounds on"} title={sound ? "Mute alert sounds" : "Turn alert sounds on"}>{sound ? <FiVolume2 /> : <FiVolumeX />}</button>
    </div>
    {item.duration > 0 && <span className={`feedback-toast-timer${paused ? " is-paused" : ""}`} style={{ animationDuration: `${item.duration}ms` }} aria-hidden="true" />}
  </div>;
}

/** The corner where every toast in the portal appears. Mounted once in Providers. */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [sound, setSound] = useState(true);
  useEffect(() => { setSound(toastSoundEnabled()); return subscribeToasts(current => setItems([...current])); }, []);
  useEffect(() => {
    if (!items.length) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && items.length) toast.dismiss(items[items.length - 1].id); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items]);
  const toggleSound = () => { setToastSound(!sound); setSound(!sound); };
  return <div className="feedback-viewport" aria-live="polite" aria-atomic="false">
    {items.map(item => <ToastCard key={item.id} item={item} sound={sound} onToggleSound={toggleSound} />)}
  </div>;
}

/**
 * Shows `message` as a toast whenever it changes to a new non-empty value, and calls `onClear`
 * when the toast closes so the caller can reset its state. Clearing the message closes the toast.
 */
export function useToastMessage(kind: ToastKind, message: string | null | undefined, onClear?: () => void, options: Omit<ToastOptions, "onDismiss"> = {}) {
  const clear = useRef(onClear); clear.current = onClear;
  const extra = useRef(options); extra.current = options;
  const shown = useRef(0);
  useEffect(() => {
    if (shown.current) { toast.dismiss(shown.current, false); shown.current = 0; }
    if (message) shown.current = toast.show(kind, message, { ...extra.current, onDismiss: () => { shown.current = 0; clear.current?.(); } });
  }, [kind, message]);
}

/** Renders nothing; puts `message` in a toast. Drop-in replacement for an inline alert paragraph. */
export function ToastMessage({ kind, message, onClear, ...options }: { kind: ToastKind; message: string | null | undefined; onClear?: () => void } & Omit<ToastOptions, "onDismiss">) {
  useToastMessage(kind, message, onClear, options);
  return null;
}
