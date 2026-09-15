namespace SES.Customs.API.Integrations;

public sealed record PriceObservation(string Title, string Source, decimal Price);
public sealed record PricePercentilesDto(decimal P25, decimal P50, decimal P75);
public sealed record PriceOutlierDto(string Title, string Source, decimal Price, string Direction);
public sealed record PriceStatisticsDto(
    int ObservationCount,
    decimal Minimum,
    decimal Maximum,
    decimal Mean,
    decimal Median,
    decimal StandardDeviation,
    PricePercentilesDto Percentiles,
    IReadOnlyList<PriceOutlierDto> PotentialOutliers);

public static class PriceStatisticsCalculator
{
    public static PriceStatisticsDto? Calculate(IEnumerable<PriceObservation> observations)
    {
        var valid = observations
            .Where(item => item.Price > 0)
            .OrderBy(item => item.Price)
            .ToArray();
        if (valid.Length == 0) return null;

        var prices = valid.Select(item => item.Price).ToArray();
        var mean = prices.Average();
        var p25 = Percentile(prices, 0.25m);
        var median = Percentile(prices, 0.50m);
        var p75 = Percentile(prices, 0.75m);
        var variance = prices.Select(price => (price - mean) * (price - mean)).Average();
        var standardDeviation = (decimal)Math.Sqrt((double)variance);
        var iqr = p75 - p25;
        var lowerFence = p25 - 1.5m * iqr;
        var upperFence = p75 + 1.5m * iqr;
        var outliers = valid
            .Where(item => item.Price < lowerFence || item.Price > upperFence)
            .Select(item => new PriceOutlierDto(
                item.Title,
                item.Source,
                item.Price,
                item.Price < lowerFence ? "Low" : "High"))
            .ToArray();

        return new PriceStatisticsDto(
            prices.Length,
            prices[0],
            prices[^1],
            mean,
            median,
            standardDeviation,
            new PricePercentilesDto(p25, median, p75),
            outliers);
    }

    // Linear interpolation between adjacent ordered observations (R-7 method).
    private static decimal Percentile(IReadOnlyList<decimal> sorted, decimal percentile)
    {
        if (sorted.Count == 1) return sorted[0];
        var index = (sorted.Count - 1) * percentile;
        var lower = (int)Math.Floor(index);
        var upper = (int)Math.Ceiling(index);
        if (lower == upper) return sorted[lower];
        var weight = index - lower;
        return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
    }
}
