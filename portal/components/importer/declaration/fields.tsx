"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { FiCheck, FiChevronDown, FiInfo, FiMinus, FiPlus, FiSlash, FiTag } from "react-icons/fi";
import { countries } from "country-flag-icons";
import * as Flags from "country-flag-icons/react/3x2";
import { compareCountries, preferredCountryCodes } from "@/lib/country-order";
import { formatMoney, invoiceCurrencies } from "@/lib/importer";
import { categoryIcons, describeSpecs, specsFor, type ProductSpec } from "@/components/importer/declaration/productSpecs";
import { commonCurrencies, conditions, incoterms, manufacturingKinds, productCategories, purposes, units } from "@/components/importer/declaration/options";

/** Product details shared by the importer's declaration and the officer's valuation search. */
export type ProductState = {
  category: string; condition: string; productName: string; branded: boolean; brand: string; model: string;
  quantity: string; unit: string; manufacturer: string; serial: string; specifications: string; details: string;
  /** Answers to the product group's detail questions (productSpecs.ts), keyed by spec key. */
  attributes: Record<string, string>;
};
export type ValueState = { incoterm: string; amount: string; currency: string; freight: string; insurance: string };
export type PurposeState = { purpose: string; machinery: boolean | null };

export const emptyProduct = (): ProductState => ({ category: "", condition: "NEW", productName: "", branded: false, brand: "", model: "", quantity: "1", unit: "pieces", manufacturer: "", serial: "", specifications: "", details: "", attributes: {} });
export const emptyValue = (): ValueState => ({ incoterm: "FOB", amount: "", currency: "USD", freight: "", insurance: "" });

/** Freight and insurance the importer still adds under the chosen invoice terms, and the resulting CIF. */
export function valueTotals(value: ValueState) {
  const terms = incoterms.find(item => item.code === value.incoterm) ?? incoterms[0];
  const paid = Number(value.amount) || 0;
  const freight = terms.freight ? Number(value.freight) || 0 : 0;
  const insurance = terms.insurance ? Number(value.insurance) || 0 : 0;
  return { terms, paid, freight, insurance, cif: paid + freight + insurance };
}

export function productProblem(product: ProductState, purpose: string) {
  if (!product.category) return "Choose the product group.";
  if (product.productName.trim().length < 2) return "Enter the product name.";
  if (!(Number(product.quantity) > 0)) return "Enter a quantity greater than zero.";
  if ((product.branded || purpose === "COMMERCIAL_RESALE") && (!product.brand.trim() || !product.model.trim())) return "Enter the brand and model, or choose “No brand” for generic goods.";
  return "";
}

export function composeDescription(product: ProductState, incoterm: string) {
  const category = productCategories.find(item => item.code === product.category)?.label ?? "Other goods";
  const condition = conditions.find(item => item.code === product.condition)?.label ?? "New";
  const extra = product.details.trim();
  const specs = describeSpecs(product.category, product.attributes ?? {});
  return `${product.productName.trim()}. Category: ${category}. Condition: ${condition}. Invoice terms: ${incoterm}.${specs ? ` Specs: ${specs}.` : ""}${extra ? ` Details: ${extra}` : ""}`;
}

export function Choice({ selected, onClick, title, hint, icon, compact }: { selected: boolean; onClick: () => void; title: string; hint?: string; icon?: ReactNode; compact?: boolean }) {
  return <button type="button" className={`ip-choice${selected ? " is-selected" : ""}${compact ? " is-compact" : ""}`} aria-pressed={selected} onClick={onClick}>
    {icon && <span className="ip-choice-icon" aria-hidden="true">{icon}</span>}
    <span><strong>{title}</strong>{hint && <small>{hint}</small>}</span>
    {selected && <FiCheck className="ip-choice-check" aria-hidden="true" />}
  </button>;
}

export function CountryFlag({ code }: { code: string }) {
  const Icon = Flags[code as keyof typeof Flags];
  return Icon ? <Icon aria-hidden="true" className="importer-country-flag" /> : null;
}

export function useCountryOptions() {
  return useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return countries.filter(code => /^[A-Z]{2}$/.test(code)).map(code => ({ code, name: code === "XK" ? "Kosovo" : names.of(code) ?? code }))
      .filter(item => item.name !== item.code).sort(compareCountries);
  }, []);
}

