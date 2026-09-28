# HS 2022 Ethiopia tariff migration

## Source analysis

The supplied file is an envelope containing `metadata` and a `tariffSchedule` of
6,219 records. Each record carries the section, chapter, heading, HS code,
description, standard unit, duty rate, and HS 2017-to-2022 update information.
The source metadata reports 19 sections, 97 chapters, and 1,124 headings;
4,821 unchanged records, 57 one-to-one remaps, 117 split records requiring
review, 1,197 records without an HS code, and 27 records without a concordance.

HS codes are normalized to six digits for lookup while the source formatting and
tariff item number remain available in the tariff line. Missing codes are kept
as nullable records instead of being fabricated.

## Revision and database plan

1. Extend `hs_revisions` with source/target HS version, record count, and source
   metadata, and add hierarchy/update fields to `hs_codes`.
2. Allow nullable HS codes for source rows that do not contain a code.
3. Preserve each tariff schedule as a revision. The imported HS 2022 revision
   is revision `2022` and is the only active revision; the previous active
   revision is archived rather than deleted.
4. Store split/remap candidates in `hs_code_update_mappings`. Candidate-only
   HS rows are searchable, but their blank duty keeps the officer review gate.
5. Retain national tariff lines and existing valuation references so older
   decisions continue to resolve to their original revision.

The migration is `20260918123108_AddHs2022TariffStructure`. Re-importing the
same source is idempotent for HS/tariff rows and replaces stale mappings for the
target revision.

## API and workflow behavior

- HS search defaults to the active revision and searches code, description,
  section/chapter/heading, and tariff item number.
- The importer accepts the new HS 2022 envelope and the legacy flat import
  format, preserving the existing admin workflow.
- Phase 2 uses the selected tariff line for the recommended duty rate.
- Blank, `Prohibited`, or otherwise non-numeric duty values are not converted
  to a fake rate. They return a review-required line and cannot be confirmed
  until the officer enters a documented approved rate.
- Split/remapped classifications remain manually selectable. Officer changes,
  tax overrides, exemptions, and completion are recorded in the existing audit
  history.

## Frontend changes

The HS catalogue displays HS 2022 section/chapter/heading and update status.
The Phase 2 selector can search and choose candidate mappings, shows missing
duty as a manual-review state, and preserves manual HS/tax overrides.

## Verification

- Active database revision: `Ethiopia Customs Tariff HS 2022`, number `2022`.
- Imported tariff records: 6,219.
- HS catalogue rows after candidate materialization: 5,833.
- Update mappings stored: 411.
- `8517.13` and `8517.14` are searchable smartphone split candidates with no
  invented duty rate.
- Backend build: passed with zero warnings/errors.
- Frontend TypeScript check and production Next build: passed.
- Local backend and frontend smoke checks: `http://127.0.0.1:5080` and
  `http://127.0.0.1:3000/hs-codes` are responding.
