// Synthetic frontend fixtures. Replace this data source with an API adapter.
export type InternationalPrice = {
  id: string; hsCode: string; revision: string; product: "coffee" | "converter";
  origin: string; destination: string; source: string; date: string;
  currency: "USD" | "EUR"; unit: "kg" | "item"; unitPrice: number; quantity: number;
  incoterm: "FOB" | "CIF"; status: "reviewed" | "pending";
};
type Fixture = [string, InternationalPrice["product"], string, string, string,
  InternationalPrice["currency"], number, number, InternationalPrice["incoterm"], InternationalPrice["status"]];
const fixtures: Fixture[] = [
  ["001", "coffee", "BR", "A", "2026-08-28", "USD", 4.82, 18000, "FOB", "reviewed"],
  ["002", "coffee", "VN", "B", "2026-08-24", "USD", 3.46, 22000, "FOB", "reviewed"],
  ["003", "converter", "CN", "C", "2026-08-22", "USD", 28.50, 1200, "CIF", "pending"],
  ["004", "coffee", "CO", "A", "2026-08-18", "USD", 5.24, 12000, "FOB", "reviewed"],
  ["005", "converter", "DE", "B", "2026-08-15", "EUR", 42.75, 800, "FOB", "reviewed"],
  ["006", "coffee", "KE", "C", "2026-08-10", "USD", 5.68, 9500, "CIF", "pending"],
  ["007", "converter", "CN", "A", "2026-07-29", "USD", 26.90, 2000, "FOB", "reviewed"],
  ["008", "coffee", "BR", "B", "2026-07-23", "USD", 4.65, 16000, "FOB", "reviewed"],
  ["009", "converter", "DE", "C", "2026-07-16", "EUR", 44.10, 650, "CIF", "pending"],
  ["010", "coffee", "VN", "A", "2026-07-08", "USD", 3.38, 24000, "FOB", "reviewed"],
  ["011", "coffee", "CO", "C", "2026-06-20", "USD", 5.12, 11000, "CIF", "pending"],
  ["012", "converter", "CN", "B", "2026-06-12", "USD", 27.25, 1500, "FOB", "reviewed"],
];
export const internationalPrices: InternationalPrice[] = fixtures.map(
  ([id, product, origin, source, date, currency, unitPrice, quantity, incoterm, status]) => ({
    id: `DEMO-IP-${id}`, product, origin, source, date, currency, unitPrice, quantity, incoterm, status,
    hsCode: product === "coffee" ? "090111" : "850440", revision: "HS 2022",
    destination: "ET", unit: product === "coffee" ? "kg" : "item",
  }));
export type PriceFilters = {
  search: string; origin: string; source: string; status: string; from: string; to: string;
};
export const emptyPriceFilters: PriceFilters = { search: "", origin: "", source: "", status: "", from: "", to: "" };
export type PriceSort = "newest" | "oldest" | "code";
export function filterPrices(records: InternationalPrice[], filters: PriceFilters, sort: PriceSort,
  productLabel: (product: InternationalPrice["product"]) => string) {
  const query = filters.search.trim().toLocaleLowerCase();
  const codeQuery = query.replace(/[.\s]/g, "");
  return records.filter(record => (
    (!query || (Boolean(codeQuery) && record.hsCode.includes(codeQuery)) || `${record.id} ${record.product} ${productLabel(record.product)}`.toLocaleLowerCase().includes(query)) &&
    (!filters.origin || record.origin === filters.origin) && (!filters.source || record.source === filters.source) &&
    (!filters.status || record.status === filters.status) && (!filters.from || record.date >= filters.from) &&
    (!filters.to || record.date <= filters.to)
  )).sort((a, b) => sort === "code" ? a.hsCode.localeCompare(b.hsCode) || b.date.localeCompare(a.date)
    : sort === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
}
// Quote cells, retain leading zeroes in HS codes, and neutralize spreadsheet formulas.
export function pricesToCsv(records: InternationalPrice[]) {
  const cell = (value: string | number) => {
    const text = String(value);
    return `"${(/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
  };
  const rows = records.map(r => ["SYNTHETIC DEMO", r.id, `'${r.hsCode}`, r.revision, r.product, r.origin,
    r.destination, `Demo source ${r.source}`, r.date, r.currency, r.unitPrice, r.unit, r.quantity,
    (r.unitPrice * r.quantity).toFixed(2), r.incoterm, r.status]);
  return "\uFEFF" + [["Data type", "Record ID", "HS code (text)", "Revision", "Product", "Origin", "Destination",
    "Source", "Observation date", "Currency", "Unit price", "Unit", "Quantity", "Original total", "Incoterm", "Demo review status"],
    ...rows].map(row => row.map(cell).join(",")).join("\r\n");
}