export function CountryPicker({ value, onChange, label = "Country of origin" }: { value: string; onChange: (code: string) => void; label?: string }) {
  const options = useCountryOptions();
  const [search, setSearch] = useState(""); const [open, setOpen] = useState(false);
  const matching = options.filter(item => `${item.name} ${item.code}`.toLowerCase().includes(search.toLowerCase()));
  const frequent = matching.filter(item => preferredCountryCodes.some(code => code === item.code));
  const other = matching.filter(item => !preferredCountryCodes.some(code => code === item.code));
  const choose = useCallback((code: string) => { onChange(code); setOpen(false); setSearch(""); }, [onChange]);
  const name = options.find(item => item.code === value)?.name ?? value;
  return <div className="importer-country-picker ip-field" onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}><span className="importer-field-label">{label}</span>
    <button type="button" className="importer-country-trigger" aria-expanded={open} onClick={() => setOpen(current => !current)}>{value ? <CountryFlag code={value} /> : <span className="importer-flag-placeholder" aria-hidden="true" />}<span>{value ? name : `Choose ${label.toLowerCase()}`}</span><FiChevronDown aria-hidden="true" /></button>
    {open && <div className="importer-country-menu"><input autoFocus value={search} onChange={event => setSearch(event.target.value)} aria-label="Search countries" placeholder="Search any country" />
      <div className="importer-country-options">{frequent.length > 0 && <><strong className="importer-country-group">Frequent import markets</strong>{frequent.map(item => <button key={item.code} type="button" aria-pressed={value === item.code} onClick={() => choose(item.code)}><CountryFlag code={item.code} />{item.name}</button>)}</>}
        {other.length > 0 && <><strong className="importer-country-group">Other countries</strong>{other.map(item => <button key={item.code} type="button" aria-pressed={value === item.code} onClick={() => choose(item.code)}><CountryFlag code={item.code} />{item.name}</button>)}</>}
        {matching.length === 0 && <p>No matching country found.</p>}</div></div>}
  </div>;
}

/** Import purpose cards; manufacturing asks whether the goods are machinery or production inputs and explains the reliefs. */
export function PurposeFields({ value, onChange }: { value: PurposeState; onChange: (next: PurposeState) => void }) {
  return <>
    <fieldset className="ip-fieldset"><legend>How will the goods be used?</legend>
      <div className="ip-choices">{purposes.map(item => { const Icon = item.icon; return <Choice key={item.code} selected={value.purpose === item.code} title={item.label} hint={item.hint} icon={<Icon />}
        onClick={() => onChange({ purpose: item.code, machinery: item.code === "MANUFACTURING" ? value.machinery : null })} />; })}</div>
    </fieldset>
    {value.purpose === "MANUFACTURING" && <fieldset className="ip-fieldset"><legend>What is imported for production?</legend>
      <div className="ip-choices is-two">{manufacturingKinds.map(item => { const Icon = item.icon; return <Choice key={item.label} selected={value.machinery === item.machinery} title={item.label} hint={item.hint} icon={<Icon />} onClick={() => onChange({ ...value, machinery: item.machinery })} />; })}</div>
      {value.machinery !== null && <div className="ip-incentive"><FiInfo aria-hidden="true" /><div><strong>{value.machinery ? "Capital goods incentive" : "Manufacturing input"}</strong>
        <p>{value.machinery
          ? "Machinery and equipment for a manufacturing investment can be imported free of customs duty, VAT and the social welfare levy (Investment Incentive Regulation No. 517/2022), and no import withholding is collected. The investment permit is verified before the assessment is finalised."
          : "Production inputs are not charged the 3% import withholding. Customs duty and VAT still apply at the tariff rates."}</p></div></div>}
    </fieldset>}
  </>;
}

