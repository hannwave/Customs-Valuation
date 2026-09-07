# Migration gate

The EF model is a draft, with generated inspection SQL in `docs/database-draft.sql`. No migration has been applied. Confirm historical evidence schema, correlation semantics, decimal precision, source/record deduplication, rate revisioning, reporting caches, lookups and retention first. Add EF Design and the matching dotnet-ef tool, generate and review an InitialCustoms migration, then test forward migration and backup/restore on PostgreSQL. Do not call EnsureCreated or Database.Migrate at application startup.
