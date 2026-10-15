"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FiArrowLeft, FiArrowRight, FiCheck, FiCheckCircle, FiCircle, FiEdit2, FiInfo, FiRotateCcw } from "react-icons/fi";
import { TariffBrowser, tariffDisplayCode, tariffLineTitle } from "@/components/tariff/TariffBrowser";
import { DocumentDrop } from "@/components/importer/declaration/DocumentDrop";
import { CountryPicker, ProductFields, PurposeFields, ValueFields, composeDescription, emptyProduct, emptyValue, productProblem, useCountryOptions, valueTotals, type ProductState, type PurposeState, type ValueState } from "@/components/importer/declaration/fields";
import { categoryForChapter, productCategories, unitForTariff } from "@/components/importer/declaration/options";
import { ASSESSMENT_CURRENCY, ValuationEvidence, type EvidenceChoice, type EvidenceInput } from "@/components/valuation/ValuationEvidence";
import { FeedbackToast } from "@/components/FeedbackToast";
import { ValuationReview, type Finalised, type TaxPreview } from "@/components/valuation/ValuationReview";
import { savePhase2 } from "@/lib/phase2Api";
import { formatMoney, importerApi, purposeLabels, type TariffOption } from "@/lib/importer";
import { officerNoteIssue } from "@/lib/officer-note-quality";
import { clearValuationSession } from "@/lib/valuation-session";
import { workspaceApi, type WorkspaceProfile } from "@/lib/workspace";
import { HsItem } from "@/components/hs/HsItem";
import { toast } from "@/lib/toast";

const STEP_TOAST = "valuation-step";

const steps = [
  { title: "Tariff match", description: "Find the tariff line for the goods. It drives the FOB, exchange-price and tax lookups." },
  { title: "Origin & purpose", description: "Where the goods were made, how they will be used, and the certificate of origin. Manufacturing imports get tax reliefs." },
  { title: "Product details", description: "The same product details importers give on the portal, with the packing list." },
  { title: "Value & invoice", description: "The price paid, the invoice terms and the customer's commercial invoice or receipt." },
  { title: "Customs value", description: "Compare what the customer paid with the FOB, global market and (for raw materials) global base prices, then choose the customs value." },
  { title: "Review & confirm", description: "Check everything decided, preview the assessment notice, and confirm to finalise the customs value and the duties and taxes." },
] as const;
const REVIEW = 5;
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

/**
 * The officer's own valuation (no importer account): collects the shipment the way the importer portal does, then
 * compares FOB, exchange and market evidence and records the customs value for the duty and tax assessment.
 */
