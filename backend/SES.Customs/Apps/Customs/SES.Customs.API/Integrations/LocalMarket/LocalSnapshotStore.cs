using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Integrations.LocalMarket;

public sealed class LocalSnapshotStore(CustomsDbContext db)
{
    public async Task SaveAsync(LocalMarketOfferDto[] offers, CancellationToken ct)
    {
        var day = DateOnly.FromDateTime(DateTime.UtcNow);
        var rows = offers.Where(x => x.Price > 0).Select(x => new {
            id = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"{x.Source}|{x.SourceListingId}|{day:yyyy-MM-dd}"))[..16]),
            source = x.Source, listing = x.SourceListingId, title = x.Title, url = x.ProductUrl,
            condition = x.Condition ?? "", price = x.Price, currency = x.Currency, day
        }).DistinctBy(x => x.id).ToArray();
        if (rows.Length == 0) return;
        if (!db.Database.IsRelational())
        {
            foreach (var r in rows)
            {
                if (!await db.Set<SES.Customs.Core.Models.MarketPriceSnapshot>().AnyAsync(x => x.Id == r.id, ct))
                {
                    db.Set<SES.Customs.Core.Models.MarketPriceSnapshot>().Add(new SES.Customs.Core.Models.MarketPriceSnapshot
                    {
                        Id = r.id,
                        Source = r.source,
                        ListingId = r.listing,
                        Title = r.title,
                        Url = r.url,
                        Condition = r.condition,
                        Price = r.price,
                        Currency = r.currency,
                        ObservedDate = r.day
                    });
                }
            }
            await db.SaveChangesAsync(ct);
            return;
        }
        var json = JsonSerializer.Serialize(rows);
        // One immutable first observation per listing per UTC day; concurrent searches are idempotent.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO market_price_snapshots ("Id", "Source", "ListingId", "Title", "Url", "Condition", "Price", "Currency", "ObservedDate")
            SELECT id, source, listing, title, url, condition, price, currency, day
            FROM jsonb_to_recordset(CAST({json} AS jsonb)) AS x(id uuid, source text, listing text, title text, url text, condition text, price numeric, currency text, day date)
            ON CONFLICT ("Id") DO NOTHING
            """, ct);
    }
}
