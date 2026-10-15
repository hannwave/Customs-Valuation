"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FiAlertTriangle, FiDownload, FiFileText, FiPrinter, FiX } from "react-icons/fi";
import { FinalInvoiceDocument } from "@/components/invoice/FinalInvoice";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatMoney } from "@/lib/importer";
import { downloadInvoicePdf, loadInvoice, type FinalInvoice, type InvoiceKind } from "@/lib/invoice";
import { toast } from "@/lib/toast";

function Viewer() {
  const params = useSearchParams();
  const kind = params.get("kind") as InvoiceKind | null;
  const id = params.get("id") ?? "";
  const autoPrint = params.get("print") === "1";
  const [invoice, setInvoice] = useState<FinalInvoice | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if ((kind !== "declaration" && kind !== "valuation") || !/^[0-9a-f-]{36}$/i.test(id)) { setError("This invoice link is not valid."); return; }
    loadInvoice(kind, id).then(setInvoice).catch(reason => setError(reason instanceof Error ? reason.message : "The invoice could not be opened."));
  }, [kind, id]);
  useEffect(() => {
    if (!invoice) return;
    document.title = `${invoice.reference} · Assessment invoice`;
    if (autoPrint) { const timer = window.setTimeout(() => window.print(), 400); return () => window.clearTimeout(timer); }
  }, [invoice, autoPrint]);

  const close = useCallback(() => { if (window.opener || window.history.length <= 1) window.close(); else window.history.back(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  async function download() {
    if (!invoice) return;
    setBusy(true);
    try { await downloadInvoicePdf(invoice); toast.success("The invoice PDF was saved to your downloads.", { title: "Invoice downloaded" }); }
    catch { toast.error("The PDF could not be created. Use Print and choose “Save as PDF” instead.", { title: "Download failed" }); }
    finally { setBusy(false); }
  }

  return <main className="dv fi-viewer">
    <header className="dv-bar">
      <div className="dv-file"><span className="dv-file-icon"><FiFileText aria-hidden="true" /></span>
        <div><strong>{invoice ? `Assessment invoice · ${invoice.reference}` : "Assessment invoice"}</strong><small>{invoice ? `Amount payable ${formatMoney(invoice.payable, invoice.currency)} · issued ${new Date(invoice.issuedAt).toLocaleDateString()}` : "Final invoice"}</small></div></div>
      <div className="dv-actions">
        <button type="button" onClick={() => window.print()} disabled={!invoice} title="Print"><FiPrinter aria-hidden="true" /><span>Print</span></button>
        <button type="button" onClick={() => void download()} disabled={!invoice || busy} title="Download PDF"><FiDownload aria-hidden="true" /><span>{busy ? "Preparing…" : "Download PDF"}</span></button>
        <ThemeToggle />
        <button type="button" className="dv-close" onClick={close} aria-label="Close" title="Close (Esc)"><FiX aria-hidden="true" /></button>
      </div>
    </header>
    <section className="dv-stage fi-stage">
      {error ? <div className="dv-message"><FiAlertTriangle aria-hidden="true" /><h1>Invoice unavailable</h1><p>{error}</p></div>
        : !invoice ? <div className="dv-message" role="status"><span className="dv-spinner" aria-hidden="true" /><p>Opening the invoice…</p></div>
        : <FinalInvoiceDocument invoice={invoice} />}
    </section>
  </main>;
}

export default function InvoiceViewerPage() {
  return <Suspense fallback={<main className="dv"><div className="dv-message" role="status"><span className="dv-spinner" aria-hidden="true" /></div></main>}><Viewer /></Suspense>;
}
