"use client";

import { useEffect, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiEdit3, FiZap } from "react-icons/fi";
import { HsPicker } from "@/components/officer/HsPicker";
import { importerApi, type TariffOption } from "@/lib/importer";
import { lineCode, lineTitle, readableTariffText, type TariffLineView } from "@/lib/officer-case";
import { HsItem } from "@/components/hs/HsItem";

const rateLabels: [string, string][] = [["DR", "Duty"], ["ER", "Excise"], ["VAT", "VAT"], ["WHR", "Withholding"], ["SR", "Surtax"], ["D2R", "2nd sched."]];

/** A tariff line chosen in the picker, in the same shape as the server's line view (rates load separately). */
export function optionToLine(option: TariffOption): TariffLineView {
  return { tariffLineId: option.tariffLineId, hsCodeId: option.hsCodeId, hsCode: option.hsCode, hsDescription: option.hsDescription, tariffItemNo: option.tariffItemNo,
    nationalCode: "", description: option.description, unit: "", duty: "", retired: false, chapter: option.chapter, chapterName: option.chapterName, heading: option.heading,
    sectionNumber: option.sectionNumber, sectionName: option.sectionName, rates: [] };
}

/**
 * The HS classification of a declaration. Starts from the importer's own tariff choice (made from the item description),
 * shows other likely lines for the same description, and opens the tariff-book picker to change it.
 */
export function HsClassificationCard({ line, source, productName, description, editable, busy, askNote, onChange }: {
  line: TariffLineView | null; source: "importer" | "officer" | "pending"; productName: string; description: string;
  editable: boolean; busy?: boolean; askNote?: boolean; onChange: (option: TariffOption, note: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [alternatives, setAlternatives] = useState<TariffOption[]>([]);
  const [rates, setRates] = useState(line?.rates ?? []);

  useEffect(() => {
    if (!editable || productName.trim().length < 2) { setAlternatives([]); return; }
    let current = true;
    void importerApi<{ items: TariffOption[] }>(`/importer-declarations/catalog?${new URLSearchParams({ stage: "search", q: productName.slice(0, 100) })}`)
      .then(result => { if (current) setAlternatives(result.items.filter(item => item.tariffLineId !== line?.tariffLineId).slice(0, 4)); })
      .catch(() => { if (current) setAlternatives([]); });
    return () => { current = false; };
  }, [editable, productName, line?.tariffLineId]);

  useEffect(() => {
    if (!line) { setRates([]); return; }
    if (line.rates.length) { setRates(line.rates); return; }
    let current = true;
    void importerApi<{ taxes: { code: string; listed: boolean; rate: number | null }[] }>(`/tariff/lines/${line.tariffLineId}/taxes`)
      .then(result => { if (current) setRates(result.taxes.filter(tax => tax.listed && tax.rate != null).map(tax => ({ taxCode: tax.code, rate: tax.rate as number }))); })
      .catch(() => { if (current) setRates([]); });
    return () => { current = false; };
  }, [line]);

  const choose = (option: TariffOption, note: string) => { onChange(option, note); setPicking(false); };
  const sourceLabel = source === "officer" ? "Confirmed by customs" : source === "pending" ? "Officer selection — saved when you approve" : "Importer's choice from the item description";

  return <section className="oc-card oc-hs-card" aria-labelledby="oc-hs-card-title">
    <header className="oc-card-head">
      <div><span className="oc-eyebrow">HS classification</span><h2 id="oc-hs-card-title">Tariff line</h2></div>
      {editable && <button type="button" className="oc-btn" onClick={() => setPicking(true)} disabled={busy}><FiEdit3 aria-hidden="true" />Change HS code</button>}
    </header>
    {line ? <div className="oc-hs-current">
      <div className="oc-hs-code-block">
        <strong className="oc-hs-desc"><HsItem code={lineCode(line)} description={lineTitle(line)} full /></strong>
        <span className={`oc-hs-source is-${source}`}>{source === "officer" ? <FiCheckCircle aria-hidden="true" /> : source === "pending" ? <FiEdit3 aria-hidden="true" /> : <FiZap aria-hidden="true" />}{sourceLabel}</span>
      </div>
      <p className="oc-muted">{line.sectionNumber && `Section ${line.sectionNumber} · `}Chapter {line.chapter}{line.chapterName ? ` ${line.chapterName}` : ""}{line.heading ? ` · Heading ${line.heading}` : ""}{line.nationalCode ? <> · ERCA <span className="oc-mono">{line.nationalCode}</span></> : null}</p>
      {line.retired && <p className="oc-callout is-warning"><FiAlertTriangle aria-hidden="true" />This tariff line is no longer in the current ERCA tariff book. Choose its replacement.</p>}
      {rates.length > 0 && <div className="hs-tax-rates oc-rate-strip" aria-label="Tariff rates">{rateLabels.map(([code, label]) => { const rate = rates.find(item => item.taxCode === code);
        return <span key={code} className={rate ? "" : "is-unlisted"}><small>{label}</small><b>{rate ? `${rate.rate}%` : "—"}</b></span>; })}</div>}
    </div> : <p className="oc-muted">No tariff line selected yet.</p>}
    {editable && alternatives.length > 0 && <div className="oc-hs-alternatives">
      <span>Other likely lines for “{productName}”</span>
      <div>{alternatives.map(item => <button key={item.tariffLineId} type="button" onClick={() => choose(item, "")} disabled={busy} title={item.hsDescription}>
        <HsItem code={item.tariffItemNo || item.hsCode} description={readableTariffText(item.description, item.hsDescription)} /></button>)}</div>
    </div>}
    {picking && <HsPicker title="Choose the correct tariff line" productName={productName} description={description} currentLineId={line?.tariffLineId} askNote={askNote} busy={busy}
      onSelect={choose} onClose={() => setPicking(false)} />}
  </section>;
}
