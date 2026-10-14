"use client";

import { useEffect, useRef, useState } from "react";
import { FiBookOpen, FiCheck, FiChevronDown, FiChevronRight, FiFolder, FiSearch, FiX } from "react-icons/fi";
import { importerApi, type CatalogOption, type TariffOption } from "@/lib/importer";

type Taxes = { nationalCode: string | null; unit: string; taxes: { code: string; name: string; listed: boolean; rate: number | null }[] };
type Mode = "search" | "browse";
const shortTaxNames: Record<string, string> = { DR: "Duty", ER: "Excise", VAT: "VAT", WHR: "Withholding", SR: "Surtax", EXR: "Export duty", D2R: "2nd sched. duty", DSR: "2nd sched. special", DAR: "2nd sched. additional" };

const catalog = <T,>(params: Record<string, string>) => importerApi<T>(`/importer-declarations/catalog?${new URLSearchParams(params)}`);
const displayCode = (item: TariffOption) => item.tariffItemNo || item.hsCode;
const lineTitle = (item: TariffOption) => item.description.toLowerCase() === "other" && item.hsDescription ? `${item.hsDescription} — other` : item.description;

function Row({ label, meta, open, onToggle, className, leaf, selected, children }: { label: string; meta?: string; open?: boolean; onToggle: () => void; className: string; leaf?: boolean; selected?: boolean; children?: React.ReactNode }) {
  return <div className={`hs-tree-branch ${className}${selected ? " is-selected" : ""}`}>
    <button type="button" className="hs-tree-row" aria-expanded={leaf ? undefined : open} aria-pressed={leaf ? selected : undefined} onClick={onToggle}>
      {leaf ? <span className="hs-tree-row-spacer" aria-hidden="true" /> : open ? <FiChevronDown /> : <FiChevronRight />}
      <span className="hs-tree-row-copy"><strong>{label}</strong>{meta && <small>{meta}</small>}</span>
    </button>
    {open && children}
  </div>;
}

/**
 * Tariff-line chooser for officers. Opens on likely matches for the importer's description and lets the officer
 * browse the tariff book by Section, Chapter and Heading, previewing each line's ERCA tax rates before choosing.
 */
