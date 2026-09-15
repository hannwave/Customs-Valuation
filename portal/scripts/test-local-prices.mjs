import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { emptyLocalPriceFilters, filterLocalPrices, inclusionLabel, localMarkets, localPriceCategories,
  localPrices, localPricesToCsv, localVerificationStatus } from "../lib/local-prices.ts";

const find = (filters = {}, sort = "newest") => filterLocalPrices(localPrices,
  { ...emptyLocalPriceFilters, ...filters }, sort, product => product === "coffee" ? "የሙከራ ጥሬ ቡና" : "Demo static converter");

test("search handles dotted HS codes, translated descriptions, IDs and empty results", () => {
  assert.equal(find({ search: "0901.11" }).length, 8);
  assert.equal(find({ search: "ቡና" }).length, 8);
  assert.equal(find({ search: " STATIC " }).length, 7);
  assert.deepEqual(find({ search: "demo-lp-004" }).map(r => r.id), ["DEMO-LP-004"]);
  assert.equal(find({ search: "unmatched" }).length, 0);
  assert.equal(find({ search: "." }).length, 0);
});
test("market, category, supplier and verification filters intersect", () => {
  assert.deepEqual(find({ marketId: "addis", category: "supplierQuotation", supplier: "D", status: "pending" }).map(r => r.id), ["DEMO-LP-004", "DEMO-LP-008"]);
  assert.equal(find({ category: "supplierQuotation", status: "verified" }).length, 0);
  assert.equal(find({ status: "pending" }).length, 5);
  for (const category of localPriceCategories) {
    const results = find({ category });
    assert.ok(results.length > 0);
    assert.ok(results.every(r => r.category === category));
  }
});
test("observation date boundaries are inclusive and reversed ranges return no records", () => {
  assert.deepEqual(find({ from: "2026-08-25", to: "2026-08-29" }).map(r => r.id), ["DEMO-LP-001", "DEMO-LP-002", "DEMO-LP-003"]);
  assert.equal(find({ from: "2026-09-01", to: "2026-08-01" }).length, 0);
  assert.equal(find({ from: "2027-01-01" }).length, 0);
  assert.equal(find({ to: "2026-06-10" }).length, 1);
});
test("sorting preserves fixtures and the reset filter set returns all observations", () => {
  const before = localPrices.map(r => r.id);
  assert.equal(find({}, "newest")[0].id, "DEMO-LP-001");
  assert.equal(find({}, "oldest")[0].id, "DEMO-LP-015");
  assert.equal(find({}, "code")[0].hsCode, "090111");
  assert.equal(find(emptyLocalPriceFilters).length, 15);
  assert.deepEqual(localPrices.map(r => r.id), before);
});
test("unknown cost inclusion is distinct from excluded and verification dates remain consistent", () => {
  assert.equal(inclusionLabel(null), "unknown");
  assert.equal(inclusionLabel(false), "excluded");
  assert.equal(inclusionLabel(true), "included");
  assert.equal(new Set(localPrices.map(r => r.id)).size, localPrices.length);
  for (const record of localPrices) {
    assert.ok(record.quantity > 0 && record.unitPrice > 0);
    assert.ok(localMarkets.some(m => m.id === record.marketId));
    if (record.verificationDate) {
      assert.equal(localVerificationStatus(record), "verified");
      assert.ok(record.verificationDate >= record.date);
    } else assert.equal(localVerificationStatus(record), "pending");
  }
});
test("CSV exports all filtered records, original units, cost basis and demo provenance", () => {
  const csv = localPricesToCsv(find({ search: "coffee" }));
  assert.equal(csv.split("\r\n").length, 9); // All eight matches, including those after page one.
  assert.ok(csv.includes('"SYNTHETIC DEMO"'));
  assert.ok(csv.includes('"\'090111"'));
  assert.ok(csv.includes('"ETB","685","kg","100","68500.00","included","excluded","excluded"'));
  assert.ok(csv.includes('"unknown","unknown","unknown","pending","Not verified"'));
  assert.ok(!csv.includes("DEMO-LP-002"));
  const escaped = localPricesToCsv([{ ...localPrices[0], supplier: 'A,"B"', sourceReference: '  =HYPERLINK("example")' }]);
  assert.ok(escaped.includes('"Demo supplier A,""B"""'));
  assert.ok(escaped.includes('"\'  =HYPERLINK(""example"")"'));
});
test("English and Amharic cover local labels, categories, markets, regions and sources", () => {
  const en = JSON.parse(readFileSync(new URL("../lib/i18n/locales/en.json", import.meta.url), "utf8"));
  const am = JSON.parse(readFileSync(new URL("../lib/i18n/locales/am.json", import.meta.url), "utf8"));
  function keys(object, prefix = "") {
    return Object.entries(object).flatMap(([key, value]) => typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]).sort();
  }
  assert.deepEqual(keys(en.localPrices), keys(am.localPrices));
  for (const resource of [en.localPrices, am.localPrices]) {
    for (const category of localPriceCategories) assert.ok(resource.categories[category]);
    for (const market of localMarkets) {
      assert.ok(resource.markets[market.id]);
      assert.ok(resource.regions[market.region]);
    }
    for (const record of localPrices) {
      assert.ok(resource.sourceTypes[record.source]);
      assert.ok(resource[record.specification]);
    }
  }
});
