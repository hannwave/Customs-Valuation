using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;
using SES.Customs.Core.Features.ManufacturerPrices.Service;

namespace SES.Customs.API.Integrations.Apify;

public sealed record ManufacturerPriceOfferDto(
    string Title,
    string ManufacturerDomain,
    string ProductUrl,
    decimal? Price,
    string? Currency,
    string EvidenceSource);

public sealed record ManufacturerPriceSearchDto(
    string Query,
    string Market,
    string? ManufacturerDomain,
    DateTimeOffset RetrievedAt,
    string Status,
    string Message,
    IReadOnlyList<ManufacturerPriceOfferDto> Items);

public sealed class ApifyManufacturerPriceClient(HttpClient httpClient, IConfiguration configuration, IMemoryCache cache)
{
    private string? Token => configuration["APIFY_API_TOKEN"] ?? configuration["Apify:ApiToken"];
    public bool IsConfigured => !string.IsNullOrWhiteSpace(Token);

    public async Task<ManufacturerPriceSearchDto> SearchAsync(string query, string market, string? site, CancellationToken ct)
    {
        if (!ManufacturerPriceMatcher.TryResolveSite(query, site, out var domain, out var directUrl) || domain is null)
            return new(query, market, null, DateTimeOffset.UtcNow, "site_required",
                "Enter the manufacturer's official website or a direct product page to search this item.", []);

        var cacheKey = $"manufacturer:{query.Trim().ToLowerInvariant()}:{market}:{domain}:{directUrl}";
        if (cache.TryGetValue(cacheKey, out ManufacturerPriceSearchDto? cached) && cached is not null) return cached;

        var candidates = directUrl is not null
            ? [new Candidate(query, directUrl.ToString(), null, null)]
            : await DiscoverPagesAsync(query, market, domain, ct);
        var discoveryQuery = domain.Equals("apple.com", StringComparison.OrdinalIgnoreCase)
            ? StripAppleVariantDetails(query) : query;
        var offers = new List<ManufacturerPriceOfferDto>();

        foreach (var candidate in candidates
                     .Where(item => ManufacturerPriceMatcher.IsOfficialUrl(item.Url, domain) &&
                                    ManufacturerPriceMatcher.IsLikelyProductPage(discoveryQuery, item.Title, item.Url))
                     .DistinctBy(item => item.Url)
                     .OrderByDescending(item => item.Url.Contains("/shop/", StringComparison.OrdinalIgnoreCase) ||
                                                item.Url.Contains("/buy/", StringComparison.OrdinalIgnoreCase) ||
                                                item.Url.Contains("/product/", StringComparison.OrdinalIgnoreCase))
                     .Take(1))
        {
            if (domain.Equals("apple.com", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    var appleOffer = await FetchAppleShopVariantAsync(query, candidate.Url, ct);
                    if (appleOffer is not null)
                    {
                        offers.Add(appleOffer);
                        continue;
                    }
                }
                catch (HttpRequestException) { /* Fall back to the generic official-page extractor. */ }
                catch (TaskCanceledException) when (!ct.IsCancellationRequested) { /* Fall back to the generic extractor. */ }
            }

            var title = candidate.Title;
            var price = candidate.Price;
            var currency = candidate.Currency;
            var source = price is > 0 ? "Indexed official-site price; verify on the product page" : "Official product page; price unavailable";

            try
            {
                var page = await CrawlPageAsync(candidate.Url, ct);
                if (page is not null &&
                    ManufacturerPriceMatcher.IsOfficialUrl(page.Value.Url, domain) &&
                    ManufacturerPriceMatcher.IsLikelyProductPage(discoveryQuery, page.Value.Title, page.Value.Url))
                {
                    title = page.Value.Title;
                    var listed = ManufacturerPagePriceParser.Extract(page.Value.Html, query);
                    if (listed.Price is > 0 && listed.Currency is not null)
                    {
                        price = listed.Price;
                        currency = listed.Currency;
                        source = "Price metadata on manufacturer product page";
                    }
                }
            }
            catch (HttpRequestException)
            {
                // A discovered official page can still be shown when its crawl fails.
            }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested)
            {
                // Keep an indexed price clearly marked as such.
            }

            offers.Add(new(title, domain, candidate.Url, price, currency, source));
        }

