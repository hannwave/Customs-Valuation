"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FiAlertTriangle, FiArrowLeft, FiArrowRight, FiCheck, FiCircle, FiEdit2, FiInfo, FiSend } from "react-icons/fi";
import { TariffBrowser, tariffDisplayCode, tariffLineTitle } from "@/components/tariff/TariffBrowser";
import { DocumentDrop } from "@/components/importer/declaration/DocumentDrop";
import { CountryPicker, ProductFields, PurposeFields, ValueFields, composeDescription, emptyProduct, productProblem, useCountryOptions, valueTotals, type ProductState, type PurposeState, type ValueState } from "@/components/importer/declaration/fields";
import { categoryForChapter, conditions, productCategories, unitForTariff } from "@/components/importer/declaration/options";
import { formatMoney, importerApi, purposeLabels, type ImporterDeclaration, type TariffOption } from "@/lib/importer";
import { HsItem } from "@/components/hs/HsItem";
import { toast } from "@/lib/toast";
import { parseSpecs } from "@/components/importer/declaration/productSpecs";

const STEP_TOAST = "declaration-step";

type Location = { id: string; displayName: string; officialCode: string; region: string };
const documentFields = [
  { name: "CommercialInvoice", kind: "COMMERCIAL_INVOICE", label: "Commercial invoice", hint: "Seller's invoice showing price, quantity and terms." },
  { name: "PackingList", kind: "PACKING_LIST", label: "Packing list", hint: "Packages, weights and contents of the shipment." },
  { name: "CertificateOfOrigin", kind: "CERTIFICATE_OF_ORIGIN", label: "Certificate of origin", hint: "Issued in the country where the goods were made." },
] as const;
const steps = [
  { title: "Tariff match", description: "Find the tariff line that describes your goods. The Customs Officer confirms the final classification." },
  { title: "Shipment & purpose", description: "Where the goods arrive, where they were made and how you will use them." },
  { title: "Product details", description: "Pick what fits your goods; the officer uses this to confirm classification and value." },
  { title: "Value of the goods", description: "What you paid the seller, as shown on the commercial invoice, and the invoice terms." },
  { title: "Trade documents", description: "Attach the three documents Customs needs, then submit for review." },
] as const;
const errorMessage = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

/** Reads back the structured parts this form writes into the declaration description. */
function parseDescription(description: string | undefined) {
  const text = description ?? "";
  const pick = (pattern: RegExp) => pattern.exec(text)?.[1]?.trim() ?? "";
  const structured = /Category: /.test(text);
  return {
    category: productCategories.find(item => item.label === pick(/Category: ([^.]+)\./))?.code ?? "",
    condition: conditions.find(item => item.label === pick(/Condition: ([^.]+)\./))?.code ?? "",
    incoterm: pick(/Invoice terms: ([A-Z]+)/),
    details: structured ? pick(/Details: ([\s\S]*)$/) : text,
    specs: pick(/Specs: ([\s\S]*?)\.(?= Details:|$)/),
  };
}

