"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FiChevronDown, FiSearch, FiX } from "react-icons/fi";
import { countries } from "country-flag-icons";
import * as Flags from "country-flag-icons/react/3x2";
import { Brand } from "@/components/Brand";
import { FeedbackToast } from "@/components/FeedbackToast";
import { ImporterDocumentPreview } from "@/components/ImporterDocumentPreview";
import { getSessionAccessToken, setSessionAccessToken } from "@/lib/auth/session";
import { importerApi, importerApiBase, type CatalogOption, type ImporterDeclaration, type TariffOption } from "@/lib/importer";

type Location = { id: string; displayName: string; officialCode: string; region: string };
type Summary = Pick<ImporterDeclaration, "id" | "reference" | "status" | "productName" | "submittedAt" | "version">;
const documentFields = [
  { name: "CommercialInvoice", kind: "COMMERCIAL_INVOICE", label: "Commercial Invoice" },
  { name: "PackingList", kind: "PACKING_LIST", label: "Packing List" },
  { name: "CertificateOfOrigin", kind: "CERTIFICATE_OF_ORIGIN", label: "Certificate of Origin" },
] as const;
const treatments = [
  ["WITHHOLDING_REVIEW", "Withholding tax review"], ["VAT_EXEMPTION", "VAT exemption review"],
  ["CUSTOMS_DUTY_EXEMPTION", "Customs duty exemption review"], ["MACHINERY_EXEMPTION", "Machinery or equipment exemption review"],
] as const;
const purposeLabels: Record<string, string> = { MANUFACTURING: "Manufacturing / production", COMMERCIAL_RESALE: "Commercial resale", PERSONAL: "Personal use", INSTITUTIONAL: "Institutional use", OTHER: "Other" };
const preferredCountries = ["CN", "IN", "TR", "AE", "SA", "QA", "OM", "KW", "BH", "JO", "EG", "IQ", "LB", "IL", "IR", "YE"];
function CountryFlag({ code }: { code: string }) {
  const Icon = Flags[code as keyof typeof Flags];
  return Icon ? <Icon aria-hidden="true" className="importer-country-flag" /> : null;
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

function ShipmentTimingNote() {
  return <aside className="importer-shipment-timing" aria-label="Shipment timing">
    <strong>Shipment timing</strong>
    <p>Average shipment time is about 7 days; allow up to 10–15 days.</p>
    <small>Use this as a planning estimate; actual timing may vary.</small>
  </aside>;
}

function SelectedFilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const next = URL.createObjectURL(file); setUrl(next); return () => URL.revokeObjectURL(next); }, [file]);
  return url ? <a href={url} target="_blank" rel="noreferrer">Preview selected file</a> : null;
}

