"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FiBookOpen, FiChevronDown, FiChevronRight, FiFolder, FiSearch, FiX } from "react-icons/fi";
import { importerApi, type CatalogOption, type TariffOption } from "@/lib/importer";
import { HsItem } from "@/components/hs/HsItem";
import { readableTariffText } from "@/lib/officer-case";

export type TariffTaxes = { nationalCode: string | null; unit: string; taxes: { code: string; name: string; listed: boolean; rate: number | null }[] };
type Mode = "search" | "browse";
const shortTaxNames: Record<string, string> = { DR: "Duty", ER: "Excise", VAT: "VAT", WHR: "Withholding", SR: "Surtax", EXR: "Export duty", D2R: "2nd sched. duty", DSR: "2nd sched. special", DAR: "2nd sched. additional" };

const catalog = <T,>(params: Record<string, string>) => importerApi<T>(`/importer-declarations/catalog?${new URLSearchParams(params)}`);
export const tariffDisplayCode = (item: TariffOption) => item.tariffItemNo || item.hsCode;
export const tariffLineTitle = (item: TariffOption) => readableTariffText(item.description, item.hsDescription);

function Row({ label, meta, open, onToggle, className, leaf, selected, after, children }: { label: ReactNode; meta?: ReactNode; open?: boolean; onToggle: () => void; className: string; leaf?: boolean; selected?: boolean; after?: ReactNode; children?: ReactNode }) {
  return <div className={`hs-tree-branch ${className}${selected ? " is-selected" : ""}`}>
    <button type="button" className="hs-tree-row" aria-expanded={leaf ? undefined : open} aria-pressed={leaf ? selected : undefined} onClick={onToggle}>
      {leaf ? <span className="hs-tree-row-spacer" aria-hidden="true" /> : open ? <FiChevronDown /> : <FiChevronRight />}
      <span className="hs-tree-row-copy"><strong>{label}</strong>{meta && <small>{meta}</small>}</span>
    </button>
    {after}
    {open && children}
  </div>;
}

/**
 * Tariff-book chooser shared by the officer's HS picker and the importer's declaration form: search the whole book or
 * browse Section › Chapter › Heading, and preview the selected line with its published ERCA rates. The caller renders
 * the action for the selected line (choose, save with a note, …) through <c>action</c>.
 */
