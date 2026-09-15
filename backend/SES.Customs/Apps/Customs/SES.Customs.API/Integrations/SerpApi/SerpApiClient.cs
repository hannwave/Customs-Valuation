using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using SES.Customs.API.Integrations;

namespace SES.Customs.API.Integrations.SerpApi;

public sealed class SerpApiClient(HttpClient httpClient, IOptions<SerpApiOptions> options)
{
    private readonly SerpApiOptions _options = options.Value;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.ApiKey);

    public async Task<InternationalPriceSearchDto> SearchGoogleShoppingAsync(
        string query,
        string? market,
        CancellationToken ct)
    {
        var selectedMarket = string.IsNullOrWhiteSpace(market)
            ? _options.DefaultMarket
            : market.Trim().ToLowerInvariant();

        var requestUrl =
            $"search.json?engine=google_shopping" +
            $"&q={Uri.EscapeDataString(query.Trim())}" +
            $"&gl={Uri.EscapeDataString(selectedMarket)}" +
            $"&hl={Uri.EscapeDataString(_options.DefaultLanguage)}" +
            $"&api_key={Uri.EscapeDataString(_options.ApiKey)}";

        using var response = await httpClient.GetAsync(requestUrl, ct);
        var payload = await response.Content.ReadFromJsonAsync<SerpApiResponse>(cancellationToken: ct);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                payload?.Error ?? $"SerpAPI returned HTTP {(int)response.StatusCode}.",
                null,
                response.StatusCode);
        }

        if (!string.IsNullOrWhiteSpace(payload?.Error))
            throw new HttpRequestException(payload.Error);

        var items = (payload?.ShoppingResults ?? [])
            .Where(item => !string.IsNullOrWhiteSpace(item.Title))
            .Select(item => new InternationalMarketPriceDto(
                item.Position,
                item.Title!,
                item.Source ?? "Unknown seller",
                item.Price ?? item.ExtractedPrice?.ToString("0.##") ?? "Price unavailable",
                item.ExtractedPrice,
                item.ProductLink,
                item.Thumbnail,
                item.Rating,
                item.Reviews,
                item.Delivery,
                item.SecondHandCondition))
            .ToArray();

        return new InternationalPriceSearchDto(
            query.Trim(),
            selectedMarket,
            DateTimeOffset.UtcNow,
            items,
            PriceStatisticsCalculator.Calculate(items
                .Where(item => item.ExtractedPrice is > 0)
                .Select(item => new PriceObservation(item.Title, item.Source, item.ExtractedPrice!.Value))));
    }

    private sealed class SerpApiResponse
    {
        [JsonPropertyName("error")]
        public string? Error { get; init; }

        [JsonPropertyName("shopping_results")]
        public SerpApiShoppingResult[]? ShoppingResults { get; init; }
    }

    private sealed class SerpApiShoppingResult
    {
        [JsonPropertyName("position")]
        public int? Position { get; init; }

        [JsonPropertyName("title")]
        public string? Title { get; init; }

        [JsonPropertyName("source")]
        public string? Source { get; init; }

        [JsonPropertyName("price")]
        public string? Price { get; init; }

        [JsonPropertyName("extracted_price")]
        public decimal? ExtractedPrice { get; init; }

        [JsonPropertyName("product_link")]
        public string? ProductLink { get; init; }

        [JsonPropertyName("thumbnail")]
        public string? Thumbnail { get; init; }

        [JsonPropertyName("rating")]
        public decimal? Rating { get; init; }

        [JsonPropertyName("reviews")]
        public int? Reviews { get; init; }

        [JsonPropertyName("delivery")]
        public string? Delivery { get; init; }

        [JsonPropertyName("second_hand_condition")]
        public string? SecondHandCondition { get; init; }
    }
}
