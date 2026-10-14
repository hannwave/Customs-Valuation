"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { FiAlertTriangle, FiCheck, FiChevronDown, FiCircle, FiSearch, FiSend, FiUploadCloud, FiX } from "react-icons/fi";
import { countries } from "country-flag-icons";
import * as Flags from "country-flag-icons/react/3x2";
import { ImporterDocumentPreview } from "@/components/ImporterDocumentPreview";
import { compareCountries, preferredCountryCodes } from "@/lib/country-order";
import { formatMoney, importerApi, invoiceCurrencies, purposeLabels, type CatalogOption, type ImporterDeclaration, type TariffOption } from "@/lib/importer";

type Location = { id: string; displayName: string; officialCode: string; region: string };
const documentFields = [
  { name: "CommercialInvoice", kind: "COMMERCIAL_INVOICE", label: "Commercial invoice", hint: "Seller's invoice showing price, quantity and terms." },
  { name: "PackingList", kind: "PACKING_LIST", label: "Packing list", hint: "Packages, weights and contents of the shipment." },
  { name: "CertificateOfOrigin", kind: "CERTIFICATE_OF_ORIGIN", label: "Certificate of origin", hint: "Issued in the country where the goods were made." },
] as const;
const treatments = [
  ["WITHHOLDING_REVIEW", "Withholding tax review"], ["VAT_EXEMPTION", "VAT exemption review"],
  ["CUSTOMS_DUTY_EXEMPTION", "Customs duty exemption review"], ["MACHINERY_EXEMPTION", "Machinery or equipment exemption review"],
] as const;
const errorMessage = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

function CountryFlag({ code }: { code: string }) {
  const Icon = Flags[code as keyof typeof Flags];
  return Icon ? <Icon aria-hidden="true" className="importer-country-flag" /> : null;
}

function Section({ number, title, description, done, children }: { number: number; title: string; description: string; done: boolean; children: ReactNode }) {
  return <section className="ip-section" aria-labelledby={`ip-section-${number}`}>
    <header><span className={`ip-step${done ? " is-done" : ""}`} aria-hidden="true">{done ? <FiCheck /> : number}</span>
      <div><h2 id={`ip-section-${number}`}>{title}</h2><p>{description}</p></div></header>
    <div className="ip-section-body">{children}</div>
  </section>;
}

