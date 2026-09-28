# API contract skeleton

Base URL in development: `http://localhost:5080`. JSON uses camelCase. All business routes require authenticated, server-authorized access. Only the three HS reads may permit anonymous synthetic data when demo mode is explicitly enabled in Development.

## Implemented read example

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/health/live` | Anonymous liveness only; does not check PostgreSQL/IAM |
| GET | `/api/hs-revisions` | Array of `id, name, number, effectiveDate, endDate, status` |
| GET | `/api/hs-codes?search=&revisionId=&page=1&pageSize=20` | `items, totalCount, page, pageSize` |
| GET | `/api/hs-codes/{id}` | HS DTO or 404 |
| GET | `/api/valuation-decisions` | Officer-owned Phase 1 valuation cases |
| POST | `/api/valuation-decisions` | Creates a Phase 1 handoff case and returns its case ID |
| GET | `/api/valuation-decisions/{id}` | Officer-owned Phase 1 case or 404 |
| GET | `/api/valuation-decisions/{id}/phase-2` | Phase 1 snapshot plus saved Phase 2 draft |
| POST | `/api/valuation-decisions/{id}/phase-2/calculate` | Provisional Phase 2 calculation preview; does not persist |
| PUT | `/api/valuation-decisions/{id}/phase-2` | Saves the Phase 2 draft and audit record |
| POST | `/api/valuation-decisions/{id}/phase-2/complete` | Saves and completes Phase 2 |

HS DTO: `id, revisionId, code, descriptionEn, descriptionAm`. Canonical codes are digit strings; dotted search is accepted. Page range is 1–100000, page size 1–100, search length at most 100; invalid query inputs return 400. Unknown revision filters produce an empty result. Errors use Problem Details. Cancellation tokens flow through handler and repository.

```json
{
  "items": [{"id":"33333333-3333-4333-8333-333333333333","revisionId":"11111111-1111-4111-8111-111111111111","code":"090111","descriptionEn":"Demo coffee product","descriptionAm":"የሙከራ ቡና"}],
  "totalCount":1,"page":1,"pageSize":20
}
```

## Protected route shells

These are controller route declarations, not completed endpoints. Policies below are provisional SRS role assignments; finalize administrative read inheritance and restricted historical/audit/export permissions in D04.

| Method | Route | Policy |
| --- | --- | --- |
| GET | `/api/hs-codes/{id}/history` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/correlations` | CustomsOfficer |
| GET | `/api/reference-prices` | CustomsOfficer |
| GET | `/api/reference-prices/{id}` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/international-prices` | CustomsOfficer |
| GET | `/api/manufacturer-prices/search?q={product}&market={market}&site={optionalDomainOrUrl}` | CustomsOfficer |
| GET | `/api/historical-customs-prices` | CustomsOfficer |
| GET | `/api/historical-customs-prices/{id}` | CustomsOfficer |
| GET | `/api/customs-trade-benchmark/search?hsCode={six-or-more-digits}` | CustomsOfficer |

The customs trade benchmark uses UN Comtrade's keyless annual preview. It first checks Ethiopia imports (reporter 231, world partner, six-digit HS code) across the last three completed calendar years. If none has usable quantity, it checks supplier exports to Ethiopia (partner 231, export flow, reporter parameter omitted) over the same years. The export fallback sums trade values and quantities only across compatible units and valuation bases; it is a quantity-weighted category average, not an average of country prices or an estimate of all Ethiopian imports. Duplicate/conflicting reporter totals and nonmatching years, HS codes, partners, flows, or dimensions are excluded.

Numeric [Comtrade quantity-unit codes](https://uncomtrade.org/docs/supplementary-quantity-units/) are supported even when the preview leaves the unit abbreviation null. Pairs, dozens, and thousands of items are normalized to `u`; kilograms and packages are never inferred to be individual items. An explicitly reported alternative item quantity is supported. Positive `cifvalue` (imports) or `fobvalue` (exports) is preferred; `primaryValue` is used otherwise and labelled `Reported trade value`. Responses include `isMirror`, `sourceLabel`, `valuationBasis`, `reporters`, `reporterCount`, and `quantityEstimated`, in addition to the source URL, period, value, quantity, unit, and explanation. The dashboard labels mirror/FOB evidence, keeps non-item quantities out of item-price selection, and retains provenance in saved valuation evidence. Export/FOB values exclude import freight and insurance and must not be presented as equivalent CIF import values.

No usable quantity across both sources yields HTTP 200 with null `unitValue`; no product price is fabricated. Provider/network/malformed-response errors yield actionable HTTP 502/503/504 problem details, not a false no-data result. Preview calls are serialized and paced across users, with one bounded retry for throttling or transient server failures and a 60-second lookup deadline. Successful benchmarks are cached for 12 hours, no-data results for 15 minutes, and errors are not cached. The result is an HS-category reference, not an exact product price or previously accepted customs valuation.
| GET | `/api/hs-codes/{id}/historical-customs-prices` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/statistics` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/trend` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/country-comparison` | CustomsOfficer |
| POST | `/api/integrations/hs/sync` | SystemAdministrator |
| POST | `/api/integrations/comtrade/sync` | SystemAdministrator |
| POST | `/api/integrations/itc/sync` | SystemAdministrator |
| POST | `/api/integrations/wits/sync` | SystemAdministrator |
| POST | `/api/integrations/nbe/exchange-rates/sync` | SystemAdministrator |
| POST | `/api/hs-revisions` | CustomsAdministrator |
| GET | `/api/price-sources` | CustomsAdministrator |
| POST | `/api/price-sources` | CustomsAdministrator |
| GET | `/api/audit-logs` | SystemAdministrator |
| POST | `/api/reports/{reportType}/exports` | CustomsOfficer |

