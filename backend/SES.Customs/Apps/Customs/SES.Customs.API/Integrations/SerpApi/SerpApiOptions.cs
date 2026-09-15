using SES.Customs.API.Integrations;

namespace SES.Customs.API.Integrations.SerpApi;

public sealed class SerpApiOptions
{
    public const string SectionName = "SerpApi";

    public string BaseUrl { get; set; } = "https://serpapi.com";
    public string ApiKey { get; set; } = "";
    public string DefaultMarket { get; set; } = "us";
    public string DefaultLanguage { get; set; } = "en";
}

public sealed record InternationalMarketPriceDto(
    int? Position,
    string Title,
    string Source,
    string DisplayPrice,
    decimal? ExtractedPrice,
    string? ProductUrl,
    string? ThumbnailUrl,
    decimal? Rating,
    int? Reviews,
    string? Delivery,
    string? Condition);

public sealed record InternationalPriceSearchDto(
    string Query,
    string Market,
    DateTimeOffset RetrievedAt,
    IReadOnlyList<InternationalMarketPriceDto> Items,
    PriceStatisticsDto? Statistics);

public sealed record SyncInternationalPricesRequest(
    string HsCode,
    string? Query,
    string? Market);

public sealed record InternationalPriceSyncDto(
    Guid HsCodeId,
    string HsCode,
    string HsDescription,
    string Query,
    string Market,
    DateTimeOffset RetrievedAt,
    int SavedCount,
    int UpdatedCount,
    int SkippedCount,
    IReadOnlyList<InternationalMarketPriceDto> Items,
    PriceStatisticsDto? Statistics);
