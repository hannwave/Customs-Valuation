"use client";

import { useState } from "react";
import { Modal } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { emptyPriceFilters, filterPrices, internationalPrices, pricesToCsv,
  type InternationalPrice, type PriceFilters, type PriceSort } from "@/lib/international-prices";
import styles from "./prices.module.css";

const pageSize = 6;
const origins = [...new Set(internationalPrices.map(record => record.origin))].sort();
const sources = [...new Set(internationalPrices.map(record => record.source))].sort();

export default function InternationalPricesPage() {
  const { t, i18n } = useTranslation();
  const label = (key: string) => t(`prices.${key}`);
  const [filters, setFilters] = useState<PriceFilters>(emptyPriceFilters);
  const [sort, setSort] = useState<PriceSort>("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<InternationalPrice | null>(null);
  const [exportMessage, setExportMessage] = useState("");
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  const records = invalidDates ? [] : filterPrices(internationalPrices, filters, sort, key => label(key));
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const locale = i18n.language === "am" ? "am-ET" : "en-GB";
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const money = (record: InternationalPrice, total = false) => new Intl.NumberFormat(locale, {
    style: "currency", currency: record.currency, currencyDisplay: "code", minimumFractionDigits: 2,
  }).format(total ? record.unitPrice * record.quantity : record.unitPrice);
  const date = (value: string) => new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
  function updateFilter(key: keyof PriceFilters, value: string) {
    setFilters(previous => ({ ...previous, [key]: value })); setPage(1); setExportMessage("");
  }
  function resetFilters() { setFilters(emptyPriceFilters); setPage(1); setExportMessage(""); }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([pricesToCsv(records)], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "international-prices-demo.csv";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportMessage(t("prices.exported", { count: records.length }));
  }
  const statusBadge = (record: InternationalPrice) => <span className={`${styles.badge} ${record.status === "reviewed" ? styles.reviewed : styles.pending}`}>{label(record.status)}</span>;

  return <div className={styles.page}>
    <div className={styles.heading}>
      <div><p className="eyebrow">{label("eyebrow")}</p><h1>{t("international")}</h1>
        <p className={styles.intro}>{label("intro")}</p></div>
      <button className={styles.exportButton} onClick={exportCsv} disabled={!records.length}>{label("export")}</button>
    </div>
    <div className={styles.notice} role="note"><span className={styles.demoPill}>{label("demo")}</span><span>{label("demoNotice")}</span></div>
    <div className={styles.metrics}>
      {[["observations", records.length], ["origins", new Set(records.map(r => r.origin)).size],
        ["sources", new Set(records.map(r => r.source)).size], ["pending", records.filter(r => r.status === "pending").length]].map(([key, value]) =>
        <div className={styles.metric} key={key}><span>{label(String(key))}</span><strong>{number(Number(value))}</strong><small>{label("filteredSet")}</small></div>)}
    </div>
    <section className={styles.panel} aria-labelledby="price-filters-title">
      <div className={styles.sectionHeading}><h2 id="price-filters-title">{label("filters")}</h2>
        <button className={styles.textButton} disabled={!activeFilters} onClick={resetFilters}>{label("clear")}{activeFilters > 0 ? ` (${activeFilters})` : ""}</button></div>
      <div className={styles.filters}>
        <label className={styles.search}>{t("search")}<input type="search" placeholder={label("searchPlaceholder")} maxLength={100} value={filters.search} onChange={e => updateFilter("search", e.target.value)} /></label>
        <label>{label("origin")}<select value={filters.origin} onChange={e => updateFilter("origin", e.target.value)}><option value="">{label("allCountries")}</option>{origins.map(value => <option key={value} value={value}>{label(`countries.${value}`)}</option>)}</select></label>
        <label>{label("source")}<select value={filters.source} onChange={e => updateFilter("source", e.target.value)}><option value="">{label("allSources")}</option>{sources.map(value => <option key={value} value={value}>{t("prices.sourceName", { source: value })}</option>)}</select></label>
        <label>{label("status")}<select value={filters.status} onChange={e => updateFilter("status", e.target.value)}><option value="">{label("allStatuses")}</option><option value="reviewed">{label("reviewed")}</option><option value="pending">{label("pending")}</option></select></label>
        <label>{label("from")}<input type="date" value={filters.from} aria-invalid={invalidDates} aria-describedby={invalidDates ? "date-error" : undefined} onChange={e => updateFilter("from", e.target.value)} /></label>
        <label>{label("to")}<input type="date" value={filters.to} aria-invalid={invalidDates} aria-describedby={invalidDates ? "date-error" : undefined} onChange={e => updateFilter("to", e.target.value)} /></label>
      </div>
      {invalidDates && <p id="date-error" role="alert">{label("dateError")}</p>}
    </section>
    <section className={styles.results} aria-labelledby="price-records-title">
      <div className={styles.resultsHeading}><div><h2 id="price-records-title">{label("records")}</h2><p role="status">{t("prices.resultCount", { count: records.length })}</p></div>
        <label className={styles.sort}>{label("sort")}<select value={sort} onChange={e => { setSort(e.target.value as PriceSort); setPage(1); }}><option value="newest">{label("newest")}</option><option value="oldest">{label("oldest")}</option><option value="code">{t("code")}</option></select></label></div>
      <div className={styles.tableScroll} role="region" aria-label={label("records")} tabIndex={0}>
        <table className={styles.table}><caption className={styles.srOnly}>{label("tableCaption")}</caption>
          <thead><tr>{["product", "origin", "unitPrice", "source", "date", "status", "details"].map(key => <th scope="col" key={key}>{label(key)}</th>)}</tr></thead>
          <tbody>{visible.map(record => <tr key={record.id}>
            <td><span className={styles.code}>{record.hsCode}</span><strong className={styles.product}>{label(record.product)}</strong><small>{record.revision} · {record.id}</small></td>
            <td>{label(`countries.${record.origin}`)}<small>{record.incoterm}</small></td>
            <td className={styles.price}><strong>{money(record)}</strong><small>{label("per")} {label(record.unit)}</small></td>
            <td>{t("prices.sourceName", { source: record.source })}</td><td className={styles.date}>{date(record.date)}</td><td>{statusBadge(record)}</td>
            <td><button className={styles.viewButton} aria-label={`${label("view")} ${record.id}`} onClick={() => setSelected(record)}>{label("view")} <span aria-hidden="true">↗</span></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!records.length && <div className={styles.empty}><span aria-hidden="true">⌕</span><h3>{label("emptyTitle")}</h3><p>{invalidDates ? label("dateError") : label("emptyBody")}</p><button onClick={resetFilters}>{label("clear")}</button></div>}
      <div className={styles.footer}><span>{t("prices.showing", { from: records.length ? (currentPage - 1) * pageSize + 1 : 0, to: Math.min(currentPage * pageSize, records.length), total: records.length })}</span>
        <div className={styles.pagination}><button className={styles.secondaryButton} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{t("previous")}</button><span>{currentPage} / {pages}</span><button className={styles.secondaryButton} disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>{t("next")}</button></div></div>
    </section>
    <p className={styles.footnote}>{label("basisNote")}</p><p className={styles.exportStatus} role="status">{exportMessage}</p>
    <Modal opened={Boolean(selected)} onClose={() => setSelected(null)} title={label("recordDetails")} size="lg" centered closeButtonProps={{ "aria-label": label("close") }} classNames={{ header: styles.modalHeader, title: styles.modalTitle }}>
      {selected && <div className={styles.detail}>
        <div className={styles.detailHeading}><span className={styles.code}>{selected.hsCode}</span>{statusBadge(selected)}</div>
        <h2>{label(selected.product)}</h2><p className={styles.recordId}>{selected.id} · {selected.revision}</p>
        <div className={styles.priceHighlight}><span>{label("unitPrice")}</span><strong>{money(selected)} <small>/ {label(selected.unit)}</small></strong><p>{label("originalCurrency")}</p></div>
        <dl className={styles.detailGrid}>{[
          ["origin", label(`countries.${selected.origin}`)], ["destination", label(`countries.${selected.destination}`)],
          ["date", date(selected.date)], ["incoterm", selected.incoterm],
          ["quantity", `${number(selected.quantity)} ${label(selected.unit)}`], ["total", money(selected, true)],
          ["source", t("prices.sourceName", { source: selected.source })], ["sourceReference", `FIXTURE-${selected.source}-${selected.id.slice(-3)}`],
        ].map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{value}</dd></div>)}</dl>
        <div className={styles.provenance}><h3>{label("provenance")}</h3><p>{label("provenanceNote")}</p></div>
        <button className={styles.secondaryButton} onClick={() => setSelected(null)}>{label("close")}</button>
      </div>}
    </Modal>
  </div>;
}
