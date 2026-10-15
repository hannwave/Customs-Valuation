using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace SES.Customs.API.Integrations.Commodities;

/// <summary>An exchange-traded commodity and how its quote converts to a price per kilogram (or litre).</summary>
public sealed record CommodityDefinition(
    string Key, string Name, string Symbol, string Exchange, string QuoteUnit,
    decimal QuoteUnitsPerValueUnit, decimal PriceDivisor, string ValueUnit, string[] HsPrefixes);

public sealed record CommodityPricePoint(DateOnly Date, decimal Close);

public sealed record CommodityQuoteDto(
    string Key, string Name, string Symbol, string Exchange, string Contract, decimal Price, string Currency, string QuoteUnit,
    decimal UsdPerValueUnit, string ValueUnit, DateTimeOffset AsOf, decimal? PreviousClose, decimal? ChangePercent,
    IReadOnlyList<CommodityPricePoint> History, string Source, string SourceUrl);

public sealed record CommodityMatchDto(bool Matched, string HsCode, CommodityQuoteDto? Quote, string Message);

/// <summary>
/// Global base market prices from exchange futures (COMEX, NYMEX, CBOT, ICE, SGX), read from Yahoo Finance's public
/// chart endpoint: the same front-month contract prices trading apps display. No API key is needed.
/// </summary>
public sealed class CommodityPriceClient(HttpClient http, IMemoryCache cache, ILogger<CommodityPriceClient> logger)
{
    private const decimal Pound = 0.45359237m, TroyOunce = 0.0311034768m;

    // QuoteUnitsPerValueUnit: how many quote units make one kilogram (or litre), so price per kg = quote / divisor × that.
    public static readonly CommodityDefinition[] Catalogue =
    [
        new("COPPER", "Copper", "HG=F", "COMEX", "USD per pound", 1m / Pound, 1m, "kg", ["74"]),
        new("ALUMINIUM", "Aluminium", "ALI=F", "COMEX", "USD per metric tonne", 0.001m, 1m, "kg", ["76"]),
        new("IRON_ORE", "Iron ore (62% Fe, CFR China)", "TIO=F", "COMEX / SGX", "USD per dry metric tonne", 0.001m, 1m, "kg", ["2601"]),
        new("STEEL", "Steel (hot-rolled coil)", "HRC=F", "COMEX", "USD per short ton", 1m / 907.18474m, 1m, "kg", ["72"]),
        new("SILVER", "Silver", "SI=F", "COMEX", "USD per troy ounce", 1m / TroyOunce, 1m, "kg", ["7106"]),
        new("GOLD", "Gold", "GC=F", "COMEX", "USD per troy ounce", 1m / TroyOunce, 1m, "kg", ["7108"]),
        new("PLATINUM", "Platinum", "PL=F", "NYMEX", "USD per troy ounce", 1m / TroyOunce, 1m, "kg", ["711011", "711019"]),
        new("PALLADIUM", "Palladium", "PA=F", "NYMEX", "USD per troy ounce", 1m / TroyOunce, 1m, "kg", ["711021", "711029"]),
        new("CRUDE_OIL", "Crude oil (WTI)", "CL=F", "NYMEX", "USD per barrel", 1m / 158.987295m, 1m, "L", ["2709"]),
        new("WHEAT", "Wheat", "ZW=F", "CBOT", "US cents per bushel", 1m / 27.2155422m, 100m, "kg", ["1001"]),
        new("MAIZE", "Maize (corn)", "ZC=F", "CBOT", "US cents per bushel", 1m / 25.4011727m, 100m, "kg", ["1005"]),
        new("SOYBEANS", "Soybeans", "ZS=F", "CBOT", "US cents per bushel", 1m / 27.2155422m, 100m, "kg", ["1201"]),
        new("RICE", "Rough rice", "ZR=F", "CBOT", "USD per hundredweight", 1m / 45.359237m, 1m, "kg", ["1006"]),
        new("SOYBEAN_OIL", "Soybean oil", "ZL=F", "CBOT", "US cents per pound", 1m / Pound, 100m, "kg", ["1507"]),
        new("COFFEE", "Coffee (arabica)", "KC=F", "ICE US", "US cents per pound", 1m / Pound, 100m, "kg", ["0901"]),
        new("SUGAR", "Sugar No. 11", "SB=F", "ICE US", "US cents per pound", 1m / Pound, 100m, "kg", ["1701"]),
        new("COTTON", "Cotton No. 2", "CT=F", "ICE US", "US cents per pound", 1m / Pound, 100m, "kg", ["5201"]),
        new("COCOA", "Cocoa", "CC=F", "ICE US", "USD per metric tonne", 0.001m, 1m, "kg", ["1801"]),
    ];

