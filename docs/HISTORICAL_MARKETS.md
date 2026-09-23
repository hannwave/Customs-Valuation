# Historical market comparison

The existing Historical Customs Prices route now uses PricesAPI for international history and saved Ethiopian marketplace observations for local history. These records are market intelligence, not customs declarations.

## Configuration

Set `PRICES_API_KEY` only in the backend process environment or .NET user-secrets. No public frontend variable is used. Development startup loads the existing API project's user-secrets automatically.

Apply the additive `AddMarketPriceSnapshots` EF migration before running. It creates an independent snapshot table without modifying existing evidence. Local-market searches save the first price per listing per UTC day with source URL, original title, currency, condition and observation date. Concurrent captures use an idempotent insert. Existing classified local records are also included using their retrieval date, never the listing creation date.

## Workflow and interpretation

- `POST /api/historical-markets/search`: `{ "brand": "Apple", "model": "iPhone 15", "variant": "128gb" }`. Use `standard` when there is no size/storage variant. Searches AU, US and GB and returns a short-lived search ID plus candidate IDs. Brand/model/storage checks reject conflicting suffixes, accessories and used/refurbished descriptions. Strict checks favor missing data over an uncertain match.
- Explicitly confirm one candidate per market. `POST /api/historical-markets/compare`: `{ "searchId": "...", "keys": ["au:..."] }`. IDs must originate from the same authenticated user's search. The server reads the candidate's PricesAPI history with `id_type=pricesapi`, its original market, and `group_by=day`.
- The international point is the median of the confirmed countries' daily merchant medians, after same-date ETB conversion. It is an equally weighted country median, not a pooled merchant median. Each row includes country and local observation counts.
- Free local sources: Jiji Ethiopia's public catalogue and EthioShop's WooCommerce Store API, through the existing adapters. Source failures are surfaced. No verified free six-month archive of arbitrary Ethiopian retail products was found; local history accumulates from actual searches and pre-existing saved observations. There is no fabricated backfill or background monitoring subscription.
- FX uses the dated fawazahmed0 currency-api ETB feed via jsDelivr, with its Cloudflare mirror as fallback. ETB-base rates are inverted. These are indicative rates; they are not written as approved NBE rates. Missing dated FX excludes the affected observation. Historical rates and provider reads are cached.
- Default range is six calendar months. 1M/3M/6M/1Y/ALL filters operate on daily rows. Nulls break paths; singleton observations appear as points. ALL uses the provider's reported retained bounds and daily requests of at most 1,500 days.
- Current international price uses the most recent dated search snapshot across selected products; its date is visible. Current local price requires today's observations. Current percentage difference requires matching dates. The six-month percentage requires the exact date six months before the international snapshot; unavailable endpoints return null. All differences use local minus international, divided by international for percent.

## Verified sources

- PricesAPI contract: https://pricesapi.io/docs
- Dated FX and fallback: https://github.com/fawazahmed0/exchange-api
- Jiji live catalogue: https://jiji.com.et/search?query=iphone

During verification, the monthly PricesAPI history endpoint returned HISTORY_UNAVAILABLE for a product with working daily history. The integration uses daily reads throughout.
