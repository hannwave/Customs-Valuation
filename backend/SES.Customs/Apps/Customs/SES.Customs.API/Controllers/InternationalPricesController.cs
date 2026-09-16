using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "International price provider is not configured",
                detail: "Configure the SerpApi:ApiKey server setting to enable Google Shopping searches.");

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
            hsCode.Code,
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
}