/** New or resubmitted declaration, one step at a time: tariff match, shipment, product, value and trade documents. */
export function DeclarationForm({ editing, onSaved }: { editing: ImporterDeclaration | null; onSaved: (saved: ImporterDeclaration) => void }) {
  const parsed = useMemo(() => parseDescription(editing?.description), [editing?.description]);
  const countryOptions = useCountryOptions();
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState(editing ? steps.length - 1 : 0);
  const [selectedHs, setSelectedHs] = useState(editing?.suggestedTariffLineId ?? "");
  const [selectedTariff, setSelectedTariff] = useState<TariffOption | null>(null);
  const [browsing, setBrowsing] = useState(!editing);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState(editing?.locationId ?? "");
  const [country, setCountry] = useState(editing?.originCountryCode ?? "");
  const [purpose, setPurpose] = useState<PurposeState>({ purpose: editing?.importPurpose ?? "", machinery: editing?.importPurpose === "MANUFACTURING" ? editing.isMachineryOrEquipment : null });
  const [product, setProduct] = useState<ProductState>(() => editing ? {
    category: parsed.category || (editing.suggestedTariffCode ? categoryForChapter(editing.suggestedTariffCode.replace(/[^0-9]/g, "").slice(0, 2)) : ""), condition: parsed.condition || "NEW", productName: editing.productName, branded: editing.isCommercialProduct,
    brand: editing.brand, model: editing.model, quantity: String(editing.quantity), unit: editing.unit || "pieces",
    manufacturer: editing.manufacturer, serial: editing.serialOrPartNumber, specifications: editing.specifications, details: parsed.details, attributes: parseSpecs(parsed.category, parsed.specs),
  } : emptyProduct());
  const [value, setValue] = useState<ValueState>(() => ({
    incoterm: parsed.incoterm || (editing && ((editing.freightAmount ?? 0) > 0 || (editing.insuranceAmount ?? 0) > 0) ? "FOB" : "CIF"),
    amount: editing?.invoiceAmount?.toString() ?? "", currency: editing?.invoiceCurrency || "USD",
    freight: editing?.freightAmount ? String(editing.freightAmount) : "", insurance: editing?.insuranceAmount ? String(editing.insuranceAmount) : "",
  }));
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { void importerApi<Location[]>("/importer-declarations/locations").then(setLocations).catch(reason => toast.error(errorMessage(reason, "Customs branches could not be loaded."), { title: "Branches unavailable" })); }, []);

  const countryName = countryOptions.find(item => item.code === country)?.name ?? country;
  const branch = locations.find(item => item.id === locationId);
  const totals = valueTotals(value);
  const qty = Number(product.quantity) || 0;
  const brandRequired = product.branded || purpose.purpose === "COMMERCIAL_RESALE";
  const tariffLabel = selectedTariff ? `${tariffLineTitle(selectedTariff)} · ${tariffDisplayCode(selectedTariff)}` : selectedHs ? [editing?.suggestedTariffDescription || "Selected tariff line", editing?.suggestedTariffCode].filter(Boolean).join(" · ") : "";
  const documentsDone = documentFields.filter(field => Boolean(files[field.name] || editing?.documents.some(document => document.kind === field.kind))).length;

  /** The first problem that stops a step from being complete, or an empty string. */
  const problemIn = (index: number): string => {
    if (index === 0) return selectedHs ? "" : "Choose the tariff line that describes your goods.";
    if (index === 1) {
      if (!locationId) return "Choose the customs branch where the goods arrive.";
      if (!country) return "Choose the country where the goods were made.";
      if (!purpose.purpose) return "Choose how you will use the goods.";
      if (purpose.purpose === "MANUFACTURING" && purpose.machinery === null) return "Tell us whether these are machines or production inputs.";
      return "";
    }
    if (index === 2) return productProblem(product, purpose.purpose);
    if (index === 3) {
      if (!(totals.paid > 0)) return "Enter the price you paid for the shipment.";
      if (totals.freight < 0 || totals.insurance < 0) return "Freight and insurance cannot be negative.";
      return "";
    }
    return documentsDone === documentFields.length ? "" : `Attach all three documents (${documentsDone} of 3 attached).`;
  };
  const complete = steps.map((_, index) => !problemIn(index));

  function go(index: number) { toast.dismiss(STEP_TOAST, false); setStep(index); setVisited(current => Math.max(current, index)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function flagStep(index: number) { toast.warning(problemIn(index), { key: STEP_TOAST, title: `Finish “${steps[index].title}” first` }); }
  function next() { if (problemIn(step)) { flagStep(step); return; } go(step + 1); }

  function chooseTariff(item: TariffOption, tariffUnit: string | undefined) {
    setSelectedHs(item.tariffLineId); setSelectedTariff(item); setBrowsing(false); toast.dismiss(STEP_TOAST, false);
    setProduct(current => {
      const suggested = categoryForChapter(item.chapter);
      return {
        ...current,
        ...(current.category ? {} : { category: suggested, branded: productCategories.find(entry => entry.code === suggested)?.branded ?? false }),
        ...(current.productName.trim() ? {} : { productName: tariffLineTitle(item).slice(0, 120) }),
        ...(!editing && tariffUnit ? { unit: unitForTariff(tariffUnit) } : {}),
      };
    });
  }

  async function submit() {
    const firstProblem = complete.findIndex(done => !done);
    if (firstProblem >= 0) { go(firstProblem); flagStep(firstProblem); return; }
    const form = new FormData();
    const fields: Record<string, string> = {
      SuggestedTariffLineId: selectedHs, OriginCountryCode: country, ImportPurpose: purpose.purpose, LocationId: locationId,
      IsCommercialProduct: String(brandRequired), IsMachineryOrEquipment: String(purpose.purpose === "MANUFACTURING" && purpose.machinery === true),
      ProductName: product.productName.trim(), Description: composeDescription(product, totals.terms.code), Brand: product.brand.trim(), Model: product.model.trim(),
      Manufacturer: product.manufacturer.trim(), SerialOrPartNumber: product.serial.trim(), Specifications: product.specifications.trim(),
      Quantity: String(qty), Unit: product.unit, InvoiceAmount: String(totals.paid), InvoiceCurrency: value.currency,
    };
    for (const [key, entry] of Object.entries(fields)) if (entry !== "") form.set(key, entry);
    if (totals.freight > 0) form.set("FreightAmount", String(totals.freight));
    if (totals.insurance > 0) form.set("InsuranceAmount", String(totals.insurance));
    if (editing) form.set("ExpectedVersion", editing.version);
    for (const field of documentFields) { const file = files[field.name]; if (file) form.set(field.name, file); }
    setBusy(true);
    try { onSaved(await importerApi<ImporterDeclaration>(editing ? `/importer-declarations/${editing.id}` : "/importer-declarations", { method: editing ? "PUT" : "POST", body: form })); }
    catch (reason) { toast.error(errorMessage(reason, "The declaration could not be submitted."), { title: "Declaration not submitted" }); }
    finally { setBusy(false); }
  }

  const checklist: [string, number, string, boolean][] = [
    ["Tariff match", 0, tariffLabel || "Not selected", complete[0]],
    ["Shipment", 1, [branch ? branch.displayName || branch.officialCode : "", country ? countryName : ""].filter(Boolean).join(" · ") || "Not selected", Boolean(locationId && country)],
    ["Purpose", 1, purpose.purpose ? `${purposeLabels[purpose.purpose]}${purpose.purpose === "MANUFACTURING" && purpose.machinery !== null ? purpose.machinery ? " · machinery" : " · inputs" : ""}` : "Not selected", Boolean(purpose.purpose)],
    ["Product", 2, product.productName.trim() ? `${product.productName.trim()}${qty > 0 ? ` · ${qty.toLocaleString()} ${product.unit}` : ""}` : "Not described", complete[2]],
    ["Price paid", 3, totals.paid > 0 ? `${formatMoney(totals.paid, value.currency)} ${totals.terms.code}` : "Not entered", complete[3]],
    ["Documents", 4, `${documentsDone} of ${documentFields.length} attached`, complete[4]],
  ];

  const body: ReactNode[] = [
    <div key="tariff" className="ip-step-body">
      {selectedHs && !browsing ? <div className="ip-tariff-chosen">
        <span className="ip-tariff-chosen-icon" aria-hidden="true"><FiCheck /></span>
        <div><small>Your tariff choice</small><strong><HsItem code={selectedTariff ? tariffDisplayCode(selectedTariff) : editing?.suggestedTariffCode} description={selectedTariff ? tariffLineTitle(selectedTariff) : editing?.suggestedTariffDescription} empty="Saved choice" full /></strong>
          {selectedTariff && <small>Section {selectedTariff.sectionNumber} › Chapter {selectedTariff.chapter} {selectedTariff.chapterName} › Heading {selectedTariff.heading}</small>}</div>
        <button type="button" className="iv-secondary" onClick={() => setBrowsing(true)}><FiEdit2 aria-hidden="true" />Change</button>
      </div> : <TariffBrowser className="ip-tariff-browser" initialQuery={product.productName} currentLineId={selectedHs} currentLabel="your choice" autoFocus={!editing}
        action={(item, taxes) => <button type="button" className="iv-primary oc-hs-choose" onClick={() => chooseTariff(item, taxes?.unit)}><FiCheck aria-hidden="true" />{item.tariffLineId === selectedHs ? "Keep this tariff line" : "Use this tariff line"}</button>} />}
      <p className="ip-hint"><FiInfo aria-hidden="true" />Not sure? Pick the closest line. Rates shown are the published ERCA rates; the officer confirms the classification and any exemption.</p>
    </div>,
    <div key="shipment" className="ip-step-body">
      <div className="importer-two">
        <label className="ip-field">Receiving customs branch<select value={locationId} onChange={e => setLocationId(e.target.value)}><option value="">Choose a branch</option>{locations.map(location => <option key={location.id} value={location.id}>{location.displayName || location.officialCode} · {location.region}</option>)}</select></label>
        <CountryPicker value={country} onChange={setCountry} />
      </div>
      <PurposeFields value={purpose} onChange={setPurpose} />
    </div>,
    <div key="product" className="ip-step-body"><ProductFields value={product} onChange={setProduct} purpose={purpose.purpose} chapterHint={selectedTariff?.chapter} /></div>,
    <div key="value" className="ip-step-body"><ValueFields value={value} onChange={setValue} quantity={qty} unit={product.unit} /></div>,
    <div key="documents" className="ip-step-body">
      <div className="ip-doc-progress"><span style={{ width: `${documentsDone / documentFields.length * 100}%` }} /></div>
      <div className="ip-drops">{documentFields.map(field => {
        const saved = editing?.documents.find(document => document.kind === field.kind);
        return <DocumentDrop key={field.kind} label={field.label} hint={field.hint} kind={field.kind} file={files[field.name] ?? null} saved={saved} declarationId={editing?.id}
          onChange={file => setFiles(previous => ({ ...previous, [field.name]: file }))} />;
      })}</div>
    </div>,
  ];

  const last = step === steps.length - 1;
  return <div className="ip-form-layout importer-form ip-wizard">
    <div className="ip-form-sections">
      {editing?.reviewNote && <div className="ip-banner is-warning"><FiAlertTriangle aria-hidden="true" /><div><strong>Officer request for {editing.reference}</strong><p>{editing.reviewNote}</p></div></div>}
      <ol className="ip-steps" aria-label="Declaration steps">{steps.map((item, index) => {
        const state = index === step ? "is-current" : complete[index] && index <= visited ? "is-done" : "";
        return <li key={item.title} className={state}><button type="button" onClick={() => go(index)} disabled={index > visited && !complete.slice(0, index).every(Boolean)} aria-current={index === step ? "step" : undefined}>
          <span className="ip-steps-dot" aria-hidden="true">{complete[index] && index !== step && index <= visited ? <FiCheck /> : index + 1}</span><span>{item.title}</span></button></li>;
      })}</ol>
      <section className="ip-section" aria-labelledby="ip-step-title">
        <header><span className="ip-step" aria-hidden="true">{step + 1}</span><div><h2 id="ip-step-title">{steps[step].title}</h2><p>{steps[step].description}</p></div></header>
        <div className="ip-section-body">{body[step]}</div>
        <footer className="ip-step-footer">
          <div>
            {step > 0 ? <button type="button" className="iv-secondary" onClick={() => go(step - 1)}><FiArrowLeft aria-hidden="true" />Back</button> : <span />}
            {last ? <button type="button" className="iv-primary" disabled={busy} onClick={() => void submit()}><FiSend aria-hidden="true" />{busy ? "Saving…" : editing?.status === "SUBMITTED" ? "Save changes" : editing ? "Resubmit to officer" : "Submit for officer review"}</button>
              : <button type="button" className="iv-primary" onClick={next}>Continue<FiArrowRight aria-hidden="true" /></button>}
          </div>
        </footer>
      </section>
    </div>

    <aside className="ip-summary" aria-label="Declaration summary">
      <h2>{editing ? `${editing.status === "SUBMITTED" ? "Edit" : "Update"} ${editing.reference}` : "Declaration summary"}</h2>
      <ul className="ip-checklist">{checklist.map(([label, index, text, done]) => <li key={label} className={done ? "is-done" : ""}><button type="button" className="ip-checklist-button" onClick={() => go(index)}>{done ? <FiCheck aria-hidden="true" /> : <FiCircle aria-hidden="true" />}<span><strong>{label}</strong><small>{text}</small></span></button></li>)}</ul>
      <p className="ip-summary-note">A Customs Officer reviews your declaration first. Final HS classification, exemptions, valuation and tax assessment happen only after that review.</p>
    </aside>
  </div>;
}
