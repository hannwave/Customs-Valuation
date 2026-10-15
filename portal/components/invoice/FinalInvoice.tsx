"use client";

import { useState } from "react";
import { FiDownload, FiExternalLink, FiPrinter } from "react-icons/fi";
import { amount, chargedNote, downloadInvoicePdf, invoiceDate, lineBasis, lineRate, loadInvoice, methodLabel, openInvoice, statusFooter, unitLabel, type FinalInvoice, type InvoiceKind } from "@/lib/invoice";
import { toast } from "@/lib/toast";

/**
 * The assessment invoice on screen (colour) and on paper: print styles turn the same markup into the black-and-white version.
 * Used for the recorded FINAL invoice and for the officer's PROVISIONAL draft on the review step.
 */
export function FinalInvoiceDocument({ invoice }: { invoice: FinalInvoice }) {
  const final = invoice.status === "FINAL";
  const parties: [string, string, string][] = [["Issuing office", "Ethiopian Customs Commission", invoice.office.name + (invoice.office.code ? ` · ${invoice.office.code}` : "")],
    ["Assessing officer", invoice.officer || "Customs Officer", ""]];
  if (invoice.importer) parties.push(["Importer", invoice.importer.name, invoice.importer.tin ? `TIN ${invoice.importer.tin}` : ""]);
  const facts = [invoice.goods.condition ? `Condition: ${invoice.goods.condition}` : "", invoice.goods.detail && invoice.goods.description ? invoice.goods.detail : ""].filter(Boolean).join(" · ");
  return <article className={`fi-paper${final ? " is-final" : " is-provisional"}`} aria-label={`Assessment invoice ${invoice.reference}`}>
    <span className="fi-flag" aria-hidden="true"><i /><i /><i /></span>
    <header className="fi-brand">
      <div className="fi-logo"><img src="/images/customs-logo-dark.png" alt="" /><small lang="am">ጉምሩክ ኮሚሽን</small><small>CUSTOMS COMMISSION</small></div>
      <div className="fi-brand-name"><p lang="am">የኢትዮጵያ ጉምሩክ ኮሚሽን</p><h2>ETHIOPIAN CUSTOMS COMMISSION</h2><p className="fi-tagline">FACILITATE TRADE <span>|</span> PROTECT OUR BORDERS <span>|</span> SERVE OUR NATION</p></div>
    </header>
    <div className="fi-rule" aria-hidden="true" />
    <section className="fi-title">
      <div><p className="fi-eyebrow">Customs assessment notice</p><h1>Assessment invoice</h1><p className="fi-ref">Reference: {invoice.reference}</p></div>
      <div className="fi-status"><span className="fi-pill">{final ? "Final" : "Provisional"}</span><strong>{invoiceDate(invoice.issuedAt)}</strong></div>
    </section>
    <section className={`fi-parties is-${parties.length}`}>{parties.map(([title, main, sub]) => <div key={title}><span className="fi-label">{title}</span><strong>{main}</strong>{sub && <small>{sub}</small>}</div>)}</section>

    <h3 className="fi-section"><span>01</span>Goods &amp; tariff details</h3>
    <section className="fi-goods">
      <div className="fi-goods-main"><span className="fi-label">Item description</span><strong>{invoice.goods.name}</strong>
        {(invoice.goods.description || invoice.goods.detail) && <p>{invoice.goods.description || invoice.goods.detail}</p>}{facts && <small>{facts}</small>}</div>
      <div className="fi-goods-side">
        <span className="fi-label">HS tariff code</span><b className="fi-code">{invoice.goods.hsCode || "—"}</b>{invoice.goods.nationalCode && <small>ERCA {invoice.goods.nationalCode}</small>}
        <dl><div><dt className="fi-label">Origin</dt><dd><strong>{invoice.goods.origin || "—"}</strong></dd></div><div><dt className="fi-label">Qty</dt><dd>{unitLabel(invoice.goods.quantity, invoice.goods.unit)}</dd></div></dl>
      </div>
    </section>
    <section className="fi-values">
      <div><span className="fi-label">Price paid{invoice.goods.terms ? ` (${invoice.goods.terms})` : ""}</span><p>{invoice.goods.pricePaid != null && <em>{invoice.goods.priceCurrency || invoice.currency}</em>}<b>{invoice.goods.pricePaid != null ? amount(invoice.goods.pricePaid) : "—"}</b></p></div>
      <div><span className="fi-label">Assessed customs value (CIF)</span><p><em>{invoice.valuation.currency || invoice.currency}</em><b>{amount(invoice.valuation.customsValue)}</b></p>
        <small>{methodLabel(invoice.valuation.method)}{invoice.valuation.exchangeRate && invoice.valuation.exchangeRate !== 1 ? ` · rate ${invoice.valuation.exchangeRate}` : ""}</small></div>
    </section>

    <h3 className="fi-section"><span>02</span>Duties, taxes &amp; fees</h3>
    <table className="fi-taxes"><thead><tr><th>Duty / tax</th><th>Basis</th><th>Rate</th><th>Amount ({invoice.currency})</th></tr></thead>
      <tbody>{invoice.lines.map((line, index) => <tr key={`${line.name}-${index}`} className={line.isApplicable ? "" : "is-off"}>
        <td><strong>{line.name}</strong>{!line.isApplicable && <small>Not applicable</small>}</td><td>{lineBasis(line)}</td><td>{lineRate(line)}</td><td>{amount(line.isApplicable ? line.amount : 0)}</td></tr>)}</tbody></table>
    <section className="fi-total"><div><span>Total duties &amp; taxes payable</span>{Math.abs(invoice.totalTax - invoice.payable) > 0.004 && <small>Before exemptions {invoice.currency} {amount(invoice.totalTax)}</small>}</div><b>{invoice.currency} {amount(invoice.payable)}</b></section>
    <p className="fi-note">{chargedNote(invoice)}</p>
    <footer className="fi-footer"><span>{statusFooter(invoice)}</span><span>1 / 1</span></footer>
  </article>;
}

/** Open, print and download buttons for one final invoice; used in the audit trail and the importer portal. */
export function InvoiceActions({ kind, id, compact = false, label = "Final invoice" }: { kind: InvoiceKind; id: string; compact?: boolean; label?: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try { await downloadInvoicePdf(await loadInvoice(kind, id)); toast.success("The invoice PDF was saved to your downloads.", { title: "Invoice downloaded" }); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "The invoice could not be downloaded.", { title: "Invoice unavailable" }); }
    finally { setBusy(false); }
  }
  return <div className={`fi-actions${compact ? " is-compact" : ""}`} role="group" aria-label={label}>
    {!compact && <span className="fi-actions-label">{label}</span>}
    <button type="button" onClick={event => { event.stopPropagation(); openInvoice(kind, id); }} title="Open the invoice"><FiExternalLink aria-hidden="true" /><span>Open</span></button>
    <button type="button" onClick={event => { event.stopPropagation(); openInvoice(kind, id, true); }} title="Print the invoice"><FiPrinter aria-hidden="true" /><span>Print</span></button>
    <button type="button" onClick={event => { event.stopPropagation(); void download(); }} disabled={busy} title="Download the invoice as PDF"><FiDownload aria-hidden="true" /><span>{busy ? "Preparing…" : "PDF"}</span></button>
  </div>;
}
