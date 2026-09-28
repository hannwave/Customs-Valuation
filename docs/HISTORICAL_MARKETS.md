# Historical international prices

Historical price review is based only on exact-product international observations already saved in the database by earlier searches. It does not read local marketplace listings or call a local-market provider. Missing dates remain unavailable; the application never fills gaps with zero or synthetic prices.

## Configuration

Set `PRICES_API_KEY` only in the backend process environment or .NET user-secrets. No public frontend variable is used. Development startup loads the API project's user-secrets automatically.

## Workflow and interpretation

- `POST /api/historical-markets/search` uses brand, exact model and variant to find candidates in Australia, the United States and the United Kingdom. It rejects conflicting variants and accessories rather than relaxing the exact-product check.
- Confirm at most one matching item per market. `POST /api/historical-markets/compare` reads only matching ETB observations saved from those confirmed product searches.
- Daily values are medians of confirmed-country observations for that date. Rows include the number of contributing markets; a date without a saved observation has no plotted value.
- `GET /api/historical-markets/summary` reads existing saved international observations only. It does not fetch providers or infer missing history.
- Default range is six calendar months. The 1M, 3M, 6M, 1Y and ALL filters operate on the saved daily rows.
- A six-month change is shown only when a saved observation exists at the exact baseline date. This feature supports review and does not represent historical customs declarations.

## Data retention

Local-market collection and comparison have been retired. Existing local-market tables, migrations and records remain in place for compatibility and are no longer read or written by active application workflows. No table-drop migration has been applied.

## Verified sources

- PricesAPI contract: https://pricesapi.io/docs
- Dated FX and fallback: https://github.com/fawazahmed0/exchange-api
