using System.Globalization;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;

namespace SES.Customs.API.Integrations.PricesApi;

public sealed record ExchangeRateDetail(
    string Currency,
    decimal EtbPerUnit,
    decimal RateToTarget,
    string Source,
    string Date,
    decimal? BuyRate = null,
    decimal? SellRate = null
);

public sealed class HistoricalFxClient(HttpClient http, IMemoryCache cache, IConfiguration config)
{
    private const string DefaultApiKey = "OBezLFQiOb0Knalra0Lv4O_0dL4r77D0uIo9s2mksrU";
    private const string DefaultBaseUrl = "https://exchange.et/api/v1";

    public async Task<Dictionary<string, decimal>> RatesAsync(DateOnly date, CancellationToken ct)
    {
        var key = $"fx:etb:{date:yyyy-MM-dd}";
        if (cache.TryGetValue<Dictionary<string, decimal>>(key, out var found)) return found!;

        // 1. Try exchange.et API first
        var exchangeEtRates = await TryFetchExchangeEtRatesAsync(date, ct);
        if (exchangeEtRates is not null && exchangeEtRates.Count > 1)
        {
            cache.Set(key, exchangeEtRates, TimeSpan.FromMinutes(30));
            return exchangeEtRates;
        }

        // 2. Fallback to currency-api CDNs
        foreach (var url in new[] {
            $"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date:yyyy-MM-dd}/v1/currencies/etb.json",
            $"https://{date:yyyy-MM-dd}.currency-api.pages.dev/v1/currencies/etb.json" })
        {
            try
            {
                using var r = await http.GetAsync(url, ct);
                if (!r.IsSuccessStatusCode) continue;
                var root = await r.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
                if (root.GetProperty("date").GetString() != date.ToString("yyyy-MM-dd")) continue;
                var rates = root.GetProperty("etb").EnumerateObject().Where(x => x.Value.TryGetDecimal(out var n) && n > 0)
                    .ToDictionary(x => x.Name.ToUpperInvariant(), x => 1 / x.Value.GetDecimal());
                rates["ETB"] = 1;
                cache.Set(key, rates, TimeSpan.FromHours(24));
                return rates;
            }
            catch (Exception ex) when (ex is HttpRequestException or JsonException or KeyNotFoundException || ex is OperationCanceledException && !ct.IsCancellationRequested) { }
        }

        var missing = new Dictionary<string, decimal> { ["ETB"] = 1 };
        cache.Set(key, missing, TimeSpan.FromMinutes(5));
        return missing;
    }

    public async Task<ExchangeRateDetail?> GetRateDetailAsync(string targetCurrency, CancellationToken ct)
    {
        var target = targetCurrency.Trim().ToUpperInvariant();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var detailsKey = $"fx:details:{today:yyyy-MM-dd}";

        if (cache.TryGetValue<Dictionary<string, ExchangeRateDetail>>(detailsKey, out var cachedDetails) &&
            cachedDetails!.TryGetValue(target, out var foundDetail))
        {
            return foundDetail;
        }

        // Ensure rates are fetched (which populates details)
        await RatesAsync(today, ct);

        if (cache.TryGetValue<Dictionary<string, ExchangeRateDetail>>(detailsKey, out var refreshedDetails) &&
            refreshedDetails!.TryGetValue(target, out var detail))
        {
            return detail;
        }

        return null;
    }

    private async Task<Dictionary<string, decimal>?> TryFetchExchangeEtRatesAsync(DateOnly date, CancellationToken ct)
    {
        var apiKey = config["ExchangeEt:ApiKey"] ?? DefaultApiKey;
        var baseUrl = config["ExchangeEt:BaseUrl"] ?? DefaultBaseUrl;
        var url = $"{baseUrl.TrimEnd('/')}/latest-rates?limit=500";

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            using var response = await http.SendAsync(req, ct);
            if (!response.IsSuccessStatusCode) return null;

            var root = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
            if (!root.TryGetProperty("data", out var data) || !data.TryGetProperty("rates", out var ratesArray))
                return null;

            var rates = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase) { ["ETB"] = 1m };
            var details = new Dictionary<string, ExchangeRateDetail>(StringComparer.OrdinalIgnoreCase);

