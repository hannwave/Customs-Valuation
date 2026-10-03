using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Queries;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using Xunit;

namespace SES.Customs.Tests;

public sealed class AuditHistoryTests
{
    private static IQueryable<AuditLog> History() => Enumerable.Range(0, 251).Select(i => new AuditLog {
        Id = Guid.NewGuid(), Module = "Valuations", Action = i == 0 ? "VALUATION_REVIEWED" : "VALUATION_CREATED",
        Username = "officer", OccurredAt = DateTimeOffset.UnixEpoch.AddDays(i)
    }).AsQueryable();

    [Fact]
    public void FiltersFindRecordsBeyondLatestTwoHundredAndCountBeforePaging()
    {
        var all = History();
        Assert.Equal(251, AuditHistoryQuery.Filter(all, "valuations", null, null, null, null).Count());
        var reviewed = AuditHistoryQuery.Filter(all, "valuations", "VALUATION_REVIEWED", null, null, null);
        Assert.Single(reviewed);
        Assert.Equal("VALUATION_REVIEWED", AuditHistoryQuery.Page(reviewed, 1, 20, false).Single().Action);
        Assert.Equal(11, AuditHistoryQuery.Page(all, 13, 20, false).Count());
    }

    [Theory]
    [InlineData("VALUATION_CREATED", "Valuations")]
    [InlineData("VALUATION_UPDATED", "Valuation")]
    [InlineData("VALUATION_REVIEWED", "Valuations")]
    [InlineData("ETHIOPIAN_IMPORT_TAX_ASSESSMENT_COMPLETED", "EthiopianImportTaxAssessment")]
    public void AllValuationActionsBelongToValuations(string action, string module)
    {
        var events = new[] { new AuditLog { Action = action, Module = module } }.AsQueryable();
        Assert.Single(AuditHistoryQuery.Filter(events, "valuations", null, null, null, null));
        Assert.Empty(AuditHistoryQuery.Filter(events, "changes", null, null, null, null));
    }

    [Fact]
    public void DateRangeIsInclusiveStartExclusiveEndAndCaseOrderIsChronological()
    {
        var filtered = AuditHistoryQuery.Filter(History(), null, null, DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch.AddDays(2), "officer");
        Assert.Equal(2, filtered.Count());
        Assert.Equal("VALUATION_REVIEWED", AuditHistoryQuery.Page(filtered, 1, 1, true).Single().Action);
    }

    [Fact]
    public void PostgreSqlTranslatesFiltersAndPaginationWithoutLoadingHistory()
    {
        using var db = new CustomsDbContext(new DbContextOptionsBuilder<CustomsDbContext>().UseNpgsql("Host=localhost;Database=not_connected").Options);
        var filtered = AuditHistoryQuery.Filter(db.AuditLogs, "valuations", "VALUATION_REVIEWED", DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch.AddDays(1), "officer");
        var sql = AuditHistoryQuery.Page(filtered, 2, 20, true).ToQueryString();
        Assert.Contains("WHERE", sql); Assert.Contains("LIMIT", sql); Assert.Contains("OFFSET", sql); Assert.Contains("ORDER BY", sql);
    }
}
