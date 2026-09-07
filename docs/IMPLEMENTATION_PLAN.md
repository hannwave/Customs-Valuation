# Customs application implementation plan skeleton

## Delivery objective

Deliver a traceable customs decision-support workflow: authenticate an officer, select an HS revision and code, inspect comparable evidence in three separate price pools, review outliers, and record a justified decision with retained evidence and audit history. Administrators maintain approved classifications, sources and configuration.

The SRS is the product-requirements baseline. The overview summarizes it and identifies unresolved scope. Its suggested delivery sequence informs this plan; neither document authorizes deployment, data acquisition, communication to third parties or use of organization credentials.

## Scope and foundation status

The delivered skeleton implements the project structure, synthetic HS query example, draft persistence model, UI navigation, language resources and tested calculation primitives. It does not implement a production customs workflow. All phases below are remaining product work unless explicitly described as a delivered foundation.

| Phase | Result | Proposed accountable role | Depends on | Exit evidence |
| --- | --- | --- | --- | --- |
| 0 | Agreed scope, comparison and source rules | Product owner with customs lead | None | Signed decision log, source access matrix, measurable acceptance criteria |
| 1 | Secure platform and repeatable environments | Technical lead / platform engineer | Initial phase 0 decisions | IAM access tests, reviewed migration pipeline, CI build and test |
| 2 | Classification management and searchable catalogue | Backend + frontend leads | 1; approved HS/tariff source | Revision and correlation test set accepted by customs users |
| 3 | Traceable evidence in all three pools and NBE conversion | Data integration lead | 1–2; source access and comparison decisions | Verified imports, quarantine/retry tests, rate provenance tests |
| 4 | Officer comparison, review and decision workflow | Application lead / customs lead | 2–3 | End-to-end decision with immutable evidence and atomic audit |
| 5 | Complete analytics, integrations and reporting | Analytics / reporting lead | 3–4 | Reconciled statistics, outlier review, all required exports |
| 6 | Pilot and operational release | QA / operations / product owner | 1–5 | UAT sign-off, load/accessibility checks, restore drill and release runbook |

People, effort, budget and calendar dates remain to be assigned. These are dependency phases, not promised durations. Phase 5 source adapters may be developed alongside phase 4 once source contracts are stable.

## Phase 0 — scope and rules

- Confirm MVP: HS revisions/search, national tariff link, read/import/verify evidence, exact-date NBE conversion policy, separate pool comparison, justified decisions and audit.
- Define comparable groups across currency, quantity/unit, dates, countries, source reliability, product specification, brand/model, quality, local price category, taxes, VAT, transport, insurance, freight and Incoterm.
- Define missing data behavior: unknown is not zero; missing rate leaves normalization pending; records failing verification stay quarantined.
- Resolve the historical customs contract missing from the SRS table/API detail: authorized data owner, field mappings, access restrictions, retention and permitted uses.
- Decide rate date policy, rate direction, corrections, calculation precision and rounding. Decide standard deviation convention and optional percentile/outlier algorithms and minimum sample size.
- Confirm decision states and any review/approval requirement. No approval role or legally applicable valuation algorithm is assumed by the starter.
- Inventory source licensing/approval, transport, credentials owner, allowed use, refresh schedule and data-quality owner. WCO/Customs source classification remains separate from supplementary WTO information.
- Agree performance targets, expected data volumes, hosting topology, backup RPO/RTO, retention, accessibility and reporting-language requirements.

Exit: approved `DECISIONS.md` register and acceptance dataset; no unresolved business choice silently embedded in code.

## Phase 1 — platform, security and delivery

- Confirm `SES.Customs` naming, ownership and repository destination; adopt Core/Infrastructure/API boundaries described in `ARCHITECTURE.md`.
- Upgrade the compatibility baseline to an organization-approved supported runtime before release; .NET 8 support ends November 10, 2026. Coordinate .NET/EF/Npgsql package upgrades together.
- Lock and audit frontend/backend dependency versions; approve MediatR and export-library licensing; configure package feeds and CI lock-file enforcement.
- Implement OIDC authorization code with PKCE using the organization's approved client or BFF pattern. Implement API JWT bearer issuer/audience/lifetime/signature checks and role-claim mapping.
- Replace the deny-only IAM adapter and remove the production startup gate only after access tests pass. Keep demo fixtures unavailable outside Development.
- Define policy matrix: officer reads evidence and records decisions; customs administrator manages classification/sources/business settings; system administrator manages security and integrations. Confirm historical/audit/report restrictions explicitly.
- Add HTTPS, configured CORS origins, session expiry/renewal/logout, secret management, structured errors, correlation IDs and appropriate request limits.
- Review the EF model, add lookup/reference tables, database constraints and first migration; establish isolated development/test environments and reviewed migration rollout.
- Implement transactional unit-of-work/outbox boundaries for audit and jobs; database-level append-only audit permission strategy.
- Add CI build, tests, dependency checks and database migration verification. Set logging/metrics and health/readiness endpoints without exposing secrets.

Exit: unauthenticated/expired/incorrect-role requests fail; no client role spoofing; database migration works on a clean PostgreSQL instance; build artifacts are reproducible.

## Phase 2 — HS and national classification

- Replace synthetic fixtures with approved imports, staging validation, multilingual descriptions and official source provenance.
- Implement revision create/update/activate/retire with effective and end dates and source references.
- Add hierarchy where needed, canonical digit-string code validation and uniqueness per revision; preserve leading zeroes.
- Manage Ethiopian national tariff lines separately from WCO international codes and retain effective dates.
- Implement correlations with mapping-group IDs for one-to-one, one-to-many and many-to-one relationships; represent retained/revised/split/merged/deleted/replaced codes.
- Add history and correlation views and administrator maintenance screens with audit capture.
- Validate same-revision mistakes, duplicate edges, missing endpoints and effective-date boundaries. Decide treatment of historical observations across revisions; never silently recode historical evidence.

