# Ethiopian Customs Valuation Decision Support

A .NET 8, Next.js 15 and PostgreSQL application for HS-code reference data, international and Ethiopian local-market price evidence, account administration and officer-facing valuation support.

The system keeps international, Ethiopian local and historical Customs price pools separate. Local marketplace data is preserved as raw observations, classified for product comparability, normalized, checked for duplicates and outliers, and summarized with a median representative price and an explainable confidence score. It is decision support only: no calculated price automatically becomes a legally applicable Customs value.

## Implemented modules

- JWT login, registration requests, administrator approval and user profile display.
- Ethiopian HS codes and tariff-line duty data stored in PostgreSQL/Supabase.
- Google Shopping international-price search through SerpAPI, with optional HS-code synchronization.
- Jiji Ethiopia and EthioShop local-market collection adapters.
- Raw local-observation persistence, product relevance scoring, category exclusions, brand/model/variant matching, condition separation, duplicate detection and unit-price normalization.
- IQR and MAD outlier detection, robust statistics, median representative price and confidence factors.
- Transparent observation/exclusion UI and audited officer classification overrides.

TeleGebeya has moved to Zemen Gebeya inside the authenticated telebirr SuperApp. It is represented as `PartnerAccessRequired` until Ethio telecom supplies a supported partner API and credentials.

## Start here

For a working local login on Windows, follow [Local database and sign-in](docs/LOCAL-DEVELOPMENT.md).

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