/** One detail question: chips for a fixed list (with "Other" for anything else), or a text/number box. */
function SpecField({ spec, value, onChange }: { spec: ProductSpec; value: string; onChange: (next: string) => void }) {
  const options = spec.options ?? [];
  const custom = Boolean(value) && !options.includes(value);
  const [typing, setTyping] = useState(custom);
  const otherOpen = typing || custom;
  if (spec.type === "choice") return <div className="ip-spec is-choice" role="group" aria-label={spec.label}>
    <span className="ip-spec-label">{spec.label}{spec.hint && <small>{spec.hint}</small>}</span>
    <div className="ip-spec-options">
      {options.map(option => <button key={option} type="button" className={`ip-spec-option${value === option ? " is-selected" : ""}`} aria-pressed={value === option}
        onClick={() => { setTyping(false); onChange(value === option ? "" : option); }}>{value === option && <FiCheck aria-hidden="true" />}{option}</button>)}
      <button type="button" className={`ip-spec-option is-other${otherOpen ? " is-selected" : ""}`} aria-pressed={otherOpen}
        onClick={() => { if (otherOpen) { setTyping(false); if (custom) onChange(""); } else { setTyping(true); if (value) onChange(""); } }}>Other…</button>
    </div>
    {otherOpen && <input className="ip-spec-input" autoFocus={!custom} value={custom ? value : ""} onChange={event => onChange(event.target.value)} maxLength={120} placeholder={`Describe the ${spec.label.toLowerCase()}`} aria-label={`Other ${spec.label.toLowerCase()}`} />}
  </div>;
  return <label className="ip-spec">
    <span className="ip-spec-label">{spec.label}{spec.hint && <small>{spec.hint}</small>}</span>
    <span className={`ip-spec-box${spec.unit ? " has-unit" : ""}`}>
      <input type={spec.type === "number" ? "number" : "text"} inputMode={spec.type === "number" ? "decimal" : undefined} min={spec.type === "number" ? 0 : undefined} step="any"
        value={value} onChange={event => onChange(event.target.value)} maxLength={120} placeholder={spec.placeholder} />
      {spec.unit && <em>{spec.unit}</em>}
    </span>
  </label>;
}