Exit: accepted sample mappings including split/merge/deletion; search by code, revision and English/Amharic description works with pagination and permissions.

## Phase 3 — prices, sources and exchange rates

- Add source approval lifecycle and country/currency/unit/market reference data. Confirm supplier identifiers and permitted source records.
- Implement international records with source/import country, trade flow/period, quantity/unit, trade value, currency, calculated unit price, Incoterm, source reference and retrieval timestamp.
- Implement local prices with market/supplier, date, quantity/unit, currency, category, VAT/tax/transport inclusion and verification date. Preserve unknown inclusion values.
- Implement historical customs records using the approved proposed schema and a separate API/persistence boundary; restrict sensitive declaration access.
- Add validated manual entry and staged file imports; validate zero/negative quantities, precision, dates, product/country/unit mappings and duplicate source records.
- Add approved NBE import/adapter, missing-rate status, exact approved date resolution, rate source/retrieval timestamps and protection against unauthorized modifications.
- Preserve original amounts/currency and immutable conversion snapshots or versioned rate links. Define total versus unit values explicitly before calculations.
- Implement idempotent sync jobs with progress, retries/backoff, quarantine and operator review. Store source version/file checksum and raw provenance where authorized.
- Implement publication/verification workflow before observations become eligible for analytics; ensure data and audit writes commit atomically.

Exit: rerunning an import creates no duplicate evidence; invalid rows are explainable; each accepted value traces to approved source, original amount and rate/version; pools cannot be blended by storage or analytics defaults.

## Phase 4 — officer workflow

- Design filters and side-by-side international/local/historical panels with explicit sample count, units, currency, period and comparability warnings.
- Implement a versioned comparison policy that groups suitable observations and explains exclusions. The supplied primitive only rejects mismatched keys; it does not determine economic comparability.
- Add mean/median/min/max and observation counts separately for each eligible pool; distinguish no data from zero and avoid silently excluding suspect evidence.
- Build evidence detail and outlier review with reason, reviewer and timestamp; retain flagged data and review history.
- Implement decision commands with required justification, HS revision/code, selected reference amount/currency, decision text and supporting evidence IDs.
- Validate officer identity from the session, validate every evidence reference and comparison rule version, and freeze evidence/rate/statistics snapshots at decision time.
- Save decision, evidence snapshots and audit in one transaction; define conflict handling, retry/idempotency and correction/amendment behavior.
- Apply the agreed review/approval workflow if required. No automated legal customs valuation is introduced by this plan.

Exit: an officer completes the workflow from search to saved decision; later price/rate changes do not alter earlier decision evidence; unauthorized writes and missing justification fail.

## Phase 5 — analysis, integrations and reporting

- Implement monthly, quarterly, annual and custom-period trends using explicit aggregation and observation weighting rules.
- Add source-country breakdown for international evidence and controlled local-versus-international comparison; expose historical evidence separately.
- Add configurable outlier rule versions, thresholds, minimum sample size and officer disposition; never automatically delete outliers.
- Complete adapters only for approved and accessible WCO/national tariff, Comtrade, NBE, historical customs and local sources. ITC/WITS remain conditional on access and approval.
- Implement the 12 report types: HS reference price, price by country, local market, local versus international, historical trend, mean/median/min/max, outlier, data source, NBE rate, HS revision, customs decision and audit.
- Add PDF/Excel/CSV exports as required per report, retaining filters, generation time, source/rate details and requesting user. Confirm Amharic font embedding and prevent CSV formula injection.
- Add asynchronous export jobs for large datasets, permission checks on job download and report retention controls.

Exit: exports reconcile with screen filters and approved reference calculations; bilingual review passes; integration retries and source outages are observable and recoverable.

## Phase 6 — assurance, pilot and release

- Test calculation edge cases, units, exchange-rate dates, leap/month boundaries, missing data, revision mapping and corrected source records.
- Test API contract compatibility, pagination and error/empty/loading states; browser workflow with actual IAM and PostgreSQL.
- Test role matrix, administrative segregation, audit access, invalid token behavior, session expiry and all negative authorization paths.
- Perform database constraint, rollback, concurrency, evidence immutability and append-only audit tests against PostgreSQL.
- Agree and measure response-time/volume targets; test batch import, reporting workload and backpressure with representative data.
- Review accessibility, responsive layout and English/Amharic terminology with customs users.
- Pilot with named officers; collect issues, train administrators, document operational ownership and escalation procedures.
- Verify backup restore, monitoring alerts, deployment rollback, credential rotation, migration runbook and retention jobs.

Exit: product-owner and customs-user acceptance, operations readiness, signed release checklist and a supported patched runtime. No production release is included in the current skeleton task.

## Work item template

```text
ID / title:
SRS section and user outcome:
Owner / reviewer:
Dependencies and open decisions:
Core contracts and business rules:
Infrastructure / schema / migration:
API method, route, policy and DTO:
Portal route / state / translations:
Audit and provenance requirements:
Acceptance examples including negative cases:
Validation evidence:
Estimate / target date / status:
```

## Definition of done

Every feature has traceable requirements, server-side validation and authorization, appropriate audit capture, tested positive and negative paths, accessible English/Amharic states, versioned API contracts and reviewed schema changes. Business-rule tests must verify behavior, not simply repeat implementation. No item marked planned or scaffolded is counted as delivered product functionality.
