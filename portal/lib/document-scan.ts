import { importerApi } from "@/lib/importer";

export type ScanResult = "pass" | "warn" | "fail" | "info";
export type ScanFlag = "HEALTHY" | "SUSPICIOUS" | "UNRELATED" | "";
export type ScanStatus = "PENDING" | "SCANNING" | "COMPLETED" | "FAILED";

/** OCR check of one uploaded document's current file. */
export type DocumentScan = {
  kind: string; status: ScanStatus; flag: ScanFlag; score?: number; detectedType?: string; summary?: string;
  findings?: { check: string; result: ScanResult; detail: string }[];
  extracted?: { field: string; value: string }[];
  engine?: string; confidence?: number | null; attempts?: number; error?: string;
  queuedAt?: string | null; startedAt?: string | null; completedAt?: string | null; nextAttemptAt?: string | null; processingMs?: number | null;
};
export type DocumentScans = Record<string, DocumentScan>;

/** Per-case counts for list badges; overall is the worst finished verdict, or PENDING/FAILED. */
export type ScanBadge = { overall: ScanFlag | "PENDING" | "FAILED"; healthy: number; suspicious: number; unrelated: number; pending: number; failed: number } | null;

export type ScanTone = "success" | "warning" | "danger" | "neutral";
export type ScanState = { key: string; label: string; tone: ScanTone; hint: string };

/** How one scan is presented: the verdict once it is done, otherwise where it is in the queue. */
export function scanState(scan: DocumentScan | undefined): ScanState {
  if (!scan || scan.status === "PENDING") return { key: "pending", label: scan?.attempts ? "Retrying scan" : "Queued for scan", tone: "neutral", hint: "The document scanner will read this file shortly." };
  if (scan.status === "SCANNING") return { key: "scanning", label: "Scanning…", tone: "neutral", hint: "The scanner is reading this file. This can take a few minutes." };
  if (scan.status === "FAILED") return { key: "failed", label: "Not scanned", tone: "neutral", hint: "The scanner could not read this file. Check it by hand." };
  if (scan.flag === "UNRELATED") return { key: "unrelated", label: "Unrelated file", tone: "danger", hint: "This file does not look like the document that was asked for." };
  if (scan.flag === "SUSPICIOUS") return { key: "suspicious", label: "Check closely", tone: "warning", hint: "Something on this document disagrees with the submission or could not be read." };
  return { key: "healthy", label: "Looks right", tone: "success", hint: "The document looks like what was asked for and agrees with the submission." };
}

export const isScanRunning = (scans: DocumentScans | undefined) => Object.values(scans ?? {}).some(scan => scan.status === "PENDING" || scan.status === "SCANNING");
export const flaggedScans = (scans: DocumentScans | undefined) => Object.values(scans ?? {}).filter(scan => scan.status === "COMPLETED" && (scan.flag === "SUSPICIOUS" || scan.flag === "UNRELATED"));

/** One short label for a list row. */
export function badgeState(badge: ScanBadge): ScanState | null {
  if (!badge || !badge.overall) return null;
  if (badge.overall === "UNRELATED") return { key: "unrelated", label: badge.unrelated === 1 ? "Unrelated file" : `${badge.unrelated} unrelated files`, tone: "danger", hint: "The document scanner found a file that is not the document asked for." };
  if (badge.overall === "SUSPICIOUS") return { key: "suspicious", label: badge.suspicious === 1 ? "1 document to check" : `${badge.suspicious} documents to check`, tone: "warning", hint: "The document scanner found something to check by hand." };
  if (badge.overall === "PENDING") return { key: "pending", label: "Scanning documents", tone: "neutral", hint: `${badge.pending} document${badge.pending === 1 ? "" : "s"} waiting for the scanner.` };
  if (badge.overall === "FAILED") return { key: "failed", label: "Not scanned", tone: "neutral", hint: "The scanner could not read the documents. Check them by hand." };
  return { key: "healthy", label: "Documents look right", tone: "success", hint: "Every document looks like what was asked for." };
}

export const loadScans = (path: string) => importerApi<DocumentScans>(path);
export const rescanDocument = (path: string) => importerApi<DocumentScans>(path, { method: "POST" });
