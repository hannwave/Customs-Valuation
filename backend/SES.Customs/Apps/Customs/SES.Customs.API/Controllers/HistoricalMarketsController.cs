using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SES.Customs.API.Integrations.LocalMarket;
using SES.Customs.API.Integrations.PricesApi;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using System.Security.Cryptography;
using System.Text;

namespace SES.Customs.API.Controllers;

[ApiController, Route("api/historical-markets"), Authorize(Policy = "OfficerOnly")]
public sealed class HistoricalMarketsController(PricesApiClient prices, HistoricalFxClient fx,
    CustomsDbContext db, IMemoryCache cache) : ControllerBase
{
    public sealed record Selection(ExactProduct Product, ProductCandidate[] Candidates, string Owner);
    public sealed record CompareRequest(string SearchId, string[] Keys);
    public sealed record Row(DateOnly Date, decimal? InternationalPrice, decimal? LocalPrice, decimal? Difference, decimal? PercentageDifference, int CountryCount, int LocalCount);
    private string Owner => User.Identity?.Name ?? "";

    [HttpPost("search")]
    public async Task<IActionResult> Search(ExactProduct product, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(product.Brand) || string.IsNullOrWhiteSpace(product.Model) || string.IsNullOrWhiteSpace(product.Variant)
            || product.Query.Length > 200 || product.Model.Length < 2)
            return BadRequest(new { message = "Enter brand, exact model and variant (or 'standard' when there is no storage/size variant). Maximum 200 characters." });
        var items = new List<ProductCandidate>();
        var messages = new List<string>();
        foreach (var market in new[] { "au", "us", "gb" })
        {
            try { items.AddRange(await prices.SearchAsync(product, market, ct)); }
            catch (ProviderException ex) { messages.Add($"{market.ToUpperInvariant()}: {ex.Message}"); }
        }
        await PersistInternationalSnapshotsAsync(items, messages, ct);
        var id = Guid.NewGuid().ToString("N");
        cache.Set($"selection:{id}", new Selection(product, items.ToArray(), Owner), TimeSpan.FromMinutes(30));
        return Ok(new { searchId = id, items, messages });
    }

    [HttpGet("summary")]
    public async Task<IActionResult> SavedSummary([FromQuery] string? q, CancellationToken ct)
    {
        var query = q?.Trim() ?? "";
        if (query.Length < 2 || query.Length > 200)
            return BadRequest(new { message = "Enter a product description between 2 and 200 characters." });

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = today.AddYears(-2);
        var snapshots = await db.Set<MarketPriceSnapshot>().AsNoTracking()
            .Where(x => x.Currency == "ETB" && x.Price > 0 && x.ObservedDate >= from && x.ObservedDate <= today)
            .ToArrayAsync(ct);

        var international = snapshots
            .Where(x => x.Source.StartsWith("PricesAPI:", StringComparison.Ordinal)
                && HistoricalComparison.MatchesQuery(query, x.Title, x.Condition))
            .GroupBy(x => x.ObservedDate)
            .ToDictionary(x => x.Key, x => new { Price = HistoricalComparison.Median(x.Select(p => p.Price)), Count = x.Select(p => p.Source).Distinct().Count() });

        var localSnapshots = snapshots
            .Where(x => !x.Source.StartsWith("PricesAPI:", StringComparison.Ordinal)
                && HistoricalComparison.MatchesQuery(query, x.Title, x.Condition));
        var localObservations = await db.LocalMarketObservations.AsNoTracking()
            .Where(x => x.RawCurrency == "ETB" && x.RawPrice > 0 && !x.IsDuplicate && !x.IsPotentialOutlier
                && (x.ClassificationStatus == LocalObservationStatus.ValidForStatistics || x.ClassificationStatus == LocalObservationStatus.ManuallyApproved)
                && x.ManualReviewStatus != ManualReviewStatus.Rejected
                && x.RetrievalDate >= new DateTimeOffset(today.AddYears(-2).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero))
            .ToArrayAsync(ct);
        var legacyLocal = localObservations
            .Where(x => HistoricalComparison.MatchesQuery(query, x.ListingTitle, x.Condition.ToString()))
            .Select(x => new { Date = DateOnly.FromDateTime(x.RetrievalDate.UtcDateTime), x.RawPrice, Source = x.Marketplace, ListingId = x.SourceListingId });
        var locals = localSnapshots.Select(x => new { Date = x.ObservedDate, x.Price, Source = x.Source, x.ListingId })
            .Concat(legacyLocal.Select(x => new { x.Date, Price = x.RawPrice, x.Source, x.ListingId }))
            .DistinctBy(x => (x.Date, x.Source, x.ListingId))
            .GroupBy(x => x.Date)
            .ToDictionary(x => x.Key, x => new { Price = HistoricalComparison.Median(x.Select(p => p.Price)), Count = x.Count() });

        var internationalDate = international.Count == 0 ? (DateOnly?)null : international.Keys.Max();
        var localDate = locals.Count == 0 ? (DateOnly?)null : locals.Keys.Max();
        var latestInternational = internationalDate.HasValue ? international[internationalDate.Value].Price : null;
        var latestLocal = localDate.HasValue ? locals[localDate.Value].Price : null;
        var sameDateLocal = internationalDate.HasValue ? locals.GetValueOrDefault(internationalDate.Value)?.Price : null;
        var baseline = international.GetValueOrDefault(today.AddMonths(-6))?.Price;
        var dates = international.Keys.Concat(locals.Keys).Distinct().Order().ToArray();
        var rows = dates.Select(day =>
        {
            international.TryGetValue(day, out var i);
            locals.TryGetValue(day, out var l);
            return new Row(day, i?.Price, l?.Price, i?.Price is > 0 && l?.Price is > 0 ? l.Price - i.Price : null,
                HistoricalComparison.Percent(l?.Price, i?.Price), i?.Count ?? 0, l?.Count ?? 0);
        }).ToArray();
        var messages = new List<string>();
        if (international.Count == 0) messages.Add("No matching international observations have been saved from previous searches.");
        if (locals.Count == 0) messages.Add("No matching local observations have been saved from previous searches.");

        return Ok(new
        {
            product = query,
            currency = "ETB",
            asOf = today,
            rows,
            summary = new
            {
                currentInternationalPrice = latestInternational,
                internationalAsOf = internationalDate,
                currentLocalPrice = latestLocal,
                localAsOf = localDate,
                sixMonthChange = HistoricalComparison.Percent(latestInternational, baseline),
                differencePercent = HistoricalComparison.Percent(sameDateLocal, latestInternational)
            },
            messages,
            methodology = "Values are medians of comparable ETB observations already saved in the database. No provider or live market is queried; missing values remain unavailable."
        });
    }

    [HttpPost("compare")]
    public async Task<IActionResult> Compare(CompareRequest request, CancellationToken ct)
    {
        if (request.SearchId is null || !cache.TryGetValue<Selection>($"selection:{request.SearchId}", out var selection) || selection!.Owner != Owner)
            return BadRequest(new { message = "Product search expired. Search again to confirm exact products." });
        var chosen = selection.Candidates.Where(x => request.Keys?.Contains(x.Key) == true).ToArray();
        if (chosen.Length == 0 || chosen.Length != request.Keys!.Distinct().Count() || chosen.GroupBy(x => x.Market).Any(x => x.Count() > 1))
            return BadRequest(new { message = "Confirm one exact product per country, in at least one country." });
        var memoKey = $"comparison:{request.SearchId}:{string.Join(',', chosen.Select(x => x.Key).Order())}";
        if (cache.TryGetValue<object>(memoKey, out var memo)) return Ok(memo);
        var messages = new List<string>();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var internationalSources = chosen.Select(x => $"PricesAPI:{x.Market.ToUpperInvariant()}").Distinct().ToArray();
        var candidateIds = chosen.Select(x => x.Id).Distinct().ToArray();
        var internationalSnapshots = await db.Set<MarketPriceSnapshot>().AsNoTracking()
            .Where(x => internationalSources.Contains(x.Source) && candidateIds.Contains(x.ListingId)
                && x.Currency == "ETB" && x.Price > 0 && x.ObservedDate <= today)
            .ToArrayAsync(ct);
        var international = internationalSnapshots
            .Where(x => HistoricalComparison.Matches(selection.Product, x.Title, x.Condition))
            .GroupBy(x => x.ObservedDate)
            .ToDictionary(x => x.Key, x => new { Price = HistoricalComparison.Median(x.Select(p => p.Price)), Count = x.Select(p => p.Source).Distinct().Count() });
        if (international.Count == 0)
            messages.Add("No saved international observations were found for the confirmed product. Run the exact-product search again to capture a new database observation.");

        var currentDate = international.Count == 0 ? (DateOnly?)null : international.Keys.Max();
        var currentPrice = currentDate.HasValue ? international[currentDate.Value].Price : null;
        var captured = await db.Set<MarketPriceSnapshot>().AsNoTracking()
            .Where(x => x.Currency == "ETB" && x.Price > 0 && x.ObservedDate <= today && !x.Source.StartsWith("PricesAPI:"))
            .ToArrayAsync(ct);
        var existing = await db.LocalMarketObservations.AsNoTracking().Where(x => x.RawCurrency == "ETB" && x.RawPrice > 0 && !x.IsDuplicate && !x.IsPotentialOutlier
            && (x.ClassificationStatus == LocalObservationStatus.ValidForStatistics || x.ClassificationStatus == LocalObservationStatus.ManuallyApproved)
            && x.ManualReviewStatus != ManualReviewStatus.Rejected).ToArrayAsync(ct);
        var legacy = existing.Select(x => new MarketPriceSnapshot { Source = x.Marketplace, ListingId = x.SourceListingId,
            Title = x.ListingTitle, Url = x.ListingUrl, Condition = x.Condition.ToString(), Price = x.RawPrice, Currency = x.RawCurrency,
            ObservedDate = DateOnly.FromDateTime(x.RetrievalDate.UtcDateTime) });
        var localRows = captured.Concat(legacy).Where(x => x.ObservedDate <= today && HistoricalComparison.Matches(selection.Product, x.Title, x.Condition))
            .DistinctBy(x => (x.Source, x.ListingId, x.ObservedDate)).ToArray();
        if (localRows.Length == 0) messages.Add("No saved local observations were found for this exact product. Search the local market first to capture a database observation.");
        var locals = localRows.GroupBy(x => x.ObservedDate).ToDictionary(x => x.Key, x => new { Price = HistoricalComparison.Median(x.Select(p => p.Price)), Count = x.Count() });
        var first = international.Keys.Concat(locals.Keys).DefaultIfEmpty(today.AddMonths(-6)).Min();
        if (first > today.AddMonths(-12)) first = today.AddMonths(-12);
        var rows = new List<Row>();
        for (var day = first; day <= today; day = day.AddDays(1))
        {
            international.TryGetValue(day, out var i); locals.TryGetValue(day, out var l);
            rows.Add(new(day, i?.Price, l?.Price, l?.Price - i?.Price, HistoricalComparison.Percent(l?.Price, i?.Price), i?.Count ?? 0, l?.Count ?? 0));
        }
        var localCurrentDate = locals.Count == 0 ? (DateOnly?)null : locals.Keys.Max();
        var localCurrent = localCurrentDate.HasValue ? locals[localCurrentDate.Value].Price : null;
        var localOnInternationalDate = currentDate.HasValue ? locals.GetValueOrDefault(currentDate.Value)?.Price : null;
        var baseline = currentDate.HasValue ? international.GetValueOrDefault(currentDate.Value.AddMonths(-6))?.Price : null;
        var result = new {
            currency = "ETB", asOf = today, product = selection.Product.Query, rows,
            summary = new { currentInternationalPrice = currentPrice, internationalAsOf = currentDate, currentLocalPrice = localCurrent,
                sixMonthChange = HistoricalComparison.Percent(currentPrice, baseline), differencePercent = HistoricalComparison.Percent(localOnInternationalDate, currentPrice) },
            messages, countries = chosen.Select(x => x.Market.ToUpperInvariant()),
            methodology = "Daily medians are calculated only from ETB observations already saved in the database by earlier exact-product and local-market searches. The comparison never calls provider history endpoints or live marketplace searches. New international observations are normalized to ETB and saved when the exact-product search runs; missing days stay empty. Six-month change needs an observation on the exact baseline date. The current difference requires same-date prices."
        };
        cache.Set(memoKey, result, TimeSpan.FromMinutes(10));
        return Ok(result);
    }

    private async Task PersistInternationalSnapshotsAsync(IEnumerable<ProductCandidate> candidates, List<string> messages, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var priced = candidates.Where(x => x.Price is > 0).ToArray();
        if (priced.Length == 0) return;

        var rates = new Dictionary<DateOnly, Dictionary<string, decimal>>();
        foreach (var date in priced.Select(x => x.ObservedDate ?? today).Distinct())
            rates[date] = await fx.RatesAsync(date, ct);

        var skipped = 0;
        var rows = priced.Select(candidate =>
        {
            var date = candidate.ObservedDate ?? today;
            var currency = candidate.Currency.Trim().ToUpperInvariant();
            if (!rates.TryGetValue(date, out var daily) || !daily.TryGetValue(currency, out var rate))
            {
                skipped++;
                return null;
            }

            var source = $"PricesAPI:{candidate.Market.ToUpperInvariant()}";
            return new MarketPriceSnapshot
            {
                Id = SnapshotId(source, candidate.Id, date), Source = source, ListingId = candidate.Id,
                Title = candidate.Title, Url = $"pricesapi://{candidate.Market}/{candidate.Id}", Condition = "New",
                Price = candidate.Price!.Value * rate, Currency = "ETB", ObservedDate = date
            };
        }).Where(x => x is not null).Cast<MarketPriceSnapshot>().ToArray();

        if (rows.Length > 0)
        {
            var ids = rows.Select(x => x.Id).ToArray();
            var existing = await db.Set<MarketPriceSnapshot>().Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            foreach (var row in rows)
            {
                if (existing.TryGetValue(row.Id, out var saved))
                {
                    saved.Title = row.Title; saved.Price = row.Price; saved.Currency = row.Currency;
                    saved.ObservedDate = row.ObservedDate; saved.Condition = row.Condition;
                }
                else db.Set<MarketPriceSnapshot>().Add(row);
            }
            await db.SaveChangesAsync(ct);
        }

        if (skipped > 0)
            messages.Add($"{skipped} international observations were not saved because an ETB exchange rate was unavailable on the observation date.");
    }

    private static Guid SnapshotId(string source, string listingId, DateOnly date)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{source}|{listingId}|{date:yyyy-MM-dd}"));
        return new Guid(bytes[..16]);
    }
}
