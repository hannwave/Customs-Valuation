"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FiAlertTriangle, FiBell, FiCheckCircle, FiClock, FiEdit3 } from "react-icons/fi";
import { FinalInvoiceDocument, InvoiceActions } from "@/components/invoice/FinalInvoice";
import { formatMoney } from "@/lib/importer";
import { loadInvoice, type FinalInvoice } from "@/lib/invoice";
import type { OfficerCase } from "@/lib/officer-case";

/**
 * The issued assessment. Officers see the same official invoice the importer opens in their portal
 * (one document, built by the API), with the case's audit and revision actions around it.
 */
export function FinalStep({ data, onRevise }: { data: OfficerCase; onRevise: () => void }) {
  const d = data.declaration;
  const currency = d.assessmentCurrency || "ETB";
  const notified = data.history.find(entry => entry.action === "IMPORTER_DECLARATION_ASSESSED");
  const [invoice, setInvoice] = useState<FinalInvoice | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setInvoice(null); setError("");
    loadInvoice("declaration", d.id).then(next => { if (active) setInvoice(next); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "The invoice could not be opened."); });
    return () => { active = false; };
  }, [d.id, d.assessedAt]);

  return <div className="oc-step-grid">
    <section className="oc-card oc-final" aria-labelledby="oc-final-title">
      <div className="oc-final-banner"><FiCheckCircle aria-hidden="true" /><div><span className="oc-eyebrow">Assessment issued</span><h2 id="oc-final-title">{formatMoney(d.assessedPayable, currency)} payable</h2>
        <p>{d.assessedAt ? `Finalised ${new Date(d.assessedAt).toLocaleString()}` : "Finalised"}{notified ? ` by ${notified.username}` : ""}. The importer received this invoice in their portal.</p></div></div>
      <div className="ip-invoice-bar"><div><strong>Final invoice</strong><small>The same invoice the importer sees for {d.reference}.</small></div><InvoiceActions kind="declaration" id={d.id} compact /></div>
      <div className="oc-final-invoice">
        {error ? <p className="oc-callout is-warning"><FiAlertTriangle aria-hidden="true" /> {error}</p>
          : invoice ? <FinalInvoiceDocument invoice={invoice} />
          : <p className="oc-muted" role="status"><span className="dv-spinner" aria-hidden="true" /> Opening the invoice…</p>}
      </div>
      <div className="oc-actions">
        {data.valuation && <Link className="oc-btn" href={`/audit/cases/${data.valuation.id}`}><FiClock aria-hidden="true" />Audit record</Link>}
        {data.valuation?.ownedByMe && <button type="button" className="oc-btn" onClick={onRevise}><FiEdit3 aria-hidden="true" />Revise assessment</button>}
      </div>
      <p className="oc-muted"><FiBell aria-hidden="true" /> A revised assessment sends the importer a new notice and is kept in the audit trail.</p>
    </section>
  </div>;
}