        if (offers.Count > 0 && offers.All(item => item.Price is null or <= 0))
        {
            try
            {
                var indexed = await FindManufacturerMerchantPriceAsync(query, market, domain, ct);
                if (indexed.Price is > 0 && indexed.Currency is not null)
                {
                    var first = offers[0];
                    offers[0] = first with
                    {
                        Price = indexed.Price,
                        Currency = indexed.Currency,
                        EvidenceSource = "Google Shopping listing names the manufacturer as seller; verify price and variant on the linked official page"
                    };
                }
            }
            catch (HttpRequestException) { /* Keep the official link when indexed pricing is unavailable. */ }
            catch (TaskCanceledException) when (!ct.IsCancellationRequested) { /* Preserve the official link. */ }
        }

        var status = offers.Any(item => item.Price is > 0 && item.Currency is not null) ? "found" : "no_price";
        var result = new ManufacturerPriceSearchDto(query, market, domain, DateTimeOffset.UtcNow, status,
            status == "found"
                ? "Review each offer's exact model, variant, currency and source before using it."
                : offers.Count > 0
                    ? "Official product pages were found, but no reliable current price was available."
                    : "No exact product page was found on this manufacturer website.", offers);
        cache.Set(cacheKey, result, TimeSpan.FromMinutes(status == "found" ? 15 : 5));
        return result;
    }

    private async Task<ManufacturerPriceOfferDto?> FetchAppleShopVariantAsync(string query, string url, CancellationToken ct)
    {
        var input = new { startUrls = new[] { new { url } }, proxyConfiguration = new { useApifyProxy = true } };
        var output = await RunActorAsync("moving_beacon-owner1~apple-shop-scraper", input, 90, "0.50", ct);
        foreach (var product in output.EnumerateArray())
        {
            var productName = String(product, "product_name") ?? String(product, "page_title") ?? "Apple product";
            if (!ManufacturerPriceMatcher.MatchesProduct(StripAppleVariantDetails(query), productName)) continue;
            if (!TryProperty(product, "variants", out var variants) || variants.ValueKind != JsonValueKind.Array) continue;

            var matchingVariants = variants.EnumerateArray()
                .Where(variant =>
                {
                    var model = String(variant, "model") ?? productName;
                    var title = string.Join(' ', new[] { model, String(variant, "storage"), String(variant, "color"), String(variant, "carrier") }
                        .Where(value => !string.IsNullOrWhiteSpace(value)));
                    return ManufacturerPriceMatcher.MatchesProduct(query, title) &&
                           ManufacturerPriceMatcher.IsOfficialUrl(String(variant, "url"), "apple.com");
                })
                .Select(variant => new
                {
                    Element = variant,
                    Storage = String(variant, "storage"),
                    Price = Number(variant, "price")
                })
                .Where(variant => variant.Price is > 0)
                .OrderBy(variant => StorageInMegabytes(variant.Storage))
                .ToList();

            var selected = matchingVariants.FirstOrDefault();
            if (selected is null) continue;
            var modelName = String(selected.Element, "model") ?? productName;
            var storage = selected.Storage;
            var color = String(selected.Element, "color");
            var variantTitle = string.Join(" ", new[] { modelName, storage, color }.Where(value => !string.IsNullOrWhiteSpace(value)));
            return new(variantTitle, "apple.com", String(selected.Element, "url")!, selected.Price,
                String(selected.Element, "currency")?.ToUpperInvariant(),
                "Current Apple Store price for the matching storage and color variant");
        }
        return null;
    }

    private static decimal? Number(JsonElement value, string name) =>
        TryProperty(value, name, out var property) && decimal.TryParse(property.ToString(), CultureInfo.InvariantCulture, out var number)
            ? number : null;

    private static int StorageInMegabytes(string? storage)
    {
        var match = Regex.Match(storage ?? "", @"(?<size>\d+)\s*(?<unit>GB|TB)", RegexOptions.IgnoreCase);
        if (!match.Success || !int.TryParse(match.Groups["size"].Value, out var size)) return int.MaxValue;
        return size * (match.Groups["unit"].Value.Equals("TB", StringComparison.OrdinalIgnoreCase) ? 1024 : 1);
    }

    private static string StripAppleVariantDetails(string query) =>
        Regex.Replace(query, @"\b\d+\s*(?:gb|tb)\b|\b(?:black|white|blue|green|pink|purple|silver|gold|orange|yellow|red)\b", "", RegexOptions.IgnoreCase).Trim();

    private async Task<List<Candidate>> DiscoverPagesAsync(string query, string market, string domain, CancellationToken ct)
    {
        var normalized = Regex.Replace(query.Trim().Replace('"', ' '), @"\bi[\s-]*phone\b", "iphone", RegexOptions.IgnoreCase);
        var capacity = Regex.Match(normalized, @"\b\d+\s*(?:gb|tb)\b", RegexOptions.IgnoreCase).Value.Replace(" ", "");
        var model = Regex.Replace(normalized, @"\b\d+\s*(?:gb|tb)\b", "", RegexOptions.IgnoreCase).Trim();
        var searchQuery = $"\"{model}\" {(capacity.Length > 0 ? capacity + " " : "")}site:{domain}";
        var input = new { queries = searchQuery, countryCode = market,
            languageCode = "en", searchLanguage = "en", maxPagesPerQuery = 1, resultsPerPage = 10,
            includeUnfilteredResults = false, saveHtml = false };
        var output = await RunActorAsync("apify~google-search-scraper", input, 75, "0.50", ct);
        var candidates = new List<Candidate>();
        foreach (var page in output.EnumerateArray())
        {
            if (!TryProperty(page, "organicResults", out var organic) || organic.ValueKind != JsonValueKind.Array) continue;
            foreach (var item in organic.EnumerateArray())
            {
                var title = String(item, "title");
                var url = String(item, "url");
                if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(url)) continue;
                var priceText = TryProperty(item, "productInfo", out var info) ? String(info, "price") : null;
                var parsed = ManufacturerPagePriceParser.ParseDisplayedPrice(priceText);
                candidates.Add(new(title, url, parsed.Price, parsed.Currency));
            }
        }
        return candidates;
    }

    private async Task<(string Url, string Title, string Html)?> CrawlPageAsync(string url, CancellationToken ct)
    {
        var input = new { startUrls = new[] { new { url } }, crawlerType = "playwright:adaptive",
            maxCrawlPages = 1, maxCrawlDepth = 0, useSitemaps = false, saveHtml = true,
            saveMarkdown = false, saveFiles = false, summarize = false };
        var output = await RunActorAsync("apify~website-content-crawler", input, 90, "0.50", ct);
        foreach (var item in output.EnumerateArray())
        {
            var pageUrl = String(item, "url");
            var html = String(item, "html");
            var title = TryProperty(item, "metadata", out var metadata) ? String(metadata, "title") : null;
            title ??= String(item, "title");
            if (!string.IsNullOrWhiteSpace(pageUrl) && !string.IsNullOrWhiteSpace(html) && !string.IsNullOrWhiteSpace(title))
                return (pageUrl, title, html);
        }
        return null;
    }

    private async Task<(decimal? Price, string? Currency)> FindManufacturerMerchantPriceAsync(
        string query, string market, string domain, CancellationToken ct)
    {
        var merchant = domain switch
        {
            "apple.com" => "Apple", "samsung.com" => "Samsung", "dell.com" => "Dell",
            "lenovo.com" => "Lenovo", "hp.com" => "HP", "microsoft.com" => "Microsoft",
            "sony.com" => "Sony", "nike.com" => "Nike", "adidas.com" => "Adidas",
            "canon.com" => "Canon", "nikon.com" => "Nikon", "toyota.com" => "Toyota",
            "honda.com" => "Honda", "bmw.com" => "BMW", "asus.com" => "ASUS",
            "acer.com" => "Acer", "mi.com" => "Xiaomi", "huawei.com" => "Huawei",
            "store.google.com" => "Google", _ => null
        };
        if (merchant is null) return (null, null);

        var input = new { queries = new[] { query }, maxResults = 10, country = market, language = "en" };
        var output = await RunActorAsync("automation-lab~google-shopping-scraper", input, 90, "0.50", ct);
        foreach (var item in output.EnumerateArray())
        {
            if (!string.Equals(String(item, "merchant")?.Trim(), merchant, StringComparison.OrdinalIgnoreCase) ||
                !ManufacturerPriceMatcher.MatchesProduct(query, String(item, "title") ?? "")) continue;

            var amount = TryProperty(item, "priceNumeric", out var priceField) ? priceField.ToString() : null;
            var parsed = ManufacturerPagePriceParser.ParseDisplayedPrice(amount);
            var currency = String(item, "currency");
            if (parsed.Price is > 0 && currency is { Length: 3 } && currency.All(char.IsLetter))
                return (parsed.Price, currency.ToUpperInvariant());
        }
        return (null, null);
    }

    private async Task<JsonElement> RunActorAsync(string actor, object input, int timeoutSeconds, string maxCharge, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"acts/{actor}/run-sync-get-dataset-items?timeout={timeoutSeconds}&maxTotalChargeUsd={maxCharge}&format=json&limit={(actor.Contains("shopping", StringComparison.Ordinal) ? 20 : 3)}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        request.Content = JsonContent.Create(input);
        using var response = await httpClient.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"Apify {actor} returned HTTP {(int)response.StatusCode}.", null, response.StatusCode);
        var output = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        if (output.ValueKind != JsonValueKind.Array)
            throw new HttpRequestException($"Apify {actor} returned an unexpected result format.");
        return output;
    }

    private static bool TryProperty(JsonElement value, string name, out JsonElement result)
    {
        result = default;
        return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(name, out result);
    }

    private static string? String(JsonElement value, string name) =>
        TryProperty(value, name, out var property) && property.ValueKind == JsonValueKind.String ? property.GetString() : null;

    private sealed record Candidate(string Title, string Url, decimal? Price, string? Currency);
}

