using Microsoft.EntityFrameworkCore;
using SES.Customs.Core.Features.Analytics.Service;
using SES.Customs.Core.Features.ExchangeRates.Service;
using SES.Customs.Core.Features.HsCodes.Contract.Query;
using SES.Customs.Core.Features.HsCodes.Handler.Query;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using SES.Customs.Infrastructure.Repository;
using Xunit;
namespace SES.Customs.Tests;
public sealed class BusinessRuleTests
{
    [Fact]
    public void Location_scope_expands_children_without_looping_on_cycles()
    {
        var branch = Guid.NewGuid(); var dryPort = Guid.NewGuid(); var station = Guid.NewGuid();
        var locations = new[] { (branch, (Guid?)station), (dryPort, (Guid?)branch), (station, (Guid?)dryPort) };
        var scope = AccessRules.Expand(locations, new[] { (branch, true) });
        Assert.Equal(3, scope.Count);
    }

    [Fact]
    public void Customs_admin_can_manage_only_officers_fully_inside_scope()
    {
        var allowed = Guid.NewGuid(); var outside = Guid.NewGuid();
        Assert.True(AccessRules.CanManageOfficer(AccessRules.CustomsAdmin, new HashSet<Guid> { allowed }, AccessRules.Officer, new[] { allowed }));
        Assert.False(AccessRules.CanManageOfficer(AccessRules.CustomsAdmin, new HashSet<Guid> { allowed }, AccessRules.Officer, new[] { allowed, outside }));
        Assert.False(AccessRules.CanManageOfficer(AccessRules.CustomsAdmin, new HashSet<Guid> { allowed }, AccessRules.CustomsAdmin, new[] { allowed }));
    }

    [Fact]
    public void Price_analysis_permissions_are_exclusive_to_customs_officers()
    {
        var pricePermissions = new[] { "reference_prices.view", "local_prices.view", "historical_prices.view", "statistics.view", "trends.view", "country_analysis.view", "outliers.view" };
        Assert.All(pricePermissions, permission => Assert.Contains(permission, AccessRules.Permissions(AccessRules.Officer)));
        Assert.All(pricePermissions, permission => Assert.DoesNotContain(permission, AccessRules.Permissions(AccessRules.CustomsAdmin)));
        Assert.All(pricePermissions, permission => Assert.DoesNotContain(permission, AccessRules.Permissions(AccessRules.SystemAdmin)));
    }
    private static ComparableObservation Observation(decimal value, PricePool pool = PricePool.International,
        string unit = "piece", string key = "reviewed-group-v1", string currency = "ETB") => new(pool, value, currency, unit, key);
    [Fact] public void CalculatesSrsExample()
    {
        var result = PriceStatisticsCalculator.Calculate(new[] {95m,100m,105m,110m,120m}.Select(x => Observation(x)).ToArray());
        Assert.Equal(5, result.Count); Assert.Equal(95m, result.Minimum); Assert.Equal(120m, result.Maximum);
        Assert.Equal(106m, result.Mean); Assert.Equal(105m, result.Median);
        Assert.Equal(Math.Sqrt(74), result.PopulationStandardDeviation!.Value, 8);
    }
    [Theory]
    [InlineData(PricePool.Local)] [InlineData(PricePool.HistoricalCustoms)]
    public void RejectsMixedPools(PricePool pool) => Assert.Throws<ArgumentException>(() =>
        PriceStatisticsCalculator.Calculate([Observation(10), Observation(20, pool)]));
    [Fact] public void RejectsMixedUnitsAndComparisonGroupsAndCurrencies()
    {
        Assert.Throws<ArgumentException>(() => PriceStatisticsCalculator.Calculate([Observation(10), Observation(20, unit: "kg")]));
        Assert.Throws<ArgumentException>(() => PriceStatisticsCalculator.Calculate([Observation(10), Observation(20, key: "retail")]));
        Assert.Throws<ArgumentException>(() => PriceStatisticsCalculator.Calculate([Observation(10), Observation(20, currency: "USD")]));
    }
    [Fact] public void EmptyGroupIsMissingNotZero()
    { var result = PriceStatisticsCalculator.Calculate([]); Assert.Equal(0, result.Count); Assert.Null(result.Mean); }
    [Fact] public void EvenMedianIsMiddleAverage()
    { Assert.Equal(15m, PriceStatisticsCalculator.Calculate([Observation(10), Observation(20)]).Median); }
    [Fact] public void ConversionPreservesOriginalAndProvenance()
    {
        var rate = new ExchangeRate { Id = Guid.NewGuid(), OriginalCurrency = "USD", Rate = 100m,
            RateDate = new(2026,1,1), NbeSourceReference = "TEST-ONLY", RetrievedAt = DateTimeOffset.UtcNow };
        var result = PriceConverter.Convert(95m, "USD", rate.RateDate, rate);
        Assert.Equal(95m, result.OriginalValue); Assert.Equal(9500m, result.ConvertedValue); Assert.Equal(rate.Id, result.RateId);
        Assert.Throws<ArgumentException>(() => PriceConverter.Convert(95m, "USD", new(2026,1,2), rate));
        Assert.Throws<ArgumentException>(() => PriceConverter.Convert(95m, "EUR", rate.RateDate, rate));
        Assert.Throws<InvalidOperationException>(() => PriceConverter.Convert(95m, "USD", rate.RateDate, null));
    }
    [Fact] public async Task HsSearchSupportsRevisionAndLeadingZeroes()
    {
        var handler = new SearchHsCodesQueryHandler(new DemoHsCodeRepository());
        var found = await handler.Handle(new("0901.11", DemoHsCodeRepository.RevisionId), default);
        Assert.Single(found.Items); Assert.Equal("090111", found.Items[0].Code);
        Assert.Empty((await handler.Handle(new("090111", Guid.NewGuid()), default)).Items);
        await Assert.ThrowsAsync<ArgumentException>(() => handler.Handle(new(null, null, 0), default));
    }
    [Fact] public void EfModelGeneratesSeparatePoolTablesAndEvidenceForeignKeys()
    {
        using var db = new CustomsDbContext(new DbContextOptionsBuilder<CustomsDbContext>()
            .UseNpgsql("Host=localhost;Database=not_connected").Options);
        var sql = db.Database.GenerateCreateScript();
        Assert.Contains("CREATE TABLE reference_prices", sql); Assert.Contains("CREATE TABLE local_prices", sql);
        Assert.Contains("CREATE TABLE historical_customs_prices", sql); Assert.Contains("ck_one_evidence_pool", sql);
        Assert.Contains("REFERENCES reference_prices", sql); Assert.Contains("REFERENCES local_prices", sql);
        if (Environment.GetEnvironmentVariable("CUSTOMS_SCHEMA_OUTPUT") is { Length: > 0 } path) File.WriteAllText(path, sql);
    }
    [Fact] public void CoreHasNoEfOrInfrastructureAssemblyReference()
    {
        var names = typeof(HsCode).Assembly.GetReferencedAssemblies().Select(x => x.Name ?? "");
        Assert.DoesNotContain(names, x => x.Contains("EntityFramework") || x.Contains("Infrastructure") || x.Contains("AspNetCore"));
    }
}
