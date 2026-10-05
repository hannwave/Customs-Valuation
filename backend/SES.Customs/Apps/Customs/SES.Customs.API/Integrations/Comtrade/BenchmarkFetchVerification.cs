using Microsoft.AspNetCore.WebUtilities;

namespace SES.Customs.API.Integrations.Comtrade;

public sealed record BenchmarkVerification(string Status, string Message, IReadOnlyList<string> Checks, int? HttpStatus = null);
public sealed record BenchmarkCatalogueCheck(string Status, string? RevisionName, string Message);
public sealed record BenchmarkFetchCheck(string HsCode, string? RequestedUnit, DateTimeOffset CheckedAt,
    BenchmarkCatalogueCheck Catalogue, BenchmarkVerification Trade, CustomsTradeBenchmark? Benchmark);

public static class BenchmarkFetchVerification
{
    public static BenchmarkVerification Verify(CustomsTradeBenchmark benchmark, string code, string? unit, int currentPeriod)
    {
        if (benchmark.UnitValue is null && benchmark.TradeValue is null && benchmark.Quantity is null && benchmark.HsCode == code)
            return new("no_data", benchmark.Message, []);

        var checks = new List<string>();
        var failures = new List<string>();
        void Check(bool passed, string description)
        {
            if (passed) checks.Add(description);
            else failures.Add(description);
        }

        Check(benchmark.HsCode == code, "HS code matches the request");
        Check(benchmark.Currency == "USD", "Currency is USD");
        Check(benchmark.Period is >= 100001 and <= 999912 && benchmark.Period.Value % 100 is >= 1 and <= 12,
            "Trade period is a valid published monthly period");
        Check(benchmark.TradeValue is > 0 && benchmark.Quantity is > 0 && benchmark.UnitValue is >= 0
            && Math.Round(benchmark.TradeValue.Value / benchmark.Quantity.Value, 2) == benchmark.UnitValue,
            "Price equals trade value divided by quantity, rounded to two decimals");
        Check(!string.IsNullOrWhiteSpace(benchmark.Unit), "Reported quantity unit is present");
        Check(SourceMatches(benchmark), "UN Comtrade source matches the HS code, published period and trade flow");
        Check(benchmark.LastCheckedAtUtc is not null, "Latest-period lookup timestamp is recorded");
        Check(benchmark.Reporters.Count > 0 && benchmark.Reporters.Select(reporter => reporter.Code).Distinct().Count() == benchmark.Reporters.Count
            && benchmark.Reporters.All(reporter => benchmark.IsMirror ? reporter.Code is > 0 and <= 999 and not (231 or 97) : reporter.Code == 231),
            "Reporting countries match the import or supplier-export source");
        Check(benchmark.ValuationBasis == "Reported trade value" || benchmark.ValuationBasis == (benchmark.IsMirror ? "FOB" : "CIF"),
            "Valuation basis matches the trade flow");

        if (failures.Count > 0)
            return new("invalid_result", "Result failed verification: " + string.Join("; ", failures) + ".", checks);
        if (unit is not null && benchmark.Unit != unit)
            return new("unit_mismatch", $"Fetched per {benchmark.Unit}, not the requested {unit}. Reference only; no unit conversion was inferred.", checks);
        checks.Add(unit is null ? "No specific quantity unit was requested" : "Reported unit matches the request");
        return new("verified", "Fetch and calculation checks passed. This remains an HS-category benchmark, not an exact product price.", checks);
    }

    private static bool SourceMatches(CustomsTradeBenchmark benchmark)
    {
        if (!Uri.TryCreate(benchmark.SourceUrl, UriKind.Absolute, out var source) || source.Scheme != "https"
            || source.Host != "comtradeapi.un.org" || source.AbsolutePath != "/public/v1/preview/C/M/HS") return false;
        var query = QueryHelpers.ParseQuery(source.Query);
        string Value(string key) => query.TryGetValue(key, out var value) ? value.ToString() : "";
        return Value("cmdCode") == benchmark.HsCode && Value("period") == benchmark.Period?.ToString()
            && Value("flowCode") == (benchmark.IsMirror ? "X" : "M")
            && Value("partnerCode") == (benchmark.IsMirror ? "231" : "0")
            && (benchmark.IsMirror ? !query.ContainsKey("reporterCode") : Value("reporterCode") == "231")
            && Value("partner2Code") == "0" && Value("customsCode") == "C00" && Value("motCode") == "0";
    }
}
