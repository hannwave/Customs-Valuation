# Customs valuation implementation skeleton

A .NET and React starter for the HS Code Reference Price Management and Customs Valuation Decision Support System. It follows the SystemsEdge WINSSAS backend and organization portal conventions, adapted to the customs SRS. Start with [the implementation plan](docs/IMPLEMENTATION_PLAN.md) and [architecture mapping](docs/ARCHITECTURE.md).

## Included

- .NET 8 solution: Common, Core, Infrastructure, API and xUnit tests.
- Feature-based MediatR contracts and handlers; repository interfaces in Core; EF Core/PostgreSQL adapters in Infrastructure.
- Working development-only HS search, revision filter, pagination and detail API using clearly synthetic fixtures.
- Draft EF mappings for classifications, three separate evidence pools, rates, decisions, decision evidence and audit records.
- Tested pure statistics and exchange-rate primitives. No production comparison engine or automatic valuation.
- React 19 / Next.js App Router portal with Mantine, RTK Query, shared layout and English/Amharic resources, following the existing portal.
- Planned routes and feature boundaries for the remaining modules, implementation phases, acceptance gates and open decisions.

This is a development skeleton. Source synchronization, production IAM, write workflows, approved comparison policy, persistent audit capture and report exports are not implemented. There are no live prices, official HS datasets or operational valuation decisions. Amharic wording needs customs-user review.

## Run locally

Prerequisites: .NET SDK 8.0.400 or later 8.0 feature band, and Node.js 22 or 24 with npm. The API demo needs no PostgreSQL or identity provider.

From this folder, in a terminal:

```powershell
dotnet restore backend/SES.Customs/SES.Customs.sln
dotnet test backend/SES.Customs/SES.Customs.sln --no-restore
dotnet run --project backend/SES.Customs/Apps/Customs/SES.Customs.API --launch-profile Demo
```

In another terminal:

```powershell
cd portal
npm ci
npm run typecheck
npm run dev
```

Open `http://localhost:3000`. API liveness: `http://localhost:5080/health/live`. API search: `http://localhost:5080/api/hs-codes?search=090111`. Demo codes are `090111` and `850440`. Their descriptions are fixtures, not official nomenclature.

The frontend defaults to the local API. To change it, copy `portal/.env.example` to `portal/.env.local` and edit the URL, then restart Next.js. No secrets belong in `NEXT_PUBLIC_*` values.

### Temporary frontend access

New visitors are directed to `/register` before seeing the workspace. Registration details can be reviewed, then users continue to `/sign-in`; the sign-in link also works without registration. Any non-empty username and password (for example `demo` / `demo`) opens the demo workspace. Refreshing keeps access in the current browser tab; Sign out clears it. Only a demo flag is stored in session storage; registration details and passwords are not saved or sent.

This is a frontend navigation gate, not authentication or API authorization. Replace `DemoSessionProvider` and `demo-session.ts` with the approved authentication flow when the backend is ready. The existing API token adapter is unchanged. Run the demo session checks from `portal` with `node --test scripts/test-demo-auth.mjs` (Node.js 24).

## Verification

```powershell
dotnet build backend/SES.Customs/SES.Customs.sln --no-restore
dotnet test backend/SES.Customs/SES.Customs.sln --no-build
cd portal
npm run typecheck
npm run build
```

See [verification results](docs/VERIFICATION.md) for checks actually run and their limits. The build does not establish production readiness.

## Production implementation gates

The API deliberately refuses to start outside Development. In Development, only synthetic HS queries bypass authentication. The authentication adapter denies access until OIDC/JWT bearer integration is implemented. Setting `Skeleton:UseDemoData=false` selects the PostgreSQL repository but does not enable sign-in or expose database records anonymously.

Before enabling production: implement and test IAM and role policies, use HTTPS, review migrations, complete durable audit/evidence handling, and satisfy the phase gates. PostgreSQL configuration will use `ConnectionStrings__Customs` via a secret provider or environment; never copy organization credentials. The schema draft is for review only and was not applied to any database.

The backend targets the reference projects' .NET 8 baseline for local compatibility. Plan a .NET 10 migration before .NET 8 support ends on November 10, 2026, and keep patches current ([Microsoft support policy](https://dotnet.microsoft.com/en-us/platform/support/policy)). The portal manifest requests Next.js 15.5.24, the maintenance patch identified in the [August 2026 security release listing](https://nextjs.org/blog), rather than copying the reference portal's 15.5.9 pin. See verification notes for dependency availability.

## Contents

```text
backend/SES.Customs/
  SES.Customs.sln
  Apps/Library/SES.Customs.Common/
  Apps/Customs/SES.Customs.Core/
    Models/  Dtos/  Features/<Module>/Contract/  Features/<Module>/Handler/
  Apps/Customs/SES.Customs.Infrastructure/
    Context/Configurations/  Context/Migrations/  Repository/  Dependency/  Integrations/
  Apps/Customs/SES.Customs.API/
    Controllers/  Security/  Properties/
  Tests/SES.Customs.Tests/
portal/
  app/  components/  lib/store/api/  lib/auth/  lib/i18n/locales/  lib/types/
docs/
  IMPLEMENTATION_PLAN.md  ARCHITECTURE.md  REQUIREMENTS_MATRIX.md
  API_CONTRACT.md  DATA_MODEL.md  DECISIONS.md  VERIFICATION.md
  database-draft.sql
scripts/
  smoke-api.ps1
```
