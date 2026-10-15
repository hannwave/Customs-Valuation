"use client";

/**
 * One toast system for the whole portal: every alert, warning, confirmation and notification
 * goes through here so it looks the same, stacks in the same corner and plays the same sounds.
 */

export type ToastKind = "error" | "warning" | "success" | "info" | "notification";

export type ToastOptions = {
  title?: string;
  /** A toast with the same key replaces the previous one instead of stacking. */
  key?: string;
  /** Milliseconds before it closes; 0 keeps it open until dismissed. */
  duration?: number;
  action?: { label: string; onClick: () => void };
  href?: string;
  /** Called when the toast closes, by the person or by its timer. */
  onDismiss?: () => void;
  silent?: boolean;
};

export type ToastItem = ToastOptions & { id: number; kind: ToastKind; message: string; duration: number; createdAt: number };

const defaultDuration: Record<ToastKind, number> = { error: 9000, warning: 7000, success: 5000, info: 6000, notification: 9000 };
const MAX_VISIBLE = 5;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<(items: ToastItem[]) => void>();
const emit = () => { for (const listener of listeners) listener(items); };

export function subscribeToasts(listener: (items: ToastItem[]) => void) {
  listeners.add(listener); listener(items);
  return () => { listeners.delete(listener); };
}

function show(kind: ToastKind, message: string, options: ToastOptions = {}): number {
  const text = message.trim();
  if (!text) return 0;
  // The same message already on screen is refreshed instead of stacked twice.
  const same = items.find(item => (options.key ? item.key === options.key : !item.key && item.kind === kind && item.message === text));
  const toast: ToastItem = { ...options, id: nextId++, kind, message: text, duration: options.duration ?? defaultDuration[kind], createdAt: Date.now() };
  items = same ? items.map(item => (item === same ? toast : item)) : [...items, toast].slice(-MAX_VISIBLE);
  emit();
  if (!options.silent) playToastSound(kind);
  return toast.id;
}

/** Closes a toast by id or key. `notify: false` skips its onDismiss (the caller already cleared its state). */
function dismiss(idOrKey: number | string, notify = true) {
  const target = items.find(item => item.id === idOrKey || (typeof idOrKey === "string" && item.key === idOrKey));
  if (!target) return;
  items = items.filter(item => item !== target);
  emit();
  if (notify) target.onDismiss?.();
}

export const toast = {
  show,
  error: (message: string, options?: ToastOptions) => show("error", message, options),
  warning: (message: string, options?: ToastOptions) => show("warning", message, options),
  success: (message: string, options?: ToastOptions) => show("success", message, options),
  info: (message: string, options?: ToastOptions) => show("info", message, options),
  notification: (message: string, options?: ToastOptions) => show("notification", message, options),
  dismiss,
};

/* ---------- Sound ---------- */

const SOUND_KEY = "toast-sound";
let audio: AudioContext | null = null;

export function toastSoundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; }
}

export function setToastSound(enabled: boolean) {
  try { localStorage.setItem(SOUND_KEY, enabled ? "on" : "off"); } catch { /* the preference only lasts this visit */ }
  if (enabled) playToastSound("success");
}

function context() {
  if (typeof window === "undefined") return null;
  const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) return null;
  audio ??= new Audio();
  if (audio.state === "suspended") void audio.resume().catch(() => {});
  return audio;
}

// Browsers only allow sound after the person has interacted with the page, so unlock on the first click or key.
if (typeof window !== "undefined") {
  const unlock = () => { context(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  window.addEventListener("pointerdown", unlock); window.addEventListener("keydown", unlock);
}

/** [frequency Hz, start s, length s] notes for each kind; short and soft, like system sounds. */
const tunes: Record<ToastKind, { wave: OscillatorType; volume: number; notes: [number, number, number][] }> = {
  success: { wave: "sine", volume: 0.16, notes: [[784, 0, 0.12], [1175, 0.09, 0.22]] },
  info: { wave: "sine", volume: 0.12, notes: [[880, 0, 0.18]] },
  notification: { wave: "sine", volume: 0.15, notes: [[988, 0, 0.14], [1319, 0.11, 0.14], [1568, 0.22, 0.28]] },
  warning: { wave: "triangle", volume: 0.2, notes: [[659, 0, 0.13], [659, 0.17, 0.16]] },
  error: { wave: "triangle", volume: 0.22, notes: [[466, 0, 0.16], [311, 0.15, 0.3]] },
};

export function playToastSound(kind: ToastKind) {
  if (!toastSoundEnabled()) return;
  try {
    const ctx = context();
    if (!ctx || ctx.state !== "running") return;
    const tune = tunes[kind], now = ctx.currentTime;
    for (const [frequency, start, length] of tune.notes) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = tune.wave; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(tune.volume, now + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start); osc.stop(now + start + length + 0.02);
    }
  } catch { /* sound is a nicety; never let it break the page */ }
}