export function ProductFields({ value, onChange, purpose, chapterHint }: { value: ProductState; onChange: (next: ProductState) => void; purpose: string; chapterHint?: string }) {
  const set = (patch: Partial<ProductState>) => onChange({ ...value, ...patch });
  const category = productCategories.find(item => item.code === value.category);
  const resale = purpose === "COMMERCIAL_RESALE";
  const generic = value.brand === "Generic" && value.model === "Generic";
  const brandRequired = (value.branded || resale) && !generic;
  const brandMode: "branded" | "generic" | "" = generic ? "generic" : value.branded || value.brand ? "branded" : resale ? "" : "generic";
  const qty = Number(value.quantity) || 0;
  const specs = specsFor(value.category);
  const attributes = value.attributes ?? {};
  const answered = specs.filter(spec => attributes[spec.key]?.trim()).length;
  const CategoryIcon = categoryIcons[value.category] ?? categoryIcons.OTHER;
  return <>
    <fieldset className="ip-fieldset"><legend>Product group {chapterHint && <small>suggested from tariff chapter {chapterHint}</small>}</legend>
      <div className="ip-cat-grid">{productCategories.map(item => {
        const Icon = categoryIcons[item.code] ?? categoryIcons.OTHER; const selected = value.category === item.code;
        return <button key={item.code} type="button" className={`ip-cat${selected ? " is-selected" : ""}`} aria-pressed={selected}
          onClick={() => set({ category: item.code, branded: item.branded, attributes: selected ? attributes : {} })}>
          <span className="ip-cat-icon" aria-hidden="true"><Icon /></span><span className="ip-cat-label">{item.label}</span>{selected && <FiCheck className="ip-cat-check" aria-hidden="true" />}</button>;
      })}</div>
    </fieldset>
    <div className="importer-two">
      <label className="ip-field">Product name<input value={value.productName} onChange={e => set({ productName: e.target.value })} maxLength={300} placeholder="e.g. Smartphone, cotton T-shirts, copper cathodes" /></label>
      <fieldset className="ip-fieldset is-inline"><legend>Condition</legend>
        <div className="oc-segmented ip-segmented">{conditions.map(item => <button key={item.code} type="button" aria-selected={value.condition === item.code} onClick={() => set({ condition: item.code })}>{item.label}</button>)}</div>
      </fieldset>
    </div>
    <div className="importer-two">
      <div className="ip-field"><span className="importer-field-label">Quantity</span>
        <div className="ip-stepper"><button type="button" onClick={() => set({ quantity: String(Math.max(1, Math.floor(qty) - 1)) })} aria-label="Decrease quantity"><FiMinus /></button>
          <input type="number" min="0.0001" step="any" value={value.quantity} onChange={e => set({ quantity: e.target.value })} aria-label="Quantity" />
          <button type="button" onClick={() => set({ quantity: String(Math.floor(qty) + 1) })} aria-label="Increase quantity"><FiPlus /></button></div></div>
      <label className="ip-field">Unit<select value={value.unit} onChange={e => set({ unit: e.target.value })}>{[...new Set([value.unit, ...units.map(item => item.value)])].map(unit => <option key={unit} value={unit}>{units.find(item => item.value === unit)?.label ?? unit}</option>)}</select></label>
    </div>

    {category && specs.length > 0 && <section className="ip-specs" aria-labelledby="ip-specs-title">
      <header>
        <span className="ip-specs-icon" aria-hidden="true"><CategoryIcon /></span>
        <div><h3 id="ip-specs-title">{category.label} details</h3><p>Helps the officer classify and value the goods. Answer from your invoice or packing list.</p></div>
        <span className={`ip-specs-count${answered === specs.length ? " is-done" : ""}`}>{answered === specs.length && <FiCheck aria-hidden="true" />}{answered} of {specs.length}</span>
      </header>
      <div className="ip-specs-grid">{specs.map(spec => <SpecField key={`${value.category}-${spec.key}`} spec={spec} value={attributes[spec.key] ?? ""} onChange={next => set({ attributes: { ...attributes, [spec.key]: next } })} />)}</div>
    </section>}

    <fieldset className="ip-fieldset ip-brand"><legend>Brand and model {brandRequired ? <small>required for {resale ? "commercial resale" : "branded goods"}</small> : <small>optional</small>}</legend>
      <div className="ip-brand-switch" role="radiogroup" aria-label="Are the goods branded?">
        <button type="button" role="radio" aria-checked={brandMode === "branded"} className={brandMode === "branded" ? "is-selected" : ""}
          onClick={() => set({ branded: true, ...(generic ? { brand: "", model: "" } : {}) })}>
          <span className="ip-brand-icon" aria-hidden="true"><FiTag /></span><span><strong>Branded</strong><small>Has a brand name and model</small></span>{brandMode === "branded" && <FiCheck className="ip-brand-check" aria-hidden="true" />}</button>
        <button type="button" role="radio" aria-checked={brandMode === "generic"} className={brandMode === "generic" ? "is-selected" : ""}
          onClick={() => set({ branded: false, brand: "Generic", model: "Generic" })}>
          <span className="ip-brand-icon" aria-hidden="true"><FiSlash /></span><span><strong>No brand</strong><small>Generic or unbranded goods</small></span>{brandMode === "generic" && <FiCheck className="ip-brand-check" aria-hidden="true" />}</button>
      </div>
      {brandMode === "branded" && <div className="ip-brand-body">
        <div className="importer-two">
          <label className="ip-field">Brand<input list="ip-brand-options" value={value.brand} onChange={e => set({ brand: e.target.value })} maxLength={120} placeholder={category?.brands[0] ? `e.g. ${category.brands[0]}` : "Brand name"} />
            <datalist id="ip-brand-options">{(category?.brands ?? []).map(item => <option key={item} value={item} />)}</datalist></label>
          <label className="ip-field">Model<input value={value.model} onChange={e => set({ model: e.target.value })} maxLength={120} placeholder="Model name or number" /></label>
        </div>
        {category && category.brands.length > 0 && <div className="ip-brand-picks"><span>Popular brands</span>
          <div className="ip-chip-row is-small">{category.brands.slice(0, 8).map(item => <button key={item} type="button" className={`ip-chip${value.brand === item ? " is-selected" : ""}`} aria-pressed={value.brand === item} onClick={() => set({ brand: item })}>{item}</button>)}</div></div>}
      </div>}
      {brandMode === "generic" && <p className="ip-brand-note"><FiInfo aria-hidden="true" />Recorded as generic goods with no brand or model. The officer values them from the description and details above.</p>}
    </fieldset>

    <details className="ip-more" open={Boolean(value.manufacturer || value.serial || value.specifications || value.details)}>
      <summary>More details <small>optional — manufacturer, part number, notes</small></summary>
      <div className="importer-two"><label className="ip-field">Manufacturer<input value={value.manufacturer} onChange={e => set({ manufacturer: e.target.value })} maxLength={200} /></label>
        <label className="ip-field">Serial / part number<input value={value.serial} onChange={e => set({ serial: e.target.value })} maxLength={200} /></label></div>
      <label className="ip-field">Other specifications<textarea value={value.specifications} onChange={e => set({ specifications: e.target.value })} maxLength={2000} rows={2} placeholder="Anything not covered above, e.g. variants or certifications" /></label>
      <label className="ip-field">Anything else the officer should know<textarea value={value.details} onChange={e => set({ details: e.target.value })} maxLength={3000} rows={2} /></label>
    </details>
  </>;
}

