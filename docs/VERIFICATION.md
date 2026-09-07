# Verification report

Verified locally on September 7, 2026. The reference WINSSAS projects and the two input documents were read only. All generated source and plan files belong to the new customs skeleton.

| Check | Result | Scope and limits |
| --- | --- | --- |
| .NET solution restore | Passed | Restored from the existing local NuGet package cache; package lockfiles generated |
| Full .NET solution build | Passed | SDK 8.0.422; zero warnings and zero errors |
| xUnit suite | Passed | 10 tests; statistics example, three-pool separation, unit/currency/group rejection, empty/even groups, rate provenance/date checks, HS search, EF SQL generation and Core dependency boundary |
| API startup and smoke script | Passed | Demo liveness, HS revisions/search, leading-zero code, empty search, 400 invalid page, 404 absent code, 401 protected decision/audit routes |
| Database-mode access boundary | Passed | With demo disabled, anonymous HS reads return 401 before querying PostgreSQL |
| Production startup gate | Passed | Production environment refuses startup with an explicit unfinished-IAM/configuration error |
| EF relational model | Passed | Draft PostgreSQL creation SQL generated; three separate evidence tables and decision-evidence foreign keys/check constraint verified |
| PostgreSQL execution | Not run | No PostgreSQL server was available; no DDL or migration was applied |
| Frontend dependency installation | Passed | Exact declared dependencies installed; package-lock.json included |
| TypeScript | Passed | `npm run typecheck`, and Next.js build type validation |
| Frontend optimized build | Passed | Next.js 15.5.24, React 19.2.3; final build succeeds after CSS and dependency correction |
| npm dependency audit | Passed | Zero reported vulnerabilities after overriding transitive PostCSS to 8.5.28; point-in-time result, not a security certification |
| Browser smoke review | Passed | Overview, HS screen, dotted `0901.11` search returning `090111`, and English-to-Amharic UI/description change against running local API |
| NuGet online vulnerability audit | Unavailable | nuget.org service-index request failed during TLS authentication; dependency security assessment remains a phase 1 task |
| Live OIDC, real data sources and report exports | Not implemented | Explicitly tracked in the implementation plan and route shells |

## Changes made during verification

- Switched API logging to console providers so the local starter does not require Windows Event Log write privileges.
- Changed CSS `align-items: end` to `flex-end` to resolve the build warning.
- Added an exact PostCSS 8.5.28 override because the original transitive version triggered npm audit findings. Reinstalled and rebuilt successfully.
- Created backend and frontend lockfiles for repeatable dependency resolution.

## Reproduction

Follow the root README. `scripts/smoke-api.ps1` assumes the Demo launch profile is running on port 5080. The PostgreSQL SQL is a draft inspection artifact, not a reviewed migration. All preview processes were stopped after verification.

The tests demonstrate starter boundaries and selected calculation behavior. They do not certify customs valuation correctness, approved comparison policy, production IAM, database transaction behavior, performance, bilingual terminology or legal compliance. Those acceptance gates remain in the implementation plan.