/** New or resubmitted declaration: tariff match, shipment, product and trade documents. */
export function DeclarationForm({ editing, onSaved }: { editing: ImporterDeclaration | null; onSaved: (saved: ImporterDeclaration) => void }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [section, setSection] = useState(""); const [chapter, setChapter] = useState(""); const [heading, setHeading] = useState("");
  const [catalogQuery, setCatalogQuery] = useState(""); const [selectedHs, setSelectedHs] = useState(editing?.suggestedTariffLineId ?? "");
  const [selectedTariff, setSelectedTariff] = useState<TariffOption | null>(null);
  const [sections, setSections] = useState<CatalogOption[]>([]); const [chapters, setChapters] = useState<CatalogOption[]>([]);
  const [headings, setHeadings] = useState<CatalogOption[]>([]); const [tariffs, setTariffs] = useState<TariffOption[]>([]);
  const [searchMatches, setSearchMatches] = useState<TariffOption[]>([]); const [searchTotal, setSearchTotal] = useState(0);
  const [tariffTotal, setTariffTotal] = useState(0); const [catalogLoading, setCatalogLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false); const [catalogError, setCatalogError] = useState(""); const [catalogRetry, setCatalogRetry] = useState(0);
  const [countrySearch, setCountrySearch] = useState(""); const [country, setCountry] = useState(editing?.originCountryCode ?? ""); const [countryOpen, setCountryOpen] = useState(false);
  const [locationId, setLocationId] = useState(editing?.locationId ?? "");
  const [purpose, setPurpose] = useState(editing?.importPurpose ?? ""); const [commercial, setCommercial] = useState(editing?.isCommercialProduct ?? false);
  const [productName, setProductName] = useState(editing?.productName ?? "");
  const [invoiceAmount, setInvoiceAmount] = useState(editing?.invoiceAmount?.toString() ?? "");
  const [invoiceCurrency, setInvoiceCurrency] = useState(editing?.invoiceCurrency || "USD");
  const [freight, setFreight] = useState(editing?.freightAmount?.toString() ?? "");
  const [insurance, setInsurance] = useState(editing?.insuranceAmount?.toString() ?? "");
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  const countryOptions = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return countries.filter(code => /^[A-Z]{2}$/.test(code)).map(code => ({ code, name: code === "XK" ? "Kosovo" : names.of(code) ?? code }))
      .filter(item => item.name !== item.code).sort(compareCountries);
  }, []);

  useEffect(() => { void importerApi<Location[]>("/importer-declarations/locations").then(setLocations).catch(reason => setError(errorMessage(reason, "Customs branches could not be loaded."))); }, []);
  useEffect(() => {
    setCatalogLoading(true); setCatalogError("");
    void importerApi<CatalogOption[]>("/importer-declarations/catalog?stage=sections").then(setSections)
      .catch(reason => setCatalogError(errorMessage(reason, "Tariff book unavailable."))).finally(() => setCatalogLoading(false));
  }, [catalogRetry]);
  useEffect(() => {
    if (!section) { setChapters([]); return; }
    let current = true;
    void importerApi<CatalogOption[]>(`/importer-declarations/catalog?${new URLSearchParams({ stage: "chapters", section })}`)
      .then(rows => { if (current) setChapters(rows); }).catch(reason => { if (current) setCatalogError(errorMessage(reason, "Chapters could not be loaded.")); });
    return () => { current = false; };
  }, [section, catalogRetry]);
  useEffect(() => {
    if (!chapter) { setHeadings([]); return; }
    let current = true;
    void importerApi<CatalogOption[]>(`/importer-declarations/catalog?${new URLSearchParams({ stage: "headings", section, chapter })}`)
      .then(rows => { if (current) setHeadings(rows); }).catch(reason => { if (current) setCatalogError(errorMessage(reason, "Tariff headings could not be loaded.")); });
    return () => { current = false; };
  }, [section, chapter, catalogRetry]);
  useEffect(() => {
    if (!heading) { setTariffs([]); setTariffTotal(0); return; }
    let current = true;
    void importerApi<{ total: number; items: TariffOption[] }>(`/importer-declarations/catalog?${new URLSearchParams({ stage: "tariffs", section, chapter, heading })}`)
      .then(result => { if (current) { setTariffs(result.items); setTariffTotal(result.total); } })
      .catch(reason => { if (current) setCatalogError(errorMessage(reason, "Tariff descriptions could not be loaded.")); });
    return () => { current = false; };
  }, [section, chapter, heading, catalogRetry]);
  useEffect(() => {
    const term = catalogQuery.trim();
    if (term.length < 2) { setSearchMatches([]); setSearchTotal(0); setSearchLoading(false); return; }
    let current = true;
    setSearchLoading(true); setCatalogError("");
    const timer = window.setTimeout(() => {
      void importerApi<{ total: number; items: TariffOption[] }>(`/importer-declarations/catalog?${new URLSearchParams({ stage: "search", q: term })}`)
        .then(result => { if (current) { setSearchMatches(result.items); setSearchTotal(result.total); } })
        .catch(reason => { if (current) setCatalogError(errorMessage(reason, "Tariff search failed.")); })
        .finally(() => { if (current) setSearchLoading(false); });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [catalogQuery, catalogRetry]);

  const matchingCountries = countryOptions.filter(item => `${item.name} ${item.code}`.toLowerCase().includes(countrySearch.toLowerCase()));
  const frequentCountries = matchingCountries.filter(item => preferredCountryCodes.some(code => code === item.code));
  const otherCountries = matchingCountries.filter(item => !preferredCountryCodes.some(code => code === item.code));
  const chooseCountry = useCallback((code: string) => { setCountry(code); setCountryOpen(false); setCountrySearch(""); }, []);
  const documentReady = (kind: string, name: string) => Boolean(selectedFiles[name] || editing?.documents.some(document => document.kind === kind));
  const documentsDone = documentFields.filter(field => documentReady(field.kind, field.name)).length;
  const tariffLabel = selectedTariff ? `${selectedTariff.tariffItemNo || selectedTariff.hsCode} · ${selectedTariff.description}` : selectedHs ? editing?.suggestedTariffDescription || "Selected tariff line" : "";
  const countryName = countryOptions.find(item => item.code === country)?.name ?? country;
  const branch = locations.find(item => item.id === locationId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!selectedHs) { setError("Select a provisional tariff description in step 1."); return; }
    if (!country) { setError("Select the country of origin in step 2."); return; }
    if (!(Number(invoiceAmount) > 0)) { setError("Enter the price you paid in step 4."); return; }
    const form = new FormData(event.currentTarget);
    form.set("SuggestedTariffLineId", selectedHs); form.set("OriginCountryCode", country); form.set("ImportPurpose", purpose); form.set("LocationId", locationId);
    form.set("IsCommercialProduct", String(commercial));
    form.set("InvoiceAmount", invoiceAmount); form.set("InvoiceCurrency", invoiceCurrency);
    if (freight.trim()) form.set("FreightAmount", freight); else form.delete("FreightAmount");
    if (insurance.trim()) form.set("InsuranceAmount", insurance); else form.delete("InsuranceAmount");
    form.set("IsMachineryOrEquipment", String(form.has("machinery"))); form.delete("machinery");
    if (editing) form.set("ExpectedVersion", editing.version);
    for (const field of documentFields) { const file = form.get(field.name); if (file instanceof File && file.size === 0) form.delete(field.name); }
    setBusy(true);
    try { onSaved(await importerApi<ImporterDeclaration>(editing ? `/importer-declarations/${editing.id}` : "/importer-declarations", { method: editing ? "PUT" : "POST", body: form })); }
    catch (reason) { setError(errorMessage(reason, "The declaration could not be submitted.")); }
    finally { setBusy(false); }
  }

  function tariffResults(items: TariffOption[]) {
    return <div className="importer-tariff-results">{items.map(item => <button key={item.tariffLineId} type="button"
      className={`importer-tariff-result${selectedHs === item.tariffLineId ? " is-selected" : ""}`} aria-pressed={selectedHs === item.tariffLineId}
      onClick={() => { setSelectedHs(item.tariffLineId); setSelectedTariff(item); }}>
      <span className="importer-tariff-path">Section {item.sectionNumber} · Chapter {item.chapter} · Heading {item.heading}</span>
      <strong>{item.description.toLowerCase() === "other" && item.hsDescription ? item.hsDescription : item.description}</strong>
      {item.hsDescription && item.hsDescription !== item.description && <small>{item.description.toLowerCase() === "other" ? "Tariff description: Other" : item.hsDescription}</small>}
      <span className="importer-tariff-code">Probable HS {item.tariffItemNo || item.hsCode}</span>
    </button>)}</div>;
  }

  const paid = Number(invoiceAmount) || 0;
  const extras = (Number(freight) || 0) + (Number(insurance) || 0);
  const checklist: [string, boolean, string][] = [
    ["Tariff match", Boolean(selectedHs), tariffLabel || "Not selected"],
    ["Customs branch", Boolean(locationId), branch ? `${branch.displayName || branch.officialCode}` : "Not selected"],
    ["Country of origin", Boolean(country), country ? countryName : "Not selected"],
    ["Import purpose", Boolean(purpose), purpose ? purposeLabels[purpose] : "Not selected"],
    ["Product", productName.trim().length >= 2, productName.trim() || "Not described"],
    ["Price paid", paid > 0, paid > 0 ? `${formatMoney(paid, invoiceCurrency)}${extras > 0 ? ` + ${formatMoney(extras, invoiceCurrency)} freight & insurance` : ""}` : "Not entered"],
    ["Documents", documentsDone === documentFields.length, `${documentsDone} of ${documentFields.length} attached`],
  ];
  const complete = checklist.every(([, done]) => done);

  return <form className="ip-form-layout importer-form" onSubmit={submit} noValidate={false}>
    <div className="ip-form-sections">
      {editing?.reviewNote && <div className="ip-banner is-warning"><FiAlertTriangle aria-hidden="true" /><div><strong>Officer request for {editing.reference}</strong><p>{editing.reviewNote}</p></div></div>}

      <Section number={1} title="Provisional tariff match" description="Search the tariff book by item name, material or code, or browse it. The Customs Officer confirms the final classification." done={Boolean(selectedHs)}>
        <div className="importer-universal-search"><FiSearch aria-hidden="true" /><input aria-label="Search the whole tariff book" value={catalogQuery} onChange={e => { setCatalogError(""); setCatalogQuery(e.target.value); }} maxLength={100} placeholder="e.g. mobile phone, cotton shirt or 8517" />{catalogQuery && <button type="button" aria-label="Clear tariff search" onClick={() => setCatalogQuery("")}><FiX /></button>}</div>
        {catalogError && <p className="iv-error" role="alert">{catalogError} <button type="button" className="ip-link-button" onClick={() => { setCatalogError(""); setCatalogRetry(value => value + 1); }}>Retry</button></p>}
        {catalogQuery.trim().length >= 2 ? <div className="importer-catalog-panel" aria-live="polite"><div className="importer-catalog-heading"><strong>Search results</strong><span>{searchLoading ? "Searching…" : `${searchTotal} matching descriptions`}</span></div>{!searchLoading && (searchMatches.length ? tariffResults(searchMatches) : <p>No matches. Try a broader item name or material.</p>)}{searchTotal > searchMatches.length && <small>Showing the first {searchMatches.length}. Add detail to narrow the search.</small>}</div>
          : <div className="importer-catalog-panel"><div className="importer-catalog-heading"><strong>Browse the tariff book</strong><span>{catalogLoading ? "Loading sections…" : `${sections.length} sections`}</span></div>
            <div className="importer-browse-row"><label>Section<select value={section} onChange={e => { setSection(e.target.value); setChapter(""); setHeading(""); setChapters([]); setHeadings([]); setTariffs([]); }}><option value="">Choose a section</option>{sections.map(x => <option key={x.code} value={x.code}>{x.code} · {x.name} ({x.count})</option>)}</select></label>
              <label>Chapter<select value={chapter} onChange={e => { setChapter(e.target.value); setHeading(""); setHeadings([]); setTariffs([]); }} disabled={!section}><option value="">Choose a chapter</option>{chapters.map(x => <option key={x.code} value={x.code}>{x.code} · {x.name} ({x.count})</option>)}</select></label>
              <label>Heading<select value={heading} onChange={e => { setHeading(e.target.value); setTariffs([]); }} disabled={!chapter}><option value="">Choose a heading</option>{headings.map(x => <option key={x.code} value={x.code}>{x.name} ({x.count})</option>)}</select></label></div>
            {heading ? <><div className="importer-catalog-heading"><strong>Tariff descriptions</strong><span>{tariffTotal} items</span></div>{tariffs.length ? tariffResults(tariffs) : <p>Loading descriptions…</p>}</> : <p>Choose a section, chapter and heading to see tariff descriptions.</p>}
          </div>}
        {selectedHs && <p className="ip-selected"><FiCheck aria-hidden="true" /><span><strong>Provisional match:</strong> {tariffLabel}</span></p>}
      </Section>

      <Section number={2} title="Shipment and purpose" description="Where the goods arrive, where they were made and how you will use them." done={Boolean(locationId && country && purpose)}>
        <div className="importer-two">
          <label>Receiving customs branch<select value={locationId} onChange={e => setLocationId(e.target.value)} required><option value="">Choose a branch</option>{locations.map(location => <option key={location.id} value={location.id}>{location.displayName || location.officialCode} · {location.region}</option>)}</select></label>
          <div className="importer-country-picker" onKeyDown={event => { if (event.key === "Escape") setCountryOpen(false); }}><span className="importer-field-label">Country of origin</span>
            <button type="button" className="importer-country-trigger" aria-expanded={countryOpen} onClick={() => setCountryOpen(value => !value)}>{country ? <CountryFlag code={country} /> : <span className="importer-flag-placeholder" aria-hidden="true" />}<span>{country ? countryName : "Choose country of origin"}</span><FiChevronDown aria-hidden="true" /></button>
            {countryOpen && <div className="importer-country-menu"><input autoFocus value={countrySearch} onChange={event => setCountrySearch(event.target.value)} aria-label="Search countries" placeholder="Search any country" />
              <div className="importer-country-options">{frequentCountries.length > 0 && <><strong className="importer-country-group">Frequent import markets</strong>{frequentCountries.map(item => <button key={item.code} type="button" aria-pressed={country === item.code} onClick={() => chooseCountry(item.code)}><CountryFlag code={item.code} />{item.name}</button>)}</>}
                {otherCountries.length > 0 && <><strong className="importer-country-group">Other countries</strong>{otherCountries.map(item => <button key={item.code} type="button" aria-pressed={country === item.code} onClick={() => chooseCountry(item.code)}><CountryFlag code={item.code} />{item.name}</button>)}</>}
                {matchingCountries.length === 0 && <p>No matching country found.</p>}</div></div>}
          </div>
        </div>
        <label>Import purpose<select value={purpose} onChange={e => { setPurpose(e.target.value); if (e.target.value === "COMMERCIAL_RESALE") setCommercial(true); }} required><option value="">Choose purpose</option>{Object.entries(purposeLabels).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        <label>Purpose details<textarea name="PurposeDetails" maxLength={1000} rows={2} defaultValue={editing?.purposeDetails ?? ""} placeholder="Explain how this item will be used" /></label>
        {purpose === "MANUFACTURING" && <div className="importer-treatments"><p>Possible special treatment for officer review</p><label><input type="checkbox" name="machinery" defaultChecked={editing?.isMachineryOrEquipment} /> Machinery or manufacturing equipment</label>{treatments.map(([code, label]) => <label key={code}><input type="checkbox" name="RequestedTreatments" value={code} defaultChecked={editing?.requestedTreatments.includes(code)} /> {label}</label>)}<small>These are requests for review. Selecting them does not grant an exemption.</small></div>}
      </Section>

      <Section number={3} title="Product identification" description="Describe the goods precisely so the officer can confirm classification and value." done={productName.trim().length >= 2}>
        <label className="importer-check"><input type="checkbox" checked={commercial} onChange={e => setCommercial(e.target.checked)} /> Commercial / commodity product (brand and model required)</label>
        <div className="importer-two"><label>Product name<input name="ProductName" required minLength={2} maxLength={300} value={productName} onChange={e => setProductName(e.target.value)} /></label>
          <div className="importer-two ip-qty"><label>Quantity<input name="Quantity" type="number" min="0.0001" step="any" required defaultValue={editing?.quantity ?? ""} /></label><label>Unit<input name="Unit" required maxLength={40} defaultValue={editing?.unit ?? ""} placeholder="pieces, kg…" /></label></div></div>
        <div className="importer-two"><label>Brand{commercial && " *"}<input name="Brand" required={commercial} maxLength={120} defaultValue={editing?.brand ?? ""} /></label><label>Model{commercial && " *"}<input name="Model" required={commercial} maxLength={120} defaultValue={editing?.model ?? ""} /></label></div>
        <label>Detailed description<textarea name="Description" required minLength={20} maxLength={4000} rows={4} defaultValue={editing?.description ?? ""} placeholder="Materials, features, intended use and distinguishing details (at least 20 characters)" /></label>
        <div className="importer-two"><label>Manufacturer<input name="Manufacturer" maxLength={200} defaultValue={editing?.manufacturer ?? ""} /></label><label>Serial / part number<input name="SerialOrPartNumber" maxLength={200} defaultValue={editing?.serialOrPartNumber ?? ""} /></label></div>
        <label>Specifications<textarea name="Specifications" maxLength={2000} rows={2} defaultValue={editing?.specifications ?? ""} /></label>
      </Section>

      <Section number={4} title="Value of the goods" description="What you paid the seller for this shipment, as shown on the commercial invoice. Customs compares it with market prices to set the customs value." done={paid > 0}>
        <div className="importer-two">
          <label>Price paid for the shipment *<div className="ip-money-input"><input type="number" min="0.01" step="0.01" inputMode="decimal" required value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} placeholder="e.g. 1250.00" aria-describedby="ip-price-hint" />
            <select aria-label="Invoice currency" value={invoiceCurrency} onChange={e => setInvoiceCurrency(e.target.value)}>{invoiceCurrencies.map(code => <option key={code}>{code}</option>)}</select></div></label>
          <div className="importer-two"><label>Freight<input type="number" min="0" step="0.01" inputMode="decimal" value={freight} onChange={e => setFreight(e.target.value)} placeholder="0.00" /></label>
            <label>Insurance<input type="number" min="0" step="0.01" inputMode="decimal" value={insurance} onChange={e => setInsurance(e.target.value)} placeholder="0.00" /></label></div>
        </div>
        <small id="ip-price-hint" className="ip-field-hint">Enter the total for every unit on the invoice, not the price of one unit. Add freight and insurance (in {invoiceCurrency}) only when they are not already included in the price.</small>
        {paid > 0 && <p className="ip-selected"><FiCheck aria-hidden="true" /><span><strong>Declared value:</strong> {formatMoney(paid + extras, invoiceCurrency)}{extras > 0 ? " including freight and insurance" : ""}</span></p>}
      </Section>

      <Section number={5} title="Trade documents" description="PDF, JPG or PNG, up to 10 MB each. All three are required." done={documentsDone === documentFields.length}>
        <div className="iv-docs">{documentFields.map(field => {
          const saved = editing?.documents.find(document => document.kind === field.kind); const selected = selectedFiles[field.name];
          return <div key={field.kind} className="ip-upload-row">
            <label className={`iv-upload${selected || saved ? " has-file" : ""}`}>
              <span className="iv-upload-icon">{selected || saved ? <FiCheck /> : <FiUploadCloud />}</span>
              <span className="iv-upload-text"><strong>{field.label}<b> *</b></strong><small>{selected ? selected.name : saved ? `Uploaded: ${saved.fileName}. Choose a file to replace it.` : field.hint}</small></span>
              <span className="iv-upload-action">{selected || saved ? "Replace" : "Choose file"}</span>
              <input name={field.name} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required={!saved} onChange={e => setSelectedFiles(previous => ({ ...previous, [field.name]: e.target.files?.[0] ?? null }))} />
            </label>
            {saved && editing && !selected && <ImporterDocumentPreview declarationId={editing.id} kind={field.kind} label={field.label} contentType={saved.contentType} fileName={saved.fileName} />}
          </div>;
        })}</div>
      </Section>
    </div>

    <aside className="ip-summary" aria-label="Declaration summary">
      <h2>{editing ? `Update ${editing.reference}` : "Declaration summary"}</h2>
      <ul className="ip-checklist">{checklist.map(([label, done, value]) => <li key={label} className={done ? "is-done" : ""}>{done ? <FiCheck aria-hidden="true" /> : <FiCircle aria-hidden="true" />}<span><strong>{label}</strong><small>{value}</small></span></li>)}</ul>
      <p className="ip-summary-note">A Customs Officer reviews your declaration first. Final HS classification, exemptions, valuation and tax assessment happen only after that review.</p>
      {error && <p className="iv-error" role="alert">{error}</p>}
      <button type="submit" className="iv-primary ip-submit" disabled={busy}><FiSend aria-hidden="true" />{busy ? "Submitting…" : editing ? "Resubmit to officer" : "Submit for officer review"}</button>
      {!complete && <small className="ip-summary-hint">Complete each item above before submitting.</small>}
    </aside>
  </form>;
}