## Contract work for feature implementation

- Prices: paginated international and historical queries by HS code/revision, date range, source and unit. Never return a blended evidence set as an ordinary list. Add metadata and provenance DTOs before write endpoints.
- Manufacturer prices: Apify searches an inferred or officer-supplied official site and returns exact product-page links, original prices/currencies when available, source labels, and a status (`found`, `no_price`, or `site_required`). The portal converts eligible offers through `/api/exchange-rates/convert`; the chosen offer and provenance are captured in the Phase 1 valuation evidence snapshot.
- Analytics: require explicit currency/unit/date window and comparison policy version; return one result per pool with eligibility/exclusion counts. Include null statistics for no observations; outlier flags do not remove records.
- Decisions: POST body includes HS code ID, selected reference amount/currency, decision, mandatory justification and typed evidence IDs. Server resolves actor, policy and immutable snapshots. Use an idempotency key and concurrency/version rule; return 201 with saved decision URL after atomic audit commit.
- Integrations: request source/period/revision and idempotency key; validate source approval before enqueue; return 202 with a job-status URL. Add `GET /api/integration-jobs/{id}` with progress/quarantine counts. Never claim completion on enqueue.
- Outlier review: proposed `POST /api/outlier-reviews` with evidence pool/ID, disposition, rule version and justification; full history retained.
- Reports: POST export request with report type, format and filters; validate role and source visibility; return asynchronous job ID for large reports. Add authorized job status/download endpoints.
- Draft schemas for these write requests and responses must be reviewed in the corresponding phase before implementation. Add generated OpenAPI and contract checks when IAM and runtime package baseline are approved.

Expected status semantics: 400 invalid input, 401 missing/invalid identity, 403 insufficient permission, 404 inaccessible or absent resource according to agreed disclosure policy, 409 duplicate/version conflict, 422 unusable evidence/rate according to agreed API convention, 503 transient dependency failure. These production error paths are planned; only the HS example's 400/404 and scaffold 401/501 behavior exist now.