    /// <summary>The commodity whose exchange price represents goods under this HS code; the most specific prefix wins.</summary>
    public static CommodityDefinition? ForHsCode(string hsCode)
    {
        var digits = new string((hsCode ?? "").Where(char.IsDigit).ToArray());
        return Catalogue.SelectMany(item => item.HsPrefixes.Select(prefix => (item, prefix)))
            .Where(pair => digits.StartsWith(pair.prefix, StringComparison.Ordinal))
            .OrderByDescending(pair => pair.prefix.Length).Select(pair => pair.item).FirstOrDefault();
    }

    public async Task<CommodityQuoteDto?> QuoteAsync(CommodityDefinition commodity, CancellationToken ct)
    {
        var key = $"commodity-quote:{commodity.Symbol}";
        if (cache.TryGetValue(key, out CommodityQuoteDto? cached)) return cached;
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"v8/finance/chart/{Uri.EscapeDataString(commodity.Symbol)}?range=1mo&interval=1d");
            using var response = await http.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode) { logger.LogWarning("Commodity quote {Symbol} failed with HTTP {Status}", commodity.Symbol, (int)response.StatusCode); return null; }
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var result = document.RootElement.GetProperty("chart").GetProperty("result")[0];
            var meta = result.GetProperty("meta");
            if (!meta.TryGetProperty("regularMarketPrice", out var priceValue) || !priceValue.TryGetDecimal(out var price) || price <= 0) return null;
            var currency = meta.TryGetProperty("currency", out var currencyValue) ? currencyValue.GetString() ?? "USD" : "USD";
            var asOf = meta.TryGetProperty("regularMarketTime", out var time) && time.TryGetInt64(out var seconds) ? DateTimeOffset.FromUnixTimeSeconds(seconds) : DateTimeOffset.UtcNow;
            decimal? previous = meta.TryGetProperty("chartPreviousClose", out var previousValue) && previousValue.TryGetDecimal(out var previousClose) ? previousClose : null;
            var contract = meta.TryGetProperty("shortName", out var name) ? name.GetString() ?? commodity.Symbol : commodity.Symbol;
            var history = new List<CommodityPricePoint>();
            if (result.TryGetProperty("timestamp", out var stamps) && result.GetProperty("indicators").GetProperty("quote")[0].TryGetProperty("close", out var closes))
                for (var index = 0; index < Math.Min(stamps.GetArrayLength(), closes.GetArrayLength()); index++)
                    if (closes[index].ValueKind == JsonValueKind.Number && closes[index].TryGetDecimal(out var close))
                        history.Add(new(DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeSeconds(stamps[index].GetInt64()).UtcDateTime), Math.Round(close, 4)));
            var usdPerUnit = Math.Round(price / commodity.PriceDivisor * commodity.QuoteUnitsPerValueUnit, 4);
            var quote = new CommodityQuoteDto(commodity.Key, commodity.Name, commodity.Symbol, commodity.Exchange, contract, price, currency, commodity.QuoteUnit,
                usdPerUnit, commodity.ValueUnit, asOf, previous, previous is > 0 ? Math.Round((price - previous.Value) / previous.Value * 100m, 2) : null, history,
                $"{commodity.Exchange} front-month futures via Yahoo Finance", $"https://finance.yahoo.com/quote/{Uri.EscapeDataString(commodity.Symbol)}");
            cache.Set(key, quote, TimeSpan.FromMinutes(10));
            return quote;
        }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or KeyNotFoundException or IndexOutOfRangeException or InvalidOperationException || exception is OperationCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(exception, "Commodity quote {Symbol} could not be read", commodity.Symbol);
            return null;
        }
    }

    public static string Describe(CommodityQuoteDto quote) =>
        string.Create(CultureInfo.InvariantCulture, $"{quote.Name}: {quote.Price:0.####} {quote.QuoteUnit} = USD {quote.UsdPerValueUnit:0.####} per {quote.ValueUnit}");
}
