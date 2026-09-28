using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace SES.Customs.API.Integrations.Comtrade;

public sealed record BenchmarkReporter(int Code, string Name);

public sealed record CustomsTradeBenchmark(
    string HsCode, int? Period, string Reporter, string Currency, string? Unit,
    decimal? TradeValue, decimal? Quantity, decimal? UnitValue, string? SourceUrl,
    string Message, bool IsMirror, string SourceLabel, string? ValuationBasis,
    IReadOnlyList<BenchmarkReporter> Reporters, bool QuantityEstimated)
{
    public int ReporterCount => Reporters.Count;
}

public sealed class ComtradeUnavailableException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

// Singleton: serialize keyless preview lookups, pace requests across users, and
// recheck the cache after waiting so simultaneous searches do not fan out upstream.
public sealed class ComtradeBenchmarkClient(IHttpClientFactory factory, IMemoryCache cache, TimeProvider? timeProvider = null)
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly SemaphoreSlim lookupGate = new(1, 1);
    private DateTimeOffset nextRequestAt;

    public async Task<CustomsTradeBenchmark> SearchAsync(string code, CancellationToken ct)
    {
        var lastYear = clock.GetUtcNow().Year - 1;
        var cacheKey = $"comtrade:benchmark:v2:{code}:{lastYear}";
        if (cache.TryGetValue<CustomsTradeBenchmark>(cacheKey, out var cached) && cached is not null) return cached;

        await lookupGate.WaitAsync(ct);
        try
        {
            if (cache.TryGetValue<CustomsTradeBenchmark>(cacheKey, out cached) && cached is not null) return cached;
            var http = factory.CreateClient("UNComtrade");
            // Prefer Ethiopia's own imports, even when a supplier has a newer report.
            foreach (var mirror in new[] { false, true })
            {
                for (var year = lastYear; year >= lastYear - 2; year--)
                {
                    // Omitting reporterCode selects all reporting suppliers. The
                    // preview endpoint rejects the literal reporterCode=ALL.
                    var origin = mirror ? "partnerCode=231&flowCode=X" : "reporterCode=231&partnerCode=0&flowCode=M";
                    var path = $"public/v1/preview/C/A/HS?{origin}&period={year}&cmdCode={code}&partner2Code=0&customsCode=C00&motCode=0&maxRecords=500";
                    using var document = await ReadAsync(http, path, ct);
                    var result = Calculate(document.RootElement, code, year, mirror, new Uri(http.BaseAddress!, path).AbsoluteUri);
                    if (result is null) continue;
                    cache.Set(cacheKey, result, TimeSpan.FromHours(12));
                    return result;
                }
            }

            var unavailable = new CustomsTradeBenchmark(code, null, "Ethiopia", "USD", null, null, null, null, null,
                "Neither Ethiopia imports nor supplier exports to Ethiopia had a usable reported quantity for this HS category in the last three completed years. No product price has been inferred.",
                false, "No usable trade benchmark", null, [], false);
            cache.Set(cacheKey, unavailable, TimeSpan.FromMinutes(15));
            return unavailable;
        }
        finally { lookupGate.Release(); }
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
            throw new ComtradeUnavailableException(throttled ? 503 : 502,
                throttled ? "The UN Comtrade preview rate limit was reached. Please retry shortly."
                    : $"The UN Comtrade preview service returned HTTP {(int)response.StatusCode}. Please retry shortly.");
        }
    }

    private static CustomsTradeBenchmark? Calculate(JsonElement root, string code, int year, bool mirror, string sourceUrl)
    {
        if (root.ValueKind != JsonValueKind.Object || !string.IsNullOrWhiteSpace(Text(root, "error")) ||
            !root.TryGetProperty("data", out var rows) || rows.ValueKind != JsonValueKind.Array)
            throw new JsonException("Invalid Comtrade data envelope.");
        // Never present a truncated preview as an aggregate benchmark.
        if (rows.GetArrayLength() >= 500) throw new ComtradeUnavailableException(502, "The trade-data preview is truncated; a complete benchmark could not be calculated.");

        var records = new List<TradeRecord>();
        foreach (var row in rows.EnumerateArray())
        {
            if (row.ValueKind != JsonValueKind.Object || Text(row, "cmdCode") != code ||
                Text(row, "flowCode") != (mirror ? "X" : "M") || Number(row, "partnerCode") != (mirror ? 231 : 0) ||
                Number(row, "period") != year || True(row, "isAggregate") || False(row, "isOriginalClassification") ||
                !DefaultDimension(row, "partner2Code", "0") || !DefaultDimension(row, "customsCode", "C00") || !DefaultDimension(row, "motCode", "0")) continue;
            var reporter = Number(row, "reporterCode");
            if (reporter is null || reporter != decimal.Truncate(reporter.Value) || reporter is <= 0 or > 999 ||
                (mirror ? reporter is 231 or 97 : reporter != 231)) continue;
            var primary = Quantity(row, "qty", "qtyUnitCode", "qtyUnitAbbr", "isQtyEstimated");
            var alternative = Quantity(row, "altQty", "altQtyUnitCode", "altQtyUnitAbbr", "isAltQtyEstimated");
            // An explicit alternative count is usable; never infer items from weight.
            var quantity = primary?.Unit == "u" ? primary : alternative?.Unit == "u" ? alternative : primary ?? alternative;
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
            .OrderByDescending(group => group.Key.Unit == "u")
            .ThenByDescending(group => group.Sum(record => record.Value)).FirstOrDefault();
        if (cohort is null) return null;
        var tradeValue = cohort.Sum(record => record.Value);
        var totalQuantity = cohort.Sum(record => record.Quantity);
        var reporters = cohort.OrderBy(record => record.ReporterCode).Select(record => new BenchmarkReporter(record.ReporterCode, record.ReporterName)).ToArray();
        var label = mirror ? $"Supplier exports to Ethiopia ({reporters.Length} reporters)" : "Ethiopia imports";
        var message = mirror
            ? "Mirror-data fallback: Ethiopia's import reports had no usable quantity. This quantity-weighted HS-category average covers only supplier reports with compatible units, not all Ethiopian imports. Export values exclude import freight and insurance; they are not equivalent to a CIF import value."
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
