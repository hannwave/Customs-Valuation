"use client";

import { useEffect, useState } from "react";
import { FiCheck, FiX } from "react-icons/fi";
import { TariffBrowser } from "@/components/tariff/TariffBrowser";
import type { TariffOption } from "@/lib/importer";

/**
 * Tariff-line chooser for officers. Opens on likely matches for the importer's description and lets the officer
 * browse the tariff book by Section, Chapter and Heading, previewing each line's ERCA tax rates before choosing.
 */
export function HsPicker({ title, productName, description, currentLineId, askNote, busy, onSelect, onClose }: {
  title: string; productName: string; description?: string; currentLineId?: string | null; askNote?: boolean; busy?: boolean;
  onSelect: (option: TariffOption, note: string) => void; onClose: () => void;
}) {
  const [note, setNote] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div className="oc-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="oc-hs-picker" role="dialog" aria-modal="true" aria-labelledby="oc-hs-title">
      <header className="oc-hs-head">
        <div><span className="oc-eyebrow">HS classification</span><h2 id="oc-hs-title">{title}</h2>
          <p>Importer described: <strong>{productName}</strong>{description ? ` — ${description.length > 160 ? `${description.slice(0, 160)}…` : description}` : ""}</p></div>
        <button type="button" className="oc-icon-button" onClick={onClose} aria-label="Close"><FiX aria-hidden="true" /></button>
      </header>
      <TariffBrowser initialQuery={productName} currentLineId={currentLineId} autoFocus inlineAction={false} action={selected => {
        const isCurrent = selected.tariffLineId === currentLineId;
        return <>
          {askNote && !isCurrent && <label className="oc-field">Reason for the change <small>(shared with the importer)</small><textarea rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="e.g. Specifications show a feature phone, not a smartphone." /></label>}
          <button type="button" className="oc-btn is-primary oc-hs-choose" disabled={busy || isCurrent} onClick={() => onSelect(selected, note.trim())}><FiCheck aria-hidden="true" />{isCurrent ? "Already the selected line" : busy ? "Saving…" : "Use this tariff line"}</button>
        </>;
      }} />
    </section>
  </div>;
}
