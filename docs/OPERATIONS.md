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
4. Approval creates an active Customs Officer account without granting an office assignment.
5. A System Administrator assigns the approved Officer to an active office under `/administration`.
6. The user signs in through `/login`; the one-hour token is stored in browser local storage.

Development seed accounts are created only when the authentication table is empty. Change or remove development credentials before any controlled deployment.

## Roles, locations and valuation workflow

- **System Administrator:** global location registry, Customs Administrator and Officer accounts, HS/source/integration administration, global audit, and global valuation oversight.
- **Customs Administrator:** Officers, assignments, activity, valuation reviews and audit records only inside explicitly assigned locations. Child offices are included only when the administrator's scope says so.
- **Customs Officer:** HS and price evidence, personal valuation drafts/submissions, and their own audit activity. Officers cannot open administrative APIs.

Bootstrap sequence:

1. Create the official location hierarchy at `/administration/locations`. Official codes are permanent; archive rather than delete historical locations.
2. Create a Customs Administrator and assign an office. Additional descendant-inclusive scopes can be granted through `POST /api/workspace/employees/{id}/scopes`.
3. Create or approve Officers, then assign an active operational office and responsibilities.
4. Officers save drafts at `/valuation-decisions` and submit them.
5. The scoped Customs Administrator records an approval or return with mandatory justification.
6. Verify all changes at `/audit`; the API filters global, scoped, or own events according to role.

Authorization is applied by the API. Hiding navigation links is only a usability feature and is not the security boundary.

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
