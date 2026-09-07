# Requirements to implementation mapping

Source identifiers: SRS = `SRS_HS_Code_Customs_Valuation_System (1).docx`; Overview = `HS_Code_Customs_Valuation_System_Overview.docx`. Section numbers below come from the SRS text, not inferred page numbers. The documents are product reference material; the user separately requested the implementation plan and code skeleton.

| SRS | Requirement | Backend boundary | Portal surface | Skeleton status | Phase |
| --- | --- | --- | --- | --- | --- |
| 1–4 | .NET, React, PostgreSQL, REST, decision support | Core/Infrastructure/API and Common | Next.js React app | Created; synthetic query example | 1 |
| 3, 21 | Officer/customs admin/system admin and OIDC | API Security and role policies | `lib/auth/session.ts` | Deny-only adapter; IAM planned | 1 |
| 5 | WCO HS and separate Ethiopian tariff | HsCode, NationalTariffLine, HsCodes | `/hs-codes` | Models and searchable synthetic data | 2 |
| 6 | Revision number/dates/status/source | HsRevision; HsRevisions | HS revision filter | Model and synthetic list | 2 |
| 7 | One-to-one/split/merge and change types | HsCodeCorrelation with mapping group | HS history/correlation views planned | Draft mapping; no workflow | 2 |
| 8 | International evidence fields | InternationalReferencePrice | `/international-prices` | Model and protected route shell | 3 |
| 9–10 | Local evidence and five categories | LocalMarketPrice, LocalMarket | `/local-prices` | Model and protected route shell | 3 |
| 11–12 | Controlled comparisons and comparability fields | Analytics comparison policy | `/analytics` | Primitive rejects mixed keys; policy planned | 4 |
| 13 | NBE date/source, original preserved | ExchangeRate, PriceConverter | Integration/rate views planned | Tested primitive; ingestion planned | 3 |
| 14 | Min/max/mean/median/count/std dev | PriceStatisticsCalculator | Analytics planned | Tested pure primitive; API planned | 4–5 |
| 15 | Monthly/quarterly/annual/custom trend | Analytics trend query | Analytics planned | Route shell only | 5 |
| 16 | International source-country analysis | Analytics country query | Analytics planned | Route shell only | 5 |
| 17 | Configurable outliers and review, never auto-delete | Analytics review commands and audit | Analytics planned | Feature boundary only | 4–5 |
| 18 | Officer dashboard and evidence counts | Analytics aggregation DTOs | `/` and `/analytics` | Overview shell; no price dashboard | 4 |
| 19 | Decisions/justification/supporting records | ValuationDecision, DecisionEvidence | `/valuation-decisions` | Draft schema; writes not implemented | 4 |
| 20 | English and Amharic | Multilingual HS fields | `lib/i18n/locales/{en,am}.json` | Resources and switch implemented; terminology review pending | 1–6 |
| 21–22 | Security, session, authorization, full audit | Policies, AuditLog, future audit unit of work | `/administration`, `/audit` | Policy and model scaffolds only | 1, 4 |
| 23 | Core table groups | Draft EF configurations, DATA_MODEL.md | N/A | Partial model; no migration applied | 1–5 |
| 24 | HS/price/analytics/integration APIs | Controllers and API_CONTRACT.md | Typed HS query service | Three HS reads implemented; others shell/planned | 2–5 |
| 25 | Twelve reports and PDF/Excel/CSV | Reporting module | `/reports` | Placeholder; no exports | 5 |
| 26 | Three distinct pools incl. historical customs | Three concrete evidence tables, no base-query repository | Separate evidence routes | Separation modeled/tested; historical contract proposed | 3–4 |
| 2, 26 | No automatic legal customs valuation | No valuation engine/automatic write | Explicit decision-support wording | Preserved across skeleton and plan | All |
| Overview open issues | Historical schema/API, access, comparability, rate date, approvals, NFRs | DECISIONS.md | Product review | Tracked as open | 0 |

## Acceptance examples to expand

- An HS code beginning with zero retains the zero and remains scoped to its revision.
- One source code splits into several target codes using a group; deletion permits a null target with validated reason.
- An attempt to calculate one mean across international and local or historical data fails.
- A missing or wrong-date exchange rate leaves the observation pending instead of inventing conversion data.
- Original price/currency and the rate source/version used in a decision remain reconstructible after a correction.
- Wholesale and retail data, incompatible units or materially different products are not silently treated as one group.
- A flagged outlier remains present after officer review, with disposition history.
- A decision cannot be saved without justification or with inaccessible/nonexistent evidence; actor comes from IAM.
- An audit entry and decision either commit together or neither commits.
- An unauthorized user cannot invoke administrative imports, see restricted historical records or export protected audit data.
