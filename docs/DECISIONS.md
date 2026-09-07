# Decision register

These choices must be resolved with the named roles before the dependent feature is accepted. No dates or owners' personal names were supplied.

| ID | Decision | Proposed owner | Blocking phase | Starter assumption / treatment |
| --- | --- | --- | --- | --- |
| D01 | Final application name, namespace and repository location | Technical lead | 1 | Separate `SES.Customs` folder in delivered outputs |
| D02 | .NET runtime, EF/Npgsql and frontend patch baseline | Platform lead | 1 | .NET 8 compatibility starter; plan .NET 10; Next 15 maintenance patch requested |
| D03 | IAM realm/issuer/audience/client IDs and role claims | Security/IAM owner | 1 | Deny-only adapter; no credentials or copied realm |
| D04 | Which roles access historical records, audits and exports | Customs/security owner | 1–4 | Protected routes; final policy tests pending |
| D05 | Approved WCO/national tariff files and update access | Customs classification owner | 2 | Synthetic fixtures only |
| D06 | Comparison eligibility, unit conversion and adjustments | Customs valuation lead | 3–4 | Strict group boundary; no production comparison algorithm |
| D07 | NBE date rule, source, publication corrections and rounding | Customs finance/data owner | 3 | Explicit exact-date rate required by primitive |
| D08 | Historical customs schema and legal access contract | Historical data owner | 3 | Proposed separate table/API; restricted until confirmed |
| D09 | Import/source licensing, available endpoints, schedules | Integration owner | 3 | No hard-coded external URLs; ITC/WITS conditional |
| D10 | Decision states, review/approval, correction and retention | Customs process owner | 4 | Officer-recorded decision model only |
| D11 | Std dev population/sample, weights, outlier method, thresholds | Analytics/customs lead | 4–5 | Pure primitive uses unweighted population std dev, clearly named |
| D12 | Volumes, latency targets, deployment topology, RPO/RTO | Operations/product owner | 1–6 | No invented SLOs, infrastructure sizing or delivery dates |
| D13 | Amharic terminology, date display, PDF font and formats | Customs UX owner | 2–6 | Draft resource strings and ISO API dates |
| D14 | IAM projections, audit IP/device data and data retention | Security/data governance | 1–6 | Draft fields only; storage policy pending |
| D15 | Report format matrix and export library approval | Reporting lead | 5 | Twelve report types in scope; formats agreed per report |
| D16 | Named owners, budget, effort and release milestones | Project manager/product owner | 0 | Role-based work plan with dates left unassigned |

## Design decisions already embodied in the skeleton

1. Keep familiar Core/Infrastructure/API projects, with EF dependencies pointing inward correctly.
2. Use React through Next.js, matching the organization portal. Next.js is the React frontend framework; business APIs remain in .NET.
3. Use a modular application with one API host for the initial system.
4. Keep all three evidence pools physically separate and expose no combined mean.
5. Fail closed for unfinished authentication and production startup; use synthetic read-only data only in Development.
6. Retain original monetary values and explicit rate provenance; no automatic customs value determination.