public static class ManufacturerPagePriceParser
{
    public static (decimal? Price, string? Currency) Extract(string html, string productQuery)
    {
        foreach (Match script in Regex.Matches(html, @"<script\b[^>]*type\s*=\s*['""']application/ld\+json['""'][^>]*>(?<body>.*?)</script>", RegexOptions.IgnoreCase | RegexOptions.Singleline))
        {
            try
            {
                using var document = JsonDocument.Parse(WebUtility.HtmlDecode(script.Groups["body"].Value));
                var price = FindProductOffer(document.RootElement, productQuery);
                if (price.Price is > 0 && price.Currency is not null) return price;
            }
            catch (JsonException) { }
        }

        string? amount = null, currency = null;
        foreach (Match tag in Regex.Matches(html, @"<meta\b[^>]*>", RegexOptions.IgnoreCase))
        {
            var field = Attribute(tag.Value, "property") ?? Attribute(tag.Value, "name") ?? Attribute(tag.Value, "itemprop");
            var content = Attribute(tag.Value, "content");
            if (field is null || content is null) continue;
            if (field.Equals("product:price:amount", StringComparison.OrdinalIgnoreCase) ||
                field.Equals("og:price:amount", StringComparison.OrdinalIgnoreCase)) amount = content;
            if (field.Equals("product:price:currency", StringComparison.OrdinalIgnoreCase) ||
                field.Equals("og:price:currency", StringComparison.OrdinalIgnoreCase)) currency = content;
        }

        var parsed = ParseDisplayedPrice(amount);
        var code = NormalizeCurrency(currency) ?? parsed.Currency;
        return parsed.Price is > 0 && code is not null ? (parsed.Price, code) : (null, null);
    }

