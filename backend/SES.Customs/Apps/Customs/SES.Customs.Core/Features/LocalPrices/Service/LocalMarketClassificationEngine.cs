using System.Globalization;
using System.Text.RegularExpressions;
using SES.Customs.Core.Models;

namespace SES.Customs.Core.Features.LocalPrices.Service;

public sealed record TargetProductProfile(
    string HsCode,
    string Query,
    string? Category = null,
    string? ProductType = null,
    string? Brand = null,
    string? Manufacturer = null,
    string? Model = null,
    string? Variant = null,
    string? Size = null,
    string? Capacity = null,
    string? Specification = null,
    string? Grade = null,
    ProductCondition Condition = ProductCondition.New,
    decimal Quantity = 1,
    string Unit = "piece",
    MarketPriceType PriceType = MarketPriceType.Retail);

public sealed record MarketplaceListing(
    string Source,
    string SourceListingId,
    string Url,
    string Title,
    string? Description,
    string? Seller,
    string? Location,
    decimal Price,
    string Currency,
    DateTimeOffset RetrievedAt,
    DateTimeOffset? ListingDate,
    string? ImageUrl,
    string? RawCategory,
    ProductCondition Condition,
    MarketPriceType PriceType);

public sealed record LocalClassificationOptions(
    int RelevanceThreshold = 80,
    LocalOutlierMethod OutlierMethod = LocalOutlierMethod.Iqr,
    bool IncludeOutliers = false,
    int MaximumAgeDays = 180,
    IReadOnlyDictionary<string, string[]>? ExclusionKeywords = null,
    IReadOnlyDictionary<string, ManualReviewStatus>? ManualReviews = null);

public sealed record ClassifiedLocalListing(
    Guid Id,
    MarketplaceListing Listing,
    int RelevanceScore,
    LocalObservationStatus Status,
    string Reason,
    string[] MatchedKeywords,
    string[] ExcludedKeywords,
    decimal OriginalQuantity,
    string OriginalUnit,
    decimal NormalizedQuantity,
    string NormalizedUnit,
    decimal? NormalizedUnitPrice,
    Guid? DuplicateOfId,
    bool IsPotentialOutlier,
    decimal? OutlierScore,
    string? OutlierReason,
    bool IncludedInStatistics);

public sealed record LocalPriceStatistics(
    int Count,
    decimal Minimum,
    decimal Maximum,
    decimal Mean,
    decimal Median,
    decimal PopulationStandardDeviation,
    decimal Q1,
    decimal Q3,
    decimal Iqr,
    DateTimeOffset OldestObservation,
    DateTimeOffset NewestObservation);

public sealed record LocalCollectionSummary(
    int RawListings,
    int ValidObservations,
    int RejectedIrrelevant,
    int WrongBrand,
    int WrongModel,
    int WrongVariant,
    int IncompatibleCondition,
    int IncompatibleUnit,
    int InvalidPrice,
    int Duplicates,
    int PotentialOutliers,
    int Excluded);

public sealed record ConfidenceFactor(string Name, decimal Score, decimal Maximum, string Explanation);
public sealed record LocalPriceConfidence(decimal Score, string Level, IReadOnlyList<ConfidenceFactor> Factors, string Disclaimer);
public sealed record RepresentativeLocalPrice(decimal? Value, string Method, string Currency, int ComparableListings, bool ExcludesOutliers);
public sealed record LocalMarketAnalysis(
    TargetProductProfile Product,
    LocalCollectionSummary Collection,
    LocalPriceStatistics? StatisticsIncludingOutliers,
    LocalPriceStatistics? RobustStatistics,
    RepresentativeLocalPrice RepresentativePrice,
    LocalPriceConfidence Confidence,
    IReadOnlyList<ClassifiedLocalListing> Observations,
    LocalOutlierMethod OutlierMethod,
    int RelevanceThreshold);

