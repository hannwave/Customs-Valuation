"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { FiAlertTriangle, FiCheckCircle, FiChevronRight, FiClock, FiInfo, FiLoader, FiRefreshCw, FiSlash, FiX, FiXOctagon } from "react-icons/fi";
import { toast } from "@/lib/toast";
import { badgeState, flaggedScans, isScanRunning, loadScans, rescanDocument, scanState, type DocumentScan, type DocumentScans, type ScanBadge, type ScanResult } from "@/lib/document-scan";

const stateIcon: Record<string, ReactElement> = {
  healthy: <FiCheckCircle />, suspicious: <FiAlertTriangle />, unrelated: <FiXOctagon />, failed: <FiSlash />,
  scanning: <FiLoader className="ds-spin" />, pending: <FiClock />,
};
const resultIcon: Record<ScanResult, ReactElement> = { pass: <FiCheckCircle />, warn: <FiAlertTriangle />, fail: <FiXOctagon />, info: <FiInfo /> };
const fieldLabel = (field: string) => field.replace(/^\w/, c => c.toUpperCase()).replace(/\bhs\b/i, "HS").replace(/\btin\b/i, "TIN");
const duration = (ms?: number | null) => !ms ? "" : ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;

/** Small verdict pill for one document; with onClick it opens the scan report. */
export function ScanPill({ scan, onClick }: { scan: DocumentScan | undefined; onClick?: () => void }) {
  const state = scanState(scan);
  const content = <>{stateIcon[state.key]}<span>{state.label}</span>{onClick && <FiChevronRight className="ds-caret" aria-hidden="true" />}</>;
  return onClick
    ? <button type="button" className={`ds-pill is-${state.tone}`} onClick={onClick} aria-haspopup="dialog" title="Open the scan report">{content}</button>
    : <span className={`ds-pill is-${state.tone}`} title={state.hint}>{content}</span>;
}

/** Badge for a queue row: the worst verdict across the case's documents. */
export function ScanQueueBadge({ badge }: { badge: ScanBadge }) {
  const state = badgeState(badge);
  if (!state) return null;
  return <span className={`ds-pill is-${state.tone} is-compact`} title={state.hint}>{stateIcon[state.key]}<span>{state.label}</span></span>;
}

const resultOrder: Record<ScanResult, number> = { fail: 0, warn: 1, info: 2, pass: 3 };

/**
 * The full scan report for one document in a panel over the page, so the narrow document list only carries the verdict pill.
 * Closes on Escape, the close button or a click outside.
 */
export function ScanReport({ scan, title, fileName, onClose, onRescan, busy }: { scan: DocumentScan | undefined; title: string; fileName?: string; onClose: () => void; onRescan?: () => void; busy?: boolean }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [onClose]);

  const state = scanState(scan);
  const done = scan?.status === "COMPLETED";
  const findings = [...(scan?.findings ?? [])].sort((a, b) => resultOrder[a.result] - resultOrder[b.result]);
  const attention = findings.filter(f => f.result === "fail" || f.result === "warn");
  const fine = findings.filter(f => f.result === "pass" || f.result === "info");
  const row = (finding: (typeof findings)[number], index: number) =>
    <li key={index} className={`is-${finding.result}`}><span className="ds-r-icon">{resultIcon[finding.result]}</span><div><strong>{finding.check}</strong><span>{finding.detail}</span></div></li>;

  return createPortal(<div className="ds-report-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="ds-report" role="dialog" aria-modal="true" aria-labelledby="ds-report-title">
      <header className="ds-report-head">
        <div><span className="ds-report-eyebrow">Document scan</span><h2 id="ds-report-title">{title}</h2>{fileName && <small>{fileName}</small>}</div>
        <button type="button" ref={closeButton} className="ds-report-close" onClick={onClose} aria-label="Close scan report"><FiX aria-hidden="true" /></button>
      </header>

      <div className="ds-report-body">
        <section className={`ds-verdict is-${state.tone}`}>
          <span className="ds-verdict-icon" aria-hidden="true">{stateIcon[state.key]}</span>
          <div>
            <strong>{state.label}</strong>
            <p>{done ? scan.summary : state.hint}{scan?.status === "FAILED" && scan.error ? ` (${scan.error})` : ""}</p>
          </div>
          {done && (scan.detectedType || typeof scan.score === "number") && <dl className="ds-verdict-facts">
            {scan.detectedType && <div><dt>Reads as</dt><dd>{scan.detectedType}</dd></div>}
            {typeof scan.score === "number" && <div><dt>Match</dt><dd><span className="ds-score" title="How well the document matches what was expected"><i style={{ width: `${scan.score}%` }} />{scan.score}%</span></dd></div>}
          </dl>}
        </section>

        {attention.length > 0 && <section className="ds-report-section"><h3>Needs attention <small>{attention.length}</small></h3><ul className="ds-checks">{attention.map(row)}</ul></section>}
        {fine.length > 0 && <section className="ds-report-section"><h3>{attention.length ? "Other checks" : "Checks"} <small>{fine.length}</small></h3><ul className="ds-checks is-quiet">{fine.map(row)}</ul></section>}

        {done && !!scan.extracted?.length && <section className="ds-report-section"><h3>What the scanner read</h3>
          <dl className="ds-read">{scan.extracted.map(item => <div key={item.field}><dt>{fieldLabel(item.field)}</dt><dd>{item.value}</dd></div>)}</dl></section>}
      </div>

      <footer className="ds-report-foot">
        <small>{done && scan.completedAt ? <>Scanned {new Date(scan.completedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}{scan.processingMs ? ` · ${duration(scan.processingMs)}` : ""}<br /></> : null}A triage aid — always confirm against the document itself.</small>
        {onRescan && (scan?.status === "COMPLETED" || scan?.status === "FAILED") && <button type="button" onClick={onRescan} disabled={busy}><FiRefreshCw aria-hidden="true" className={busy ? "ds-spin" : ""} />{busy ? "Queuing…" : "Scan again"}</button>}
      </footer>
    </aside>
  </div>, document.body);
}

