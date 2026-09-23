using System.Text.RegularExpressions;

namespace SES.Customs.Core.Models;

public sealed record ExactProduct(string Brand, string Model, string Variant)
{
    public string Query => $"{Brand.Trim()} {Model.Trim()} {(Variant == "standard" ? "" : Variant.Trim())}".Trim();
}

public static class HistoricalComparison
{
    private static string Normal(string value) => Regex.Replace(value.ToLowerInvariant(), @"[^a-z0-9]", "");
    public static bool Matches(ExactProduct target, string title, string? condition)
    {
        var text = title.ToLowerInvariant();
        if (Regex.IsMatch(text + " " + condition, @"\b(refurbished|renewed|used|second.hand|pre.owned|case|cover|protector|replacement|adapter|cable|charger|strap|earpads|ear cushions|bundle|replica)\b", RegexOptions.IgnoreCase)) return false;
        var normalized = Normal(title);
        if (!normalized.Contains(Normal(target.Brand)) || !normalized.Contains(Normal(target.Model))) return false;
        // Reject extra model suffixes (15 vs 15 Pro/Plus/Max) and other numeric model/storage variants.
        foreach (var suffix in new[] { "pro", "max", "plus", "ultra", "mini", "lite", "fe" })
            if (Regex.IsMatch(text, $@"\b{suffix}\b") != Regex.IsMatch(target.Query.ToLowerInvariant(), $@"\b{suffix}\b")) return false;
        var wantedNumbers = Regex.Matches(target.Query, @"\d+").Select(x => x.Value).ToHashSet();
        var actualNumbers = Regex.Matches(title, @"\d+").Select(x => x.Value).ToHashSet();
        if (!wantedNumbers.SetEquals(actualNumbers)) return false;
        var sizes = Regex.Matches(Regex.Replace(text, @"\s+", ""), @"\d+(?:gb|tb)").Select(x => x.Value).ToHashSet();
        var expected = Regex.Matches(Regex.Replace(target.Query.ToLowerInvariant(), @"\s+", ""), @"\d+(?:gb|tb)").Select(x => x.Value).ToHashSet();
        if (!sizes.SetEquals(expected)) return false;
        return target.Variant == "standard" || normalized.Contains(Normal(target.Variant));
    }

    public static decimal? Median(IEnumerable<decimal> prices)
    {
        var values = prices.Where(x => x > 0).Order().ToArray();
        return values.Length == 0 ? null : values.Length % 2 == 1 ? values[values.Length / 2] : (values[values.Length / 2 - 1] + values[values.Length / 2]) / 2;
    }
    public static decimal? Percent(decimal? value, decimal? baseline) => value.HasValue && baseline is > 0 ? (value.Value - baseline.Value) / baseline.Value * 100 : null;
}
