using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using SES.Customs.API.Integrations;

namespace SES.Customs.API.Integrations.LocalMarket;

public sealed record LocalMarketOfferDto(
    string Source,
    string Title,
    string? Description,
    decimal Price,
    string Currency,
    string ProductUrl,
    string? ThumbnailUrl,
    string? Location,
    string? Condition,
    string SourceListingId,
    string? SellerName,
    DateTimeOffset? ListingDate,
    string? RawCategory);

public sealed record LocalMarketSourceStatusDto(
    string Id,
    string Name,
    string Status,
    int ResultCount,
    string? Message,
    string WebsiteUrl);

public sealed record LocalMarketSearchDto(
    string Query,
    DateTimeOffset RetrievedAt,
    LocalMarketOfferDto[] Items,
    LocalMarketSourceStatusDto[] Sources,
    PriceStatisticsDto? Statistics);

public sealed class LocalMarketSearchService(
    IHttpClientFactory clientFactory,
    IOptions<LocalMarketOptions> options,
    ILogger<LocalMarketSearchService> logger)
{
    private static readonly Regex JijiCard = new(
        "<a(?<attrs>[^>]*class=\"[^\"]*qa-advert-list-item[^\"]*\"[^>]*)>(?<body>.*?)</a>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);
    private static readonly Regex HtmlTag = new("<[^>]+>", RegexOptions.Singleline | RegexOptions.Compiled);
    private readonly LocalMarketOptions _options = options.Value;

    public async Task<LocalMarketSearchDto> SearchAsync(
        string query,
        IReadOnlyCollection<string>? requestedSources,
        CancellationToken ct)
    {
        var selected = NormalizeSources(requestedSources);
        var tasks = new List<Task<ProviderResult>>();

        if (selected.Contains("jiji")) tasks.Add(SearchJijiSafelyAsync(query, ct));
        if (selected.Contains("ethioshop")) tasks.Add(SearchEthioShopSafelyAsync(query, ct));
        if (selected.Contains("telegebeya")) tasks.Add(Task.FromResult(TeleGebeyaUnavailable()));

        var results = await Task.WhenAll(tasks);
        var items = results
            .SelectMany(result => result.Items)
            .OrderBy(item => item.Price)
            .ThenBy(item => item.Source)
            .ToArray();

        return new LocalMarketSearchDto(
            query.Trim(),
            DateTimeOffset.UtcNow,
            items,
            results.Select(result => result.Status).ToArray(),
            PriceStatisticsCalculator.Calculate(items.Select(item =>
                new PriceObservation(item.Title, item.Source, item.Price))));
    }

    private async Task<ProviderResult> SearchJijiSafelyAsync(string query, CancellationToken ct)
    {
        try
        {
            var client = clientFactory.CreateClient("JijiEthiopia");
            using var response = await client.GetAsync($"search?query={Uri.EscapeDataString(query.Trim())}", ct);
            response.EnsureSuccessStatusCode();
            var html = await response.Content.ReadAsStringAsync(ct);
            var offers = ParseJiji(html).Take(40).ToArray();
            return Available("jiji", "Jiji Ethiopia", offers, _options.JijiBaseUrl);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(ex, "Jiji Ethiopia search failed.");
            return Failed("jiji", "Jiji Ethiopia", "The Jiji public catalogue did not respond. Try again shortly.", _options.JijiBaseUrl);
        }
    }

    private async Task<ProviderResult> SearchEthioShopSafelyAsync(string query, CancellationToken ct)
    {
        try
        {
            var client = clientFactory.CreateClient("EthioShop");
            var products = await client.GetFromJsonAsync<EthioShopProduct[]>(
                $"products?search={Uri.EscapeDataString(query.Trim())}&per_page=40",
                ct) ?? [];

            var offers = products
                .Select(ToEthioShopOffer)
                .Where(item => item is not null)
                .Cast<LocalMarketOfferDto>()
                .ToArray();
            return Available("ethioshop", "EthioShop", offers, "https://ethio.shop/");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or NotSupportedException or JsonException)
        {
            logger.LogWarning(ex, "EthioShop search failed.");
            return Failed("ethioshop", "EthioShop", "The EthioShop Store API did not respond. Try again shortly.", "https://ethio.shop/");
        }
    }

    private IEnumerable<LocalMarketOfferDto> ParseJiji(string html)
    {
        foreach (Match card in JijiCard.Matches(html))
        {
            var attrs = card.Groups["attrs"].Value;
            var body = card.Groups["body"].Value;
            var href = Attribute(attrs, "href");
            var title = ClassText(body, "qa-advert-title");
            var priceText = ClassText(body, "qa-advert-price");
            if (string.IsNullOrWhiteSpace(href) || string.IsNullOrWhiteSpace(title) || !TryParseEtb(priceText, out var price))
                continue;

            var absoluteUrl = Uri.TryCreate(new Uri(_options.JijiBaseUrl), href, out var productUri)
                ? productUri.ToString()
                : _options.JijiBaseUrl;
            var image = Attribute(body, "data-src") ?? Attribute(body, "src");

            yield return new LocalMarketOfferDto(
                "Jiji Ethiopia",
                title,
                ClassText(body, "b-list-advert-base__description-text"),
                price,
                "ETB",
                absoluteUrl,
                image,
                ClassText(body, "b-list-advert__region__text"),
                ClassText(body, "b-list-advert-base__item-attr"),
                ListingId(absoluteUrl),
                ClassText(body, "b-list-advert__seller-name"),
                null,
                null);
        }
    }

    private static LocalMarketOfferDto? ToEthioShopOffer(EthioShopProduct product)
    {
        if (string.IsNullOrWhiteSpace(product.Name) || string.IsNullOrWhiteSpace(product.Permalink) ||
            product.Prices is null || !decimal.TryParse(product.Prices.Price, NumberStyles.Number, CultureInfo.InvariantCulture, out var rawPrice))
            return null;

        var divisor = (decimal)Math.Pow(10, Math.Clamp(product.Prices.CurrencyMinorUnit, 0, 6));
        var price = divisor == 0 ? rawPrice : rawPrice / divisor;
        if (price <= 0) return null;

        return new LocalMarketOfferDto(
            "EthioShop",
            product.Name,
            CleanHtml(product.ShortDescription),
            price,
            string.IsNullOrWhiteSpace(product.Prices.CurrencyCode) ? "ETB" : product.Prices.CurrencyCode,
            product.Permalink,
            product.Images?.FirstOrDefault()?.Src,
            "Ethiopia",
            "New",
            product.Id.ToString(CultureInfo.InvariantCulture),
            "EthioShop",
            null,
            null);
    }

    private ProviderResult TeleGebeyaUnavailable() => new(
        [],
        new LocalMarketSourceStatusDto(
            "telegebeya",
            "TeleGebeya / Zemen Gebeya",
            "PartnerAccessRequired",
            0,
            "The marketplace now runs inside the authenticated telebirr SuperApp and has no public product API. Add Ethio telecom partner credentials when they are issued.",
            _options.TeleGebeyaInfoUrl));

    private static HashSet<string> NormalizeSources(IReadOnlyCollection<string>? sources)
    {
        var supported = new HashSet<string>(["jiji", "ethioshop", "telegebeya"], StringComparer.OrdinalIgnoreCase);
        if (sources is null || sources.Count == 0) return supported;
        return sources.Where(supported.Contains).ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static ProviderResult Available(string id, string name, LocalMarketOfferDto[] offers, string url) => new(
        offers,
        new LocalMarketSourceStatusDto(id, name, "Available", offers.Length, offers.Length == 0 ? "No matching products were returned." : null, url));

    private static ProviderResult Failed(string id, string name, string message, string url) => new(
        [], new LocalMarketSourceStatusDto(id, name, "Unavailable", 0, message, url));

    private static bool TryParseEtb(string? value, out decimal price)
    {
        var numeric = Regex.Replace(value ?? "", "[^0-9.]", "");
        return decimal.TryParse(numeric, NumberStyles.Number, CultureInfo.InvariantCulture, out price) && price > 0;
    }

    private static string? Attribute(string html, string attribute)
    {
        var match = Regex.Match(html, $"{Regex.Escape(attribute)}\\s*=\\s*[\"'](?<value>.*?)[\"']", RegexOptions.IgnoreCase | RegexOptions.Singleline);
        return match.Success ? WebUtility.HtmlDecode(match.Groups["value"].Value) : null;
    }

    private static string? ClassText(string html, string className)
    {
        var match = Regex.Match(
            html,
            $"<[^>]*class=\"[^\"]*{Regex.Escape(className)}[^\"]*\"[^>]*>(?<value>.*?)</[^>]+>",
            RegexOptions.IgnoreCase | RegexOptions.Singleline);
        return match.Success ? CleanHtml(match.Groups["value"].Value) : null;
    }

    private static string? CleanHtml(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var decoded = WebUtility.HtmlDecode(HtmlTag.Replace(value, " "));
        return Regex.Replace(decoded, "\\s+", " ").Trim();
    }

    private static string ListingId(string url)
    {
        var match = Regex.Match(url, @"-(?<id>\d+)\.html", RegexOptions.IgnoreCase);
        if (match.Success) return match.Groups["id"].Value;
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(url));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private sealed record ProviderResult(LocalMarketOfferDto[] Items, LocalMarketSourceStatusDto Status);

    private sealed class EthioShopProduct
    {
        [JsonPropertyName("id")] public long Id { get; init; }
        [JsonPropertyName("name")] public string? Name { get; init; }
        [JsonPropertyName("permalink")] public string? Permalink { get; init; }
        [JsonPropertyName("short_description")] public string? ShortDescription { get; init; }
        [JsonPropertyName("prices")] public EthioShopPrices? Prices { get; init; }
        [JsonPropertyName("images")] public EthioShopImage[]? Images { get; init; }
    }

    private sealed class EthioShopPrices
    {
        [JsonPropertyName("price")] public string? Price { get; init; }
        [JsonPropertyName("currency_code")] public string CurrencyCode { get; init; } = "ETB";
        [JsonPropertyName("currency_minor_unit")] public int CurrencyMinorUnit { get; init; } = 2;
    }

    private sealed class EthioShopImage
    {
        [JsonPropertyName("src")] public string? Src { get; init; }
    }
}
