using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Integrations;
using SES.Customs.API.Integrations.LocalMarket;
using SES.Customs.Core.Features.LocalPrices.Service;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

[ApiController]
[Route("api/local-prices")]
[Authorize(Roles = "CustomsOfficer,CustomsAdministrator,SystemAdministrator")]
public sealed class LocalPricesController(
    LocalMarketSearchService localMarket,
    CustomsDbContext db,
    IConfiguration configuration) : ControllerBase
{
    [HttpGet("search")]
    public async Task<IActionResult> LegacySearch([FromQuery] string? q, [FromQuery] string? sources, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
            return BadRequest(new { message = "Enter a product search containing at least two characters." });
        return Ok(await localMarket.SearchAsync(q, ParseSources(sources), ct));
    }

    [HttpPost("/api/local-market/search")]
    public async Task<IActionResult> SearchAndClassify([FromBody] LocalMarketAnalysisRequest request, CancellationToken ct)
    {
        var validation = await ValidateRequestAsync(request, ct);
        if (validation.Error is not null) return validation.Error;

        var response = await AnalyzeAndPersistAsync(validation.HsCode!, validation.Query!, request, ct);
        return Ok(response);
    }

    [HttpPost("sync")]
    public async Task<IActionResult> Sync([FromBody] SyncLocalPricesRequest request, CancellationToken ct)
    {
        var analysisRequest = new LocalMarketAnalysisRequest(
            request.HsCode, request.Query, request.Sources, request.Category, request.ProductType,
            request.Brand, request.Model, request.Variant, request.Condition, request.PriceType,
            request.RelevanceThreshold, request.OutlierMethod, request.IncludeOutliers, request.MaximumAgeDays);
        var validation = await ValidateRequestAsync(analysisRequest, ct);
        if (validation.Error is not null) return validation.Error;

        var response = await AnalyzeAndPersistAsync(validation.HsCode!, validation.Query!, analysisRequest, ct);
        var valid = response.Analysis.Observations.Where(item => item.IncludedInStatistics).ToArray();
        var sourceNames = valid.Select(item => item.Listing.Source).Distinct(StringComparer.Ordinal).ToArray();
        var sources = await EnsureSourcesAsync(sourceNames, ct);
        var markets = await EnsureMarketsAsync(sourceNames, ct);
        var existing = await db.LocalPrices
            .Where(item => item.HsCodeId == validation.HsCode!.Id && sources.Values.Select(source => source.Id).Contains(item.SourceId))
            .ToDictionaryAsync(item => $"{item.SourceId:N}|{item.SourceReference}", StringComparer.Ordinal, ct);
        var saved = 0;
        var updated = 0;
        var now = DateTimeOffset.UtcNow;

        foreach (var item in valid)
        {
            var offer = item.Listing;
            var source = sources[offer.Source];
            var reference = SourceReference(offer.Url, offer.Source, offer.Title, offer.Price);
            var key = $"{source.Id:N}|{reference}";
            if (existing.TryGetValue(key, out var price))
            {
                price.ProductDescription = offer.Title;
                price.BrandModel = response.Analysis.Product.Model ?? offer.Description;
                price.OriginalValue = offer.Price;
                price.UnitPrice = item.NormalizedUnitPrice;
                price.OriginalCurrency = offer.Currency;
                price.PriceDate = DateOnly.FromDateTime((offer.ListingDate ?? offer.RetrievedAt).UtcDateTime);
                price.RetrievedAt = now;
                updated++;
                continue;
            }
            var localPrice = new LocalMarketPrice
            {
                Id = Guid.NewGuid(), HsCodeId = validation.HsCode!.Id, SourceId = source.Id,
                SourceReference = reference, ProductDescription = offer.Title,
                BrandModel = response.Analysis.Product.Model ?? offer.Description,
                Quantity = item.OriginalQuantity, QuantityUnit = item.OriginalUnit,
                OriginalValue = offer.Price, OriginalCurrency = offer.Currency,
                UnitPrice = item.NormalizedUnitPrice,
                PriceDate = DateOnly.FromDateTime((offer.ListingDate ?? offer.RetrievedAt).UtcDateTime),
                RetrievedAt = now, CreatedAt = now, MarketId = markets[offer.Source].Id,
                SupplierReference = offer.Url, PriceType = ToEvidencePriceType(offer.PriceType)
            };
            db.LocalPrices.Add(localPrice);
            existing[key] = localPrice;
            saved++;
        }
        await db.SaveChangesAsync(ct);
        return Ok(new LocalPriceSyncDto(response, saved, updated, response.Analysis.Collection.Excluded));
    }

    [HttpGet("/api/hs-codes/{id:guid}/local-prices")]
    public async Task<IActionResult> Observations(
        Guid id, [FromQuery] LocalObservationStatus? status, [FromQuery] ProductCondition? condition,
        [FromQuery] string? source, [FromQuery] string? seller, [FromQuery] MarketPriceType? priceType,
        [FromQuery] DateTimeOffset? dateFrom, [FromQuery] DateTimeOffset? dateTo, CancellationToken ct)
    {
        var query = db.LocalMarketObservations.AsNoTracking().Where(item => item.HsCodeId == id);
        if (status is not null) query = query.Where(item => item.ClassificationStatus == status);
        if (condition is not null) query = query.Where(item => item.Condition == condition);
        if (!string.IsNullOrWhiteSpace(source)) query = query.Where(item => item.Marketplace == source);
        if (!string.IsNullOrWhiteSpace(seller)) query = query.Where(item => item.SellerName == seller);
        if (priceType is not null) query = query.Where(item => item.PriceType == priceType);
        if (dateFrom is not null) query = query.Where(item => item.RetrievalDate >= dateFrom);
        if (dateTo is not null) query = query.Where(item => item.RetrievalDate <= dateTo);
        return Ok(new { observations = await query.OrderByDescending(item => item.RetrievalDate).Take(500).ToArrayAsync(ct) });
    }

    [HttpGet("/api/hs-codes/{id:guid}/local-prices/rejected")]
    public async Task<IActionResult> Rejected(Guid id, CancellationToken ct) => Ok(new
    {
        observations = await db.LocalMarketObservations.AsNoTracking()
            .Where(item => item.HsCodeId == id && item.ClassificationStatus != LocalObservationStatus.ValidForStatistics &&
                item.ClassificationStatus != LocalObservationStatus.PotentialOutlier && item.ClassificationStatus != LocalObservationStatus.ManuallyApproved)
            .OrderByDescending(item => item.RetrievalDate).Take(500).ToArrayAsync(ct)
    });

    [HttpGet("/api/hs-codes/{id:guid}/local-prices/outliers")]
    public async Task<IActionResult> Outliers(Guid id, CancellationToken ct) => Ok(new
    {
        observations = await db.LocalMarketObservations.AsNoTracking()
            .Where(item => item.HsCodeId == id && item.IsPotentialOutlier)
            .OrderByDescending(item => item.RetrievalDate).Take(500).ToArrayAsync(ct)
    });

    [HttpGet("/api/hs-codes/{id:guid}/local-statistics")]
    public async Task<IActionResult> Statistics(Guid id, CancellationToken ct, [FromQuery] bool includeOutliers = false)
    {
        var values = await db.LocalMarketObservations.AsNoTracking()
            .Where(item => item.HsCodeId == id && item.NormalizedUnitPrice > 0 &&
                (item.ClassificationStatus == LocalObservationStatus.ValidForStatistics ||
                 item.ClassificationStatus == LocalObservationStatus.ManuallyApproved ||
                 (includeOutliers && item.ClassificationStatus == LocalObservationStatus.PotentialOutlier)))
            .Select(item => new { item.ListingTitle, item.Marketplace, Price = item.NormalizedUnitPrice!.Value })
            .ToArrayAsync(ct);
        return Ok(new
        {
            hsCodeId = id,
            includeOutliers,
            statistics = PriceStatisticsCalculator.Calculate(values.Select(item => new PriceObservation(item.ListingTitle, item.Marketplace, item.Price)))
        });
    }

    [HttpPatch("{id:guid}/review")]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewLocalObservationRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Justification) || request.Justification.Trim().Length < 10)
            return BadRequest(new { message = "A review justification of at least 10 characters is required." });
        if (!Enum.TryParse<ManualReviewStatus>(request.Decision, true, out var decision) || decision == ManualReviewStatus.Unreviewed)
            return BadRequest(new { message = "Decision must be Approved, Rejected, or ConfirmedOutlier." });
        var item = await db.LocalMarketObservations.SingleOrDefaultAsync(observation => observation.Id == id, ct);
        if (item is null) return NotFound(new { message = "Local marketplace observation was not found." });

        var previous = new { item.ClassificationStatus, item.ManualReviewStatus, item.ReviewedBy, item.ReviewedAt, item.ReviewJustification };
        item.ManualReviewStatus = decision;
        item.ClassificationStatus = decision switch
        {
            ManualReviewStatus.Approved => LocalObservationStatus.ManuallyApproved,
            ManualReviewStatus.Rejected => LocalObservationStatus.ManuallyRejected,
            ManualReviewStatus.ConfirmedOutlier => LocalObservationStatus.PotentialOutlier,
            _ => item.ClassificationStatus
        };
        item.IsPotentialOutlier = decision == ManualReviewStatus.ConfirmedOutlier || item.IsPotentialOutlier;
        item.ReviewedBy = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "unknown";
        item.ReviewedAt = DateTimeOffset.UtcNow;
        item.ReviewJustification = request.Justification.Trim();
        item.UpdatedAt = DateTimeOffset.UtcNow;
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(), UserId = item.ReviewedBy, Username = User.Identity?.Name ?? "unknown",
            OccurredAt = DateTimeOffset.UtcNow, Action = "LocalPriceClassificationOverride", Module = "LocalPrices",
            RecordId = item.Id, PreviousValueJson = JsonSerializer.Serialize(previous),
            NewValueJson = JsonSerializer.Serialize(new { item.ClassificationStatus, item.ManualReviewStatus, item.ReviewedBy, item.ReviewedAt, item.ReviewJustification }),
            Decision = decision.ToString(), Justification = item.ReviewJustification,
            IpDeviceInformation = HttpContext.Connection.RemoteIpAddress?.ToString()
        });
        await db.SaveChangesAsync(ct);
        return Ok(item);
    }

    private async Task<LocalMarketAnalysisResponse> AnalyzeAndPersistAsync(HsCode hsCode, string query, LocalMarketAnalysisRequest request, CancellationToken ct)
    {
        var fetched = await localMarket.SearchAsync(query, ParseSources(request.Sources), ct);
        await PersistRawSnapshotsAsync(hsCode.Id, query, fetched, ct);
        var target = new TargetProductProfile(
            hsCode.Code, query, request.Category, request.ProductType, request.Brand, null,
            request.Model, request.Variant, null, null, null, null,
            ParseEnum(request.Condition, ProductCondition.New), 1, "piece",
            ParseEnum(request.PriceType, MarketPriceType.Retail));
        var defaultThreshold = configuration.GetValue("LocalMarketAnalysis:RelevanceThreshold", 80);
        var defaultAge = configuration.GetValue("LocalMarketAnalysis:MaximumAgeDays", 180);
        var listingIds = fetched.Items.Select(item => item.SourceListingId).ToArray();
        var existingReviews = await db.LocalMarketObservations.AsNoTracking()
            .Where(item => listingIds.Contains(item.SourceListingId) && item.ManualReviewStatus != ManualReviewStatus.Unreviewed)
            .Select(item => new { item.Marketplace, item.SourceListingId, item.ManualReviewStatus })
            .ToArrayAsync(ct);
        var manualReviews = existingReviews.ToDictionary(
            item => ReviewKey(item.Marketplace, item.SourceListingId),
            item => item.ManualReviewStatus,
            StringComparer.Ordinal);
        var options = new LocalClassificationOptions(
            Math.Clamp(request.RelevanceThreshold ?? defaultThreshold, 0, 100),
            ParseEnum(request.OutlierMethod, LocalOutlierMethod.Iqr),
            request.IncludeOutliers ?? false,
            Math.Clamp(request.MaximumAgeDays ?? defaultAge, 1, 3650),
            null,
            manualReviews);
        var listings = fetched.Items.Select(item => new MarketplaceListing(
            item.Source, item.SourceListingId, item.ProductUrl, item.Title, item.Description,
            item.SellerName, item.Location, item.Price, item.Currency, fetched.RetrievedAt,
            item.ListingDate, item.ThumbnailUrl, item.RawCategory, ParseCondition(item.Condition), MarketPriceType.Retail)).ToArray();
        var analysis = LocalMarketClassificationEngine.Analyze(target, listings, options);
        analysis = await PersistObservationsAsync(hsCode.Id, analysis, ct);
        return new LocalMarketAnalysisResponse(hsCode.Id, hsCode.Code, hsCode.DescriptionEn, fetched.Sources, analysis);
    }

    private async Task PersistRawSnapshotsAsync(Guid hsCodeId, string query, LocalMarketSearchDto fetched, CancellationToken ct)
    {
        var names = fetched.Items.Select(item => item.Source).Distinct(StringComparer.Ordinal).ToArray();
        var sources = await EnsureSourcesAsync(names, ct);
        var sourceIds = sources.Values.Select(item => item.Id).ToArray();
        var listingIds = fetched.Items.Select(item => item.SourceListingId).ToArray();
        var existing = await db.LocalMarketObservations
            .Where(item => sourceIds.Contains(item.SourceId) && listingIds.Contains(item.SourceListingId))
            .ToDictionaryAsync(item => $"{item.SourceId:N}|{item.SourceListingId}", StringComparer.Ordinal, ct);
        var now = DateTimeOffset.UtcNow;
        foreach (var offer in fetched.Items)
        {
            var source = sources[offer.Source];
            var key = $"{source.Id:N}|{offer.SourceListingId}";
            if (!existing.TryGetValue(key, out var entity))
            {
                entity = new LocalMarketObservation
                {
                    Id = Guid.NewGuid(), HsCodeId = hsCodeId, SourceId = source.Id,
                    SourceListingId = offer.SourceListingId, Marketplace = offer.Source,
                    ListingUrl = offer.ProductUrl, ListingTitle = offer.Title,
                    RawPrice = offer.Price, RawCurrency = offer.Currency,
                    RetrievalDate = fetched.RetrievedAt, SearchQuery = query,
                    TargetProfileJson = "{}", Condition = ParseCondition(offer.Condition),
                    PriceType = MarketPriceType.Retail, OriginalQuantity = 1, OriginalUnit = "piece",
                    NormalizedQuantity = 1, NormalizedUnit = "piece", NormalizedCurrency = "ETB",
                    ClassificationStatus = LocalObservationStatus.Raw,
                    ClassificationReason = "Fetched from marketplace; classification pending.",
                    MatchedKeywordsJson = "[]", ExcludedKeywordsJson = "[]",
                    OutlierMethod = LocalOutlierMethod.None, ManualReviewStatus = ManualReviewStatus.Unreviewed,
                    CreatedAt = now, UpdatedAt = now
                };
                db.LocalMarketObservations.Add(entity);
                existing[key] = entity;
            }
            entity.HsCodeId = hsCodeId; entity.ListingUrl = offer.ProductUrl; entity.ListingTitle = offer.Title;
            entity.ListingDescription = offer.Description; entity.SellerName = offer.SellerName; entity.Location = offer.Location;
            entity.RawPrice = offer.Price; entity.RawCurrency = offer.Currency; entity.RetrievalDate = fetched.RetrievedAt;
            entity.ListingDate = offer.ListingDate; entity.ImageUrl = offer.ThumbnailUrl; entity.RawCategory = offer.RawCategory;
            entity.SearchQuery = query; entity.UpdatedAt = now;
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task<LocalMarketAnalysis> PersistObservationsAsync(Guid hsCodeId, LocalMarketAnalysis analysis, CancellationToken ct)
    {
        var names = analysis.Observations.Select(item => item.Listing.Source).Distinct(StringComparer.Ordinal).ToArray();
        var sources = await EnsureSourcesAsync(names, ct);
        var sourceIds = sources.Values.Select(item => item.Id).ToArray();
        var listingIds = analysis.Observations.Select(item => item.Listing.SourceListingId).ToArray();
        var existing = await db.LocalMarketObservations
            .Where(item => sourceIds.Contains(item.SourceId) && listingIds.Contains(item.SourceListingId))
            .ToDictionaryAsync(item => $"{item.SourceId:N}|{item.SourceListingId}", StringComparer.Ordinal, ct);
        var idMap = analysis.Observations.ToDictionary(item => item.Id, item =>
        {
            var source = sources[item.Listing.Source];
            return existing.TryGetValue($"{source.Id:N}|{item.Listing.SourceListingId}", out var entity) ? entity.Id : item.Id;
        });
        var persisted = new List<ClassifiedLocalListing>();
        var profileJson = JsonSerializer.Serialize(analysis.Product, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        foreach (var result in analysis.Observations)
        {
            var source = sources[result.Listing.Source];
            var key = $"{source.Id:N}|{result.Listing.SourceListingId}";
            var stable = result with
            {
                Id = idMap[result.Id],
                DuplicateOfId = result.DuplicateOfId is { } duplicateId && idMap.TryGetValue(duplicateId, out var mapped) ? mapped : null
            };
            if (!existing.TryGetValue(key, out var entity))
            {
                entity = new LocalMarketObservation { Id = stable.Id, CreatedAt = DateTimeOffset.UtcNow };
                db.LocalMarketObservations.Add(entity);
                existing[key] = entity;
            }
            MapObservation(entity, hsCodeId, source.Id, profileJson, analysis, stable);
            persisted.Add(stable);
        }
        await db.SaveChangesAsync(ct);
        return analysis with { Observations = persisted };
    }

    private static void MapObservation(LocalMarketObservation entity, Guid hsCodeId, Guid sourceId, string profileJson, LocalMarketAnalysis analysis, ClassifiedLocalListing result)
    {
        var listing = result.Listing;
        entity.HsCodeId = hsCodeId; entity.SourceId = sourceId; entity.SourceListingId = listing.SourceListingId;
        entity.Marketplace = listing.Source; entity.ListingUrl = listing.Url; entity.ListingTitle = listing.Title;
        entity.ListingDescription = listing.Description; entity.SellerName = listing.Seller; entity.Location = listing.Location;
        entity.RawPrice = listing.Price; entity.RawCurrency = listing.Currency; entity.RetrievalDate = listing.RetrievedAt;
        entity.ListingDate = listing.ListingDate; entity.ImageUrl = listing.ImageUrl; entity.RawCategory = listing.RawCategory;
        entity.SearchQuery = analysis.Product.Query; entity.TargetProfileJson = profileJson; entity.Brand = analysis.Product.Brand;
        entity.Model = analysis.Product.Model; entity.Variant = analysis.Product.Variant; entity.ProductType = analysis.Product.ProductType;
        entity.Condition = listing.Condition; entity.PriceType = listing.PriceType; entity.OriginalQuantity = result.OriginalQuantity;
        entity.OriginalUnit = result.OriginalUnit; entity.NormalizedQuantity = result.NormalizedQuantity; entity.NormalizedUnit = result.NormalizedUnit;
        entity.NormalizedPrice = listing.Currency.Equals("ETB", StringComparison.OrdinalIgnoreCase) ? listing.Price : null;
        entity.NormalizedCurrency = "ETB"; entity.NormalizedUnitPrice = result.NormalizedUnitPrice;
        entity.RelevanceScore = result.RelevanceScore;
        if (entity.ManualReviewStatus == ManualReviewStatus.Unreviewed) entity.ClassificationStatus = result.Status;
        entity.ClassificationReason = result.Reason; entity.MatchedKeywordsJson = JsonSerializer.Serialize(result.MatchedKeywords);
        entity.ExcludedKeywordsJson = JsonSerializer.Serialize(result.ExcludedKeywords); entity.IsDuplicate = result.DuplicateOfId is not null;
        entity.DuplicateOfId = result.DuplicateOfId; entity.IsPotentialOutlier = result.IsPotentialOutlier;
        entity.OutlierMethod = analysis.OutlierMethod; entity.OutlierScore = result.OutlierScore; entity.OutlierReason = result.OutlierReason;
        entity.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private async Task<Dictionary<string, PriceSource>> EnsureSourcesAsync(string[] names, CancellationToken ct)
    {
        var values = await db.Set<PriceSource>().Where(item => names.Contains(item.Name) && item.Pool == PricePool.Local)
            .ToDictionaryAsync(item => item.Name, StringComparer.Ordinal, ct);
        foreach (var name in names.Where(name => !values.ContainsKey(name)))
        {
            var source = new PriceSource { Id = Guid.NewGuid(), Name = name, Pool = PricePool.Local, ApprovalReference = "Public marketplace observation; officer review required", IsApproved = false };
            db.Add(source); values[name] = source;
        }
        return values;
    }

    private async Task<Dictionary<string, LocalMarket>> EnsureMarketsAsync(string[] names, CancellationToken ct)
    {
        var values = await db.Set<LocalMarket>().Where(item => names.Contains(item.NameEn)).ToDictionaryAsync(item => item.NameEn, StringComparer.Ordinal, ct);
        foreach (var name in names.Where(name => !values.ContainsKey(name)))
        {
            var market = new LocalMarket { Id = Guid.NewGuid(), NameEn = name, Region = "Ethiopia" };
            db.Add(market); values[name] = market;
        }
        return values;
    }

    private async Task<(HsCode? HsCode, string? Query, IActionResult? Error)> ValidateRequestAsync(LocalMarketAnalysisRequest request, CancellationToken ct)
    {
        var code = new string((request.HsCode ?? "").Where(char.IsDigit).ToArray());
        if (code.Length == 8) code = code[..6];
        if (code.Length != 6) return (null, null, BadRequest(new { message = "Enter a valid six-digit HS code." }));
        var hsCode = await db.HsCodes.AsNoTracking().Where(item => item.Code == code).OrderByDescending(item => item.RevisionId).FirstOrDefaultAsync(ct);
        if (hsCode is null) return (null, null, NotFound(new { message = $"HS code {code} was not found." }));
        var query = string.IsNullOrWhiteSpace(request.Query) ? hsCode.DescriptionEn : request.Query.Trim();
        return query.Length < 2 ? (null, null, BadRequest(new { message = "Enter a usable product description." })) : (hsCode, query, null);
    }

    private static string[]? ParseSources(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
    private static T ParseEnum<T>(string? value, T fallback) where T : struct, Enum => Enum.TryParse<T>(value, true, out var parsed) ? parsed : fallback;
    private static ProductCondition ParseCondition(string? value)
    {
        var normalized = (value ?? "").ToLowerInvariant();
        if (normalized.Contains("refurb")) return ProductCondition.Refurbished;
        if (normalized.Contains("used") || normalized.Contains("second hand")) return ProductCondition.Used;
        if (normalized.Contains("new")) return ProductCondition.New;
        return ProductCondition.Unknown;
    }
    private static LocalPriceCategory ToEvidencePriceType(MarketPriceType type) => type switch
    {
        MarketPriceType.Wholesale => LocalPriceCategory.Wholesale,
        MarketPriceType.Distributor => LocalPriceCategory.Distributor,
        MarketPriceType.Manufacturer => LocalPriceCategory.Manufacturer,
        MarketPriceType.SupplierQuotation => LocalPriceCategory.SupplierQuotation,
        _ => LocalPriceCategory.Retail
    };
    private static string SourceReference(string url, string source, string title, decimal price)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out _)) return url;
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{source}|{title}|{price}"));
        return $"local-market:{Convert.ToHexString(bytes).ToLowerInvariant()}";
    }
    private static string ReviewKey(string source, string listingId) => $"{NormalizeKeyPart(source)}|{NormalizeKeyPart(listingId)}";
    private static string NormalizeKeyPart(string value) => string.Join(" ", Regex.Matches(value.ToLowerInvariant(), "[a-z0-9]+").Select(match => match.Value));
}

public sealed record LocalMarketAnalysisRequest(
    string HsCode, string? Query, string? Sources, string? Category = null, string? ProductType = null,
    string? Brand = null, string? Model = null, string? Variant = null, string? Condition = null,
    string? PriceType = null, int? RelevanceThreshold = null, string? OutlierMethod = null,
    bool? IncludeOutliers = null, int? MaximumAgeDays = null);
public sealed record SyncLocalPricesRequest(
    string HsCode, string? Query, string? Sources, string? Category = null, string? ProductType = null,
    string? Brand = null, string? Model = null, string? Variant = null, string? Condition = null,
    string? PriceType = null, int? RelevanceThreshold = null, string? OutlierMethod = null,
    bool? IncludeOutliers = null, int? MaximumAgeDays = null);
public sealed record ReviewLocalObservationRequest(string Decision, string Justification);
public sealed record LocalMarketAnalysisResponse(Guid HsCodeId, string HsCode, string HsDescription, LocalMarketSourceStatusDto[] Sources, LocalMarketAnalysis Analysis);
public sealed record LocalPriceSyncDto(LocalMarketAnalysisResponse Result, int SavedCount, int UpdatedCount, int SkippedCount);
