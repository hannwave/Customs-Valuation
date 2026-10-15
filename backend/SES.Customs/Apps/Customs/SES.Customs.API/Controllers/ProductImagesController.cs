using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using SES.Customs.API.Integrations.SerpApi;

namespace SES.Customs.API.Controllers;

/// <summary>
/// Product photos for goods that have none of their own (no photo in the market offers): a Google Images search
/// through SerpApi, cached for a day so the same product does not spend another search.
/// </summary>
[ApiController, Route("api/product-images"), Authorize(Policy = "CustomsOfficer")]
public sealed class ProductImagesController(IHttpClientFactory httpFactory, IOptions<SerpApiOptions> options, IMemoryCache cache, ILogger<ProductImagesController> logger) : ControllerBase
{
    public sealed record ProductImage(string Title, string ThumbnailUrl, string? ImageUrl, string? Source, string? PageUrl);

    [HttpGet]
    public async Task<IActionResult> Search([FromQuery] string? q, CancellationToken ct)
    {
        var query = (q ?? "").Trim();
        if (query.Length is < 2 or > 150) return BadRequest(new { message = "Search with 2 to 150 characters." });
        var key = $"product-images:{query.ToLowerInvariant()}";
        if (cache.TryGetValue(key, out ProductImage[]? cached) && cached is not null) return Ok(new { query, items = cached });
        var settings = options.Value;
        if (string.IsNullOrWhiteSpace(settings.ApiKey)) return Ok(new { query, items = Array.Empty<ProductImage>(), message = "Product image search is not configured." });

        var url = $"{settings.BaseUrl.TrimEnd('/')}/search.json?engine=google_images&safe=active&hl={Uri.EscapeDataString(settings.DefaultLanguage)}" +
                  $"&gl={Uri.EscapeDataString(settings.DefaultMarket)}&q={Uri.EscapeDataString(query)}&api_key={Uri.EscapeDataString(settings.ApiKey)}";
        try
        {
            var client = httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);
            using var response = await client.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Product image search returned {Status}", (int)response.StatusCode);
                return Ok(new { query, items = Array.Empty<ProductImage>(), message = "No product images could be found right now." });
            }
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
            var items = new List<ProductImage>();
            if (document.RootElement.TryGetProperty("images_results", out var results) && results.ValueKind == JsonValueKind.Array)
                foreach (var item in results.EnumerateArray())
                {
                    var thumbnail = Text(item, "thumbnail");
                    if (thumbnail is null || !thumbnail.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) continue;
                    items.Add(new ProductImage(Text(item, "title") ?? query, thumbnail, Text(item, "original"), Text(item, "source"), Text(item, "link")));
                    if (items.Count == 8) break;
                }
            var found = items.ToArray();
            cache.Set(key, found, TimeSpan.FromHours(24));
            return Ok(new { query, items = found });
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(ex, "Product image search failed");
            return Ok(new { query, items = Array.Empty<ProductImage>(), message = "No product images could be found right now." });
        }
    }

    private static string? Text(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString()) ? value.GetString() : null;
}
