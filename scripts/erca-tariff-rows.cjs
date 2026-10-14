// Converts the raw scrape into importer rows and reports coverage against the full code lookup.
const fs = require("fs");
const path = require("path");
const dir = process.argv[2];
const codes = Object.values(JSON.parse(fs.readFileSync(path.join(dir, "erca-codes.json"), "utf8"))).flat();
const headings = JSON.parse(fs.readFileSync(path.join(dir, "erca-lines.json"), "utf8"));
const rows = new Map();
for (const heading of Object.values(headings)) for (const row of heading.rows) {
  const code = row.code.replace(/\D/g, "");
  if (code.length === 11 && !rows.has(code)) rows.set(code, { code, description: row.description, unit: row.unit, rates: row.rates });
}
const missing = codes.filter(c => !rows.has(c.code));
const extra = [...rows.keys()].filter(code => !codes.some(c => c.code === code));
const counts = {};
for (const row of rows.values()) for (const [tax, value] of Object.entries(row.rates)) if (value !== "") counts[tax] = (counts[tax] ?? 0) + 1;
const values = {};
for (const row of rows.values()) for (const [tax, value] of Object.entries(row.rates)) { values[tax] ??= {}; values[tax][value || "(blank)"] = (values[tax][value || "(blank)"] ?? 0) + 1; }
const short = Object.values(headings).filter(h => h.rows.length < h.found).length;
const sorted = [...rows.values()].sort((a, b) => a.code.localeCompare(b.code));
fs.writeFileSync(path.join(dir, "erca-tariff-rows.json"), JSON.stringify(sorted, null, 0));
console.log(JSON.stringify({ lookupCodes: codes.length, scrapedRows: rows.size, missingFromScrape: missing.length, missingSample: missing.slice(0, 10).map(c => c.code), extraNotInLookup: extra.length, headingsShort: short, ratesPresent: counts, distinctValues: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 12)])) }, null, 1));