            // Group by currency code
            var currencyGroups = new Dictionary<string, List<RawRateEntry>>(StringComparer.OrdinalIgnoreCase);
            foreach (var item in ratesArray.EnumerateArray())
            {
                if (!item.TryGetProperty("rate", out var rateObj)) continue;
                if (!rateObj.TryGetProperty("currency_code", out var codeProp)) continue;
                var code = codeProp.GetString()?.Trim().ToUpperInvariant();
                if (string.IsNullOrWhiteSpace(code) || code.Length != 3) continue;

                decimal buy = 0, sell = 0;
                if (rateObj.TryGetProperty("buy", out var buyProp))
                    decimal.TryParse(buyProp.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out buy);
                if (rateObj.TryGetProperty("sell", out var sellProp))
                    decimal.TryParse(sellProp.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out sell);

                if (buy <= 0 && sell <= 0) continue;

                var source = "exchange.et";
                var sourceFullName = "Ethiopian Banks";
                if (item.TryGetProperty("provenance", out var provObj))
                {
                    if (provObj.TryGetProperty("source", out var srcProp))
                        source = srcProp.GetString() ?? source;
                    if (provObj.TryGetProperty("source_full_name", out var fullProp))
                        sourceFullName = fullProp.GetString() ?? sourceFullName;
                }

                var rateDate = date.ToString("yyyy-MM-dd");
                if (rateObj.TryGetProperty("date", out var dateProp))
                    rateDate = dateProp.GetString() ?? rateDate;

                if (!currencyGroups.TryGetValue(code, out var list))
                {
                    list = new List<RawRateEntry>();
                    currencyGroups[code] = list;
                }
                list.Add(new RawRateEntry(source, sourceFullName, buy, sell, rateDate));
            }

            foreach (var (curr, entries) in currencyGroups)
            {
                // Prefer Commercial Bank of Ethiopia (CBE)
                var cbe = entries.FirstOrDefault(e =>
                    e.Source.Equals("CBE", StringComparison.OrdinalIgnoreCase) ||
                    e.SourceFullName.Contains("Commercial Bank", StringComparison.OrdinalIgnoreCase));

                decimal chosenMid, chosenBuy, chosenSell;
                string sourceLabel;
                string effectiveDate;

                if (cbe is not null)
                {
                    chosenBuy = cbe.Buy > 0 ? cbe.Buy : cbe.Sell;
                    chosenSell = cbe.Sell > 0 ? cbe.Sell : cbe.Buy;
                    chosenMid = (chosenBuy + chosenSell) / 2m;
                    sourceLabel = "Commercial Bank of Ethiopia (exchange.et)";
                    effectiveDate = cbe.Date;
                }
                else
                {
                    var validBuys = entries.Where(e => e.Buy > 0).Select(e => e.Buy).ToArray();
                    var validSells = entries.Where(e => e.Sell > 0).Select(e => e.Sell).ToArray();
                    chosenBuy = validBuys.Length > 0 ? validBuys.Average() : 0m;
                    chosenSell = validSells.Length > 0 ? validSells.Average() : 0m;
                    chosenMid = (chosenBuy > 0 && chosenSell > 0)
                        ? (chosenBuy + chosenSell) / 2m
                        : (chosenSell > 0 ? chosenSell : chosenBuy);
                    sourceLabel = $"Ethiopian Bank Average (exchange.et, n={entries.Count})";
                    effectiveDate = entries[0].Date;
                }

                if (chosenMid > 0)
                {
                    var etbPerUnit = Math.Round(chosenMid, 4);
                    rates[curr] = etbPerUnit;
                    details[curr] = new ExchangeRateDetail(
                        Currency: curr,
                        EtbPerUnit: etbPerUnit,
                        RateToTarget: Math.Round(1m / etbPerUnit, 8),
                        Source: sourceLabel,
                        Date: effectiveDate,
                        BuyRate: chosenBuy > 0 ? Math.Round(chosenBuy, 4) : null,
                        SellRate: chosenSell > 0 ? Math.Round(chosenSell, 4) : null
                    );
                }
            }

            var detailsKey = $"fx:details:{date:yyyy-MM-dd}";
            cache.Set(detailsKey, details, TimeSpan.FromMinutes(30));
            return rates;
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            return null;
        }
    }

    private sealed record RawRateEntry(string Source, string SourceFullName, decimal Buy, decimal Sell, string Date);
}
