import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { emptyPriceFilters, filterPrices, internationalPrices, pricesToCsv } from "../lib/international-prices.ts";

const find = (filters, sort = "newest") => filterPrices(internationalPrices, { ...emptyPriceFilters, ...filters }, sort, product => product === "coffee" ? "የሙከራ ጥሬ ቡና" : "Demo static converter");

test("search accepts dotted HS codes, translated descriptions and record IDs", () => {
  assert.equal(find({ search: "0901.11" }).length, 7);
  assert.equal(find({ search: "ቡና" }).length, 7);
  assert.equal(find({ search: "DEMO-IP-003" })[0].id, "DEMO-IP-003");
  assert.equal(find({ search: "nonexistent" }).length, 0);
  assert.equal(find({ search: "." }).length, 0);
});
test("filters intersect and dates include both boundaries", () => {
  assert.deepEqual(find({ origin: "BR", from: "2026-07-23", to: "2026-08-28" }).map(r => r.id), ["DEMO-IP-001", "DEMO-IP-008"]);
  assert.deepEqual(find({ origin: "BR", source: "B", status: "reviewed" }).map(r => r.id), ["DEMO-IP-008"]);
  assert.equal(find({ from: "2026-09-01", to: "2026-08-01" }).length, 0);
  assert.equal(find({ status: "pending", source: "A" }).length, 0);
});
test("sorting leaves fixtures unchanged", () => {
  const original = internationalPrices.map(r => r.id);
  assert.equal(find({}, "oldest")[0].id, "DEMO-IP-012");
  assert.equal(find({}, "newest")[0].id, "DEMO-IP-001");
  assert.equal(find({}, "code")[0].hsCode, "090111");
  assert.deepEqual(internationalPrices.map(r => r.id), original);
});
test("CSV exports the complete filtered set with currencies, units and demo provenance", () => {
  const csv = pricesToCsv(find({ search: "090111" }));
  assert.equal(csv.split("\r\n").length, 8);
  assert.ok(csv.includes('"\'090111"'));
  assert.ok(csv.includes('"SYNTHETIC DEMO"'));
  assert.ok(csv.includes('"USD","4.82","kg","18000","86760.00"'));
  assert.ok(!csv.includes("DEMO-IP-003"));
  const escaped = pricesToCsv([{ ...internationalPrices[0], source: 'A,"B"', id: '=HYPERLINK("example")' }]);
  assert.ok(escaped.includes('"Demo source A,""B"""'));
  assert.ok(escaped.includes('"\'=HYPERLINK(""example"")"'));
});
test("both supported languages cover all international price labels", () => {
  const en = JSON.parse(readFileSync(new URL("../lib/i18n/locales/en.json", import.meta.url), "utf8"));
  const am = JSON.parse(readFileSync(new URL("../lib/i18n/locales/am.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(en.prices).sort(), Object.keys(am.prices).sort());
  assert.deepEqual(Object.keys(en.prices.countries).sort(), Object.keys(am.prices.countries).sort());
});
