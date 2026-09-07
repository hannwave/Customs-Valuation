using SES.Customs.Core.Models;
namespace SES.Customs.Core.Features.Analytics.Service;

public sealed record ComparableObservation(PricePool Pool, decimal Value, string Currency, string Unit, string ComparabilityKey);
public sealed record PriceStatistics(int Count, decimal? Minimum, decimal? Maximum, decimal? Mean, decimal? Median, double? PopulationStandardDeviation);

// Pure calculation primitive, not an approved production comparison engine.
// A future comparison policy must create the key after checking dates, products,
// taxes, local price category, Incoterms and adjustment provenance.
public static class PriceStatisticsCalculator
{
    public static PriceStatistics Calculate(IReadOnlyCollection<ComparableObservation> observations)
    {
        if (observations.Count == 0) return new(0, null, null, null, null, null);
        if (observations.Any(x => x.Value < 0 || string.IsNullOrWhiteSpace(x.Currency)
            || string.IsNullOrWhiteSpace(x.Unit) || string.IsNullOrWhiteSpace(x.ComparabilityKey)))
            throw new ArgumentException("Observations require non-negative values and explicit comparison metadata.");
        if (observations.Select(x => (x.Pool, x.Currency, x.Unit, x.ComparabilityKey)).Distinct().Count() != 1)
            throw new ArgumentException("Statistics require one price pool and one comparable group.");
        var values = observations.Select(x => x.Value).Order().ToArray();
        var mean = values.Average();
        var median = values.Length % 2 == 0
            ? values[values.Length / 2 - 1] / 2 + values[values.Length / 2] / 2
            : values[values.Length / 2];
        var variance = values.Average(x => Math.Pow((double)(x - mean), 2));
        return new(values.Length, values[0], values[^1], mean, median, Math.Sqrt(variance));
    }
}
