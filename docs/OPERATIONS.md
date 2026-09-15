# Operations and troubleshooting

## Service health

```powershell
Invoke-RestMethod http://127.0.0.1:5080/health/live
Invoke-WebRequest http://127.0.0.1:3000/login -UseBasicParsing
```

Expected API mode for the persistent application is `development-database`.

## Database migrations

Create a migration after changing EF entities or configuration:

```powershell
dotnet ef migrations add DescriptiveMigrationName `
  --project backend/SES.Customs/Apps/Customs/SES.Customs.Infrastructure/SES.Customs.Infrastructure.csproj `
  --startup-project backend/SES.Customs/Apps/Customs/SES.Customs.API/SES.Customs.API.csproj `
  --context CustomsDbContext
```

Apply reviewed migrations with `dotnet ef database update` using the same project, startup-project and context arguments. Never rewrite an already-applied shared migration; add a corrective migration instead.

## HS-code import

The System Administrator import endpoint accepts the Ethiopian tariff JSON file as multipart form data:

```text
POST /api/hs-codes/import
Authorization: Bearer <system-administrator JWT>
Form field: file
```

The importer validates six-digit HS codes and eight-digit national tariff lines, updates descriptions and stores duty/unit metadata.

## Authentication workflow

1. A user submits `/signup`.
2. The request is stored with `Pending` status.
3. A System Administrator reviews it under `/administration`.
4. Approval creates an active JWT account.
5. The user signs in through `/login`; the one-hour token is stored in browser local storage.

Development seed accounts are created only when the authentication table is empty. Change or remove development credentials before any controlled deployment.

## Local-market workflow

1. Enter an HS code and normalized product target.
2. Select condition, price type, marketplaces, relevance threshold and outlier method.
3. The API persists each fetched record as `Raw`, then classifies it.
4. The UI shows used, excluded, wrong-variant, duplicate and outlier groups with reasons.
5. The robust median is presented as the representative local price.
6. An officer may approve, reject or confirm an outlier with mandatory justification.
7. Every manual decision creates an audit record.
8. **Save clean evidence to database** copies only the comparable pool into local reference evidence.

The confidence score and representative price are decision-support indicators, not automatic Customs values.

## Live API integration test

Start the API, then set credentials for a dedicated test account:

```powershell
$env:CUSTOMS_API_BASE_URL = "http://127.0.0.1:5080"
$env:CUSTOMS_API_TEST_USER = "YOUR_TEST_ADMIN_USERNAME"
$env:CUSTOMS_API_TEST_PASSWORD = "YOUR_TEST_ADMIN_PASSWORD"

dotnet test backend/SES.Customs/Tests/SES.Customs.Tests/SES.Customs.Tests.csproj `
  --filter "Category=Integration"
```

Without these three variables, the integration test exits without making an external request.

## Common failures

### API unavailable

- Confirm port 5080 is listening.
- Check `ASPNETCORE_URLS` and both portal API URLs.
- Restart the portal after changing `.env.local`.

### Database connection failure

- Verify the Supabase project is active.
- Prefer the correct regional pooler hostname.
- Confirm SSL is required and the username includes the project reference when Supabase specifies it.
- Verify outbound TCP access to the database port.

### International search unavailable

- Confirm `SerpApi:ApiKey` exists in the API process configuration.
- Restart the API after changing user-secrets.
- Check account quota and provider response in server logs; never log or paste the key.

### Empty or low-confidence local results

- Confirm the exact model, variant and condition.
- Inspect exclusion categories before lowering the threshold.
- Compare IQR and MAD results.
- Missing seller or condition metadata correctly reduces confidence.
