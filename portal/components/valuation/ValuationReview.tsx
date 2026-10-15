"use client";

import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiDownload, FiEdit2, FiExternalLink, FiFileText, FiImage, FiPackage, FiPrinter } from "react-icons/fi";
import { FinalInvoiceDocument } from "@/components/invoice/FinalInvoice";
import { downloadInvoicePdf, type FinalInvoice } from "@/lib/invoice";
import { HsItem } from "@/components/hs/HsItem";
import { tariffDisplayCode, tariffLineTitle } from "@/components/tariff/TariffBrowser";
import { valueTotals, type ProductState, type PurposeState, type ValueState } from "@/components/importer/declaration/fields";
import { ASSESSMENT_CURRENCY, type EvidenceChoice } from "@/components/valuation/ValuationEvidence";
import { formatMoney, importerApi, purposeLabels, type TariffOption } from "@/lib/importer";

export type TaxPreviewLine = { name: string; calculationType: string; value: number; calculationBasis: string; baseAmount: number; calculatedAmount: number; notes: string; status: string; sourceReference: string; isApplicable: boolean; comparisonOnly: boolean };
export type TaxPreview = { tariffItemNo: string; nationalCode: string | null; description: string; productCategory: string; customsValueAmount: number; currency: string; taxLines: TaxPreviewLine[]; totalTax: number; totalWithCustomsValue: number; reviewRequired: boolean };
export type Finalised = { reference: string; decisionId: string; confirmedAt: string; totalTax: number | null; taxLines: TaxPreviewLine[] | null };
type ProductImage = { title: string; thumbnailUrl: string; imageUrl: string | null; source: string | null; pageUrl: string | null };

const statusLabels: Record<string, string> = { Exempt: "Exempt", NotApplicable: "Not applicable", ReviewRequired: "Needs review", OfficerAdjusted: "Adjusted" };
const basisLabels: Record<string, string> = {
  CIF: "Customs value", CIF_PLUS_DUTY: "Value + duty", CIF_PLUS_DUTY_EXCISE: "Value + duty + excise", CIF_PLUS_DUTY_EXCISE_SURTAX: "Value + duty + excise + surtax",
  CIFPlusDuty: "Value + duty", CIFPlusDutyPlusExcise: "Value + duty + excise", CIFPlusDutyPlusExcisePlusSurtax: "Value + duty + excise + surtax", InitialDuty: "Customs value",
};
const rate = (line: TaxPreviewLine) => line.calculationType === "Percentage" ? `${line.value}%` : line.calculationType === "PerUnit" ? `${line.value} ETB/unit` : formatMoney(line.value, ASSESSMENT_CURRENCY);

/**
 * Last step of the valuation search: everything decided in the five steps, the product photo, the trade documents and
 * the assessment notice that will be issued, with duties and taxes calculated from the tariff. Nothing is saved until
 * the officer confirms.
 */
