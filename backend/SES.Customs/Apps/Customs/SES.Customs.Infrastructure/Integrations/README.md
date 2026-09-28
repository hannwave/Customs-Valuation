# Approved source adapters

Implement `IApprovedSourceAdapter` for WCO/national tariff imports, optional ITC/WITS, NBE and authorized historical customs data. No provider endpoints or credentials are assumed. No live network requests or synchronization are implemented. Confirm access/licensing, mapping, schedules and rate-date policy first. Persist raw source provenance and staged validation results; make retries idempotent. See implementation plan phase 3.
