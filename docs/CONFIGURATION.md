# Configuration and secrets

ASP.NET Core reads `appsettings.json`, environment-specific JSON, the optional ignored `appsettings.Local.json`, Development user-secrets, environment variables, and command-line settings (later sources override earlier ones). Private user-secrets override local JSON defaults, so a stale local database/JWT setting cannot shadow working user-secrets. Environment variables override JSON and user-secrets; nested keys use a double underscore (`__`). Never commit operational credentials.

## Required API settings

| Setting | Required | Purpose |
| --- | --- | --- |
| `ConnectionStrings__Customs` | Yes | PostgreSQL/Supabase connection used by EF Core. |
| `Skeleton__UseDemoData=false` | Yes for the full application | Enables PostgreSQL repositories and persistent authentication. |
| `Jwt__Key` or user-secret `Jwt:Key` | Yes | HMAC signing key; at least 32 bytes. |
| `ASPNETCORE_ENVIRONMENT=Development` | Currently | The API intentionally blocks non-Development startup pending production hardening. |
| `ASPNETCORE_URLS` | No | Local documentation uses `http://127.0.0.1:5080`. |

## Supabase PostgreSQL

Use the connection shown by Supabase under **Project Settings → Database → Connection string**. The transaction/session pooler is often more reliable than the direct IPv6 address on developer networks.

Example shape only:

```powershell
$env:ConnectionStrings__Customs = "Host=REGION.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.PROJECT_REF;Password=YOUR_PASSWORD;SSL Mode=Require;Trust Server Certificate=true"
```

Characters in passwords do not need URL encoding in this semicolon-delimited Npgsql form. Store the real value in a secret manager or process environment, not `appsettings.json`.

The portal does not connect directly to Supabase. Browser-side Supabase variables are therefore not required by this architecture.

## JWT signing key

Generate a private development key and store it with .NET user-secrets:

```powershell
$jwtBytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
$jwtKey = [Convert]::ToBase64String($jwtBytes)
dotnet user-secrets set "Jwt:Key" $jwtKey `
  --project backend/SES.Customs/Apps/Customs/SES.Customs.API/SES.Customs.API.csproj
```

Production should use an organization-approved secret provider and identity design. Do not reuse development signing keys.

## SerpAPI

International prices use server-side SerpAPI Google Shopping requests. Store the key outside source control:

```powershell
dotnet user-secrets set "SerpApi:ApiKey" "YOUR_SERPAPI_KEY" `
  --project backend/SES.Customs/Apps/Customs/SES.Customs.API/SES.Customs.API.csproj
```

Optional settings are `SerpApi:DefaultMarket`, `SerpApi:DefaultLanguage` and `SerpApi:BaseUrl`. The API suppresses informational HttpClient URL logs because SerpAPI authenticates through a query parameter.

## Apify manufacturer prices

Set `APIFY_API_TOKEN` on the API server, or put `Apify:ApiToken` in the API project's ignored `appsettings.Local.json`. The token is never sent to the portal. The officer can search a known brand automatically or enter an official manufacturer domain or direct product URL.

The API runs Apify's Google Search Results Scraper for manufacturer-site discovery. For Apple product pages it calls the Apple Shop Scraper to retrieve structured price and storage/color variants, selects the requested variant, or the lowest-storage base variant when none is specified. Other manufacturers use Website Content Crawler for one exact product page. If that page exposes no price, Google Shopping Scraper can supply an indexed offer only when its merchant label matches the inferred manufacturer and the product model matches exactly. Indexed offers are labeled separately and should be verified on the linked manufacturer page; they are not represented as prices verified directly on that page. Missing prices remain missing. Apify bills Actor runs; each run is capped at $0.50 (the provider's minimum accepted cap). Results are cached for 15 minutes when priced and 5 minutes otherwise.

## Portal environment

Copy `portal/.env.example` to `portal/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:5080
NEXT_PUBLIC_CUSTOMS_API_URL=http://localhost:5080/api/
```

These URLs are public browser configuration. Never put database, JWT, Supabase service-role or provider secrets in a `NEXT_PUBLIC_*` variable.

## CORS

`Cors:AllowedOrigins` must list each portal origin exactly. For example, `http://localhost:3000` and `http://127.0.0.1:3000` are different origins.