    public static (decimal? Price, string? Currency) ParseDisplayedPrice(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return (null, null);
        var currency = value.Contains('€') ? "EUR" : value.Contains('£') ? "GBP" :
            value.Contains('$') ? "USD" : value.Contains("AED", StringComparison.OrdinalIgnoreCase) ? "AED" :
            value.Contains("ZAR", StringComparison.OrdinalIgnoreCase) ? "ZAR" :
            value.Contains("USD", StringComparison.OrdinalIgnoreCase) ? "USD" :
            value.Contains("EUR", StringComparison.OrdinalIgnoreCase) ? "EUR" :
            value.Contains("GBP", StringComparison.OrdinalIgnoreCase) ? "GBP" : null;
        var match = Regex.Match(value, @"\d[\d.,\s]*");
        if (!match.Success) return (null, null);
        var amount = match.Value.Replace(" ", "");
        if (amount.Contains(',') && amount.Contains('.'))
            amount = amount.LastIndexOf(',') > amount.LastIndexOf('.')
                ? amount.Replace(".", "").Replace(',', '.')
                : amount.Replace(",", "");
        else if (amount.Contains(','))
            amount = amount.Length - amount.LastIndexOf(',') - 1 is 1 or 2
                ? amount.Replace(',', '.')
                : amount.Replace(",", "");
        if (!decimal.TryParse(amount, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var price) || price <= 0)
            return (null, null);
        return (price, currency);
    }