export default function ImporterPage() {
  const [hasToken, setHasToken] = useState(false);
  const [account, setAccount] = useState<{ role: string; fullName: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [editing, setEditing] = useState<ImporterDeclaration | null>(null);
  const [section, setSection] = useState(""); const [chapter, setChapter] = useState(""); const [heading, setHeading] = useState("");
  const [catalogQuery, setCatalogQuery] = useState(""); const [selectedHs, setSelectedHs] = useState("");
  const [selectedTariff, setSelectedTariff] = useState<TariffOption | null>(null);
  const [sections, setSections] = useState<CatalogOption[]>([]); const [chapters, setChapters] = useState<CatalogOption[]>([]);
  const [headings, setHeadings] = useState<CatalogOption[]>([]); const [tariffs, setTariffs] = useState<TariffOption[]>([]);
  const [searchMatches, setSearchMatches] = useState<TariffOption[]>([]); const [searchTotal, setSearchTotal] = useState(0);
  const [tariffTotal, setTariffTotal] = useState(0); const [catalogLoading, setCatalogLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false); const [catalogError, setCatalogError] = useState(""); const [catalogRetry, setCatalogRetry] = useState(0);
  const [countrySearch, setCountrySearch] = useState(""); const [country, setCountry] = useState(""); const [countryOpen, setCountryOpen] = useState(false);
  const [purpose, setPurpose] = useState(""); const [commercial, setCommercial] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});

  const dismissError = useCallback(() => { setError(""); setCatalogError(""); }, []);
  const dismissNotice = useCallback(() => setNotice(""), []);
  const retryCatalog = useCallback(() => {
    setCatalogError("");
    setCatalogRetry(value => value + 1);
  }, []);

  const countryOptions = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return countries.filter(code => /^[A-Z]{2}$/.test(code)).map(code => ({ code, name: code === "XK" ? "Kosovo" : names.of(code) ?? code }))
      .filter(item => item.name !== item.code)
      .sort((a, b) => {
        const ai = preferredCountries.indexOf(a.code), bi = preferredCountries.indexOf(b.code);
        return ai >= 0 && bi >= 0 ? ai - bi : ai >= 0 ? -1 : bi >= 0 ? 1 : a.name.localeCompare(b.name);
      });
  }, []);

  useEffect(() => {
    const token = getSessionAccessToken();
    if (!token) return;
    setHasToken(true);
    fetch(`${importerApiBase}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => { if (!response.ok) throw new Error("Please sign in again."); return response.json(); })
      .then(user => {
        setAccount(user);
        if (user.role === "Importer") {
          void importerApi<Summary[]>("/importer-declarations").then(setSummaries).catch(reason => setError(errorMessage(reason, "Unable to load your submissions.")));
          void importerApi<Location[]>("/importer-declarations/locations").then(setLocations).catch(reason => setError(errorMessage(reason, "Unable to load customs branches.")));
        }
      }).catch(reason => setError(reason instanceof Error ? reason.message : "Account unavailable."));
  }, []);

  useEffect(() => {
    if (account?.role !== "Importer") return;
    setCatalogLoading(true); setCatalogError("");
    void importerApi<CatalogOption[]>("/importer-declarations/catalog?stage=sections")
      .then(setSections).catch(reason => setCatalogError(reason instanceof Error ? reason.message : "Tariff book unavailable."))
      .finally(() => setCatalogLoading(false));
  }, [account?.role, catalogRetry]);
  useEffect(() => {
    if (!section) { setChapters([]); return; }
    let current = true;
    void importerApi<CatalogOption[]>(`/importer-declarations/catalog?${new URLSearchParams({ stage: "chapters", section })}`)
      .then(rows => { if (current) setChapters(rows); }).catch(reason => { if (current) setCatalogError(errorMessage(reason, "Chapters could not be loaded. Try again.")); });
    return () => { current = false; };
  }, [section, catalogRetry]);
  useEffect(() => {
    if (!chapter) { setHeadings([]); return; }
    let current = true;
    void importerApi<CatalogOption[]>(`/importer-declarations/catalog?${new URLSearchParams({ stage: "headings", section, chapter })}`)
      .then(rows => { if (current) setHeadings(rows); }).catch(reason => { if (current) setCatalogError(errorMessage(reason, "Tariff headings could not be loaded. Try again.")); });
    return () => { current = false; };
  }, [section, chapter, catalogRetry]);
  useEffect(() => {
    if (!heading) { setTariffs([]); setTariffTotal(0); return; }
    let current = true;
    void importerApi<{ total: number; items: TariffOption[] }>(`/importer-declarations/catalog?${new URLSearchParams({ stage: "tariffs", section, chapter, heading })}`)
      .then(result => { if (current) { setTariffs(result.items); setTariffTotal(result.total); } })
      .catch(reason => { if (current) setCatalogError(errorMessage(reason, "Tariff descriptions could not be loaded. Try again.")); });
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
        .catch(reason => { if (current) setCatalogError(reason instanceof Error ? reason.message : "Tariff search failed."); })
        .finally(() => { if (current) setSearchLoading(false); });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [catalogQuery, catalogRetry]);

  const matchingCountries = countryOptions.filter(item => `${item.name} ${item.code}`.toLowerCase().includes(countrySearch.toLowerCase()));
  const frequentCountries = matchingCountries.filter(item => preferredCountries.includes(item.code));
  const otherCountries = matchingCountries.filter(item => !preferredCountries.includes(item.code));
  function chooseEdit(declaration: ImporterDeclaration | null) {
    setEditing(declaration); setSelectedHs(declaration?.suggestedTariffLineId ?? ""); setSelectedTariff(null); setCountry(declaration?.originCountryCode ?? "");
    setPurpose(declaration?.importPurpose ?? ""); setCommercial(declaration?.isCommercialProduct ?? false);
    setSection(""); setChapter(""); setHeading(""); setCatalogQuery(""); setCountrySearch(""); setCountryOpen(false); setSelectedFiles({});
    setError(""); setNotice("");
  }
  async function loadForEdit(id: string) {
    try { chooseEdit(await importerApi<ImporterDeclaration>(`/importer-declarations/${id}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Declaration could not be opened."); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    if (!selectedHs) { setError("Select a provisional tariff description."); return; }
    if (!country) { setError("Select the country of origin."); return; }
    const form = new FormData(event.currentTarget);
    form.set("SuggestedTariffLineId", selectedHs); form.set("OriginCountryCode", country); form.set("ImportPurpose", purpose);
    form.set("IsCommercialProduct", String(commercial));
    form.set("IsMachineryOrEquipment", String(form.has("machinery"))); form.delete("machinery");
    if (editing) form.set("ExpectedVersion", editing.version);
    for (const field of documentFields) { const file = form.get(field.name); if (file instanceof File && file.size === 0) form.delete(field.name); }
    setBusy(true);
    try {
      const saved = await importerApi<ImporterDeclaration>(editing ? `/importer-declarations/${editing.id}` : "/importer-declarations", { method: editing ? "PUT" : "POST", body: form });
      chooseEdit(null); setNotice(`${saved.reference} was sent to a Customs Officer for review.`);
      setSummaries(current => [{ id: saved.id, reference: saved.reference, status: saved.status, productName: saved.productName, submittedAt: saved.submittedAt, version: saved.version }, ...current.filter(item => item.id !== saved.id)].slice(0, 100));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The declaration could not be submitted."); }
    finally { setBusy(false); }
  }

  function tariffResults(items: TariffOption[]) {
    return <div className="importer-tariff-results">{items.map(item => <button key={item.tariffLineId} type="button"
      className={`importer-tariff-result${selectedHs === item.tariffLineId ? " is-selected" : ""}`}
      aria-pressed={selectedHs === item.tariffLineId}
      onClick={() => { setSelectedHs(item.tariffLineId); setSelectedTariff(item); }}>
      <span className="importer-tariff-path">Section {item.sectionNumber} · Chapter {item.chapter} · Heading {item.heading}</span>
      <strong>{item.description.toLowerCase() === "other" && item.hsDescription ? item.hsDescription : item.description}</strong>
      {item.hsDescription && item.hsDescription !== item.description && <small>{item.description.toLowerCase() === "other" ? "Tariff description: Other" : item.hsDescription}</small>}
      <span className="importer-tariff-code">Probable HS {item.tariffItemNo || item.hsCode}</span>
    </button>)}</div>;
  }

  if (!hasToken) return <main className="importer-shell"><header className="importer-top"><Link href="/"><Brand compact variant="dark" /></Link></header><div className="importer-card"><h1>Importer Portal</h1><p>Sign in or create an importer account to register imported goods.</p><ShipmentTimingNote /><div className="importer-actions"><Link className="importer-primary" href="/login?next=%2Fimporter">Sign in</Link><Link href="/importer/register">Create importer account</Link></div></div></main>;
  if (account && account.role !== "Importer") return <main className="importer-shell"><div className="importer-card"><h1>Importer account required</h1><p>This portal is for importer accounts. Your customs workspace uses a different role.</p><Link href="/dashboard">Return to workspace</Link></div></main>;
  return <main className="importer-shell"><FeedbackToast error={error || catalogError} success={notice} onDismissError={dismissError} onDismissSuccess={dismissNotice} onRetry={!error && catalogError ? retryCatalog : undefined} retryLabel="Retry catalogue" /><header className="importer-top"><Link href="/"><Brand compact variant="dark" /></Link><div><span>{account?.fullName ?? "Importer Portal"}</span><button type="button" onClick={() => { setSessionAccessToken(null); window.location.assign("/"); }}>Sign out</button></div></header>
    <div className="importer-wrap"><div className="importer-intro"><p className="importer-eyebrow">IMPORTER PORTAL</p><h1>Register imported goods</h1><p>Describe the item and attach your trade documents. A Customs Officer verifies the HS mapping and any tax treatment before assessment.</p></div>
      <div className="importer-grid"><section className="importer-card"><div className="importer-section-heading"><div><p className="importer-eyebrow">YOUR DECLARATIONS</p><h2>Submissions</h2></div><button type="button" onClick={() => chooseEdit(null)}>New declaration</button></div>
        {summaries.length ? <ul className="importer-list">{summaries.map(item => <li key={item.id}><strong>{item.productName}</strong><span>{item.reference} · {new Date(item.submittedAt).toLocaleDateString()}</span><small>{item.status.replaceAll("_", " ")}</small>{item.status === "INFORMATION_REQUESTED" && <button type="button" onClick={() => void loadForEdit(item.id)}>Add requested information</button>}</li>)}</ul> : <p>No declarations submitted yet.</p>}
      </section>
      <section className="importer-card"><p className="importer-eyebrow">{editing ? `UPDATE ${editing.reference}` : "NEW SUBMISSION"}</p><h2>Item and shipment details</h2><ShipmentTimingNote />
        {editing?.reviewNote && <p className="importer-review-note"><strong>Officer request:</strong> {editing.reviewNote}</p>}
        <form key={editing?.id ?? "new"} className="importer-form" onSubmit={submit}>
          <fieldset><legend>1. Provisional tariff match</legend><p>Search the tariff book by item name, material, description or code. You can also browse its Section → Chapter → Heading structure. The Customs Officer confirms the final classification.</p>
          <div className="importer-universal-search"><FiSearch aria-hidden="true" /><input aria-label="Search the whole tariff book" value={catalogQuery} onChange={e => { setCatalogError(""); setCatalogQuery(e.target.value); }} maxLength={100} placeholder="Search the whole tariff book, e.g. mobile phone or cotton shirt" />{catalogQuery && <button type="button" aria-label="Clear tariff search" onClick={() => { setCatalogError(""); setCatalogQuery(""); }}><FiX /></button>}</div>
            {catalogQuery.trim().length >= 2 ? <div className="importer-catalog-panel" aria-live="polite"><div className="importer-catalog-heading"><strong>Search results</strong><span>{searchLoading ? "Searching…" : `${searchTotal} matching tariff descriptions`}</span></div>{!searchLoading && (searchMatches.length ? tariffResults(searchMatches) : <p>No matches. Try a broader item name or material.</p>)}{searchTotal > searchMatches.length && <small>Showing the first {searchMatches.length} matches. Add detail to narrow the search.</small>}</div> : <div className="importer-catalog-panel"><div className="importer-catalog-heading"><strong>Browse the tariff book</strong><span>{catalogLoading ? "Loading sections…" : `${sections.length} sections available`}</span></div>
              <div className="importer-browse-row"><label>Section<select value={section} onChange={e => { setCatalogError(""); setSection(e.target.value); setChapter(""); setHeading(""); setSelectedHs(""); setSelectedTariff(null); setChapters([]); setHeadings([]); setTariffs([]); }}><option value="">Choose a section</option>{sections.map(x => <option key={x.code} value={x.code}>{x.code} · {x.name} ({x.count})</option>)}</select></label>
                <label>Chapter<select value={chapter} onChange={e => { setCatalogError(""); setChapter(e.target.value); setHeading(""); setSelectedHs(""); setSelectedTariff(null); setHeadings([]); setTariffs([]); }} disabled={!section}><option value="">Choose a chapter</option>{chapters.map(x => <option key={x.code} value={x.code}>{x.code} · {x.name} ({x.count})</option>)}</select></label>
                <label>Heading / subheading<select value={heading} onChange={e => { setCatalogError(""); setHeading(e.target.value); setSelectedHs(""); setSelectedTariff(null); setTariffs([]); }} disabled={!chapter}><option value="">Choose a heading</option>{headings.map(x => <option key={x.code} value={x.code}>{x.name} ({x.count})</option>)}</select></label></div>
              {heading ? <><div className="importer-catalog-heading"><strong>Tariff descriptions</strong><span>{tariffTotal} items</span></div>{tariffs.length ? tariffResults(tariffs) : <p>Loading descriptions for this heading…</p>}{tariffTotal > tariffs.length && <small>Showing the first {tariffs.length} items. Use the search above to narrow the list.</small>}</> : <p>Choose a section, chapter and heading to see its tariff descriptions.</p>}
            </div>}
            {selectedHs && <p className="importer-provisional"><strong>Provisional match:</strong> {selectedTariff ? `${selectedTariff.tariffItemNo || selectedTariff.hsCode} · ${selectedTariff.description}` : editing?.suggestedTariffDescription || "Selected tariff line"}<br /><small>The Customs Officer will verify the final HS code.</small></p>}
          </fieldset>
          <fieldset><legend>2. Origin and purpose</legend><label>Customs branch<select name="LocationId" required defaultValue={editing?.locationId ?? ""}><option value="">Choose the receiving branch</option>{locations.map(location => <option key={location.id} value={location.id}>{location.displayName || location.officialCode} · {location.region}</option>)}</select></label>
            <div className="importer-country-picker" onKeyDown={event => { if (event.key === "Escape") setCountryOpen(false); }}><span className="importer-field-label">Country of origin *</span>
              <button type="button" className="importer-country-trigger" aria-expanded={countryOpen} onClick={() => setCountryOpen(value => !value)}>{country ? <CountryFlag code={country} /> : <span className="importer-flag-placeholder" aria-hidden="true" />}<span>{country ? countryOptions.find(item => item.code === country)?.name ?? country : "Choose country of origin"}</span><FiChevronDown aria-hidden="true" /></button>
              {countryOpen && <div className="importer-country-menu"><input autoFocus value={countrySearch} onChange={event => setCountrySearch(event.target.value)} aria-label="Search countries" placeholder="Search any country" />
                <div className="importer-country-options">{frequentCountries.length > 0 && <><strong className="importer-country-group">Frequent import markets</strong>{frequentCountries.map(item => <button key={item.code} type="button" aria-pressed={country === item.code} onClick={() => { setCountry(item.code); setCountryOpen(false); setCountrySearch(""); }}><CountryFlag code={item.code} />{item.name}</button>)}</>}
                  {otherCountries.length > 0 && <><strong className="importer-country-group">Other countries</strong>{otherCountries.map(item => <button key={item.code} type="button" aria-pressed={country === item.code} onClick={() => { setCountry(item.code); setCountryOpen(false); setCountrySearch(""); }}><CountryFlag code={item.code} />{item.name}</button>)}</>}
                  {matchingCountries.length === 0 && <p>No matching country found.</p>}</div></div>}
            </div>
            <label>Import purpose<select value={purpose} onChange={e => { setPurpose(e.target.value); if (e.target.value === "COMMERCIAL_RESALE") setCommercial(true); }} required><option value="">Choose purpose</option>{Object.entries(purposeLabels).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            <label>Purpose details<textarea name="PurposeDetails" maxLength={1000} defaultValue={editing?.purposeDetails ?? ""} placeholder="Explain how this item will be used" /></label>
            {purpose === "MANUFACTURING" && <div className="importer-treatments"><p>Possible special treatment for officer review</p><label><input type="checkbox" name="machinery" defaultChecked={editing?.isMachineryOrEquipment} /> Machinery or manufacturing equipment</label>{treatments.map(([code, label]) => <label key={code}><input type="checkbox" name="RequestedTreatments" value={code} defaultChecked={editing?.requestedTreatments.includes(code)} /> {label}</label>)}<small>These are requests for review. Selecting them does not grant an exemption.</small></div>}
          </fieldset>
          <fieldset><legend>3. Product identification</legend><label className="importer-check"><input type="checkbox" checked={commercial} onChange={e => setCommercial(e.target.checked)} /> Commercial / commodity product</label>
            <div className="importer-two"><label>Product name<input name="ProductName" required minLength={2} maxLength={300} defaultValue={editing?.productName ?? ""} /></label><label>Quantity<input name="Quantity" type="number" min="0.0001" step="any" required defaultValue={editing?.quantity ?? ""} /></label></div>
            <label>Unit of measurement<input name="Unit" required maxLength={40} defaultValue={editing?.unit ?? ""} placeholder="pieces, kg, litres…" /></label>
            <div className="importer-two"><label>Brand{commercial && " *"}<input name="Brand" required={commercial} maxLength={120} defaultValue={editing?.brand ?? ""} /></label><label>Model{commercial && " *"}<input name="Model" required={commercial} maxLength={120} defaultValue={editing?.model ?? ""} /></label></div>
            <label>Detailed description<textarea name="Description" required minLength={20} maxLength={4000} rows={4} defaultValue={editing?.description ?? ""} placeholder="Materials, features, intended use and distinguishing details" /></label>
            <div className="importer-two"><label>Manufacturer<input name="Manufacturer" maxLength={200} defaultValue={editing?.manufacturer ?? ""} /></label><label>Serial / part number<input name="SerialOrPartNumber" maxLength={200} defaultValue={editing?.serialOrPartNumber ?? ""} /></label></div>
            <label>Specifications<textarea name="Specifications" maxLength={2000} rows={2} defaultValue={editing?.specifications ?? ""} /></label>
          </fieldset>
          <fieldset><legend>4. Mandatory documents</legend><p>Upload PDF, JPG, JPEG or PNG files. Each file may be up to 10 MB.</p>
            {documentFields.map(field => { const saved = editing?.documents.find(document => document.kind === field.kind); const selected = selectedFiles[field.name]; return <div className="importer-upload" key={field.kind}><label>{field.label} *<input name={field.name} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required={!saved} onChange={e => setSelectedFiles(previous => ({ ...previous, [field.name]: e.target.files?.[0] ?? null }))} /></label><small>{selected ? `Ready: ${selected.name}` : saved ? `Uploaded: ${saved.fileName}` : "Required before submission"}</small>{saved && editing && <ImporterDocumentPreview declarationId={editing.id} kind={field.kind} label={field.label} contentType={saved.contentType} />}{selected && <SelectedFilePreview file={selected} />}</div>; })}
          </fieldset>
          <p className="importer-disclaimer">Your declaration goes to a Customs Officer first. Final HS classification, exemptions, valuation and tax assessment happen only after officer review.</p>
          <button className="importer-primary" disabled={busy || !account}>{busy ? "Submitting…" : editing ? "Resubmit to officer" : "Submit for officer review"}</button>
        </form>
      </section></div>
    </div>
  </main>;
}
