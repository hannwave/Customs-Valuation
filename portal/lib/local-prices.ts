// Frontend-only synthetic evidence, kept separate from international observations.
export const localPriceCategories = ["wholesale", "retail", "manufacturer", "distributor", "supplierQuotation"] as const;
export type LocalPriceCategory = typeof localPriceCategories[number];
export const localMarkets = [
  { id: "addis", region: "addisAbaba" },
  { id: "adama", region: "oromia" },
  { id: "direDawa", region: "direDawa" },
  { id: "hawassa", region: "sidama" },
] as const;
export type LocalMarketId = typeof localMarkets[number]["id"];
export type LocalPrice = {
  id: string;
  hsCode: string;
  revision: string;
  product: "coffee" | "converter";
  marketId: LocalMarketId;
  supplier: string;
  category: LocalPriceCategory;
  date: string;
  verificationDate: string | null;
  currency: "ETB";
  unit: "kg" | "item";
  unitPrice: number;
  quantity: number;
  vatIncluded: boolean | null;
  otherTaxesIncluded: boolean | null;
  transportIncluded: boolean | null;
  source: "survey" | "quotation" | "catalog";
  sourceReference: string;
  specification: string;
};
type Fixture = [string, LocalPrice["product"], LocalMarketId, string, LocalPriceCategory, string,
  string | null, number, number, boolean | null, boolean | null, boolean | null];
const fixtures: Fixture[] = [
  ["001", "coffee", "addis", "A", "wholesale", "2026-08-29", "2026-08-30", 685, 100, true, false, false],
  ["002", "converter", "adama", "B", "distributor", "2026-08-27", "2026-08-28", 4850, 20, true, null, true],
  ["003", "coffee", "hawassa", "C", "retail", "2026-08-25", null, 790, 1, null, null, false],
  ["004", "converter", "addis", "D", "supplierQuotation", "2026-08-22", null, 4250, 50, false, false, null],
  ["005", "coffee", "adama", "A", "manufacturer", "2026-08-19", "2026-08-21", 625, 250, false, false, false],
  ["006", "coffee", "direDawa", "C", "wholesale", "2026-08-15", "2026-08-17", 710, 80, true, true, true],
  ["007", "converter", "hawassa", "B", "retail", "2026-08-11", "2026-08-12", 5600, 1, true, null, false],
  ["008", "coffee", "addis", "D", "supplierQuotation", "2026-08-06", null, 665, 150, null, null, null],
  ["009", "converter", "direDawa", "B", "distributor", "2026-07-30", "2026-08-01", 4725, 30, false, true, true],
  ["010", "coffee", "hawassa", "A", "manufacturer", "2026-07-23", "2026-07-25", 610, 300, false, false, false],
  ["011", "converter", "addis", "C", "retail", "2026-07-17", null, 5500, 2, null, null, false],
  ["012", "coffee", "adama", "D", "wholesale", "2026-07-09", "2026-07-10", 650, 120, true, false, null],
  ["013", "converter", "adama", "B", "manufacturer", "2026-06-26", "2026-06-28", 3900, 100, false, false, false],
  ["014", "coffee", "direDawa", "C", "retail", "2026-06-18", "2026-06-19", 760, 2, true, null, false],
  ["015", "converter", "hawassa", "D", "supplierQuotation", "2026-06-10", null, 4400, 25, null, null, null],
];
export const localPrices: LocalPrice[] = fixtures.map(
  ([id, product, marketId, supplier, category, date, verificationDate, unitPrice, quantity,
    vatIncluded, otherTaxesIncluded, transportIncluded]) => ({
    id: `DEMO-LP-${id}`, hsCode: product === "coffee" ? "090111" : "850440", revision: "HS 2022",
    product, marketId, supplier, category, date, verificationDate, unitPrice, quantity,
    vatIncluded, otherTaxesIncluded, transportIncluded, currency: "ETB", unit: product === "coffee" ? "kg" : "item",
    source: category === "supplierQuotation" ? "quotation" : category === "manufacturer" ? "catalog" : "survey",
    sourceReference: `LOCAL-FIXTURE-${id}`, specification: product === "coffee" ? "coffeeSpec" : "converterSpec",
  }));

export function localVerificationStatus(record: LocalPrice): "verified" | "pending" {
  return record.verificationDate ? "verified" : "pending";
}
export function inclusionLabel(value: boolean | null): "included" | "excluded" | "unknown" {
  return value === null ? "unknown" : value ? "included" : "excluded";
}
export type LocalPriceFilters = {
  search: string; marketId: string; category: string; supplier: string; status: string; from: string; to: string;
};
export type LocalPriceSort = "newest" | "oldest" | "code";
export const emptyLocalPriceFilters: LocalPriceFilters = {
  search: "", marketId: "", category: "", supplier: "", status: "", from: "", to: "",
};
export function filterLocalPrices(records: LocalPrice[], filters: LocalPriceFilters, sort: LocalPriceSort,
  productLabel: (product: LocalPrice["product"]) => string) {
  if (filters.from && filters.to && filters.from > filters.to) return [];
  const query = filters.search.trim().toLocaleLowerCase();
  const codeQuery = query.replace(/[.\s]/g, "");
  return records.filter(record => (
    (!query || (Boolean(codeQuery) && record.hsCode.includes(codeQuery)) ||
      `${record.id} ${record.product} ${productLabel(record.product)}`.toLocaleLowerCase().includes(query)) &&
    (!filters.marketId || record.marketId === filters.marketId) &&
    (!filters.category || record.category === filters.category) &&
    (!filters.supplier || record.supplier === filters.supplier) &&
    (!filters.status || localVerificationStatus(record) === filters.status) &&
    (!filters.from || record.date >= filters.from) && (!filters.to || record.date <= filters.to)
  )).sort((a, b) => sort === "code" ? a.hsCode.localeCompare(b.hsCode) || b.date.localeCompare(a.date)
    : sort === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
}

export function localPricesToCsv(records: LocalPrice[]) {
  const cell = (value: string | number) => {
    const text = String(value);
    return `"${(/^[\s]*[=+@\-]|^[\t\r\n]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
  };
  const rows = records.map(r => ["SYNTHETIC DEMO", r.id, `'${r.hsCode}`, r.revision, r.product,
    `Demo market: ${r.marketId}`, localMarkets.find(m => m.id === r.marketId)?.region ?? "",
    `Demo supplier ${r.supplier}`, r.category, r.date, r.currency, r.unitPrice, r.unit, r.quantity,
    (r.unitPrice * r.quantity).toFixed(2), inclusionLabel(r.vatIncluded), inclusionLabel(r.otherTaxesIncluded),
    inclusionLabel(r.transportIncluded), localVerificationStatus(r), r.verificationDate ?? "Not verified",
    `Demo ${r.source}`, r.sourceReference, r.specification]);
  return "\uFEFF" + [["Data type", "Record ID", "HS code (text)", "Revision", "Product", "Market", "Region",
    "Supplier", "Price category", "Observation date", "Currency", "Unit price", "Unit", "Quantity", "Original total",
    "VAT", "Other taxes", "Transport", "Demo verification status", "Demo verification date", "Source", "Source reference", "Specification key"],
    ...rows].map(row => row.map(cell).join(",")).join("\r\n");
}