public static class LocalMarketClassificationEngine
{
    private static readonly Regex TokenRegex = new("[a-z0-9]+", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex QuantityRegex = new(@"(?:pack\s+of\s+|lot\s+of\s+)(?<quantity>\d{1,4})|(?<quantity>\d{1,4})\s*(?:pieces|piece|pcs|units)\b", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly Regex CapacityRegex = new(@"\b(?<amount>\d{1,4})\s*(?<unit>gb|tb)\b", RegexOptions.Compiled | RegexOptions.IgnoreCase);
    private static readonly HashSet<string> StopWords = new(["a", "an", "and", "for", "of", "the", "with", "in", "on", "new", "used"], StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> VariantQualifiers = new(["pro", "max", "mini", "plus", "ultra", "lite", "air"], StringComparer.OrdinalIgnoreCase);
    private static readonly string[] UniversalAccessories = ["case", "cover", "cable", "charger", "adapter", "screen protector", "tempered glass", "glass", "replacement screen", "display", "battery", "housing", "camera protector", "earphones", "accessory", "spare part"];
    private static readonly IReadOnlyDictionary<string, string[]> DefaultExclusions = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
    {
        ["smartphone"] = UniversalAccessories,
        ["phone"] = UniversalAccessories,
        ["computer"] = ["bag", "sleeve", "charger", "adapter", "mouse", "keyboard", "screen protector", "battery", "spare part"],
        ["vehicle"] = ["spare part", "tyre", "tire", "battery", "cover", "engine part", "accessory"],
        ["clothing"] = ["hanger", "mannequin", "sewing pattern", "fabric only"],
        ["default"] = ["spare part", "accessory", "replacement part"]
    };
    private static readonly IReadOnlyDictionary<string, string[]> ProductTypeSignals = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
    {
        ["smartphone"] = ["phone", "smartphone", "iphone", "galaxy", "mobile"],
        ["computer"] = ["computer", "laptop", "notebook", "macbook", "desktop", "chromebook"],
        ["vehicle"] = ["vehicle", "car", "truck", "suv", "motorcycle", "pickup"],
        ["clothing"] = ["shirt", "dress", "trouser", "jacket", "shoe", "clothing", "garment"]
    };

    public static LocalMarketAnalysis Analyze(
        TargetProductProfile target,
        IReadOnlyCollection<MarketplaceListing> rawListings,
        LocalClassificationOptions? options = null)
    {
        options ??= new LocalClassificationOptions();
        if (options.RelevanceThreshold is < 0 or > 100) throw new ArgumentOutOfRangeException(nameof(options.RelevanceThreshold));
        if (string.IsNullOrWhiteSpace(target.Query)) throw new ArgumentException("A target product query is required.", nameof(target));

        var now = rawListings.Count == 0 ? DateTimeOffset.UtcNow : rawListings.Max(item => item.RetrievedAt);
        var classified = rawListings.Select(item => Classify(target, item, options, now)).ToList();
        MarkDuplicates(classified);
        MarkOutliers(classified, options.OutlierMethod);
        ApplyManualReviews(classified, options.ManualReviews);

        var comparableWithOutliers = classified.Where(IsComparableBeforeOutlier).ToArray();
        var robust = comparableWithOutliers.Where(item => !item.IsPotentialOutlier).ToArray();
        for (var index = 0; index < classified.Count; index++)
        {
            var item = classified[index];
            var include = IsComparableBeforeOutlier(item) && (options.IncludeOutliers || !item.IsPotentialOutlier);
            classified[index] = item with { IncludedInStatistics = include };
        }

        var allStats = Statistics(comparableWithOutliers);
        var robustStats = Statistics(robust);
        var selectedStats = options.IncludeOutliers ? allStats : robustStats;
        var summary = Summary(classified);
        var confidence = Confidence(classified, robustStats);
        return new LocalMarketAnalysis(
            target,
            summary,
            allStats,
            robustStats,
            new RepresentativeLocalPrice(selectedStats?.Median, "Median", "ETB", selectedStats?.Count ?? 0, !options.IncludeOutliers),
            confidence,
            classified,
            options.OutlierMethod,
            options.RelevanceThreshold);
    }

    private static ClassifiedLocalListing Classify(TargetProductProfile target, MarketplaceListing listing, LocalClassificationOptions options, DateTimeOffset now)
    {
        var id = Guid.NewGuid();
        var text = Normalize($"{listing.Title} {listing.Description}");
        var query = Normalize(target.Query);
        var brandTokens = Tokens(target.Brand).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var targetTokens = Tokens(query).Where(token => !StopWords.Contains(token) && !brandTokens.Contains(token)).Distinct().ToArray();
        var listingTokens = Tokens(text).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var matched = targetTokens.Where(listingTokens.Contains).ToArray();
        var coverage = targetTokens.Length == 0 ? 0m : (decimal)matched.Length / targetTokens.Length;
        var phraseMatch = text.Contains(query, StringComparison.Ordinal);
        var modelBonus = !string.IsNullOrWhiteSpace(target.Model) && ContainsPhrase(text, target.Model) ? 10 : 0;
        var variantText = string.Join(" ", new[] { target.Variant, target.Capacity, target.Size }.Where(value => !string.IsNullOrWhiteSpace(value)));
        var variantBonus = variantText.Length > 0 && Tokens(variantText).All(token => Tokens(text).Contains(token)) ? 5 : 0;
        var score = Math.Clamp((int)Math.Round(coverage * 75m) + (phraseMatch ? 10 : 0) + (coverage == 1 ? 5 : 0) + modelBonus + variantBonus, 0, 100);
        var exclusions = ApplicableExclusions(target, options).Where(keyword => ContainsPhrase(text, keyword) && !ContainsPhrase(query, keyword)).Distinct().ToArray();
        var (quantity, unitPrice) = NormalizeQuantity(listing);

        LocalObservationStatus status;
        string reason;
        if (listing.Price <= 0 || !string.Equals(listing.Currency, "ETB", StringComparison.OrdinalIgnoreCase))
        {
            status = LocalObservationStatus.InvalidPrice;
            reason = listing.Price <= 0 ? "Listing has no valid positive price." : $"Currency {listing.Currency} has no approved ETB conversion for this search.";
        }
        else if (exclusions.Length > 0)
        {
            status = LocalObservationStatus.RejectedIrrelevant;
            score = Math.Min(score, 20);
            reason = $"Excluded product type detected: {string.Join(", ", exclusions)}.";
        }
        else if (!MatchesBrand(target.Brand, target.Model, text))
        {
            status = LocalObservationStatus.WrongBrand;
            reason = $"Required brand '{target.Brand}' was not found.";
        }
        else if (!MatchesRequired(target.Model, text))
        {
            status = LocalObservationStatus.WrongModel;
            reason = $"Required model '{target.Model}' was not found.";
        }
        else if (!VariantMatches(target, query, text))
        {
            status = LocalObservationStatus.WrongVariant;
            reason = "The listing has a missing or conflicting product variant/specification.";
        }
        else if (target.Condition != ProductCondition.Unknown && listing.Condition != target.Condition)
        {
            status = LocalObservationStatus.IncompatibleCondition;
            reason = listing.Condition == ProductCondition.Unknown
                ? "The listing condition could not be confirmed."
                : $"Listing condition is {listing.Condition}; target condition is {target.Condition}.";
        }
        else if (target.PriceType != MarketPriceType.Unknown && listing.PriceType != target.PriceType)
        {
            status = LocalObservationStatus.RejectedIrrelevant;
            reason = $"Listing price type is {listing.PriceType}; target price type is {target.PriceType}.";
        }
        else if (listing.ListingDate is { } listingDate && listingDate < now.AddDays(-options.MaximumAgeDays))
        {
            status = LocalObservationStatus.RejectedIrrelevant;
            reason = $"Listing is older than the configured {options.MaximumAgeDays}-day window.";
        }
        else if (score < options.RelevanceThreshold)
        {
            status = LocalObservationStatus.RejectedIrrelevant;
            reason = $"Relevance score {score} is below the configured threshold {options.RelevanceThreshold}.";
        }
        else
        {
            status = LocalObservationStatus.ValidForStatistics;
            reason = "Product, variant, condition, price type, currency and unit are comparable.";
        }

        return new ClassifiedLocalListing(
            id, listing, score, status, reason, matched, exclusions, quantity, "piece",
            1, "piece", unitPrice, null, false, null, null, status == LocalObservationStatus.ValidForStatistics);
    }

    private static bool VariantMatches(TargetProductProfile target, string query, string text)
    {
        var requested = Normalize(string.Join(" ", new[] { target.Variant, target.Size, target.Capacity, target.Specification }.Where(value => !string.IsNullOrWhiteSpace(value))));
        if (requested.Length > 0 && !Tokens(requested).All(token => Tokens(text).Contains(token))) return false;

        var targetCapacity = CapacityRegex.Match($"{query} {requested}");
        var listingCapacity = CapacityRegex.Match(text);
        if (targetCapacity.Success)
        {
            if (!listingCapacity.Success) return false;
            if (!string.Equals(targetCapacity.Value.Replace(" ", ""), listingCapacity.Value.Replace(" ", ""), StringComparison.OrdinalIgnoreCase)) return false;
        }

        var queryTokens = Tokens(query).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var listingTokens = Tokens(text).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return !VariantQualifiers.Any(qualifier => listingTokens.Contains(qualifier) && !queryTokens.Contains(qualifier));
    }

    private static void MarkDuplicates(List<ClassifiedLocalListing> items)
    {
        var seenIds = new Dictionary<string, Guid>(StringComparer.Ordinal);
        var seenFingerprints = new Dictionary<string, Guid>(StringComparer.Ordinal);
        for (var index = 0; index < items.Count; index++)
        {
            var item = items[index];
            if (item.Status != LocalObservationStatus.ValidForStatistics) continue;
            var listing = item.Listing;
            var idKey = $"{Normalize(listing.Source)}|id:{Normalize(listing.SourceListingId)}";
            var fingerprint = $"{Normalize(listing.Source)}|{Normalize(listing.Seller)}|{Normalize(listing.Title)}|{listing.Price.ToString(CultureInfo.InvariantCulture)}";
            Guid originalId;
            var duplicate = (!string.IsNullOrWhiteSpace(listing.SourceListingId) && seenIds.TryGetValue(idKey, out originalId)) ||
                seenFingerprints.TryGetValue(fingerprint, out originalId);
            if (duplicate)
            {
                items[index] = item with { Status = LocalObservationStatus.Duplicate, Reason = "Probable duplicate marketplace listing.", DuplicateOfId = originalId, IncludedInStatistics = false };
                continue;
            }
            if (!string.IsNullOrWhiteSpace(listing.SourceListingId)) seenIds[idKey] = item.Id;
            seenFingerprints[fingerprint] = item.Id;
        }
    }

    private static void MarkOutliers(List<ClassifiedLocalListing> items, LocalOutlierMethod method)
    {
        if (method == LocalOutlierMethod.None) return;
        var candidates = items.Where(item => item.Status == LocalObservationStatus.ValidForStatistics && item.NormalizedUnitPrice is > 0).ToArray();
        if (candidates.Length < 4) return;
        var values = candidates.Select(item => item.NormalizedUnitPrice!.Value).Order().ToArray();
        var median = Percentile(values, .5m);
        decimal lower;
        decimal upper;
        Func<decimal, decimal> score;
        if (method == LocalOutlierMethod.Mad)
        {
            var deviations = values.Select(value => Math.Abs(value - median)).Order().ToArray();
            var mad = Percentile(deviations, .5m);
            if (mad == 0) return;
            lower = median - (3.5m * mad / .6745m);
            upper = median + (3.5m * mad / .6745m);
            score = value => .6745m * Math.Abs(value - median) / mad;
        }
        else
        {
            var q1 = Percentile(values, .25m);
            var q3 = Percentile(values, .75m);
            var iqr = q3 - q1;
            lower = q1 - 1.5m * iqr;
            upper = q3 + 1.5m * iqr;
            score = value => iqr == 0 ? 0 : value < q1 ? (q1 - value) / iqr : (value - q3) / iqr;
        }
        for (var index = 0; index < items.Count; index++)
        {
            var item = items[index];
            if (item.Status != LocalObservationStatus.ValidForStatistics || item.NormalizedUnitPrice is not { } value || (value >= lower && value <= upper)) continue;
            items[index] = item with
            {
                Status = LocalObservationStatus.PotentialOutlier,
                IsPotentialOutlier = true,
                OutlierScore = score(value),
                OutlierReason = $"Price {value:0.##} ETB is outside the {method.ToString().ToUpperInvariant()} bounds {lower:0.##}–{upper:0.##} ETB.",
                IncludedInStatistics = false
            };
        }
    }

    private static void ApplyManualReviews(List<ClassifiedLocalListing> items, IReadOnlyDictionary<string, ManualReviewStatus>? reviews)
    {
        if (reviews is null || reviews.Count == 0) return;
        for (var index = 0; index < items.Count; index++)
        {
            var item = items[index];
            var key = $"{Normalize(item.Listing.Source)}|{Normalize(item.Listing.SourceListingId)}";
            if (!reviews.TryGetValue(key, out var review) || review == ManualReviewStatus.Unreviewed) continue;
            items[index] = review switch
            {
                ManualReviewStatus.Approved => item with { Status = LocalObservationStatus.ManuallyApproved, Reason = "Included by an authorized officer review.", IsPotentialOutlier = false },
                ManualReviewStatus.Rejected => item with { Status = LocalObservationStatus.ManuallyRejected, Reason = "Excluded by an authorized officer review." },
                ManualReviewStatus.ConfirmedOutlier => item with { Status = LocalObservationStatus.PotentialOutlier, IsPotentialOutlier = true, Reason = "Confirmed as an outlier by an authorized officer review." },
                _ => item
            };
        }
    }

    private static bool IsComparableBeforeOutlier(ClassifiedLocalListing item) =>
        item.Status is LocalObservationStatus.ValidForStatistics or LocalObservationStatus.PotentialOutlier or LocalObservationStatus.ManuallyApproved;

    private static LocalPriceStatistics? Statistics(IReadOnlyCollection<ClassifiedLocalListing> items)
    {
        var comparable = items.Where(item => item.NormalizedUnitPrice is > 0).OrderBy(item => item.NormalizedUnitPrice).ToArray();
        if (comparable.Length == 0) return null;
        var values = comparable.Select(item => item.NormalizedUnitPrice!.Value).ToArray();
        var mean = values.Average();
        var q1 = Percentile(values, .25m);
        var q3 = Percentile(values, .75m);
        var variance = values.Select(value => (value - mean) * (value - mean)).Average();
        var dates = comparable.Select(item => item.Listing.ListingDate ?? item.Listing.RetrievedAt).ToArray();
        return new LocalPriceStatistics(values.Length, values[0], values[^1], mean, Percentile(values, .5m),
            (decimal)Math.Sqrt((double)variance), q1, q3, q3 - q1, dates.Min(), dates.Max());
    }

    private static LocalCollectionSummary Summary(IReadOnlyCollection<ClassifiedLocalListing> items)
    {
        int Count(LocalObservationStatus status) => items.Count(item => item.Status == status);
        var used = items.Count(item => item.IncludedInStatistics);
        return new LocalCollectionSummary(items.Count, used, Count(LocalObservationStatus.RejectedIrrelevant),
            Count(LocalObservationStatus.WrongBrand), Count(LocalObservationStatus.WrongModel), Count(LocalObservationStatus.WrongVariant),
            Count(LocalObservationStatus.IncompatibleCondition), Count(LocalObservationStatus.IncompatibleUnit), Count(LocalObservationStatus.InvalidPrice),
            Count(LocalObservationStatus.Duplicate), items.Count(item => item.IsPotentialOutlier), items.Count - used);
    }

    private static LocalPriceConfidence Confidence(IReadOnlyCollection<ClassifiedLocalListing> items, LocalPriceStatistics? stats)
    {
        var valid = items.Where(IsComparableBeforeOutlier).ToArray();
        var countScore = Math.Min(30m, valid.Length * 3m);
        var sellers = valid.Select(item => item.Listing.Seller).Where(value => !string.IsNullOrWhiteSpace(value)).Distinct(StringComparer.OrdinalIgnoreCase).Count();
        var sellerScore = Math.Min(15m, sellers * 1.5m);
        var sourceCount = valid.Select(item => item.Listing.Source).Distinct(StringComparer.OrdinalIgnoreCase).Count();
        var sourceScore = Math.Min(10m, sourceCount * 5m);
        var matchScore = valid.Length == 0 ? 0 : valid.Average(item => (decimal)item.RelevanceScore) * .20m;
        var freshnessScore = valid.Length == 0 ? 0 : Math.Min(10m, valid.Count(item => (item.Listing.ListingDate ?? item.Listing.RetrievedAt) >= DateTimeOffset.UtcNow.AddDays(-30)) * 10m / valid.Length);
        var dispersionScore = stats is null || stats.Mean == 0 ? 0 : Math.Max(0, 10m - Math.Min(10m, stats.PopulationStandardDeviation / stats.Mean * 20m));
        var outlierRatio = valid.Length == 0 ? 1m : (decimal)valid.Count(item => item.IsPotentialOutlier) / valid.Length;
        var outlierScore = Math.Max(0, 5m - outlierRatio * 10m);
        var factors = new[]
        {
            new ConfidenceFactor("Comparable observations", countScore, 30, $"{valid.Length} comparable listings."),
            new ConfidenceFactor("Independent sellers", sellerScore, 15, $"{sellers} identified sellers; missing seller data does not receive credit."),
            new ConfidenceFactor("Source diversity", sourceScore, 10, $"{sourceCount} independent marketplaces."),
            new ConfidenceFactor("Product matching", matchScore, 20, valid.Length == 0 ? "No valid matches." : $"Average relevance {valid.Average(item => item.RelevanceScore):0.#}/100."),
            new ConfidenceFactor("Freshness", freshnessScore, 10, "Share of comparable observations retrieved or listed in the last 30 days."),
            new ConfidenceFactor("Price dispersion", dispersionScore, 10, "Lower relative dispersion receives more confidence."),
            new ConfidenceFactor("Outlier ratio", outlierScore, 5, $"{outlierRatio:P0} of comparable observations flagged.")
        };
        var total = Math.Round(factors.Sum(factor => factor.Score), 1);
        var level = valid.Length < 3 ? "INSUFFICIENT_DATA" : total >= 80 ? "HIGH" : total >= 60 ? "MEDIUM" : "LOW";
        return new LocalPriceConfidence(total, level, factors, "Decision-support indicator only; it is not a legally authoritative Customs value.");
    }

    private static IEnumerable<string> ApplicableExclusions(TargetProductProfile target, LocalClassificationOptions options)
    {
        var dictionaries = options.ExclusionKeywords ?? DefaultExclusions;
        var key = new[] { target.ProductType, target.Category }.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value) && dictionaries.ContainsKey(value))
            ?? ProductTypeSignals.FirstOrDefault(pair => pair.Value.Any(signal => ContainsPhrase(Normalize(target.Query), signal))).Key
            ?? "default";
        return dictionaries.TryGetValue(key, out var values) ? values : DefaultExclusions["default"];
    }

    private static bool MatchesRequired(string? required, string text) => string.IsNullOrWhiteSpace(required) || ContainsPhrase(text, required);
    private static bool MatchesBrand(string? brand, string? model, string text) =>
        string.IsNullOrWhiteSpace(brand) || ContainsPhrase(text, brand) || (!string.IsNullOrWhiteSpace(model) && ContainsPhrase(text, model));
    private static bool ContainsPhrase(string text, string phrase) => $" {text} ".Contains($" {Normalize(phrase)} ", StringComparison.Ordinal);
    private static string Normalize(string? value) => string.Join(" ", Tokens(value));
    private static string[] Tokens(string? value)
    {
        var separated = Regex.Replace((value ?? "").ToLowerInvariant(), @"(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])", " ");
        return TokenRegex.Matches(separated).Select(match => match.Value switch
        {
            "one" => "1", "two" => "2", "three" => "3", "four" => "4", "five" => "5",
            "six" => "6", "seven" => "7", "eight" => "8", "nine" => "9", "ten" => "10",
            "eleven" => "11", "twelve" => "12", "thirteen" => "13", "fourteen" => "14", "fifteen" => "15",
            "sixteen" => "16", "seventeen" => "17", "eighteen" => "18", "nineteen" => "19", "twenty" => "20",
            _ => match.Value
        }).ToArray();
    }
    private static (decimal Quantity, decimal UnitPrice) NormalizeQuantity(MarketplaceListing listing)
    {
        var match = QuantityRegex.Match($"{listing.Title} {listing.Description}");
        if (!match.Success || !decimal.TryParse(match.Groups["quantity"].Value, out var quantity) || quantity <= 1) return (1, listing.Price);
        return (quantity, listing.Price / quantity);
    }
    private static decimal Percentile(IReadOnlyList<decimal> sorted, decimal percentile)
    {
        if (sorted.Count == 1) return sorted[0];
        var index = (sorted.Count - 1) * percentile;
        var lower = (int)Math.Floor(index);
        var upper = (int)Math.Ceiling(index);
        return lower == upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
    }
}