/** A short notice when the scanner flagged something: a one-line title and a chip per flagged file (which opens its report when onOpen is given). */
export function ScanAlert({ scans, labels, onOpen }: { scans: DocumentScans | undefined; labels: Record<string, string>; onOpen?: (kind: string) => void }) {
  const flagged = flaggedScans(scans);
  if (flagged.length === 0) {
    const running = Object.values(scans ?? {}).filter(s => s.status === "PENDING" || s.status === "SCANNING").length;
    if (isScanRunning(scans)) return <div className="ds-alert is-neutral"><FiLoader className="ds-spin" aria-hidden="true" /><span><b>Scanning {running === 1 ? "1 document" : `${running} documents`}…</b></span></div>;
    const scanned = Object.values(scans ?? {}).filter(s => s.status === "COMPLETED");
    return scanned.length > 0 && scanned.length === Object.keys(scans ?? {}).length ? <div className="ds-alert is-success"><FiCheckCircle aria-hidden="true" /><span><b>Documents look right</b></span></div> : null;
  }
  const unrelated = flagged.some(scan => scan.flag === "UNRELATED");
  return <div className={`ds-alert is-${unrelated ? "danger" : "warning"}`} role="status">{unrelated ? <FiXOctagon aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />}
    <span><b>{flagged.length === 1 ? "1 document needs a closer look" : `${flagged.length} documents need a closer look`}</b>
      <span className="ds-alert-files">{flagged.map(scan => {
        const label = labels[scan.kind] ?? scan.kind; const tone = scan.flag === "UNRELATED" ? " is-danger" : "";
        return onOpen
          ? <button key={scan.kind} type="button" className={`ds-alert-file${tone}`} onClick={() => onOpen(scan.kind)} title={`${scanState(scan).label} — open the scan report`}><i aria-hidden="true" />{label}</button>
          : <span key={scan.kind} className={`ds-alert-file${tone}`} title={scanState(scan).label}><i aria-hidden="true" />{label}</span>;
      })}</span></span></div>;
}

/** Keeps a case's scans fresh: polls while any scan is still running and offers a rescan. */
export function useDocumentScans(path: string | null, initial: DocumentScans | undefined) {
  const [scans, setScans] = useState<DocumentScans | undefined>(initial);
  const [busy, setBusy] = useState("");
  useEffect(() => { setScans(initial); }, [initial]);
  useEffect(() => {
    if (!path || !isScanRunning(scans)) return;
    const timer = window.setTimeout(() => { loadScans(path).then(next => {
      const finished = Object.values(next).filter(scan => scan.status === "COMPLETED" && scans?.[scan.kind]?.status !== "COMPLETED" && (scan.flag === "SUSPICIOUS" || scan.flag === "UNRELATED"));
      if (finished.length) toast.warning(`The document scanner flagged ${finished.length === 1 ? "a document" : `${finished.length} documents`} on this case.`, { key: `scan-${path}` });
      setScans(next);
    }).catch(() => undefined); }, 15_000);
    return () => window.clearTimeout(timer);
  }, [path, scans]);
  const rescan = useCallback(async (kind: string, rescanPath: string) => {
    setBusy(kind);
    try { setScans(await rescanDocument(rescanPath)); toast.info("The document is queued for another scan."); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "The document could not be queued for scanning."); }
    finally { setBusy(""); }
  }, []);
  return { scans, busy, rescan };
}
