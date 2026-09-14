"use client";

import { useState } from "react";
import { Modal } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { emptyLocalPriceFilters, filterLocalPrices, inclusionLabel, localMarkets,
  localPriceCategories, localPrices, localPricesToCsv, localVerificationStatus,
  type LocalPrice, type LocalPriceFilters, type LocalPriceSort } from "@/lib/local-prices";
import styles from "@/components/price-browser.module.css";

const pageSize = 6;
const suppliers = [...new Set(localPrices.map(record => record.supplier))].sort();

export default function LocalPricesPage() {
  const { t, i18n } = useTranslation();
  const label = (key: string) => t([`localPrices.${key}`, `prices.${key}`]);
  const [filters, setFilters] = useState<LocalPriceFilters>(emptyLocalPriceFilters);
  const [sort, setSort] = useState<LocalPriceSort>("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<LocalPrice | null>(null);
  const [exportCount, setExportCount] = useState<number | null>(null);
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  const records = filterLocalPrices(localPrices, filters, sort, product => label(product));
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const locale = i18n.language === "am" ? "am-ET" : "en-GB";
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const money = (record: LocalPrice, total = false) => new Intl.NumberFormat(locale, {
    style: "currency", currency: record.currency, currencyDisplay: "code", minimumFractionDigits: 2,
  }).format(total ? record.unitPrice * record.quantity : record.unitPrice);
  const date = (value: string) => new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
  const marketName = (record: LocalPrice) => label(`markets.${record.marketId}`);
  const regionName = (record: LocalPrice) => label(`regions.${localMarkets.find(m => m.id === record.marketId)?.region}`);
  const supplierName = (supplier: string) => t("localPrices.supplierName", { supplier });
  function updateFilter(key: keyof LocalPriceFilters, value: string) {
    setFilters(previous => ({ ...previous, [key]: value })); setPage(1); setExportCount(null);
  }
  function resetFilters() { setFilters(emptyLocalPriceFilters); setPage(1); setExportCount(null); }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([localPricesToCsv(records)], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "local-market-prices-demo.csv";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportCount(records.length);
  }
  const statusBadge = (record: LocalPrice) => <span className={`${styles.badge} ${record.verificationDate ? styles.reviewed : styles.pending}`}>
    {label(localVerificationStatus(record))}
  </span>;

  return <div className={styles.page}>
    <div className={styles.heading}>
      <div><p className="eyebrow">{label("eyebrow")}</p><h1>{t("local")}</h1><p className={styles.intro}>{label("intro")}</p></div>
      <button className={styles.exportButton} onClick={exportCsv} disabled={!records.length}>{label("export")}</button>
    </div>
    <div className={styles.notice} role="note"><span className={styles.demoPill}>{label("demo")}</span><span>{label("demoNotice")}</span></div>
    <div className={styles.metrics}>
      {[["observations", records.length], ["marketCount", new Set(records.map(r => r.marketId)).size],
        ["supplierCount", new Set(records.map(r => r.supplier)).size], ["pending", records.filter(r => !r.verificationDate).length]].map(([key, value]) =>
        <div className={styles.metric} key={key}><span>{label(String(key))}</span><strong>{number(Number(value))}</strong><small>{label("filteredSet")}</small></div>)}
    </div>
    <section className={styles.panel} aria-labelledby="local-filters-title">
      <div className={styles.sectionHeading}><h2 id="local-filters-title">{label("filters")}</h2>
        <button className={styles.textButton} disabled={!activeFilters} onClick={resetFilters}>{label("clear")}{activeFilters > 0 ? ` (${activeFilters})` : ""}</button></div>
      <div className={styles.filters}>
        <label className={styles.search}>{t("search")}<input type="search" placeholder={label("searchPlaceholder")} maxLength={100} value={filters.search} onChange={e => updateFilter("search", e.target.value)} /></label>
        <label>{label("market")}<select value={filters.marketId} onChange={e => updateFilter("marketId", e.target.value)}><option value="">{label("allMarkets")}</option>{localMarkets.map(market => <option key={market.id} value={market.id}>{label(`markets.${market.id}`)}</option>)}</select></label>
        <label>{label("category")}<select value={filters.category} onChange={e => updateFilter("category", e.target.value)}><option value="">{label("allCategories")}</option>{localPriceCategories.map(category => <option key={category} value={category}>{label(`categories.${category}`)}</option>)}</select></label>
        <label>{label("supplier")}<select value={filters.supplier} onChange={e => updateFilter("supplier", e.target.value)}><option value="">{label("allSuppliers")}</option>{suppliers.map(supplier => <option key={supplier} value={supplier}>{supplierName(supplier)}</option>)}</select></label>
        <label>{label("status")}<select value={filters.status} onChange={e => updateFilter("status", e.target.value)}><option value="">{label("allStatuses")}</option><option value="verified">{label("verified")}</option><option value="pending">{label("pending")}</option></select></label>
        <label>{label("from")}<input type="date" value={filters.from} aria-invalid={invalidDates} aria-describedby={invalidDates ? "local-date-error" : undefined} onChange={e => updateFilter("from", e.target.value)} /></label>
        <label>{label("to")}<input type="date" value={filters.to} aria-invalid={invalidDates} aria-describedby={invalidDates ? "local-date-error" : undefined} onChange={e => updateFilter("to", e.target.value)} /></label>
      </div>
      {invalidDates && <p id="local-date-error" role="alert">{label("dateError")}</p>}
    </section>
    <section className={styles.results} aria-labelledby="local-records-title">
      <div className={styles.resultsHeading}><div><h2 id="local-records-title">{label("records")}</h2><p role="status">{t("prices.resultCount", { count: records.length })}</p></div>
        <label className={styles.sort}>{label("sort")}<select value={sort} onChange={e => { setSort(e.target.value as LocalPriceSort); setPage(1); }}><option value="newest">{label("newest")}</option><option value="oldest">{label("oldest")}</option><option value="code">{t("code")}</option></select></label></div>
      <div className={styles.tableScroll} role="region" aria-label={label("records")} tabIndex={0}>
        <table className={styles.table}><caption className={styles.srOnly}>{label("tableCaption")}</caption>
          <thead><tr>{["product", "market", "unitPrice", "category", "date", "status", "details"].map(key => <th scope="col" key={key}>{label(key)}</th>)}</tr></thead>
          <tbody>{visible.map(record => <tr key={record.id}>
            <td><span className={styles.code}>{record.hsCode}</span><strong className={styles.product}>{label(record.product)}</strong><small>{record.revision} · {record.id}</small></td>
            <td>{marketName(record)}<small>{supplierName(record.supplier)}</small></td>
            <td className={styles.price}><strong>{money(record)}</strong><small>{label("per")} {label(record.unit)}</small><small>{label("vat")}: {label(inclusionLabel(record.vatIncluded))}</small></td>
            <td>{label(`categories.${record.category}`)}</td><td className={styles.date}>{date(record.date)}</td><td>{statusBadge(record)}</td>
            <td><button className={styles.viewButton} aria-label={`${label("view")} ${record.id}`} onClick={() => setSelected(record)}>{label("view")} <span aria-hidden="true">↗</span></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!records.length && <div className={styles.empty}><span aria-hidden="true">⌕</span><h3>{label("emptyTitle")}</h3><p>{invalidDates ? label("dateError") : label("emptyBody")}</p><button onClick={resetFilters}>{label("clear")}</button></div>}
      <div className={styles.footer}><span>{t("prices.showing", { from: records.length ? (currentPage - 1) * pageSize + 1 : 0, to: Math.min(currentPage * pageSize, records.length), total: records.length })}</span>
        <div className={styles.pagination}><button className={styles.secondaryButton} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{t("previous")}</button><span>{currentPage} / {pages}</span><button className={styles.secondaryButton} disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>{t("next")}</button></div></div>
    </section>
    <p className={styles.footnote}>{label("basisNote")}</p><p className={styles.exportStatus} role="status">{exportCount !== null ? t("prices.exported", { count: exportCount }) : ""}</p>
    <Modal opened={Boolean(selected)} onClose={() => setSelected(null)} title={label("recordDetails")} size="lg" centered closeButtonProps={{ "aria-label": label("close") }} classNames={{ header: styles.modalHeader, title: styles.modalTitle }}>
      {selected && <div className={styles.detail}>
        <div className={styles.detailHeading}><span className={styles.code}>{selected.hsCode}</span>{statusBadge(selected)}</div>
        <h2>{label(selected.product)}</h2><p className={styles.recordId}>{selected.id} · {selected.revision}</p>
        <div className={styles.priceHighlight}><span>{label("unitPrice")}</span><strong>{money(selected)} <small>/ {label(selected.unit)}</small></strong><p>{label("priceNote")}</p></div>
        <dl className={styles.detailGrid}>{[
          ["market", marketName(selected)], ["region", regionName(selected)],
          ["supplier", supplierName(selected.supplier)], ["category", label(`categories.${selected.category}`)],
          ["date", date(selected.date)], ["verificationDate", selected.verificationDate ? date(selected.verificationDate) : label("notVerified")],
          ["quantity", `${number(selected.quantity)} ${label(selected.unit)}`], ["total", money(selected, true)],
          ["specification", label(selected.specification)], ["source", label(`sourceTypes.${selected.source}`)],
          ["sourceReference", selected.sourceReference],
        ].map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{value}</dd></div>)}</dl>
        <div className={styles.provenance}><h3>{label("costBasis")}</h3>
          <dl className={styles.detailGrid}>{([["vat", selected.vatIncluded], ["otherTaxes", selected.otherTaxesIncluded], ["transport", selected.transportIncluded]] as const).map(([key, value]) =>
            <div key={key}><dt>{label(key)}</dt><dd>{label(inclusionLabel(value))}</dd></div>)}</dl>
          <p>{label("inclusionNote")}</p>
        </div>
        <div className={styles.provenance}><h3>{label("provenance")}</h3><p>{label("provenanceNote")}</p></div>
        <button className={styles.secondaryButton} onClick={() => setSelected(null)}>{label("close")}</button>
      </div>}
    </Modal>
  </div>;
}
