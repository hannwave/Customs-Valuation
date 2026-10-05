using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;

namespace SES.Customs.API.Integrations.Comtrade;

public sealed record BenchmarkReporter(int Code, string Name);

public sealed record ComtradeReporter(int Code, string Name, string IsoAlpha2);

public sealed record CustomsTradeBenchmark(
    string HsCode, int? Period, string Reporter, string Currency, string? Unit,
    decimal? TradeValue, decimal? Quantity, decimal? UnitValue, string? SourceUrl,
    string Message, bool IsMirror, string SourceLabel, string? ValuationBasis,
    IReadOnlyList<BenchmarkReporter> Reporters, bool QuantityEstimated,
    int? ReporterCode = null, int? PartnerCode = null, string? Partner = null,
    DateTimeOffset? LastCheckedAtUtc = null)
{
    public int ReporterCount => Reporters.Count;
}

public sealed class ComtradeUnavailableException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

// Singleton: serialize keyless preview lookups, pace requests across users, and
// recheck the cache after waiting so simultaneous searches do not fan out upstream.
public sealed class ComtradeBenchmarkClient(IHttpClientFactory factory, IMemoryCache cache, TimeProvider? timeProvider = null, IConfiguration? config = null)
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly IConfiguration? configuration = config;
    private readonly SemaphoreSlim lookupGate = new(1, 1);
    private DateTimeOffset nextRequestAt;

    public async Task<CustomsTradeBenchmark> SearchAsync(string code, CancellationToken ct, string? preferredUnit = null)
    {
        var cacheKey = $"comtrade:benchmark:v6-latest:{code}:{preferredUnit ?? "any"}";
        if (cache.TryGetValue<CustomsTradeBenchmark>(cacheKey, out var cached) && cached is not null) return cached;

        await lookupGate.WaitAsync(ct);
        try
        {
            if (cache.TryGetValue<CustomsTradeBenchmark>(cacheKey, out cached) && cached is not null) return cached;
            var http = factory.CreateClient("UNComtrade");
            CustomsTradeBenchmark? differentUnitReference = null;
            var periods = await GetAvailablePeriodsAsync(231, ct);
            var checkedAt = clock.GetUtcNow();
            // Use the newest period in Comtrade's availability catalog. Do not
            // scan every historical month when a product has no row in that
            // latest dataset; that makes the user wait through many upstream calls.
            foreach (var period in periods)
            {
                foreach (var mirror in new[] { false, true })
                {
                    // Omitting reporterCode selects all reporting suppliers. The
                    // preview endpoint rejects the literal reporterCode=ALL.
                    var origin = mirror ? "partnerCode=231&flowCode=X" : "reporterCode=231&partnerCode=0&flowCode=M";
                    var publicPath = $"public/v1/preview/C/M/HS?{origin}&period={period}&cmdCode={code}&partner2Code=0&customsCode=C00&motCode=0&maxRecords=500";
                    var requestPath = WithSubscriptionKey(publicPath);
                    using var document = await ReadAsync(http, requestPath, ct);
                    var result = Calculate(document.RootElement, code, period, mirror, new Uri(http.BaseAddress!, publicPath).AbsoluteUri, preferredUnit);
                    if (result is null) continue;
                    var stamped = result with
                    {
                        ReporterCode = mirror ? null : 231,
                        PartnerCode = mirror ? 231 : 0,
                        Partner = mirror ? "Ethiopia" : "World",
                        LastCheckedAtUtc = checkedAt
                    };
                    if (preferredUnit is not null && stamped.Unit != preferredUnit)
                    {
                        differentUnitReference ??= stamped;
                        continue;
                    }
                    cache.Set(cacheKey, stamped, TimeSpan.FromHours(1));
                    return stamped;
                }
            }

            if (differentUnitReference is not null)
            {
                var reference = differentUnitReference with
                {
                    Message = differentUnitReference.Message + $" No benchmark in the requested unit ({preferredUnit}) was available. This value remains a reference per {differentUnitReference.Unit}; no weight-to-item conversion has been inferred."
                };
                cache.Set(cacheKey, reference, TimeSpan.FromHours(1));
                return reference;
            }
            var unavailable = new CustomsTradeBenchmark(code, null, "Ethiopia", "USD", null, null, null, null, null,
                "Comtrade has no usable published period for this HS category, or the reported quantity is unavailable. No price has been inferred.",
                false, "No usable trade benchmark", null, [], false);
            var checkedUnavailable = unavailable with { LastCheckedAtUtc = checkedAt };
            cache.Set(cacheKey, checkedUnavailable, TimeSpan.FromMinutes(15));
            return checkedUnavailable;
        }
        finally { lookupGate.Release(); }
    }

    public async Task<CustomsTradeBenchmark> SearchOriginFobAsync(string code, string countryCode, CancellationToken ct, string? preferredUnit = null)
    {
        var reporter = await ResolveReporterAsync(countryCode, ct)
            ?? throw new ComtradeUnavailableException(400, "The selected country is not available as a UN Comtrade reporting country.");
        var cacheKey = $"comtrade:origin-fob:v3-latest:{code}:{reporter.Code}:{preferredUnit ?? "any"}";
        if (cache.TryGetValue<CustomsTradeBenchmark>(cacheKey, out var cached) && cached is not null) return cached;

        await lookupGate.WaitAsync(ct);
        try
        {
            if (cache.TryGetValue<CustomsTradeBenchmark>(cacheKey, out cached) && cached is not null) return cached;
            var http = factory.CreateClient("UNComtrade");
            CustomsTradeBenchmark? differentUnitReference = null;
            var checkedAt = clock.GetUtcNow();
            foreach (var period in await GetAvailablePeriodsAsync(reporter.Code, ct))
            {
                var publicPath = $"public/v1/preview/C/M/HS?reporterCode={reporter.Code}&partnerCode=231&flowCode=X&period={period}&cmdCode={code}&partner2Code=0&customsCode=C00&motCode=0&maxRecords=500";
                var requestPath = WithSubscriptionKey(publicPath);
                using var document = await ReadAsync(http, requestPath, ct);
                var result = Calculate(document.RootElement, code, period, mirror: true, new Uri(http.BaseAddress!, publicPath).AbsoluteUri, preferredUnit);
                if (result is null) continue;
                var named = result with
                {
                    Reporter = reporter.Name,
                    SourceLabel = $"{reporter.Name} exports to Ethiopia",
                    Reporters = [new BenchmarkReporter(reporter.Code, reporter.Name)],
                    ReporterCode = reporter.Code,
                    PartnerCode = 231,
                    Partner = "Ethiopia",
                    LastCheckedAtUtc = checkedAt,
                    Message = $"Country-of-origin FOB export unit value for {reporter.Name} in {period}. This is supporting reference evidence, not an exact brand/model price or an accepted customs valuation."
                };
                if (preferredUnit is not null && named.Unit != preferredUnit)
                {
                    differentUnitReference = named with
                    {
                        Message = named.Message + $" No benchmark in the requested unit ({preferredUnit}) was available. This value remains a reference per {named.Unit}; no unit conversion has been inferred."
                    };
                }
                else
                {
                    cache.Set(cacheKey, named, TimeSpan.FromHours(1));
                    return named;
                }
            }

            if (differentUnitReference is not null)
            {
                cache.Set(cacheKey, differentUnitReference, TimeSpan.FromHours(1));
                return differentUnitReference;
            }

            var unavailable = new CustomsTradeBenchmark(code, null, reporter.Name, "USD", null, null, null, null, null,
                $"No usable FOB period has been published by Comtrade for {reporter.Name}, or no usable quantity was reported.",
                true, $"{reporter.Name} FOB exports to Ethiopia", "FOB", [new BenchmarkReporter(reporter.Code, reporter.Name)], false,
                reporter.Code, 231, "Ethiopia", checkedAt);
            cache.Set(cacheKey, unavailable, TimeSpan.FromMinutes(15));
            return unavailable;
        }
        finally { lookupGate.Release(); }
    }

    private async Task<IReadOnlyList<int>> GetAvailablePeriodsAsync(int reporterCode, CancellationToken ct)
    {
        var cacheKey = $"comtrade:availability:v1:monthly-hs:{reporterCode}";
        if (cache.TryGetValue<IReadOnlyList<int>>(cacheKey, out var cached) && cached is not null) return cached;

        var http = factory.CreateClient("UNComtrade");
        var subscriptionKey = configuration?["Comtrade:SubscriptionKey"];
        var path = string.IsNullOrWhiteSpace(subscriptionKey)
            ? $"public/v1/getDA/C/M/HS?reporterCode={reporterCode}"
            : $"data/v1/getDA/C/M/HS?reporterCode={reporterCode}&subscription-key={Uri.EscapeDataString(subscriptionKey)}";
        using var document = await ReadAsync(http, path, ct);
        if (!document.RootElement.TryGetProperty("data", out var rows) || rows.ValueKind != JsonValueKind.Array)
            throw new JsonException("Invalid Comtrade availability envelope.");

        var periods = rows.EnumerateArray()
            .Where(row => string.Equals(Text(row, "freqCode"), "M", StringComparison.OrdinalIgnoreCase)
                && string.Equals(Text(row, "classificationSearchCode"), "HS", StringComparison.OrdinalIgnoreCase)
                && (!row.TryGetProperty("isOriginalClassification", out var original) || original.ValueKind != JsonValueKind.False))
            .Select(row => Number(row, "period"))
            .Where(period => period is >= 100001 and <= 999912 && period % 100 is >= 1 and <= 12)
            .Select(period => (int)period!.Value)
            .Distinct()
            .OrderByDescending(period => period)
            .Take(1)
            .ToArray();

        // Lightweight unit-test handlers and older hosts may not expose the
        // availability metadata fields. Keep those callers compatible while
        // production hosts use the catalog above.
        if (periods.Length == 0 && configuration is null)
            periods = [int.Parse(clock.GetUtcNow().ToString("yyyyMM"))];

        cache.Set(cacheKey, periods, TimeSpan.FromHours(1));
        return periods;
    }

    private async Task<ComtradeReporter?> ResolveReporterAsync(string countryCode, CancellationToken ct)
    {
        var normalized = countryCode.Trim().ToUpperInvariant();
        var cacheKey = $"comtrade:reporters:v1:{normalized}";
        if (cache.TryGetValue<ComtradeReporter?>(cacheKey, out var cached)) return cached;

        var http = factory.CreateClient("UNComtrade");
        using var response = await http.GetAsync("files/v1/app/reference/Reporters.json", ct);
        if (!response.IsSuccessStatusCode)
            throw new ComtradeUnavailableException(502, "UN Comtrade country metadata could not be loaded.");
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var now = clock.GetUtcNow().UtcDateTime;
        ComtradeReporter? reporter = null;
        var reporterEffectiveDate = DateTime.MinValue;
        if (document.RootElement.TryGetProperty("results", out var results) && results.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in results.EnumerateArray())
            {
                if (string.Equals(Text(item, "isGroup"), "true", StringComparison.OrdinalIgnoreCase)
                    || !string.Equals(Text(item, "reporterCodeIsoAlpha2"), normalized, StringComparison.OrdinalIgnoreCase)
                    || !DateTime.TryParse(Text(item, "entryEffectiveDate"), out var effective)
                    || effective > now
                    || (DateTime.TryParse(Text(item, "entryExpiredDate"), out var expired) && expired <= now)) continue;

                var code = Number(item, "reporterCode");
                if (code is null || code.Value != decimal.Truncate(code.Value) || code.Value <= 0 || code.Value > int.MaxValue) continue;
                var candidate = new ComtradeReporter((int)code.Value, Text(item, "reporterDesc") ?? normalized, normalized);
                if (reporter is null || effective > reporterEffectiveDate)
                {
                    reporter = candidate;
                    reporterEffectiveDate = effective;
                }
            }
        }
        cache.Set(cacheKey, reporter, TimeSpan.FromHours(24));
        return reporter;
    }

    private async Task<JsonDocument> ReadAsync(HttpClient http, string path, CancellationToken ct)
    {
        for (var attempt = 0; ; attempt++)
        {
            var delay = nextRequestAt - clock.GetUtcNow();
            if (delay > TimeSpan.Zero) await Task.Delay(delay, clock, ct);
            using var response = await http.GetAsync(path, ct);
            nextRequestAt = clock.GetUtcNow().AddSeconds(1.5);
            if (response.IsSuccessStatusCode)
                return await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);

            var throttled = response.StatusCode == HttpStatusCode.TooManyRequests;
            var transient = throttled || (int)response.StatusCode >= 500;
            var retryDelay = response.Headers.RetryAfter?.Delta
                ?? (response.Headers.RetryAfter?.Date is { } retryAt ? retryAt - clock.GetUtcNow() : TimeSpan.FromSeconds(2));
            if (attempt == 0 && transient && retryDelay <= TimeSpan.FromSeconds(10))
            {
                var retryTime = clock.GetUtcNow().Add(retryDelay);
                if (retryTime > nextRequestAt) nextRequestAt = retryTime;
                continue;
            }
            var providerMessage = await response.Content.ReadAsStringAsync(ct);
            if (response.StatusCode == HttpStatusCode.Forbidden && providerMessage.Contains("quota", StringComparison.OrdinalIgnoreCase))
                throw new ComtradeUnavailableException(503,
                    "UN Comtrade's public API quota has been exhausted. Configure Comtrade:SubscriptionKey or retry after the provider quota is replenished.");
            throw new ComtradeUnavailableException(throttled ? 503 : 502,
                throttled ? "The UN Comtrade preview rate limit was reached. Please retry shortly."
                    : $"The UN Comtrade preview service returned HTTP {(int)response.StatusCode}. Please retry shortly.");
        }
    }

    private string WithSubscriptionKey(string publicPath)
    {
        var key = configuration?["Comtrade:SubscriptionKey"];
        return string.IsNullOrWhiteSpace(key)
            ? publicPath
            : publicPath.Replace("public/v1/", "data/v1/", StringComparison.Ordinal) + $"&subscription-key={Uri.EscapeDataString(key)}";
    }

    private static CustomsTradeBenchmark? Calculate(JsonElement root, string code, int year, bool mirror, string sourceUrl, string? preferredUnit)
    {
        if (root.ValueKind != JsonValueKind.Object || !string.IsNullOrWhiteSpace(Text(root, "error")) ||
            !root.TryGetProperty("data", out var rows) || rows.ValueKind != JsonValueKind.Array)
            throw new JsonException("Invalid Comtrade data envelope.");
        // Never present a truncated preview as an aggregate benchmark.
        if (rows.GetArrayLength() >= 500) throw new ComtradeUnavailableException(502, "The trade-data preview is truncated; a complete benchmark could not be calculated.");

        var records = new List<TradeRecord>();
        foreach (var row in rows.EnumerateArray())
        {
            // isAggregate can mean national tariff lines were rolled up into
            // this exact HS category. That is valid for a category benchmark;
            // exclude unrelated totals by code, reporter and dimensions instead.
            if (row.ValueKind != JsonValueKind.Object || Text(row, "cmdCode") != code ||
                Text(row, "flowCode") != (mirror ? "X" : "M") || Number(row, "partnerCode") != (mirror ? 231 : 0) ||
                Number(row, "period") != year || False(row, "isOriginalClassification") ||
                !DefaultDimension(row, "partner2Code", "0") || !DefaultDimension(row, "customsCode", "C00") || !DefaultDimension(row, "motCode", "0")) continue;
            var reporter = Number(row, "reporterCode");
            if (reporter is null || reporter != decimal.Truncate(reporter.Value) || reporter is <= 0 or > 999 ||
                (mirror ? reporter is 231 or 97 : reporter != 231)) continue;
            var primary = Quantity(row, "qty", "qtyUnitCode", "qtyUnitAbbr", "isQtyEstimated");
            var alternative = Quantity(row, "altQty", "altQtyUnitCode", "altQtyUnitAbbr", "isAltQtyEstimated");
            // Prefer an explicitly reported quantity matching the tariff unit;
            // never infer items from weight or weight from an item count.
            var preferred = preferredUnit ?? "u";
            var quantity = primary?.Unit == preferred ? primary : alternative?.Unit == preferred ? alternative : primary ?? alternative;
            var basisValue = Number(row, mirror ? "fobvalue" : "cifvalue");
            var value = basisValue is > 0 ? basisValue : Number(row, "primaryValue");
            if (value is not > 0 || quantity is null) continue;
            var basis = basisValue is > 0 ? mirror ? "FOB" : "CIF" : "Reported trade value";
            var reporterCode = (int)reporter.Value;
            records.Add(new TradeRecord(reporterCode, Text(row, "reporterDesc") ?? (mirror ? $"Reporter {reporterCode}" : "Ethiopia"),
                quantity.Unit, quantity.Amount, value.Value, basis, quantity.Estimated));
        }

        // Collapse identical duplicates. Conflicting totals for the same reporter
        // are ambiguous and must not be double counted or arbitrarily selected.
        var unique = records.GroupBy(record => record.ReporterCode)
            .Select(group => group.Distinct().ToArray()).Where(group => group.Length == 1).Select(group => group[0]);
        var cohort = unique.GroupBy(record => (record.Unit, record.Basis))
            .OrderByDescending(group => group.Key.Unit == (preferredUnit ?? "u"))
            .ThenByDescending(group => group.Sum(record => record.Value)).FirstOrDefault();
        if (cohort is null) return null;
        var tradeValue = cohort.Sum(record => record.Value);
        var totalQuantity = cohort.Sum(record => record.Quantity);
        var reporters = cohort.OrderBy(record => record.ReporterCode).Select(record => new BenchmarkReporter(record.ReporterCode, record.ReporterName)).ToArray();
        var label = mirror ? $"Supplier exports to Ethiopia ({reporters.Length} reporters)" : "Ethiopia imports";
        var message = mirror
            ? "Mirror-data fallback: Ethiopia's import reports had no usable quantity in the required unit. This quantity-weighted HS-category average covers only supplier reports with compatible units, not all Ethiopian imports. Export values exclude import freight and insurance; they are not equivalent to a CIF import value."
            : "HS-category import unit value (trade value divided by reported quantity).";
        message += " This is not an exact brand/model price or an accepted customs valuation.";
        var estimated = cohort.Any(record => record.Estimated);
        if (estimated) message += " Some quantities are estimated by the reporting source.";
        return new CustomsTradeBenchmark(code, year, mirror ? "Supplier countries" : "Ethiopia", "USD", cohort.Key.Unit,
            tradeValue, totalQuantity, Math.Round(tradeValue / totalQuantity, 2), sourceUrl, message, mirror,
            label, cohort.Key.Basis, reporters, estimated);
    }

    private static ReportedQuantity? Quantity(JsonElement row, string amountName, string codeName, string unitName, string estimatedName)
    {
        var amount = Number(row, amountName);
        if (amount is not > 0) return null;
        // The keyless preview often leaves descriptions null. Numeric unit codes
        // are authoritative: https://uncomtrade.org/docs/supplementary-quantity-units/
        var unit = Number(row, codeName) switch
        {
            2 => ("m2", 1m), 3 => ("1000 kWh", 1m), 4 => ("m", 1m), 5 => ("u", 1m),
            6 => ("u", 2m), 7 => ("l", 1m), 8 => ("kg", 1m), 9 => ("u", 1000m),
            10 => ("pack", 1m), 11 => ("u", 12m), 12 => ("m3", 1m), 13 => ("carat", 1m),
            null => Text(row, unitName)?.Trim().ToLowerInvariant() switch
            {
                "u" => ("u", 1m), "2u" => ("u", 2m), "1000u" => ("u", 1000m), "12u" => ("u", 12m),
                "kg" => ("kg", 1m), "m" => ("m", 1m), "m2" => ("m2", 1m), "m3" => ("m3", 1m),
                "l" => ("l", 1m), "carat" => ("carat", 1m), _ => ("", 0m)
            },
            _ => ("", 0m)
        };
        return unit.Item2 == 0 ? null : new ReportedQuantity(unit.Item1, amount.Value * unit.Item2, True(row, estimatedName));
    }

    private static bool DefaultDimension(JsonElement row, string name, string expected) => Text(row, name) is not { } value || value == expected;
    private static bool True(JsonElement row, string name) => row.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.True;
    private static bool False(JsonElement row, string name) => row.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.False;
    private static string? Text(JsonElement row, string name) => row.TryGetProperty(name, out var field) && field.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined)
        ? field.ValueKind == JsonValueKind.String ? field.GetString() : field.ToString() : null;
    private static decimal? Number(JsonElement row, string name) => decimal.TryParse(Text(row, name), System.Globalization.NumberStyles.Float,
        System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : null;
    private sealed record ReportedQuantity(string Unit, decimal Amount, bool Estimated);
    private sealed record TradeRecord(int ReporterCode, string ReporterName, string Unit, decimal Quantity, decimal Value, string Basis, bool Estimated);
}
