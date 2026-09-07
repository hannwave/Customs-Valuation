# Data model skeleton

The EF model is a design starting point, not a production-approved schema. `database-draft.sql` is generated from that model for inspection without connecting to PostgreSQL. No migration has been applied. Table names use SRS snake_case; EF column names currently use CLR PascalCase, quoted by PostgreSQL. Standardize column naming before the initial migration.

| Table | Main purpose and constraints | Status |
| --- | --- | --- |
| hs_revisions | Revision number unique; dates, name, status, source reference | Mapped |
| hs_codes | Digit string, bilingual description; unique revision + code; revision FK | Mapped; validation/import pending |
| hs_code_correlations | Grouped from/to edges, six change kinds, optional target for deletion; code FKs | Mapped; cardinality/date validation pending |
| national_tariff_lines | Separate national code and bilingual description with date validity | Mapped |
| reference_prices | International trade fields; quantity, original totals/unit price, countries, Incoterm, provenance | Mapped |
| local_prices | Market/supplier, five categories, nullable tax/VAT/transport flags, verification date | Mapped |
| historical_customs_prices | Proposed authorized declaration evidence pool with method and authorization reference | Mapped proposal; owner confirmation required |
| price_sources | Pool and approval reference; enabled only after review | Mapped; application enforcement pending |
| local_markets | Bilingual market name and region | Mapped |
| exchange_rates | Original/converted currency, positive directional rate, date, source, retrieval time | Mapped; official rate immutability/versioning pending |
| valuation_decisions | HS code, selected reference amount/currency, decision, justification, actor and time | Mapped; workflow validation pending |
| decision_evidence | Exactly one of three pool-specific foreign keys; JSON snapshot and comparison version | Mapped; snapshot writer pending |
| audit_logs | Actor/time/action/module/record, before/after JSON, decision and justification, optional IP/device | Mapped; append-only persistence policy pending |
| countries, currencies, quantity_units | Controlled reference vocabularies and conversion rules | Planned; currently code strings |
| exchange_rate_sources | Approved NBE source and source version ownership | Planned; currently source reference |
| suppliers | Supplier identity, verification and disclosure rules | Proposed; currently supplier reference string |
| price_statistics, price_trends | Derived materialized results with cohort/rule/version and invalidation policy | Planned; prefer on-demand queries until scale requires caching |
| decision_justifications | Separate versions/corrections if workflow requires them | Planned; current required field belongs to decision |
| users, roles, permissions | Local projection of approved IAM identities, never duplicated passwords | Planned; confirm organization IAM responsibility |
| integration_jobs, import_batches, import_errors | Idempotency, staging provenance, retries and quarantine | Proposed supporting tables |
| outlier_reviews, outlier_rule_versions | Flags and officer disposition without deletion | Proposed supporting tables |

## Three pools

`PriceEvidence` shares CLR fields only. EF table-per-concrete-type mapping produces distinct `reference_prices`, `local_prices`, and `historical_customs_prices` tables. No public base-price repository or blended statistics endpoint is provided. Before writes, enforce source-pool correspondence, approved source state and record comparability. Draft model setters alone do not enforce these business rules.

## Money and provenance

Quantities/amounts currently use `numeric(24,8)` and rates `numeric(24,12)` as proposed precision. Confirm precision, rounding and upper bounds with the data owner. `OriginalValue` means original record total; `UnitPrice` means total divided by a validated nonzero quantity. `ConvertedValue` is the corresponding total in the target currency. Comparable analytics must use normalized unit values and compatible bases, not raw totals.

Rates explicitly mean target units per original unit. The conversion primitive requires a specified matching date and source and returns a new snapshot. The caller must choose the date using an approved policy. Missing rates cause a controlled failure; there is no most-recent-rate fallback. Persist rate revisions and snapshots immutably before adding import/write paths.

## Integrity work before the first migration

- Required/nonempty validation and database checks for quantities, amounts, dates, code lengths and allowed status transitions.
- National tariff code length and uniqueness by national schedule/effective dates.
- Correlation source/target revision consistency, deletion semantics and valid split/merge grouping.
- Deduplication keys per source observation/trade period/product/country/unit; source-specific keys must avoid collapsing legitimate rows.
- Rate publication/revision identity and a stable reference to the exact applied rate; no silent overwrite.
- Exactly-one evidence FK is drafted, but matching HS/revision, authorization and snapshot completeness must also be validated in the decision command.
- Restrictive delete behavior and immutable evidence snapshots; audit append-only database role/permissions and retention policy.
- UTC timestamps and explicit date-only business fields; integration source timezone/date parsing agreement.
- Normalized lookup foreign keys, indexes sized for expected query patterns and concurrency controls.

An audit entity is not an audit system. The future write pipeline must record before/after values and authenticated actor data in the same transaction as state changes and prohibit ordinary application users from modifying audit rows.
