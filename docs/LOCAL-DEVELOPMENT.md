# Local database and working sign-in

The portal requires the API and PostgreSQL for authentication. Price-provider
credentials are not required for login. The old demo profile selected an
in-memory HS repository without the database needed by authentication; the
development default now uses PostgreSQL.

## First-time setup (Windows)

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-local-database.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-local-database.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

Setup downloads PostgreSQL 17 Windows binaries from EDB if they are absent.
See the [PostgreSQL Windows download page](https://www.postgresql.org/download/windows/)
and [EDB binary distribution](https://www.enterprisedb.com/download-postgresql-binaries).
The database listens only on `127.0.0.1:55432`, uses password authentication,
and has a separate application role. No Windows service is installed.

Migrations create the schema in `customs_local`; they are explicitly scoped
to the new local database. Startup reuses running services and opens no terminal
windows. Build the API before using `start-local.ps1` after backend code changes.

## Sign in

Open [the portal](http://127.0.0.1:3000/login). The app's existing development
account seeding creates these accounts when the authentication table is empty:

| Username | Password | Role |
| --- | --- | --- |
| `sysadmin` | `DemoPass1!` | System Administrator |
| `admin` | `DemoPass1!` | Customs Administrator |
| `officer` | `DemoPass1!` | Customs Officer |

These are local development accounts. Newly requested accounts still require
administrator approval before sign-in. The new database contains no imported
tariff records or price evidence; import and collection are separate steps.

## Subsequent startup

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

Database data survives stopping processes or restarting the computer. Run the
startup script after a reboot; it does not install an automatic startup task.

## Configuration and verification

- `.local-dev/settings.json`: generated database credentials and JWT signing key.
- `.local-dev/pgdata/`: persistent PostgreSQL data; do not delete it to restart.
- API `appsettings.Local.json`: machine-local database and JWT configuration.
- `portal/.env.local`: public loopback API URLs.
- `.local-dev/*.log`: PostgreSQL, API and portal startup logs.

All local state and secret files are ignored by Git. In Development, user-secrets,
environment variables and command-line settings override `appsettings.Local.json`.
The local startup uses that configuration; remove unrelated database environment
overrides if you intend to use the local database.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-local-login.ps1
```

The check verifies persisted development accounts, JWT login and profile lookup,
invalid-password rejection, protected routes, role restrictions and portal CORS.
It does not print passwords or tokens.

SerpAPI credentials are still required for live international price searches.
Partner-only marketplace access also requires its own provider credentials.
See [configuration](CONFIGURATION.md). The production startup gate is unchanged.