export function ValuationSearch({ profile, onSubmitted }: { profile: WorkspaceProfile; onSubmitted: () => void }) {
  const countryOptions = useCountryOptions();
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(0);
  const [tariff, setTariff] = useState<TariffOption | null>(null);
  const [browsing, setBrowsing] = useState(true);
  const [country, setCountry] = useState("");
  const [purpose, setPurpose] = useState<PurposeState>({ purpose: "", machinery: null });
  const [product, setProduct] = useState<ProductState>(emptyProduct);
  const [value, setValue] = useState<ValueState>(emptyValue);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [packingList, setPackingList] = useState<File | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [preview, setPreview] = useState<TaxPreview | null>(null);
  const [finalised, setFinalised] = useState<Finalised | null>(null);
  const [choice, setChoice] = useState<EvidenceChoice | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const totals = valueTotals(value);
  const qty = Number(product.quantity) || 0;
  const countryName = countryOptions.find(item => item.code === country)?.name ?? country;
  const noteIssue = officerNoteIssue(note);
  const noteRequired = choice ? !choice.fobBased : false;
  const searchQuery = [product.brand, product.model].filter(item => item && item !== "Generic").join(" ") || product.productName;

  const problemIn = (index: number): string => {
    if (index === 0) return tariff ? "" : "Choose the tariff line for the goods.";
    if (index === 1) {
      if (!country) return "Choose the country of origin.";
      if (!purpose.purpose) return "Choose how the goods will be used.";
      if (purpose.purpose === "MANUFACTURING" && purpose.machinery === null) return "Choose machinery or production inputs.";
      if (!certificate) return "Attach the certificate of origin.";
      return "";
    }
    if (index === 2) return productProblem(product, purpose.purpose) || (packingList ? "" : "Attach the packing list.");
    if (index === 3) {
      if (!(totals.paid > 0)) return "Enter the price paid for the shipment.";
      if (!receipt) return "Attach the customer's commercial invoice or receipt.";
      return "";
    }
    if (index === 4) {
      if (!choice?.value) return "Choose a customs value with an amount in ETB.";
      if (noteRequired && note.trim().length < 10) return "FOB is the standard basis. Explain in the note why another value was used.";
      return noteIssue ?? "";
    }
    if (!preview) return "Wait for the duties and taxes to be calculated.";
    if (preview.reviewRequired) return "A tax has no rate in the tariff for this line. Choose another tariff line in step 1.";
    return "";
  };
  const complete = steps.map((_, index) => !problemIn(index));
  function go(index: number) { toast.dismiss(STEP_TOAST, false); setStep(index); setVisited(current => Math.max(current, index)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function flagStep(index: number, message = problemIn(index)) { toast.warning(message, { key: STEP_TOAST, title: "Finish this step first" }); }
  function next() { if (problemIn(step)) { flagStep(step); return; } go(step + 1); }

  function chooseTariff(item: TariffOption, tariffUnit: string | undefined) {
    setTariff(item); setBrowsing(false); toast.dismiss(STEP_TOAST, false);
    setProduct(current => {
      const suggested = categoryForChapter(item.chapter);
      return { ...current,
        ...(current.category ? {} : { category: suggested, branded: productCategories.find(entry => entry.code === suggested)?.branded ?? false }),
        ...(current.productName.trim() ? {} : { productName: tariffLineTitle(item).slice(0, 120) }),
        ...(tariffUnit ? { unit: unitForTariff(tariffUnit) } : {}) };
    });
  }

  useEffect(() => { if (choice?.photoUrl) setPhoto(current => current ?? choice.photoUrl); }, [choice?.photoUrl]);

  const evidenceInput = useMemo<EvidenceInput | null>(() => tariff && country ? {
    productQuery: searchQuery, quantity: qty || 1, unit: product.unit, hsCode: tariff.hsCode, tariffLabel: tariffDisplayCode(tariff),
    originCountryCode: country, originCountryName: countryName,
    declared: totals.paid > 0 ? { amount: totals.paid, currency: value.currency, freight: totals.freight, insurance: totals.insurance, incoterm: totals.terms.code, documentLabel: receipt ? receipt.name : "invoice" } : null,
  // Rebuild only when the shipment changes, so the evidence is not searched again on every keystroke elsewhere.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  } : null, [tariff, country, visited >= 4, step === 4]);

  async function submit() {
    const firstProblem = complete.findIndex(done => !done);
    if (firstProblem >= 0) { go(firstProblem); flagStep(firstProblem); return; }
    if (!tariff || !receipt || !packingList || !certificate || !choice?.value || !preview) return;
    if ([receipt, packingList, certificate].some(file => file.size > MAX_RECEIPT_BYTES)) { flagStep(step, "Each document must be 8 MB or smaller."); return; }
    const now = Date.now();
    const office = profile.locations.find(location => location.id === profile.user.primaryLocationId && location.locationType === "BRANCH" && location.status === "ACTIVE"
      && new Date(location.effectiveFrom).getTime() <= now && (!location.effectiveTo || new Date(location.effectiveTo).getTime() > now) && (location.supportsValuation || location.supportsInspection));
    if (!office) { setError("Your assigned office is not enabled for valuation. Ask your Customs Administrator to assign an active valuation office."); return; }
    setBusy(true); setError("");
    try {
      const manufacturing = purpose.purpose === "MANUFACTURING";
      const machinery = manufacturing && purpose.machinery === true;
      const description = composeDescription(product, totals.terms.code);
      const evidence = {
        ...choice.evidence, product: product.productName.trim(), description, productType: manufacturing ? "MANUFACTURING" : "COMMODITY",
        importPurpose: purpose.purpose, isMachineryOrEquipment: machinery,
        brand: product.brand.trim() || null, model: product.model.trim() || null, manufacturer: product.manufacturer.trim() || null, specifications: product.specifications.trim() || null,
        hsCode: tariffDisplayCode(tariff), tariffLineId: tariff.tariffLineId, hsCodeId: tariff.hsCodeId,
        purchaseCountryCode: country, purchaseCountryName: countryName, invoiceTerms: totals.terms.code,
        officer: { id: profile.user.id, name: profile.user.fullName }, valuationMethod: choice.methodName, supportingSource: choice.apiSource, productPhoto: photo,
        documents: { commercialInvoice: receipt.name, packingList: packingList.name, certificateOfOrigin: certificate.name },
      };
      // 1. The customs value with the commercial invoice.
      const form = new FormData();
      form.append("hsCodeId", tariff.hsCodeId); form.append("locationId", office.id);
      form.append("selectedReferenceValue", String(choice.value)); form.append("currency", ASSESSMENT_CURRENCY);
      form.append("decision", `Customs value selected for ${product.productName.trim()}`); form.append("justification", note.trim());
      form.append("evidence", JSON.stringify(evidence)); form.append("productName", product.productName.trim().slice(0, 300));
      form.append("purchaseCountryCode", country); form.append("selectedPriceSource", choice.apiSource); form.append("valuationMethod", choice.methodName);
      if (photo) form.append("productPhotoUrl", photo);
      form.append("declaredPriceAmount", String(totals.paid)); form.append("declaredPriceCurrency", value.currency); form.append("receipt", receipt);
      if (choice.key === "declared") {
        form.append("fobPriceAmount", String(totals.paid)); form.append("fobPriceCurrency", value.currency);
        form.append("freightAmount", String(totals.freight)); form.append("insuranceAmount", String(totals.insurance));
      }
      const created = await importerApi<{ id: string; version: string; selectedReferenceValue?: number; currency?: string }>("/workspace/decisions/with-receipt", { method: "POST", body: form });
      // 2. The packing list and certificate of origin.
      for (const [kind, file] of [["PACKING_LIST", packingList], ["CERTIFICATE_OF_ORIGIN", certificate]] as const) {
        const upload = new FormData(); upload.append("kind", kind); upload.append("file", file);
        await importerApi(`/workspace/decisions/${created.id}/documents`, { method: "POST", body: upload });
      }
      // 3. Submit the price review and finalise the duty and tax assessment on the chosen tariff line.
      await workspaceApi<{ status: string }>(`/decisions/${created.id}/submit`, { method: "POST", body: JSON.stringify({ version: created.version, justification: note.trim() }) });
      const assessment = await savePhase2(created.id, {
        selectedHsCodeId: tariff.hsCodeId, selectedTariffLineId: tariff.tariffLineId, targetCurrency: ASSESSMENT_CURRENCY, exchangeRate: 1, exchangeRateSource: "Customs value set in ETB", exchangeRateDate: null,
        exemptionAmount: 0, waiverAmount: 0, manualAdjustmentAmount: 0, manualAdjustmentType: "Fixed", notes: "", taxLines: [],
        customsValueAmount: created.selectedReferenceValue ?? choice.value, customsValueCurrency: ASSESSMENT_CURRENCY,
        quantity: qty || 1, unit: (product.unit || "PCS").slice(0, 40), originCountry: country, productCategory: preview.productCategory, exemptionCodes: [],
        originPreferenceClaimed: false, exciseTaxApplicable: false, isCommercialImport: purpose.purpose === "COMMERCIAL_RESALE", withholdingApplicable: true,
        adjustmentReason: "", officerConfirmation: true, importPurpose: purpose.purpose, isMachineryOrEquipment: machinery,
      }, true);
      const saved = assessment.phase2;
      setFinalised({
        reference: `VAL-${created.id.slice(0, 8).toUpperCase()}`, decisionId: created.id, confirmedAt: new Date().toISOString(), totalTax: saved?.totalTax ?? preview.totalTax,
        taxLines: saved ? saved.taxLines.map(line => ({ name: line.name, calculationType: line.calculationType, value: line.value, calculationBasis: line.calculationBasis, baseAmount: line.baseAmount,
          calculatedAmount: line.calculatedAmount, notes: line.notes, status: line.status, sourceReference: line.sourceReference ?? "", isApplicable: line.isApplicable,
          comparisonOnly: line.name === "Excise Tax (specific)" && line.calculationBasis === "UNIT_RATE_ETB_GREATER_OF" })) : null,
      });
      clearValuationSession();
      window.scrollTo({ top: 0, behavior: "smooth" });
      onSubmitted();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The valuation could not be saved."); }
    finally { setBusy(false); }
  }

  function reset() {
    clearValuationSession();
    setStep(0); setVisited(0); toast.dismiss(STEP_TOAST, false); setTariff(null); setBrowsing(true); setCountry(""); setPurpose({ purpose: "", machinery: null });
    setProduct(emptyProduct()); setValue(emptyValue()); setReceipt(null); setPackingList(null); setCertificate(null); setChoice(null); setNote(""); setError("");
    setPhoto(null); setPreview(null); setFinalised(null);
  }

  const officeName = profile.locations.find(location => location.id === profile.user.primaryLocationId)?.displayName ?? "Customs office";
  const reviewDocuments = useMemo(() => [{ label: "Commercial invoice or receipt", file: receipt }, { label: "Packing list", file: packingList }, { label: "Certificate of origin", file: certificate }], [receipt, packingList, certificate]);
  const checklist: [string, number, string, boolean][] = [
    ["Tariff match", 0, tariff ? `${tariffLineTitle(tariff)} · ${tariffDisplayCode(tariff)}` : "Not selected", complete[0]],
    ["Origin & purpose", 1, [country ? countryName : "", purpose.purpose ? `${purposeLabels[purpose.purpose]}${purpose.purpose === "MANUFACTURING" && purpose.machinery !== null ? purpose.machinery ? " · machinery" : " · inputs" : ""}` : ""].filter(Boolean).join(" · ") || "Not selected", complete[1]],
    ["Product", 2, product.productName.trim() ? `${product.productName.trim()}${qty > 0 ? ` · ${qty.toLocaleString()} ${product.unit}` : ""}` : "Not described", complete[2]],
    ["Value & invoice", 3, totals.paid > 0 ? `${formatMoney(totals.cif, value.currency)} CIF${receipt ? " · invoice attached" : ""}` : "Not entered", complete[3]],
    ["Documents", 1, `${[certificate, packingList, receipt].filter(Boolean).length} of 3 attached`, Boolean(certificate && packingList && receipt)],
    ["Customs value", 4, choice?.value ? formatMoney(choice.value, ASSESSMENT_CURRENCY) : "Not chosen", complete[4]],
    ["Duties and taxes", REVIEW, finalised ? `${formatMoney(finalised.totalTax, ASSESSMENT_CURRENCY)} · finalised` : preview ? formatMoney(preview.totalTax, ASSESSMENT_CURRENCY) : "Calculated on review", Boolean(finalised)],
  ];

  const body: ReactNode[] = [
    <div key="tariff" className="ip-step-body">
      {tariff && !browsing ? <div className="ip-tariff-chosen">
        <span className="ip-tariff-chosen-icon" aria-hidden="true"><FiCheck /></span>
        <div><small>Tariff line</small><strong><HsItem code={tariffDisplayCode(tariff)} description={tariffLineTitle(tariff)} full /></strong><small>Section {tariff.sectionNumber} › Chapter {tariff.chapter} {tariff.chapterName} › Heading {tariff.heading}</small></div>
        <button type="button" className="iv-secondary" onClick={() => setBrowsing(true)}><FiEdit2 aria-hidden="true" />Change</button>
      </div> : <TariffBrowser className="ip-tariff-browser" initialQuery={product.productName} currentLineId={tariff?.tariffLineId} currentLabel="selected" autoFocus
        action={(item, taxes) => <button type="button" className="iv-primary oc-hs-choose" onClick={() => chooseTariff(item, taxes?.unit)}><FiCheck aria-hidden="true" />Use this tariff line</button>} />}
    </div>,
    <div key="origin" className="ip-step-body"><CountryPicker value={country} onChange={setCountry} /><PurposeFields value={purpose} onChange={setPurpose} />
      <DocumentDrop label="Certificate of origin" hint="Proves where the goods were made. PDF, JPG or PNG up to 8 MB." kind="CERTIFICATE_OF_ORIGIN" file={certificate} onChange={setCertificate} /></div>,
    <div key="product" className="ip-step-body"><ProductFields value={product} onChange={setProduct} purpose={purpose.purpose} chapterHint={tariff?.chapter} />
      <DocumentDrop label="Packing list" hint="Lists the packages, quantities and weights. PDF, JPG or PNG up to 8 MB." kind="PACKING_LIST" file={packingList} onChange={setPackingList} /></div>,
    <div key="value" className="ip-step-body"><ValueFields value={value} onChange={setValue} quantity={qty} unit={product.unit} payer="the customer" />
      <DocumentDrop label="Commercial invoice or receipt" hint="Shows the price the customer paid. PDF, JPG or PNG up to 8 MB." kind="COMMERCIAL_INVOICE" file={receipt} onChange={setReceipt} /></div>,
    <div key="evidence" className="ip-step-body">
      {evidenceInput && <ValuationEvidence key={`${evidenceInput.hsCode}-${evidenceInput.originCountryCode}-${evidenceInput.quantity}-${evidenceInput.declared?.amount}`} input={evidenceInput} onChange={setChoice} />}
      <label className="ip-field" htmlFor="vs-note">Valuation note {noteRequired ? <small className="vs-required">required — FOB is the standard basis</small> : <small>optional</small>}
        <textarea id="vs-note" rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder={noteRequired ? "e.g. Invoice is 40% below the copper exchange price; base market value applied." : "Optional note for the record"} /></label>
      {noteIssue && <small className="iv-field-error">{noteIssue}</small>}
    </div>,
    <div key="review" className="ip-step-body">
      {tariff && choice?.value ? <ValuationReview tariff={tariff} countryCode={country} countryName={countryName} purpose={purpose} product={product} value={value}
        documents={reviewDocuments}
        choice={choice} note={note} officerName={profile.user.fullName} officeName={officeName} searchQuery={searchQuery}
        photo={photo} onPhoto={setPhoto} onPreview={setPreview} onEdit={go} finalised={finalised} /> : <p className="oc-muted">Choose the customs value first.</p>}
    </div>,
  ];

  const last = step === steps.length - 1;
  return <section className="ip-page vs-page">
    <div className="vs-heading"><div><p className="eyebrow">Valuation search</p><h1>Value a shipment</h1><p className="lead">Describe the goods the way importers do, then compare FOB, live exchange and market prices to set the customs value.</p></div>
      <button type="button" className="iv-secondary" onClick={reset}><FiRotateCcw aria-hidden="true" />Start over</button></div>
    <FeedbackToast error={error} success="" onDismissError={() => setError("")} onDismissSuccess={() => {}} />
    <div className="ip-form-layout importer-form ip-wizard">
      <div className="ip-form-sections">
        <ol className="ip-steps" aria-label="Valuation steps">{steps.map((item, index) => {
          const state = index === step ? "is-current" : complete[index] && index <= visited ? "is-done" : "";
          return <li key={item.title} className={state}><button type="button" onClick={() => go(index)} disabled={index > visited && !complete.slice(0, index).every(Boolean)} aria-current={index === step ? "step" : undefined}>
            <span className="ip-steps-dot" aria-hidden="true">{complete[index] && index !== step && index <= visited ? <FiCheck /> : index + 1}</span><span>{item.title}</span></button></li>;
        })}</ol>
        <section className="ip-section" aria-labelledby="vs-step-title">
          <header><span className="ip-step" aria-hidden="true">{step + 1}</span><div><h2 id="vs-step-title">{steps[step].title}</h2><p>{steps[step].description}</p></div></header>
          {/* The evidence step stays mounted once opened, so going back does not repeat the price searches. */}
          <div className="ip-section-body">{step !== 4 && body[step]}{visited >= 4 && <div hidden={step !== 4}>{body[4]}</div>}</div>
          <footer className="ip-step-footer">
            <div>
              {step > 0 && !finalised ? <button type="button" className="iv-secondary" onClick={() => go(step - 1)}><FiArrowLeft aria-hidden="true" />Back</button> : <span />}
              {finalised ? <button type="button" className="iv-primary" onClick={reset}><FiRotateCcw aria-hidden="true" />Value another shipment</button>
                : last ? <button type="button" className="iv-primary" disabled={busy || !preview || preview.reviewRequired} onClick={() => void submit()}><FiCheckCircle aria-hidden="true" />{busy ? "Finalising…" : "Confirm and finalise"}</button>
                : <button type="button" className="iv-primary" onClick={next}>{step === 4 ? "Review" : "Continue"}<FiArrowRight aria-hidden="true" /></button>}
            </div>
          </footer>
        </section>
      </div>
      <aside className="ip-summary" aria-label="Valuation summary">
        <h2>Valuation summary</h2>
        <ul className="ip-checklist">{checklist.map(([label, index, text, done]) => <li key={label} className={done ? "is-done" : ""}><button type="button" className="ip-checklist-button" onClick={() => go(index)}>{done ? <FiCheck aria-hidden="true" /> : <FiCircle aria-hidden="true" />}<span><strong>{label}</strong><small>{text}</small></span></button></li>)}</ul>
        <p className="ip-summary-note"><FiInfo aria-hidden="true" /> FOB plus freight and insurance is the standard basis. Choosing any other value needs a short note. Nothing is saved until you confirm on the review step.</p>
      </aside>
    </div>
  </section>;
}
