"use client";

import Link from "next/link";
import { FiBell, FiCheckCircle, FiClock, FiEdit3, FiPrinter } from "react-icons/fi";
import { formatMoney } from "@/lib/importer";
import { lineCode, type OfficerCase } from "@/lib/officer-case";

/** The issued assessment, as the importer sees it, with links to the audit record. */
export function FinalStep({ data, onRevise }: { data: OfficerCase; onRevise: () => void }) {
  const d = data.declaration;
  const currency = d.assessmentCurrency || "ETB";
  const lines = d.assessmentLines.filter(line => line.isApplicable && line.amount > 0);
  const notified = data.history.find(entry => entry.action === "IMPORTER_DECLARATION_ASSESSED");
  return <div className="oc-step-grid">
    <section className="oc-card oc-final" aria-labelledby="oc-final-title">
      <div className="oc-final-banner"><FiCheckCircle aria-hidden="true" /><div><span className="oc-eyebrow">Assessment issued</span><h2 id="oc-final-title">{formatMoney(d.assessedPayable, currency)} payable</h2>
        <p>{d.assessedAt ? `Finalised ${new Date(d.assessedAt).toLocaleString()}` : "Finalised"}{notified ? ` by ${notified.username}` : ""}. The importer received the notice in their portal.</p></div></div>
      <dl className="oc-facts">
        <div><dt>Customs value (CIF)</dt><dd><b>{formatMoney(d.assessedCustomsValue, currency)}</b></dd></div>
        <div><dt>Valuation method</dt><dd>{data.valuation?.selectedPriceSource === "originFobCif" ? "Declared transaction value (invoice + freight + insurance)" : data.valuation?.valuationMethod ?? "—"}</dd></div>
        <div><dt>HS classification</dt><dd className="oc-mono">{lineCode(data.confirmedLine)}</dd></div>
        <div><dt>Declared price</dt><dd>{formatMoney(d.invoiceAmount, d.invoiceCurrency)}</dd></div>
      </dl>
      <div className="oc-table-wrap"><table className="oc-tax-table is-readonly">
        <thead><tr><th scope="col">Duty or tax</th><th scope="col">Rate</th><th scope="col">Base</th><th scope="col">Amount</th></tr></thead>
        <tbody>{lines.length ? lines.map(line => <tr key={line.name}><td><strong>{line.name}</strong></td><td>{line.calculationType === "Percentage" ? `${line.rate}%` : line.calculationType === "PerUnit" ? `${line.rate} ETB/unit` : formatMoney(line.rate, currency)}</td><td>{formatMoney(line.baseAmount, currency)}</td><td className="oc-amount">{formatMoney(line.amount, currency)}</td></tr>)
          : <tr><td colSpan={4} className="oc-muted">No duties or taxes apply.</td></tr>}</tbody>
        <tfoot><tr><th scope="row" colSpan={3}>Payable</th><td className="oc-amount">{formatMoney(d.assessedPayable, currency)}</td></tr></tfoot>
      </table></div>
      <div className="oc-actions">
        {data.valuation && <Link className="oc-btn" href={`/audit/cases/${data.valuation.id}`}><FiClock aria-hidden="true" />Audit record</Link>}
        <button type="button" className="oc-btn" onClick={() => window.print()}><FiPrinter aria-hidden="true" />Print notice</button>
        {data.valuation?.ownedByMe && <button type="button" className="oc-btn" onClick={onRevise}><FiEdit3 aria-hidden="true" />Revise assessment</button>}
      </div>
      <p className="oc-muted"><FiBell aria-hidden="true" /> A revised assessment sends the importer a new notice and is kept in the audit trail.</p>
    </section>
  </div>;
}
