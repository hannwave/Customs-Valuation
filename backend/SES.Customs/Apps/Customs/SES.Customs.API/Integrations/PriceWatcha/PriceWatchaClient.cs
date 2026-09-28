using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
namespace SES.Customs.API.Integrations.PriceWatcha;
public sealed record PriceWatchaHistoryDto(string ProductId, string? Name, string? Shop, decimal? CurrentPrice, string? Currency, JsonElement[] History);
public sealed record PriceWatchaSearchDto(string Query, PriceWatchaHistoryDto[] Items);
public sealed class PriceWatchaClient(HttpClient httpClient, IOptions<PriceWatchaOptions> options)
{
    private readonly PriceWatchaOptions _options = options.Value;
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.ApiKey);
    public async Task<PriceWatchaSearchDto> SearchWithHistoryAsync(string query, CancellationToken ct)
    {
        using var search = await httpClient.GetAsync($"search?q={Uri.EscapeDataString(query.Trim())}&limit=10", ct); search.EnsureSuccessStatusCode();
        var result = await search.Content.ReadFromJsonAsync<SearchResponse>(cancellationToken: ct) ?? new();
        var items = await Task.WhenAll((result.Items ?? []).Where(x => !string.IsNullOrWhiteSpace(x.ProductId)).Select(x => GetHistoryAsync(x.ProductId!, ct)));
        return new(query.Trim(), items);
    }
    private async Task<PriceWatchaHistoryDto> GetHistoryAsync(string id, CancellationToken ct)
    { using var response = await httpClient.GetAsync($"products/{Uri.EscapeDataString(id)}/price-history", ct); response.EnsureSuccessStatusCode(); var h = await response.Content.ReadFromJsonAsync<HistoryResponse>(cancellationToken: ct) ?? new(); return new(id, h.Name, h.Shop, h.CurrentPrice, h.Currency, h.History ?? []); }
    private sealed class SearchResponse { [JsonPropertyName("results")] public SearchItem[]? Items { get; init; } }
    private sealed class SearchItem { [JsonPropertyName("product_id")] public string? ProductId { get; init; } }
    private sealed class HistoryResponse { [JsonPropertyName("name")] public string? Name { get; init; } [JsonPropertyName("shop")] public string? Shop { get; init; } [JsonPropertyName("current_price")] public decimal? CurrentPrice { get; init; } [JsonPropertyName("currency")] public string? Currency { get; init; } [JsonPropertyName("history")] public JsonElement[]? History { get; init; } }
}
