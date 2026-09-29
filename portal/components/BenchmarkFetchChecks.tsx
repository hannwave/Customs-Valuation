"use client";

import { useEffect, useRef, useState } from "react";
import { getSessionAccessToken } from "@/lib/auth/session";
import type { BenchmarkFetchCheck } from "@/lib/types/customs";
import styles from "./BenchmarkFetchChecks.module.css";

type Category = { label: string; hsCode: string; unit?: "u" | "kg" };
type Row = Category & { result?: BenchmarkFetchCheck; error?: string; running?: boolean };
const samples: Category[] = [
  { label: "Smartphones", hsCode: "851713", unit: "u" },
  { label: "Cigars", hsCode: "240210", unit: "kg" },
  { label: "Milled rice", hsCode: "100630", unit: "kg" },
  { label: "Tobacco cigarettes", hsCode: "240220", unit: "kg" },
  { label: "Portable computers", hsCode: "847130", unit: "u" },
];
const tradeLabels = { verified: "Fetch verified", no_data: "No usable data", unit_mismatch: "Different unit — reference only", invalid_result: "Verification failed", api_error: "API error" };

export function BenchmarkFetchChecks({ hsCode, preferredUnit }: { hsCode: string; preferredUnit: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function run(categories: Category[]) {
    if (active.current) return;
    const token = getSessionAccessToken();
    if (!token) { setNotice("Sign in again before checking price fetches."); return; }
    const abort = new AbortController();
    active.current = abort;
    setBusy(true);
    setNotice("");
    setRows(categories);
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5080";
    try {
      for (let index = 0; index < categories.length; index++) {
        if (abort.signal.aborted) break;
        const category = categories[index];
        setRows(previous => previous.map((row, i) => i === index ? { ...row, running: true } : row));
        try {
          const params = new URLSearchParams({ hsCode: category.hsCode });
          if (category.unit) params.set("unit", category.unit);
          const response = await fetch(`${base}/api/customs-trade-benchmark/check?${params}`, {
            headers: { Authorization: `Bearer ${token}` }, signal: abort.signal,
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(response.status === 401 || response.status === 403
            ? "Sign in with an officer account to check benchmarks."
            : body.detail ?? body.message ?? `Check API returned HTTP ${response.status}.`);
          if (!body.trade || !(body.trade.status in tradeLabels) || !body.catalogue)
            throw new Error("The check API returned an unreadable report.");
          setRows(previous => previous.map((row, i) => i === index ? { ...row, running: false, result: body } : row));
          // Do not continue a sample run after provider throttling.
          if (body.trade.httpStatus === 503) { setNotice("Stopped because the provider is rate-limited. Retry later; completed results remain below."); break; }
        } catch (error) {
          if (abort.signal.aborted) break;
          setRows(previous => previous.map((row, i) => i === index ? { ...row, running: false, error: error instanceof Error ? error.message : "Check request failed." } : row));
          // An unreachable/unauthorized check API affects every remaining row.
          setNotice("Stopped after a check request failed. Fix the reported issue and retry.");
          break;
        }
      }
    } finally {
      if (abort.signal.aborted) setNotice("Check stopped. Completed results are retained; unchecked rows are not failures.");
      setRows(previous => previous.map(row => ({ ...row, running: false })));
      active.current = null;
      setBusy(false);
    }
  }

  const completed = rows.filter(row => row.result || row.error).length;
  const verified = rows.filter(row => row.result?.trade.status === "verified").length;
  const missing = rows.filter(row => row.result?.catalogue.status === "missing").length;
  const selected: Category = { label: "Selected category", hsCode, ...(preferredUnit === "u" || preferredUnit === "kg" ? { unit: preferredUnit } : {}) };
  return <details className={styles.panel}>
    <summary>Check price fetches</summary>
    <div className={styles.body}>
      <p>Check the selected HS category or five sample categories without submitting a valuation. Tariff availability and trade fetching are tested separately.</p>
      <div className={styles.actions}>
        <button type="button" disabled={busy || hsCode.length !== 6} onClick={() => void run([selected])}>Check selected HS{hsCode.length === 6 ? ` ${hsCode}` : ""}</button>
        <button type="button" disabled={busy} onClick={() => void run(samples)}>Run 5 sample checks</button>
        {busy && <button type="button" onClick={() => active.current?.abort()}>Stop checks</button>}
      </div>
      <p className={styles.note}>Checks run one at a time and can take about a minute per category. Normal API caching applies (up to 12 hours). Samples measure only these categories—not overall coverage or exact product-price accuracy. International market prices are not tested here.</p>
      <p role="status" aria-live="polite">{busy ? "Checking… " : ""}{rows.length > 0 ? `${completed}/${rows.length} completed · ${verified} fetches verified · ${missing} missing tariff categories` : "No checks run yet."}</p>
      {notice && <p role="status">{notice}</p>}
      {rows.length > 0 && <div className={styles.scroll}><table>
        <caption>Customs trade benchmark fetch report</caption>
        <thead><tr><th scope="col">Category / HS</th><th scope="col">Active tariff</th><th scope="col">Trade fetch</th><th scope="col">Price / source</th></tr></thead>
        <tbody>{rows.map(row => {
          const benchmark = row.result?.benchmark;
          return <tr key={`${row.hsCode}:${row.unit ?? "any"}`}>
            <th scope="row">{row.label}<small>HS {row.hsCode} · requested {row.unit === "u" ? "item" : row.unit ?? "any reported unit"}</small></th>
            <td>{row.result ? <><span className={row.result.catalogue.status === "present" ? styles.good : styles.warning}>{row.result.catalogue.status === "present" ? "Present" : row.result.catalogue.status === "missing" ? "Missing tariff category" : "Catalogue error"}</span><small>{row.result.catalogue.revisionName}</small><small>{row.result.catalogue.message}</small></> : "Not checked"}</td>
            <td>{row.running ? "Checking…" : row.error ? <span className={styles.warning}>{row.error}</span> : row.result ? <><span className={row.result.trade.status === "verified" ? styles.good : styles.warning}>{tradeLabels[row.result.trade.status]}{row.result.trade.httpStatus ? ` (HTTP ${row.result.trade.httpStatus})` : ""}</span><small>{row.result.trade.message}</small><details><summary>Verification details</summary><ul>{row.result.trade.checks.map(check => <li key={check}>{check}</li>)}</ul><small>Checked {new Date(row.result.checkedAt).toLocaleString()}</small></details></> : "Not checked"}</td>
            <td>{benchmark?.unitValue != null ? <><strong>{new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(benchmark.unitValue)} / {benchmark.unit === "u" ? "item" : benchmark.unit}</strong><small>{benchmark.period} · {benchmark.valuationBasis} · {benchmark.sourceLabel}</small><small>Trade value {benchmark.tradeValue?.toLocaleString()} USD ÷ quantity {benchmark.quantity?.toLocaleString()} {benchmark.unit}</small>{benchmark.quantityEstimated && <small>Some reported quantities are estimated.</small>}<small>{benchmark.message}</small>{benchmark.sourceUrl && <a href={benchmark.sourceUrl} target="_blank" rel="noopener noreferrer">UN Comtrade source</a>}</> : "—"}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    </div>
  </details>;
}
