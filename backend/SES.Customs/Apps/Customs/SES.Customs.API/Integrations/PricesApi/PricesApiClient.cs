using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;
using SES.Customs.Core.Models;

namespace SES.Customs.API.Integrations.PricesApi;

public sealed record ProductCandidate(string Key, string Id, string Market, string Title, string Currency, decimal? Price, DateOnly? ObservedDate);
public sealed record NativePrice(DateOnly Date, decimal Price, string Currency, string Market);
public sealed class ProviderException(string message, int status = 502) : Exception(message) { public int Status { get; } = status; }

public sealed class PricesApiClient(HttpClient http, IMemoryCache cache)
{
    public async Task<JsonElement> ReadAsync(string path, CancellationToken ct)
    {
        if (http.DefaultRequestHeaders.Authorization is null) throw new ProviderException("Configure PRICES_API_KEY in backend environment or user-secrets.", 503);
        try
        {
            using var response = await http.GetAsync(path, ct);
            if (!response.IsSuccessStatusCode)
                throw new ProviderException(response.StatusCode switch {
                    System.Net.HttpStatusCode.Unauthorized => "PricesAPI rejected the configured key.",
                    System.Net.HttpStatusCode.Forbidden => "PricesAPI access or credits are unavailable for this account.",
                    System.Net.HttpStatusCode.TooManyRequests => "PricesAPI rate limit reached. Wait a minute and try again.",
                    System.Net.HttpStatusCode.NotFound => "PricesAPI has no retained history for this product in this market.",
                    _ => "PricesAPI is temporarily unavailable. Try again shortly."
                }, response.StatusCode == System.Net.HttpStatusCode.TooManyRequests ? 429 : 502);
            return await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new ProviderException("PricesAPI timed out while collecting products. Please retry.", 504); }
        catch (HttpRequestException) { throw new ProviderException("PricesAPI could not be reached."); }
        catch (JsonException) { throw new ProviderException("PricesAPI returned an unreadable response."); }
    }

    public async Task<ProductCandidate[]> SearchAsync(ExactProduct target, string market, CancellationToken ct)
    {
        var key = $"prices:search:{market}:{target.Query.ToLowerInvariant()}";
        if (cache.TryGetValue<ProductCandidate[]>(key, out var cached)) return cached!;
        var json = await ReadAsync($"products/search?q={Uri.EscapeDataString(target.Query)}&country={market}&limit=5&offers_limit=1", ct);
        if (!json.TryGetProperty("data", out var data) || !data.TryGetProperty("products", out var products)) throw new ProviderException("PricesAPI search response has no product collection.");
        DateOnly? observed = json.TryGetProperty("meta", out var meta) && meta.TryGetProperty("scraped_at", out var at) && DateTimeOffset.TryParse(at.GetString(), out var stamp) ? DateOnly.FromDateTime(stamp.UtcDateTime) : null;
        var result = products.EnumerateArray().Where(p => HistoricalComparison.Matches(target, p.GetProperty("title").GetString()!, Text(p, "condition")))
            .Where(p => p.TryGetProperty("pid", out var id) && id.ValueKind == JsonValueKind.Number)
            .Select(p => new ProductCandidate($"{market}:{p.GetProperty("pid")}", p.GetProperty("pid").ToString(), market, Text(p, "title")!, Text(p, "currency") ?? "", Number(p, "price"), observed)).DistinctBy(p => p.Key).ToArray();
        cache.Set(key, result, TimeSpan.FromMinutes(20));
        return result;
    }

    public async Task<NativePrice[]> HistoryAsync(ProductCandidate product, CancellationToken ct)
    {
        var key = $"prices:history:{product.Key}";
        if (cache.TryGetValue<NativePrice[]>(key, out var cached)) return cached!;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var identity = $"id={Uri.EscapeDataString(product.Id)}&id_type=pricesapi&market={product.Market}";
        // The live monthly endpoint can return HISTORY_UNAVAILABLE for valid products.
        // Use daily reads throughout, paged within the documented 1,500-day ceiling.
        var recentFrom = today.AddDays(-1499);
        var bounds = await ReadAsync($"products/history?{identity}&from={recentFrom:yyyy-MM-dd}&to={today:yyyy-MM-dd}&group_by=day", ct);
        if (!bounds.TryGetProperty("range", out var range)) throw new ProviderException("PricesAPI history response has no coverage range.");
        var points = new List<NativePrice>();
        void Append(JsonElement json)
        {
            var currency = json.GetProperty("product").GetProperty("currency").GetString()!;
            foreach (var row in json.GetProperty("prices").EnumerateArray())
                if (DateOnly.TryParse(Text(row, "date"), out var day) && Number(row, "median_merchant_price") is > 0 and var price)
                    points.Add(new(day, price, currency, product.Market));
        }
        Append(bounds);
        if (DateOnly.TryParse(Text(range, "available_from"), out var first))
        {
            for (var from = first; from < recentFrom; from = from.AddDays(1500))
            {
                var to = from.AddDays(1499) < recentFrom ? from.AddDays(1499) : recentFrom.AddDays(-1);
                var json = await ReadAsync($"products/history?{identity}&from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}&group_by=day", ct);
                Append(json);
            }
        }
        var result = points.DistinctBy(x => x.Date).OrderBy(x => x.Date).ToArray();
        cache.Set(key, result, TimeSpan.FromMinutes(30));
        return result;
    }
    private static string? Text(JsonElement e, string key) => e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    private static decimal? Number(JsonElement e, string key) => e.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDecimal(out var n) ? n : null;
}