export function TariffBrowser({ initialQuery, currentLineId, currentLabel = "current", autoFocus, className = "", action, inlineAction = true }: {
  /** Also show the action under the selected row; turn off when the action has its own form fields. */
  inlineAction?: boolean;
  initialQuery: string; currentLineId?: string | null; currentLabel?: string; autoFocus?: boolean; className?: string;
  action: (selected: TariffOption, taxes: TariffTaxes | null) => ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState(initialQuery.slice(0, 100));
  const [results, setResults] = useState<TariffOption[]>([]);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [sections, setSections] = useState<CatalogOption[]>([]);
  const [children, setChildren] = useState<Record<string, CatalogOption[] | TariffOption[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingKey, setLoadingKey] = useState("");
  const [selected, setSelected] = useState<TariffOption | null>(null);
  const [taxes, setTaxes] = useState<TariffTaxes | null>(null);
  const [error, setError] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (autoFocus) { searchInput.current?.focus(); searchInput.current?.select(); } }, [autoFocus]);

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
    void importerApi<TariffTaxes>(`/tariff/lines/${selected.tariffLineId}/taxes`).then(value => { if (current) setTaxes(value); }).catch(() => { if (current) setTaxes(null); });
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

  const label = (item: TariffOption) => <><HsItem code={tariffDisplayCode(item)} description={tariffLineTitle(item)} />{item.tariffLineId === currentLineId && <em className="hs-tree-current">{currentLabel}</em>}</>;
  // The selected line carries the caller's action right under it, so it is next to where the person clicked.
  const pick = (item: TariffOption) => inlineAction && selected?.tariffLineId === item.tariffLineId ? <div className="hs-tree-pick">{action(item, taxes)}</div> : null;
  const lineRow = (item: TariffOption) => <Row key={item.tariffLineId} className="hs-tree-tariff" leaf selected={selected?.tariffLineId === item.tariffLineId}
    label={label(item)} onToggle={() => setSelected(item)} after={pick(item)} />;
  const loading = (key: string) => loadingKey === key ? <div className="hs-catalogue-loading">Loading…</div> : null;

  const tree = sections.map(section => {
    const sKey = `s:${section.code}`;
    return <Row key={sKey} className="hs-tree-section" label={<HsItem code={`Section ${section.code}`} description={section.name} />} meta={`${section.count} tariff lines`} open={expanded[sKey]} onToggle={() => void toggle(sKey, { stage: "chapters", section: section.code })}>
      <div className="hs-tree-children">{loading(sKey)}{((children[sKey] ?? []) as CatalogOption[]).map(chapter => {
        const cKey = `c:${chapter.code}`;
        return <Row key={cKey} className="hs-tree-chapter" label={<HsItem code={`Chapter ${chapter.code}`} description={chapter.name} />} meta={`${chapter.count} tariff lines`} open={expanded[cKey]} onToggle={() => void toggle(cKey, { stage: "headings", section: section.code, chapter: chapter.code })}>
          <div className="hs-tree-children">{loading(cKey)}{((children[cKey] ?? []) as CatalogOption[]).map(heading => {
            const hKey = `h:${heading.code}`;
            return <Row key={hKey} className="hs-tree-heading" label={<HsItem code={heading.code} description={heading.name !== heading.code ? heading.name : null} />} meta={`Heading · ${heading.count} tariff lines`} open={expanded[hKey]} onToggle={() => void toggle(hKey, { stage: "tariffs", section: section.code, chapter: chapter.code, heading: heading.code })}>
              <div className="hs-tree-children">{loading(hKey)}{((children[hKey] ?? []) as TariffOption[]).map(lineRow)}</div>
            </Row>;
          })}</div>
        </Row>;
      })}</div>
    </Row>;
  });

  return <div className={`tariff-browser ${className}`}>
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
          <div className="oc-hs-list-head" aria-live="polite">{searching ? "Searching…" : query.trim().length < 2 ? "Type at least two characters" : `${total} matching tariff lines${total > results.length ? `, best ${results.length} shown` : ""}${results.length && !selected ? " · select one to use it" : ""}`}</div>
          <div className="hs-tree-list">{results.map(item => <Row key={item.tariffLineId} className="hs-tree-tariff" leaf selected={selected?.tariffLineId === item.tariffLineId}
            label={label(item)} meta={item.chapterName && item.chapterName !== `Chapter ${item.chapter}` ? `Chapter ${item.chapter} · ${item.chapterName}` : `Chapter ${item.chapter}`} onToggle={() => setSelected(item)} after={pick(item)} />)}
            {!searching && query.trim().length >= 2 && results.length === 0 && <p className="hs-catalogue-empty">No tariff line matches. Try a broader word, or browse the tariff book.</p>}</div>
        </> : <div className="hs-tree-list">{sections.length ? tree : <div className="hs-catalogue-loading">Loading sections…</div>}</div>}
      </div>
      <aside className="oc-hs-detail">
        {selected ? <>
          <div className="oc-hs-detail-scroll">
          <span className="hs-detail-eyebrow">Section {selected.sectionNumber} › Chapter {selected.chapter} › Heading {selected.heading}</span>
          <h3 className="oc-hs-desc oc-hs-title"><HsItem code={tariffDisplayCode(selected)} description={tariffLineTitle(selected)} full /></h3>
          {taxes?.nationalCode && <p className="oc-muted">ERCA national code <span className="oc-mono">{taxes.nationalCode}</span>{taxes.unit ? ` · unit ${taxes.unit}` : ""}</p>}
          {selected.hsDescription && selected.hsDescription !== selected.description && <p className="oc-muted">Under <HsItem code={selected.hsCode} description={selected.hsDescription} full /></p>}
          <div className="hs-tax-rates" aria-label="Tax rates">{taxes ? taxes.taxes.map(tax => <span key={tax.code} className={tax.listed ? "" : "is-unlisted"}><small title={tax.name}>{shortTaxNames[tax.code] ?? tax.code}</small><b>{tax.listed ? `${tax.rate}%` : "—"}</b></span>) : <small className="oc-muted">Loading rates…</small>}</div>
          </div>
          <div className="oc-hs-detail-foot">{action(selected, taxes)}</div>
        </> : <div className="hs-detail-placeholder"><div className="hs-placeholder-icon"><FiFolder /></div><h2>Pick a tariff line</h2><p>Search or browse, then select a line to see its ERCA duty and tax rates.</p></div>}
      </aside>
    </div>
  </div>;
}
