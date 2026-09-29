using Microsoft.EntityFrameworkCore;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using SES.Customs.Infrastructure.Repository;
using Xunit;

namespace SES.Customs.Tests;

public sealed class HsCodeSearchTests
{
    [Fact]
    public async Task RiceSearchReturnsAllRiceTypesWithoutChoosingOneOrMatchingUnrelatedWords()
    {
        using var db = CreateDatabase();
        var revision = new HsRevision { Id = Guid.NewGuid(), Name = "Test tariff", Status = "Active", EffectiveDate = new(2026, 1, 1) };
        db.HsRevisions.Add(revision);
        foreach (var (code, description) in new[] {
            ("100610", "Rice in the husk"), ("100620", "Husked rice"), ("100630", "Milled rice"), ("100640", "Broken rice"),
            ("130212", "Of liquorice"), ("330610", "Dentifrices"), ("991006", "Not rice; contains heading digits only as a suffix") })
            db.HsCodes.Add(new HsCode { Id = Guid.NewGuid(), RevisionId = revision.Id, Code = code, DescriptionEn = description });
        await db.SaveChangesAsync();
        var result = await new HsCodeRepository(db).SearchAsync("Rice", null, 1, 8, CancellationToken.None);
        Assert.Equal(4, result.TotalCount);
        Assert.Equal(new[] { "100610", "100620", "100630", "100640" }, result.Items.Select(item => item.Code));
    }

    [Fact]
    public async Task MissingRiceCategoriesProduceNoMatchRatherThanAnUnrelatedTariff()
    {
        using var db = CreateDatabase();
        var revision = new HsRevision { Id = Guid.NewGuid(), Name = "Incomplete test tariff", Status = "Active", EffectiveDate = new(2026, 1, 1) };
        db.HsRevisions.Add(revision);
        db.HsCodes.Add(new HsCode { Id = Guid.NewGuid(), RevisionId = revision.Id, Code = "130212", DescriptionEn = "Of liquorice" });
        db.HsCodes.Add(new HsCode { Id = Guid.NewGuid(), RevisionId = revision.Id, Code = "330610", DescriptionEn = "Dentifrices" });
        await db.SaveChangesAsync();
        var result = await new HsCodeRepository(db).SearchAsync("rice", null, 1, 8, CancellationToken.None);
        Assert.Empty(result.Items);
        Assert.Equal(0, result.TotalCount);
    }

    private static CustomsDbContext CreateDatabase() => new(new DbContextOptionsBuilder<CustomsDbContext>()
        .UseInMemoryDatabase($"hs-search-{Guid.NewGuid()}").Options);
}