export function HsPicker({ title, productName, description, currentLineId, askNote, busy, onSelect, onClose }: {
  title: string; productName: string; description?: string; currentLineId?: string | null; askNote?: boolean; busy?: boolean;
  onSelect: (option: TariffOption, note: string) => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState(productName.slice(0, 100));
  const [results, setResults] = useState<TariffOption[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [sections, setSections] = useState<CatalogOption[]>([]);
  const [children, setChildren] = useState<Record<string, CatalogOption[] | TariffOption[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingKey, setLoadingKey] = useState("");
  const [selected, setSelected] = useState<TariffOption | null>(null);
  const [taxes, setTaxes] = useState<Taxes | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => { searchInput.current?.focus(); searchInput.current?.select(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (mode !== "search") return;
    const term = query.trim();
    if (term.length < 2) { setResults([]); setTotal(0); setSearching(false); return; }
    let current = true; setSearching(true);
    const timer = window.setTimeout(() => {
      void catalog<{ total: number; items: TariffOption[] }>({ stage: "search", q: term })
        .then(result => { if (current) { setResults(result.items); setTotal(result.total); setError(""); } })
        .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : "Tariff search failed."); })
        .finally(() => { if (current) setSearching(false); });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [query, mode]);

  useEffect(() => {
    if (mode !== "browse" || sections.length) return;
    void catalog<CatalogOption[]>({ stage: "sections" }).then(setSections).catch(reason => setError(reason instanceof Error ? reason.message : "The tariff book could not be loaded."));
  }, [mode, sections.length]);

  useEffect(() => {
    if (!selected) { setTaxes(null); return; }
    let current = true; setTaxes(null);
    void importerApi<Taxes>(`/tariff/lines/${selected.tariffLineId}/taxes`).then(value => { if (current) setTaxes(value); }).catch(() => { if (current) setTaxes(null); });
    return () => { current = false; };
  }, [selected]);

  async function toggle(key: string, params: Record<string, string>) {
    const opening = !expanded[key];
    setExpanded(state => ({ ...state, [key]: opening }));
    if (!opening || children[key]) return;
    setLoadingKey(key);
    try {
      const rows = params.stage === "tariffs" ? (await catalog<{ items: TariffOption[] }>(params)).items : await catalog<CatalogOption[]>(params);
      setChildren(state => ({ ...state, [key]: rows }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This part of the tariff book could not be loaded."); }
    finally { setLoadingKey(""); }
  }

  const lineRow = (item: TariffOption) => <Row key={item.tariffLineId} className="hs-tree-tariff" leaf selected={selected?.tariffLineId === item.tariffLineId}
    label={`${displayCode(item)}${item.tariffLineId === currentLineId ? "  ·  current" : ""}`} meta={lineTitle(item)} onToggle={() => setSelected(item)} />;
  const loading = (key: string) => loadingKey === key ? <div className="hs-catalogue-loading">Loading…</div> : null;

  const tree = sections.map(section => {
    const sKey = `s:${section.code}`;
    return <Row key={sKey} className="hs-tree-section" label={`Section ${section.code}`} meta={`${section.name} · ${section.count} lines`} open={expanded[sKey]} onToggle={() => void toggle(sKey, { stage: "chapters", section: section.code })}>
      <div className="hs-tree-children">{loading(sKey)}{((children[sKey] ?? []) as CatalogOption[]).map(chapter => {
        const cKey = `c:${chapter.code}`;
        return <Row key={cKey} className="hs-tree-chapter" label={`Chapter ${chapter.code}`} meta={`${chapter.name} · ${chapter.count} lines`} open={expanded[cKey]} onToggle={() => void toggle(cKey, { stage: "headings", section: section.code, chapter: chapter.code })}>
          <div className="hs-tree-children">{loading(cKey)}{((children[cKey] ?? []) as CatalogOption[]).map(heading => {
            const hKey = `h:${heading.code}`;
            return <Row key={hKey} className="hs-tree-heading" label={`Heading ${heading.code}`} meta={`${heading.count} tariff lines`} open={expanded[hKey]} onToggle={() => void toggle(hKey, { stage: "tariffs", section: section.code, chapter: chapter.code, heading: heading.code })}>
              <div className="hs-tree-children">{loading(hKey)}{((children[hKey] ?? []) as TariffOption[]).map(lineRow)}</div>
            </Row>;
          })}</div>
        </Row>;
      })}</div>
    </Row>;
  });

  const isCurrent = selected?.tariffLineId === currentLineId;
  return <div className="oc-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="oc-hs-picker" role="dialog" aria-modal="true" aria-labelledby="oc-hs-title">
      <header className="oc-hs-head">
        <div><span className="oc-eyebrow">HS classification</span><h2 id="oc-hs-title">{title}</h2>
          <p>Importer described: <strong>{productName}</strong>{description ? ` — ${description.length > 160 ? `${description.slice(0, 160)}…` : description}` : ""}</p></div>
        <button type="button" className="oc-icon-button" onClick={onClose} aria-label="Close"><FiX aria-hidden="true" /></button>
      </header>
      <div className="oc-hs-toolbar">
        <div className="oc-segmented" role="tablist" aria-label="How to find the tariff line">
          <button type="button" role="tab" aria-selected={mode === "search"} onClick={() => setMode("search")}><FiSearch aria-hidden="true" />Search</button>
          <button type="button" role="tab" aria-selected={mode === "browse"} onClick={() => setMode("browse")}><FiBookOpen aria-hidden="true" />Browse tariff book</button>
        </div>
        {mode === "search" && <label className="oc-search"><FiSearch aria-hidden="true" /><input ref={searchInput} value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Item name, material or HS code" aria-label="Search the tariff book" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><FiX /></button>}</label>}
      </div>
      {error && <p className="oc-inline-error" role="alert">{error}</p>}
      <div className="oc-hs-body">
        <div className="oc-hs-list">
          {mode === "search" ? <>
            <div className="oc-hs-list-head">{searching ? "Searching…" : query.trim().length < 2 ? "Type at least two characters" : `${total} matching tariff lines${total > results.length ? `, best ${results.length} shown` : ""}`}</div>
            <div className="hs-tree-list">{results.map(item => <Row key={item.tariffLineId} className="hs-tree-tariff" leaf selected={selected?.tariffLineId === item.tariffLineId}
              label={`${displayCode(item)}${item.tariffLineId === currentLineId ? "  ·  current" : ""}`} meta={`${lineTitle(item)} · Ch. ${item.chapter} ${item.chapterName}`} onToggle={() => setSelected(item)} />)}
              {!searching && query.trim().length >= 2 && results.length === 0 && <p className="hs-catalogue-empty">No tariff line matches. Try a broader word, or browse the tariff book.</p>}</div>
          </> : <div className="hs-tree-list">{sections.length ? tree : <div className="hs-catalogue-loading">Loading sections…</div>}</div>}
        </div>
        <aside className="oc-hs-detail">
          {selected ? <>
            <span className="hs-detail-eyebrow">Section {selected.sectionNumber} › Chapter {selected.chapter} › Heading {selected.heading}</span>
            <h3 className="oc-hs-code">{displayCode(selected)}</h3>
            {taxes?.nationalCode && <p className="oc-muted">ERCA national code <span className="oc-mono">{taxes.nationalCode}</span>{taxes.unit ? ` · unit ${taxes.unit}` : ""}</p>}
            <p className="oc-hs-desc">{lineTitle(selected)}</p>
            {selected.hsDescription && selected.hsDescription !== selected.description && <p className="oc-muted">HS {selected.hsCode}: {selected.hsDescription}</p>}
            <div className="hs-tax-rates" aria-label="Tax rates">{taxes ? taxes.taxes.map(tax => <span key={tax.code} className={tax.listed ? "" : "is-unlisted"}><small title={tax.name}>{shortTaxNames[tax.code] ?? tax.code}</small><b>{tax.listed ? `${tax.rate}%` : "—"}</b></span>) : <small className="oc-muted">Loading rates…</small>}</div>
            {askNote && !isCurrent && <label className="oc-field">Reason for the change <small>(shared with the importer)</small><textarea rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="e.g. Specifications show a feature phone, not a smartphone." /></label>}
            <button type="button" className="oc-btn is-primary oc-hs-choose" disabled={busy || isCurrent} onClick={() => onSelect(selected, note.trim())}><FiCheck aria-hidden="true" />{isCurrent ? "Already the selected line" : busy ? "Saving…" : "Use this tariff line"}</button>
          </> : <div className="hs-detail-placeholder"><div className="hs-placeholder-icon"><FiFolder /></div><h2>Pick a tariff line</h2><p>Search or browse, then select a line to see its ERCA duty and tax rates.</p></div>}
        </aside>
      </div>
    </section>
  </div>;
}
