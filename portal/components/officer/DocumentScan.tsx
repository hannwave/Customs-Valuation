"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { FiAlertTriangle, FiCheckCircle, FiChevronDown, FiClock, FiInfo, FiLoader, FiRefreshCw, FiSlash, FiXOctagon } from "react-icons/fi";
import { toast } from "@/lib/toast";
import { badgeState, flaggedScans, isScanRunning, loadScans, rescanDocument, scanState, type DocumentScan, type DocumentScans, type ScanBadge, type ScanResult } from "@/lib/document-scan";

const stateIcon: Record<string, ReactElement> = {
  healthy: <FiCheckCircle />, suspicious: <FiAlertTriangle />, unrelated: <FiXOctagon />, failed: <FiSlash />,
  scanning: <FiLoader className="ds-spin" />, pending: <FiClock />,
};
const resultIcon: Record<ScanResult, ReactElement> = { pass: <FiCheckCircle />, warn: <FiAlertTriangle />, fail: <FiXOctagon />, info: <FiInfo /> };
const fieldLabel = (field: string) => field.replace(/^\w/, c => c.toUpperCase()).replace(/\bhs\b/i, "HS").replace(/\btin\b/i, "TIN");
const duration = (ms?: number | null) => !ms ? "" : ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;

/** Small verdict pill for one document. */
export function ScanPill({ scan, onClick, open }: { scan: DocumentScan | undefined; onClick?: () => void; open?: boolean }) {
  const state = scanState(scan);
  const content = <>{stateIcon[state.key]}<span>{state.label}</span>{onClick && <FiChevronDown className="ds-caret" aria-hidden="true" />}</>;
  return onClick
    ? <button type="button" className={`ds-pill is-${state.tone}${open ? " is-open" : ""}`} onClick={onClick} aria-expanded={open} title={state.hint}>{content}</button>
    : <span className={`ds-pill is-${state.tone}`} title={state.hint}>{content}</span>;
}

/** Badge for a queue row: the worst verdict across the case's documents. */
export function ScanQueueBadge({ badge }: { badge: ScanBadge }) {
  const state = badgeState(badge);
  if (!state) return null;
  return <span className={`ds-pill is-${state.tone} is-compact`} title={state.hint}>{stateIcon[state.key]}<span>{state.label}</span></span>;
}

/** What the scanner concluded and why, with the fields it read off the page. */
export function ScanDetail({ scan, onRescan, busy }: { scan: DocumentScan | undefined; onRescan?: () => void; busy?: boolean }) {
  const state = scanState(scan);
  const done = scan?.status === "COMPLETED";
  return <div className={`ds-detail is-${state.tone}`}>
    <p className="ds-summary">{done ? scan.summary : state.hint}{scan?.status === "FAILED" && scan.error ? ` (${scan.error})` : ""}</p>
    {done && <>
      <div className="ds-meta">
        {scan.detectedType && <span>Reads as <b>{scan.detectedType}</b></span>}
        {typeof scan.score === "number" && <span className="ds-score" title="How well the document matches what was expected"><i style={{ width: `${scan.score}%` }} />Match {scan.score}%</span>}
      </div>
      {!!scan.findings?.length && <ul className="ds-findings">{scan.findings.map((finding, index) =>
        <li key={index} className={`is-${finding.result}`}>{resultIcon[finding.result]}<div><strong>{finding.check}</strong><span>{finding.detail}</span></div></li>)}</ul>}
      {!!scan.extracted?.length && <details className="ds-extracted"><summary>What the scanner read</summary>
        <dl>{scan.extracted.map(item => <div key={item.field}><dt>{fieldLabel(item.field)}</dt><dd>{item.value}</dd></div>)}</dl></details>}
    </>}
    <footer>
      <small>{done && scan.completedAt ? <>Scanned {new Date(scan.completedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}{scan.processingMs ? ` · ${duration(scan.processingMs)}` : ""}</>
        : scan?.status === "PENDING" && scan.nextAttemptAt ? <>Next try {new Date(scan.nextAttemptAt).toLocaleTimeString(undefined, { timeStyle: "short" })}</>
        : scan?.status === "SCANNING" && scan.startedAt ? <>Started {new Date(scan.startedAt).toLocaleTimeString(undefined, { timeStyle: "short" })}</> : "A triage aid — always confirm against the document itself."}</small>
      {onRescan && (scan?.status === "COMPLETED" || scan?.status === "FAILED") && <button type="button" onClick={onRescan} disabled={busy}><FiRefreshCw aria-hidden="true" className={busy ? "ds-spin" : ""} />{busy ? "Queuing…" : "Scan again"}</button>}
    </footer>
  </div>;
}

/** One line above the document list when the scanner flagged something. */
export function ScanAlert({ scans, labels }: { scans: DocumentScans | undefined; labels: Record<string, string> }) {
  const flagged = flaggedScans(scans);
  if (flagged.length === 0) {
    if (isScanRunning(scans)) return <p className="ds-alert is-neutral"><FiLoader className="ds-spin" aria-hidden="true" />The document scanner is still reading {Object.values(scans ?? {}).filter(s => s.status === "PENDING" || s.status === "SCANNING").length === 1 ? "one file" : "these files"}.</p>;
    const scanned = Object.values(scans ?? {}).filter(s => s.status === "COMPLETED");
    return scanned.length > 0 && scanned.length === Object.keys(scans ?? {}).length ? <p className="ds-alert is-success"><FiCheckCircle aria-hidden="true" />The scanner found nothing unusual in these documents.</p> : null;
  }
  const unrelated = flagged.some(scan => scan.flag === "UNRELATED");
  return <p className={`ds-alert is-${unrelated ? "danger" : "warning"}`} role="status">{unrelated ? <FiXOctagon aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />}
    <span><b>Scanner flagged {flagged.length === 1 ? "1 document" : `${flagged.length} documents`}:</b> {flagged.map(scan => `${labels[scan.kind] ?? scan.kind} (${scanState(scan).label.toLowerCase()})`).join(", ")}. Open the {flagged.length === 1 ? "file" : "files"} before deciding.</span></p>;
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
