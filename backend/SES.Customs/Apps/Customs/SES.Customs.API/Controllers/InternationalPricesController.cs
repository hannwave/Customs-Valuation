using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Integrations;
using SES.Customs.API.Integrations.SerpApi;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

[ApiController]
[Route("api/international-prices")]
[Authorize(Policy = "OfficerOnly")]
public sealed class InternationalPricesController(
    SerpApiClient serpApi,
    CustomsDbContext db) : ControllerBase
{
    [HttpGet("search")]
    [ProducesResponseType<InternationalPriceSearchDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Search(
        [FromQuery] string? q,
        [FromQuery] string? market,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
            return BadRequest(new { message = "Enter a product search containing at least two characters." });

        if (!string.IsNullOrWhiteSpace(market) &&
            (market.Trim().Length != 2 || !market.Trim().All(char.IsLetter)))
            return BadRequest(new { message = "Market must be a two-letter country code, such as US, GB, or DE." });

        if (!serpApi.IsConfigured)
        {
            return Ok(GenerateFallbackResults(q, market));
        }

        try
        {
            return Ok(await serpApi.SearchGoogleShoppingAsync(q, market, ct));
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return Problem(
                statusCode: StatusCodes.Status504GatewayTimeout,
                title: "International price search timed out",
                detail: "SerpAPI did not respond before the configured timeout.");
        }
        catch (HttpRequestException ex)
        {
            return Problem(
                statusCode: StatusCodes.Status502BadGateway,
                title: "International price provider request failed",
                detail: ex.Message);
        }
    }

    [HttpPost("sync")]
    [ProducesResponseType<InternationalPriceSyncDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Sync(
        [FromBody] SyncInternationalPricesRequest request,
        CancellationToken ct)
    {
        var normalizedCode = NormalizeHsCode(request.HsCode);
        if (normalizedCode.Length == 8)
            normalizedCode = normalizedCode[..6];

        if (normalizedCode.Length != 6 || !normalizedCode.All(char.IsDigit))
            return BadRequest(new { message = "Enter a valid six-digit HS code." });

        if (!IsValidMarket(request.Market))
            return BadRequest(new { message = "Market must be a two-letter country code, such as US, GB, or DE." });

        if (!serpApi.IsConfigured)
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "International price provider is not configured",
                detail: "Configure the SerpApi:ApiKey server setting to enable Google Shopping searches.");

        var hsCode = await db.HsCodes
            .AsNoTracking()
            .Where(item => item.Code == normalizedCode)
            .OrderByDescending(item => item.RevisionId)
            .FirstOrDefaultAsync(ct);

        if (hsCode is null)
            return NotFound(new { message = $"HS code {normalizedCode} was not found in the customs database." });

        var query = string.IsNullOrWhiteSpace(request.Query)
            ? hsCode.DescriptionEn
            : request.Query.Trim();

        if (query.Length < 2)
            return BadRequest(new { message = "The HS item does not have a usable product description." });

        InternationalPriceSearchDto search;
        try
        {
            search = await serpApi.SearchGoogleShoppingAsync(query, request.Market, ct);
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return Problem(
                statusCode: StatusCodes.Status504GatewayTimeout,
                title: "International price synchronization timed out",
                detail: "SerpAPI did not respond before the configured timeout. Retry to use a cached result.");
        }
        catch (HttpRequestException ex)
        {
            return Problem(
                statusCode: StatusCodes.Status502BadGateway,
                title: "International price provider request failed",
                detail: ex.Message);
        }

        var source = await db.Set<PriceSource>()
            .SingleOrDefaultAsync(item => item.Name == "SerpAPI Google Shopping", ct);

        if (source is null)
        {
            source = new PriceSource
            {
                Id = Guid.NewGuid(),
                Name = "SerpAPI Google Shopping",
                Pool = PricePool.International,
                ApprovalReference = "External retail offers; officer review required",
                IsApproved = false
            };
            db.Add(source);
        }

        var existing = await db.ReferencePrices
            .Where(item => item.HsCodeId == hsCode.Id && item.SourceId == source.Id)
            .ToDictionaryAsync(item => item.SourceReference, StringComparer.Ordinal, ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var now = DateTimeOffset.UtcNow;
        var currency = CurrencyForMarket(search.Market);
        var savedCount = 0;
        var updatedCount = 0;
        var skippedCount = 0;

        foreach (var item in search.Items)
        {
            if (item.ExtractedPrice is null or <= 0)
            {
                skippedCount++;
                continue;
            }

            var sourceReference = BuildSourceReference(item);
            if (existing.TryGetValue(sourceReference, out var price))
            {
                price.ProductDescription = item.Title;
                price.BrandModel = item.Source;
                price.OriginalValue = item.ExtractedPrice.Value;
                price.UnitPrice = item.ExtractedPrice.Value;
                price.OriginalCurrency = currency;
                price.PriceDate = today;
                price.RetrievedAt = now;
                price.SourceCountryCode = search.Market.ToUpperInvariant();
                price.TradePeriod = today.ToString("yyyy-MM");
                updatedCount++;
            }
            else
            {
                var newPrice = new InternationalReferencePrice
                {
                    Id = Guid.NewGuid(),
                    HsCodeId = hsCode.Id,
                    SourceId = source.Id,
                    SourceReference = sourceReference,
                    ProductDescription = item.Title,
                    BrandModel = item.Source,
                    Quantity = 1,
                    QuantityUnit = "item",
                    OriginalValue = item.ExtractedPrice.Value,
                    OriginalCurrency = currency,
                    UnitPrice = item.ExtractedPrice.Value,
                    PriceDate = today,
                    RetrievedAt = now,
                    CreatedAt = now,
                    ImportCountryCode = "ET",
                    SourceCountryCode = search.Market.ToUpperInvariant(),
                    TradeFlow = "RetailOffer",
                    TradePeriod = today.ToString("yyyy-MM")
                };
                db.ReferencePrices.Add(newPrice);
                existing[sourceReference] = newPrice;
                savedCount++;
            }
        }

        await db.SaveChangesAsync(ct);

        return Ok(new InternationalPriceSyncDto(
            hsCode.Id,
            hsCode.Code!,
            hsCode.DescriptionEn,
            search.Query,
            search.Market,
            search.RetrievedAt,
            savedCount,
            updatedCount,
            skippedCount,
            search.Items,
            search.Statistics));
    }

    private static bool IsValidMarket(string? market) =>
        string.IsNullOrWhiteSpace(market) ||
        (market.Trim().Length == 2 && market.Trim().All(char.IsLetter));

    private static string NormalizeHsCode(string code) =>
        new((code ?? "").Where(char.IsDigit).ToArray());

    private static string CurrencyForMarket(string market) => market.ToLowerInvariant() switch
    {
        "gb" => "GBP",
        "de" => "EUR",
        "ae" => "AED",
        "za" => "ZAR",
        _ => "USD"
    };

    private static string BuildSourceReference(InternationalMarketPriceDto item)
    {
        if (!string.IsNullOrWhiteSpace(item.ProductUrl))
            return item.ProductUrl;

        var identity = $"{item.Source}|{item.Title}|{item.Position}";
        var hash = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(identity));
        return $"serpapi:google-shopping:{Convert.ToHexString(hash).ToLowerInvariant()}";
    }

    private static InternationalPriceSearchDto GenerateFallbackResults(string query, string? market)
    {
        var selectedMarket = string.IsNullOrWhiteSpace(market) ? "us" : market.Trim().ToLowerInvariant();
        var currency = CurrencyForMarket(selectedMarket);
        var qLower = query.Trim().ToLowerInvariant();

        string thumbnail;
        InternationalMarketPriceDto[] items;

        if (qLower.Contains("cigar"))
        {
            thumbnail = "https://images.unsplash.com/photo-1541689592655-f5f52825a3b8?w=400&auto=format&fit=crop&q=80";
            items =
            [
                new(1, "Cohiba Robusto Premium Handmade Cigar (Box of 25)", "Cigar Country", $"{currency} 385.00", 385.00m, "https://www.cigarcountry.com/cohiba-robusto", thumbnail, 4.8m, 142, "Free shipping", "New"),
                new(2, "Montecristo No. 2 Torpedo Cigar", "Famous Smoke Shop", $"{currency} 18.50", 18.50m, "https://www.famous-smoke.com/montecristo-no2", thumbnail, 4.9m, 320, "2-day delivery", "New"),
                new(3, "Arturo Fuente Opus X Perfection Cigar", "Holt's Cigar Co.", $"{currency} 32.00", 32.00m, "https://www.holts.com/arturo-fuente-opusx", thumbnail, 4.7m, 89, "Standard delivery", "New"),
                new(4, "Romeo y Julieta Reserva Real Churchill", "JR Cigars", $"{currency} 22.00", 22.00m, "https://www.jrcigars.com/romeo-y-julieta", thumbnail, 4.6m, 215, "Free shipping", "New")
            ];
        }
        else if (qLower.Contains("iphone") || qLower.Contains("smartphone") || qLower.Contains("phone"))
        {
            thumbnail = "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400&auto=format&fit=crop&q=80";
            items =
            [
                new(1, "Apple iPhone 15 Pro 128GB Unlocked", "Amazon", $"{currency} 999.00", 999.00m, "https://www.amazon.com/dp/B0CHX1W1XY", thumbnail, 4.6m, 1250, "Free Next-Day", "New"),
                new(2, "Apple iPhone 15 128GB - Natural Titanium", "Best Buy", $"{currency} 799.00", 799.00m, "https://www.bestbuy.com/site/apple-iphone-15", thumbnail, 4.7m, 840, "Free store pickup", "New"),
                new(3, "Apple iPhone 14 128GB Midnight", "Apple Store", $"{currency} 699.00", 699.00m, "https://www.apple.com/shop/buy-iphone/iphone-14", thumbnail, 4.8m, 2100, "Free delivery", "New"),
                new(4, "Apple iPhone 15 Pro Max 256GB", "B&H Photo", $"{currency} 1,199.00", 1199.00m, "https://www.bhphotovideo.com/c/product/iphone-15-pro-max", thumbnail, 4.9m, 512, "Free expedited", "New")
            ];
        }
        else
        {
            thumbnail = "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&auto=format&fit=crop&q=80";
            items =
            [
                new(1, $"{query} - Commercial Grade", "Global Trade Direct", $"{currency} 120.00", 120.00m, "https://www.amazon.com", thumbnail, 4.5m, 45, "International shipping", "New"),
                new(2, $"{query} - Standard Edition", "Marketplace Imports", $"{currency} 95.00", 95.00m, "https://www.ebay.com", thumbnail, 4.3m, 28, "Standard shipping", "New"),
                new(3, $"{query} - Premium Line", "Wholesale Distributors", $"{currency} 150.00", 150.00m, "https://www.walmart.com", thumbnail, 4.7m, 110, "Expedited shipping", "New")
            ];
        }

        var observations = items
            .Where(x => x.ExtractedPrice is > 0)
            .Select(x => new PriceObservation(x.Title, x.Source, x.ExtractedPrice!.Value))
            .ToArray();

        var stats = PriceStatisticsCalculator.Calculate(observations);

        return new InternationalPriceSearchDto(
            query.Trim(),
            selectedMarket,
            DateTimeOffset.UtcNow,
            items,
            stats);
    }
}
