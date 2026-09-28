# Ethiopian Customs Valuation Decision Support

A .NET 8, Next.js 15 and PostgreSQL application for HS-code reference data, international price evidence, account administration and officer-facing valuation support.

The system uses international price evidence and historical observations already saved from earlier searches. No market price automatically becomes a legally applicable Customs value. Local-market collection, search, analysis and valuation selection have been retired. Existing local-market database tables and records are retained for compatibility; this change does not delete stored data.

## Implemented modules

- JWT login, registration requests, administrator approval and user profile display.
- Backend-enforced `SYSTEM_ADMIN`, `CUSTOMS_ADMIN` and `CUSTOMS_OFFICER` permissions with location scopes.
- Effective-dated Customs location hierarchy, employee assignments, immutable location snapshots and audited changes.
- Officer valuation drafts/submission, scoped administrator review, and role-filtered audit visibility.
- Ethiopian HS codes and tariff-line duty data stored in PostgreSQL/Supabase.
- Google Shopping international-price search through SerpAPI, with optional HS-code synchronization.
- Manufacturer-site price evidence through Apify, with exact product matching, source links, currency conversion and officer selection in Price Review.
- International price search and product-specific saved history.

TeleGebeya has moved to Zemen Gebeya inside the authenticated telebirr SuperApp. It is represented as `PartnerAccessRequired` until Ethio telecom supplies a supported partner API and credentials.

## Start here

1. Follow [Environment setup](docs/SETUP.md).
2. Configure secrets using [Configuration and secrets](docs/CONFIGURATION.md).
3. Use [Operations and troubleshooting](docs/OPERATIONS.md) for migrations, HS imports and health checks.

Quick local endpoints after startup:

- Portal: `http://127.0.0.1:3000`
- API health: `http://127.0.0.1:5080/health/live`
- API base: `http://127.0.0.1:5080/api`

## Repository layout

```text
backend/SES.Customs/
  Apps/Customs/SES.Customs.Core/            domain models and pure business rules
  Apps/Customs/SES.Customs.Infrastructure/  EF Core, PostgreSQL and repositories
  Apps/Customs/SES.Customs.API/             HTTP, authentication and provider adapters
  Tests/SES.Customs.Tests/                  unit and opt-in live API integration tests
portal/
  app/                                      Next.js routes
  components/                               shared UI components
  lib/                                      authentication, API and TypeScript contracts
docs/
  SETUP.md  CONFIGURATION.md  OPERATIONS.md
```

## Verification

```powershell
dotnet restore backend/SES.Customs/SES.Customs.sln
dotnet build backend/SES.Customs/SES.Customs.sln --no-restore
dotnet test backend/SES.Customs/SES.Customs.sln --no-build

Set-Location portal
npm ci
npm run typecheck
npm run build
```

The API currently contains an explicit production startup gate. Complete organization-approved identity, HTTPS, secret management and production deployment review before removing that gate.
