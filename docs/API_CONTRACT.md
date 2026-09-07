# API contract skeleton

Base URL in development: `http://localhost:5080`. JSON uses camelCase. All business routes require authenticated, server-authorized access in the target system. Only the three HS demo reads permit anonymous synthetic data in Development. The current deny-only authentication adapter cannot accept credentials; protected shells return 401 until IAM is implemented, and then 501 until their workflow is built.

## Implemented read example

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/health/live` | Anonymous liveness only; does not check PostgreSQL/IAM |
| GET | `/api/hs-revisions` | Array of `id, name, number, effectiveDate, endDate, status` |
| GET | `/api/hs-codes?search=&revisionId=&page=1&pageSize=20` | `items, totalCount, page, pageSize` |
| GET | `/api/hs-codes/{id}` | HS DTO or 404 |

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
| GET | `/api/local-prices` | CustomsOfficer |
| GET | `/api/local-prices/{id}` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/local-prices` | CustomsOfficer |
| GET | `/api/local-markets` | CustomsOfficer |
| GET | `/api/historical-customs-prices` | CustomsOfficer |
| GET | `/api/historical-customs-prices/{id}` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/historical-customs-prices` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/statistics` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/trend` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/country-comparison` | CustomsOfficer |
| GET | `/api/hs-codes/{id}/local-vs-international` | CustomsOfficer |
| POST | `/api/integrations/hs/sync` | SystemAdministrator |
| POST | `/api/integrations/comtrade/sync` | SystemAdministrator |
| POST | `/api/integrations/itc/sync` | SystemAdministrator |
| POST | `/api/integrations/wits/sync` | SystemAdministrator |
| POST | `/api/integrations/nbe/exchange-rates/sync` | SystemAdministrator |
| GET | `/api/valuation-decisions` | CustomsOfficer |
| POST | `/api/valuation-decisions` | CustomsOfficer |
| GET | `/api/valuation-decisions/{id}` | CustomsOfficer |
| POST | `/api/local-prices` | CustomsAdministrator |
| POST | `/api/hs-revisions` | CustomsAdministrator |
| GET | `/api/price-sources` | CustomsAdministrator |
| POST | `/api/price-sources` | CustomsAdministrator |
| GET | `/api/audit-logs` | SystemAdministrator |
| POST | `/api/reports/{reportType}/exports` | CustomsOfficer |

## Contract work for feature implementation

- Prices: paginated query by HS code/revision, pool-specific filters, date range, source, unit and verification status. Never return a blended pool as an ordinary list. Add metadata and provenance DTOs before write endpoints.
- Analytics: require explicit currency/unit/date window and comparison policy version; return one result per pool with eligibility/exclusion counts. Include null statistics for no observations; outlier flags do not remove records.
- Decisions: POST body includes HS code ID, selected reference amount/currency, decision, mandatory justification and typed evidence IDs. Server resolves actor, policy and immutable snapshots. Use an idempotency key and concurrency/version rule; return 201 with saved decision URL after atomic audit commit.
- Integrations: request source/period/revision and idempotency key; validate source approval before enqueue; return 202 with a job-status URL. Add `GET /api/integration-jobs/{id}` with progress/quarantine counts. Never claim completion on enqueue.
- Outlier review: proposed `POST /api/outlier-reviews` with evidence pool/ID, disposition, rule version and justification; full history retained.
- Reports: POST export request with report type, format and filters; validate role and source visibility; return asynchronous job ID for large reports. Add authorized job status/download endpoints.
- Draft schemas for these write requests and responses must be reviewed in the corresponding phase before implementation. Add generated OpenAPI and contract checks when IAM and runtime package baseline are approved.

Expected status semantics: 400 invalid input, 401 missing/invalid identity, 403 insufficient permission, 404 inaccessible or absent resource according to agreed disclosure policy, 409 duplicate/version conflict, 422 unusable evidence/rate according to agreed API convention, 503 transient dependency failure. These production error paths are planned; only the HS example's 400/404 and scaffold 401/501 behavior exist now.