    private static (decimal? Price, string? Currency) FindProductOffer(JsonElement element, string query)
    {
        if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in element.EnumerateArray())
            {
                var found = FindProductOffer(child, query);
                if (found.Price is > 0) return found;
            }
        }
        else if (element.ValueKind == JsonValueKind.Object)
        {
            var type = Text(element, "@type") ?? "";
            if (type.Contains("Product", StringComparison.OrdinalIgnoreCase) &&
                ManufacturerPriceMatcher.MatchesProduct(query, Text(element, "name") ?? "") &&
                element.TryGetProperty("offers", out var offers))
            {
                var found = FindOffer(offers);
                if (found.Price is > 0) return found;
            }
            foreach (var child in element.EnumerateObject())
            {
                if (child.NameEquals("offers")) continue;
                var found = FindProductOffer(child.Value, query);
                if (found.Price is > 0) return found;
            }
        }
        return (null, null);
    }

    private static (decimal? Price, string? Currency) FindOffer(JsonElement offer)
    {
        if (offer.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in offer.EnumerateArray())
            {
                var found = FindOffer(item);
                if (found.Price is > 0) return found;
            }
        }
        else if (offer.ValueKind == JsonValueKind.Object)
        {
            var amount = Text(offer, "price") ?? Text(offer, "lowPrice");
            var parsed = ParseDisplayedPrice(amount);
            var currency = NormalizeCurrency(Text(offer, "priceCurrency")) ?? parsed.Currency;
            if (parsed.Price is > 0 && currency is not null) return (parsed.Price, currency);
            if (offer.TryGetProperty("priceSpecification", out var nested)) return FindOffer(nested);
        }
        return (null, null);
    }

    private static string? Text(JsonElement value, string name)
    {
        if (value.ValueKind != JsonValueKind.Object || !value.TryGetProperty(name, out var field)) return null;
        return field.ValueKind is JsonValueKind.String or JsonValueKind.Number ? field.ToString() : null;
    }

    private static string? NormalizeCurrency(string? value) =>
        value is { Length: 3 } && value.All(char.IsLetter) ? value.ToUpperInvariant() : null;

    private static string? Attribute(string tag, string name)
    {
        var match = Regex.Match(tag, $@"\b{name}\s*=\s*['""'](?<value>[^'""']+)['""']", RegexOptions.IgnoreCase);
        return match.Success ? WebUtility.HtmlDecode(match.Groups["value"].Value) : null;
    }
}
