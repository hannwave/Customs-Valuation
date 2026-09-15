# Environment setup

This guide creates a local development environment from a clean clone. The full application requires PostgreSQL; Supabase PostgreSQL is the currently supported hosted option.

## 1. Prerequisites

- Git 2.40 or newer.
- .NET SDK 8.0.400 or a later .NET 8 feature band.
- Node.js 22 or 24 LTS with npm.
- A Supabase project, or PostgreSQL 15 or newer.
- A SerpAPI account only when international Google Shopping searches are required.

Confirm the tools:

```powershell
git --version
dotnet --version
node --version
npm --version
```

## 2. Clone and restore

```powershell
git clone https://github.com/hannwave/Customs-Valuation.git
Set-Location Customs-Valuation

dotnet restore backend/SES.Customs/SES.Customs.sln
Set-Location portal
npm ci
Set-Location ..
```

Use `npm ci` on clean environments so `portal/package-lock.json` remains authoritative.

## 3. Configure the API

Follow [CONFIGURATION.md](CONFIGURATION.md) to supply:

- `ConnectionStrings__Customs`
- a private `Jwt:Key`
- `SerpApi:ApiKey` when international search is enabled
- `Skeleton__UseDemoData=false`

The browser never receives the database password, JWT signing key or SerpAPI key.

## 4. Create or update the database

From the repository root, with `ConnectionStrings__Customs` configured:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:Skeleton__UseDemoData = "false"

dotnet ef database update `
  --project backend/SES.Customs/Apps/Customs/SES.Customs.Infrastructure/SES.Customs.Infrastructure.csproj `
  --startup-project backend/SES.Customs/Apps/Customs/SES.Customs.API/SES.Customs.API.csproj `
  --context CustomsDbContext
```

This creates authentication, HS-code, price-evidence, audit and raw local-market observation tables. Review migrations before applying them to a shared database.

## 5. Configure the portal

```powershell
Copy-Item portal/.env.example portal/.env.local
```

The defaults point to `http://localhost:5080`. Change both URLs when the API uses a different host or port. Every `NEXT_PUBLIC_*` value is visible to the browser and must not contain secrets.

## 6. Run the application

API terminal:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:ASPNETCORE_URLS = "http://127.0.0.1:5080"
$env:Skeleton__UseDemoData = "false"
dotnet run --project backend/SES.Customs/Apps/Customs/SES.Customs.API/SES.Customs.API.csproj --no-launch-profile
```

Portal terminal:

```powershell
Set-Location portal
npm run dev
```

Open `http://127.0.0.1:3000` and verify `http://127.0.0.1:5080/health/live` returns `ok`.

## 7. Verify the environment

```powershell
dotnet test backend/SES.Customs/SES.Customs.sln --no-restore

Set-Location portal
npm run typecheck
npm run build
```

The local-market integration test is opt-in because it calls the running API and a live marketplace. See [OPERATIONS.md](OPERATIONS.md#live-api-integration-test).