export function ValueFields({ value, onChange, quantity, unit, payer = "you" }: { value: ValueState; onChange: (next: ValueState) => void; quantity: number; unit: string; payer?: string }) {
  const set = (patch: Partial<ValueState>) => onChange({ ...value, ...patch });
  const { terms, paid, freight, insurance, cif } = valueTotals(value);
  return <>
    <fieldset className="ip-fieldset"><legend>Invoice terms <small>shown on the commercial invoice</small></legend>
      <div className="ip-choices is-four">{incoterms.map(item => { const Icon = item.icon; return <Choice key={item.code} compact selected={value.incoterm === item.code} title={item.label} hint={item.hint} icon={<Icon />} onClick={() => set({ incoterm: item.code })} />; })}</div>
    </fieldset>
    <div className="ip-field"><span className="importer-field-label">Price {payer} paid for the whole shipment</span>
      <div className="ip-money-input is-large"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={value.amount} onChange={e => set({ amount: e.target.value })} placeholder="0.00" aria-label="Price paid" />
        <select aria-label="Invoice currency" value={value.currency} onChange={e => set({ currency: e.target.value })}>{invoiceCurrencies.map(code => <option key={code}>{code}</option>)}</select></div>
      <div className="ip-chip-row is-small">{commonCurrencies.map(code => <button key={code} type="button" className={`ip-chip${value.currency === code ? " is-selected" : ""}`} onClick={() => set({ currency: code })}>{code}</button>)}</div>
      <small className="ip-field-hint">The total for every unit on the invoice{quantity > 1 && paid > 0 ? ` — about ${formatMoney(paid / quantity, value.currency)} per ${unit.replace(/s$/, "")}` : ", not the price of one unit"}.</small>
    </div>
    {(terms.freight || terms.insurance) && <div className="importer-two">
      {terms.freight && <label className="ip-field">Freight to Ethiopia ({value.currency})<input type="number" min="0" step="0.01" inputMode="decimal" value={value.freight} onChange={e => set({ freight: e.target.value })} placeholder="0.00" /></label>}
      {terms.insurance && <label className="ip-field">Insurance ({value.currency})<input type="number" min="0" step="0.01" inputMode="decimal" value={value.insurance} onChange={e => set({ insurance: e.target.value })} placeholder="0.00" /></label>}
    </div>}
    <div className="ip-value-summary" aria-live="polite">
      <div><span>Invoice price ({terms.code})</span><b>{formatMoney(paid, value.currency)}</b></div>
      {terms.freight && <div><span>Freight</span><b>{formatMoney(freight, value.currency)}</b></div>}
      {terms.insurance && <div><span>Insurance</span><b>{formatMoney(insurance, value.currency)}</b></div>}
      <div className="is-total"><span>Declared CIF value</span><b>{formatMoney(cif, value.currency)}</b></div>
      <small>{terms.freight || terms.insurance ? "Customs values goods at CIF: the FOB price plus freight and insurance to Ethiopia." : "CIF invoices already include freight and insurance."} The value is checked against FOB, exchange and market prices.</small>
    </div>
  </>;
}