export function ValuationReview({ tariff, countryCode, countryName, purpose, product, value, documents, choice, note, officerName, officeName, searchQuery,
  photo, onPhoto, onPreview, onEdit, finalised }: {
  tariff: TariffOption; countryCode: string; countryName: string; purpose: PurposeState; product: ProductState; value: ValueState;
  documents: { label: string; file: File | null }[]; choice: EvidenceChoice; note: string; officerName: string; officeName: string; searchQuery: string;
  photo: string | null; onPhoto: (url: string | null) => void; onPreview: (preview: TaxPreview | null) => void; onEdit: (step: number) => void; finalised: Finalised | null;
}) {
  const totals = valueTotals(value);
  const quantity = Number(product.quantity) || 1;
  const manufacturing = purpose.purpose === "MANUFACTURING";
  const [preview, setPreview] = useState<{ busy: boolean; error: string; value: TaxPreview | null }>({ busy: true, error: "", value: null });
  const [images, setImages] = useState<{ busy: boolean; items: ProductImage[] }>({ busy: false, items: [] });
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  // Duties and taxes for the chosen customs value, from the same calculator the saved assessment uses.
  useEffect(() => {
    if (!choice.value) return;
    let active = true;
    setPreview({ busy: true, error: "", value: null });
    void importerApi<TaxPreview>("/valuation-search/tax-preview", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tariffLineId: tariff.tariffLineId, customsValueAmount: choice.value, quantity, unit: product.unit, originCountry: countryCode,
        importPurpose: purpose.purpose, isMachineryOrEquipment: manufacturing && purpose.machinery === true, isCommercialImport: purpose.purpose === "COMMERCIAL_RESALE" }) })
      .then(result => { if (active) { setPreview({ busy: false, error: "", value: result }); onPreview(result); } })
      .catch(reason => { if (active) { setPreview({ busy: false, error: reason instanceof Error ? reason.message : "Duties and taxes could not be calculated.", value: null }); onPreview(null); } });
    return () => { active = false; };
  // onPreview is a state setter in the parent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tariff.tariffLineId, choice.value, quantity, product.unit, countryCode, purpose.purpose, purpose.machinery]);

  // Product images for the officer to choose from; the market offer's photo (when there is one) stays the default.
  useEffect(() => {
    if (searchQuery.trim().length < 2) return;
    let active = true;
    setImages({ busy: true, items: [] });
    void importerApi<{ items: ProductImage[] }>(`/product-images?${new URLSearchParams({ q: searchQuery.trim() })}`)
      .then(result => { if (!active) return; setImages({ busy: false, items: result.items }); if (!photo && result.items[0]) onPhoto(result.items[0].thumbnailUrl); })
      .catch(() => { if (active) setImages({ busy: false, items: [] }); });
    return () => { active = false; };
  // Searched once per product; choosing a photo must not search again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const gallery = useMemo(() => [...new Set([photo, ...images.items.map(item => item.thumbnailUrl)].filter((url): url is string => Boolean(url) && !broken[url as string]))].slice(0, 5), [photo, images.items, broken]);
  const shownPhoto = photo && !broken[photo] ? photo : gallery[0] ?? null;
  const lines = finalised?.taxLines ?? preview.value?.taxLines ?? [];
  const charged = lines.filter(line => line.isApplicable && !line.comparisonOnly);
  const totalTax = finalised?.totalTax ?? preview.value?.totalTax ?? null;
  const customsValue = choice.value ?? 0;
  const needsReview = lines.filter(line => line.isApplicable && line.status === "ReviewRequired");
  const issued = finalised ? new Date(finalised.confirmedAt) : new Date();
  const fileUrls = useMemo(() => new Map(documents.filter(doc => doc.file).map(doc => [doc.file as File, URL.createObjectURL(doc.file as File)])), [documents]);
  useEffect(() => () => fileUrls.forEach(url => URL.revokeObjectURL(url)), [fileUrls]);
  const docUrl = (file: File) => fileUrls.get(file);
  // The notice shown before confirming (PROVISIONAL) and after (FINAL) uses the same invoice layout as the recorded one.
  const draftInvoice: FinalInvoice = {
    kind: "valuation", reference: finalised?.reference ?? "Assigned on confirmation", issuedAt: issued.toISOString(), status: finalised ? "FINAL" : "PROVISIONAL",
    office: { name: officeName, code: "" }, officer: officerName, importer: null,
    goods: {
      name: product.productName, detail: [product.brand && product.brand !== "Generic" ? product.brand : "", product.model !== "Generic" ? product.model : ""].filter(Boolean).join(" · "),
      hsCode: tariffDisplayCode(tariff), nationalCode: preview.value?.nationalCode ?? "", description: tariffLineTitle(tariff), origin: countryName, quantity, unit: product.unit,
      pricePaid: totals.paid, priceCurrency: value.currency, condition: product.condition.charAt(0) + product.condition.slice(1).toLowerCase(), terms: totals.terms.code,
    },
    valuation: { method: choice.methodName, customsValue, currency: ASSESSMENT_CURRENCY, exchangeRate: null, exchangeRateSource: "" },
    lines: lines.filter(line => !line.comparisonOnly).map(line => ({ name: line.name, calculationType: line.calculationType, rate: line.value, calculationBasis: line.calculationBasis,
      baseAmount: line.baseAmount, amount: line.calculatedAmount, isApplicable: line.isApplicable, status: line.status })),
    totalTax: totalTax ?? 0, payable: totalTax ?? 0, currency: ASSESSMENT_CURRENCY,
  };

  const Edit = ({ step }: { step: number }) => finalised ? null : <button type="button" className="vr-edit" onClick={() => onEdit(step)}><FiEdit2 aria-hidden="true" />Edit</button>;

  return <div className="vr">
    {finalised && <div className="vr-done" role="status"><FiCheckCircle aria-hidden="true" /><div><strong>Assessment finalised · {finalised.reference}</strong><p>The customs value and the duties and taxes are recorded. Print the notice for the customer.</p></div></div>}
    {!finalised && needsReview.length > 0 && <p className="oc-callout is-warning"><FiAlertTriangle aria-hidden="true" />{needsReview.map(line => line.name).join(", ")} {needsReview.length === 1 ? "has" : "have"} no rate in the tariff for this line. Choose another tariff line in step 1 before confirming.</p>}

    <div className="vr-top">
      <section className="vr-product" aria-label="Product">
        <div className={`vr-photo${shownPhoto ? "" : " is-empty"}`}>
          {shownPhoto ? <img src={shownPhoto} alt={product.productName} onError={() => setBroken(state => ({ ...state, [shownPhoto]: true }))} />
            : <div className="vr-photo-empty">{images.busy ? <span className="ve-loading" aria-label="Finding a product photo" /> : <FiPackage aria-hidden="true" />}<span>{images.busy ? "Finding a product photo…" : "No product photo"}</span></div>}
        </div>
        {gallery.length > 1 && !finalised && <div className="vr-thumbs" role="radiogroup" aria-label="Product photo">{gallery.map(url => <button key={url} type="button" role="radio" aria-checked={url === shownPhoto} className={url === shownPhoto ? "is-selected" : ""} onClick={() => onPhoto(url)}>
          <img src={url} alt="" onError={() => setBroken(state => ({ ...state, [url]: true }))} /></button>)}</div>}
        {!shownPhoto && !images.busy && <small className="vr-photo-note"><FiImage aria-hidden="true" />The record is saved without a photo.</small>}
      </section>

      <section className="vr-summary" aria-label="Valuation summary">
        <span className="vr-eyebrow">{product.category ? product.category.replaceAll("_", " ").toLowerCase() : "Goods"}</span>
        <h3>{product.productName}</h3>
        <p className="vr-sub">{[product.brand && product.brand !== "Generic" ? product.brand : "", product.model].filter(Boolean).join(" · ") || "No brand"} · {quantity.toLocaleString()} {product.unit} · from {countryName}</p>
        <div className="vr-figures">
          <div><span>Customer paid</span><strong>{formatMoney(totals.paid, value.currency)}</strong><small>{totals.terms.code}{totals.freight || totals.insurance ? ` + ${formatMoney(totals.freight + totals.insurance, value.currency)} freight & insurance` : ""}</small></div>
          <div className="is-value"><span>Customs value (CIF)</span><strong>{formatMoney(customsValue, ASSESSMENT_CURRENCY)}</strong><small>{choice.methodName}</small></div>
          <div className="is-tax"><span>Duties and taxes</span><strong>{preview.busy && !finalised ? <span className="ve-loading" aria-label="Calculating" /> : formatMoney(totalTax, ASSESSMENT_CURRENCY)}</strong><small>{manufacturing ? purpose.machinery ? "Capital goods reliefs applied" : "Manufacturing reliefs applied" : "From the ERCA tariff"}</small></div>
        </div>
      </section>
    </div>

    <div className="vr-grid">
      <section className="vr-card"><header><h4>1 · Tariff match</h4><Edit step={0} /></header>
        <HsItem code={tariffDisplayCode(tariff)} description={tariffLineTitle(tariff)} full />
        <small>Section {tariff.sectionNumber} › {tariff.chapterName && tariff.chapterName !== `Chapter ${tariff.chapter}` ? `Chapter ${tariff.chapter} ${tariff.chapterName}` : `Chapter ${tariff.chapter}`}{preview.value?.nationalCode ? ` · ERCA ${preview.value.nationalCode}` : ""}</small></section>
      <section className="vr-card"><header><h4>2 · Origin & purpose</h4><Edit step={1} /></header>
        <dl><div><dt>Country of origin</dt><dd>{countryName}</dd></div><div><dt>Purpose</dt><dd>{purposeLabels[purpose.purpose] ?? purpose.purpose}{manufacturing && purpose.machinery !== null ? purpose.machinery ? " · machinery / equipment" : " · production inputs" : ""}</dd></div></dl></section>
      <section className="vr-card"><header><h4>3 · Product</h4><Edit step={2} /></header>
        <dl><div><dt>Condition</dt><dd>{product.condition.toLowerCase()}</dd></div>{product.manufacturer.trim() && <div><dt>Manufacturer</dt><dd>{product.manufacturer}</dd></div>}{product.specifications && <div><dt>Specifications</dt><dd>{product.specifications}</dd></div>}{product.serial && <div><dt>Serial / part</dt><dd>{product.serial}</dd></div>}</dl></section>
      <section className="vr-card"><header><h4>4 · Value</h4><Edit step={3} /></header>
        <dl><div><dt>Price paid ({totals.terms.code})</dt><dd>{formatMoney(totals.paid, value.currency)}</dd></div><div><dt>Freight</dt><dd>{formatMoney(totals.freight, value.currency)}</dd></div><div><dt>Insurance</dt><dd>{formatMoney(totals.insurance, value.currency)}</dd></div><div><dt>CIF paid</dt><dd>{formatMoney(totals.cif, value.currency)}</dd></div></dl></section>
      <section className="vr-card"><header><h4>5 · Customs value</h4><Edit step={4} /></header>
        <dl><div><dt>Basis</dt><dd>{choice.methodName}</dd></div><div><dt>Value</dt><dd>{formatMoney(customsValue, ASSESSMENT_CURRENCY)}</dd></div>{note.trim() && <div><dt>Note</dt><dd>{note.trim()}</dd></div>}</dl></section>
      <section className="vr-card"><header><h4>Trade documents</h4></header>
        <ul className="vr-docs">{documents.map(doc => <li key={doc.label}><FiFileText aria-hidden="true" /><span><strong>{doc.label}</strong><small>{doc.file ? `${doc.file.name} · ${Math.max(1, Math.round(doc.file.size / 1024))} KB` : "Missing"}</small></span>
          {doc.file && <a href={docUrl(doc.file)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${doc.label}`}><FiExternalLink aria-hidden="true" /></a>}</li>)}</ul></section>
    </div>

    <section className="vr-invoice-wrap" aria-label="Assessment notice preview">
      <header className="vr-invoice-head"><div><h4>Assessment notice</h4><p>{finalised ? "Issued — print or save it as PDF for the customer." : "Preview of the notice that is issued when you confirm."}</p></div>
        <div className="vr-invoice-actions"><button type="button" className="iv-secondary" onClick={() => window.print()} disabled={!lines.length}><FiPrinter aria-hidden="true" />Print</button>
          <button type="button" className="iv-secondary" onClick={() => void downloadInvoicePdf(draftInvoice)} disabled={!lines.length}><FiDownload aria-hidden="true" />Download PDF</button></div></header>
      {preview.error && !finalised ? <p className="iv-error" role="alert">{preview.error}</p>
        : preview.busy && !finalised ? <p className="oc-muted">Calculating duties and taxes…</p>
        : <div className="vr-invoice-print"><FinalInvoiceDocument invoice={draftInvoice} /></div>}
    </section>
  </div>;
}
