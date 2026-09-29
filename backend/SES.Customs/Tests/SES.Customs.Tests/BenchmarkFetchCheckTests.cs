using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SES.Customs.API.Controllers;
using SES.Customs.API.Integrations.Comtrade;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using Xunit;

namespace SES.Customs.Tests;

public sealed class BenchmarkFetchCheckTests
{
    [Theory]
    [InlineData(false, "CIF")]
    [InlineData(true, "FOB")]
    public void VerifiesMatchingImportsAndSupplierExports(bool mirror, string basis)
    {
        var benchmark = ValidBenchmark(mirror);
        var result = BenchmarkFetchVerification.Verify(benchmark, "851713", "u", 2026);
        Assert.Equal("verified", result.Status);
        Assert.Equal(basis, benchmark.ValuationBasis);
        Assert.Equal(9, result.Checks.Count);
    }

    [Fact]
    public void EmptySuccessfulResponseIsNoDataNotVerified()
    {
        var result = BenchmarkFetchVerification.Verify(NoData(), "851713", "u", 2026);
        Assert.Equal("no_data", result.Status);
        Assert.Empty(result.Checks);
    }

    [Fact]
    public void PartialResultWithNoPriceFailsVerification()
    {
        var result = BenchmarkFetchVerification.Verify(ValidBenchmark() with { UnitValue = null }, "851713", "u", 2026);
        Assert.Equal("invalid_result", result.Status);
    }

    [Fact]
    public void WeightResultForItemRequestIsReferenceOnly()
    {
        var result = BenchmarkFetchVerification.Verify(ValidBenchmark() with { Unit = "kg" }, "851713", "u", 2026);
        Assert.Equal("unit_mismatch", result.Status);
        Assert.Contains("Reference only", result.Message);
    }

    [Fact]
    public void TinyPositiveTradeValueMayLegitimatelyRoundToZero()
    {
        var result = BenchmarkFetchVerification.Verify(ValidBenchmark() with { TradeValue = .01m, Quantity = 100, UnitValue = 0 }, "851713", "u", 2026);
        Assert.Equal("verified", result.Status);
    }

    [Fact]
    public void ArithmeticUsesTheSameDecimalRoundingAsTheBenchmark()
    {
        var result = BenchmarkFetchVerification.Verify(ValidBenchmark() with { TradeValue = 10.05m, Quantity = 10, UnitValue = 1.00m }, "851713", "u", 2026);
        Assert.Equal("verified", result.Status);
    }

    [Fact]
    public void WrongCodeCurrencyPriceYearAndReporterFailChecks()
    {
        var invalid = ValidBenchmark() with { HsCode = "100630", Currency = "ETB", UnitValue = 25, Period = 2026, Reporters = [new(156, "China")] };
        var result = BenchmarkFetchVerification.Verify(invalid, "851713", "u", 2026);
        Assert.Equal("invalid_result", result.Status);
        Assert.Contains("HS code", result.Message);
        Assert.Contains("Currency", result.Message);
        Assert.Contains("Year", result.Message);
        Assert.Contains("Price", result.Message);
        Assert.Contains("Reporting countries", result.Message);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("not-a-url")]
    [InlineData("http://comtradeapi.un.org/public/v1/preview/C/A/HS")]
    [InlineData("https://example.com/public/v1/preview/C/A/HS")]
    [InlineData("https://comtradeapi.un.org/public/v1/preview/C/A/HS")]
    public void MissingOrWrongSourceIsInvalidInsteadOfThrowing(string? source)
    {
        var result = BenchmarkFetchVerification.Verify(ValidBenchmark() with { SourceUrl = source }, "851713", "u", 2026);
        Assert.Equal("invalid_result", result.Status);
        Assert.Contains("UN Comtrade source", result.Message);
    }

    [Theory]
    [InlineData("cmdCode=851713", "cmdCode=100630")]
    [InlineData("period=2025", "period=2024")]
    [InlineData("flowCode=M", "flowCode=X")]
    [InlineData("partnerCode=0", "partnerCode=231")]
    [InlineData("motCode=0", "motCode=1")]
    public void SourceMustMatchRequestedDimensions(string before, string after)
    {
        var benchmark = ValidBenchmark();
        var result = BenchmarkFetchVerification.Verify(benchmark with { SourceUrl = benchmark.SourceUrl!.Replace(before, after) }, "851713", "u", 2026);
        Assert.Equal("invalid_result", result.Status);
    }

    [Fact]
    public void DuplicateReportersAndWrongMirrorBasisAreInvalid()
    {
        var benchmark = ValidBenchmark(true) with { ValuationBasis = "CIF", Reporters = [new(156, "China"), new(156, "China")] };
        var result = BenchmarkFetchVerification.Verify(benchmark, "851713", "u", 2026);
        Assert.Equal("invalid_result", result.Status);
        Assert.Contains("Reporting countries", result.Message);
        Assert.Contains("Valuation basis", result.Message);
    }

    [Fact]
    public async Task MissingActiveTariffDoesNotHideAWorkingTradeFetch()
    {
        using var fixture = new Fixture(ValidBenchmark());
        var archived = new HsRevision { Id = Guid.NewGuid(), Name = "Archived tariff", Status = "Archived" };
        fixture.Db.HsRevisions.Add(archived);
        fixture.Db.HsCodes.Add(new HsCode { Id = Guid.NewGuid(), RevisionId = archived.Id, Code = "851713", DescriptionEn = "Smartphones" });
        await fixture.Db.SaveChangesAsync();
        var result = await fixture.Check();
        Assert.Equal("missing", result.Catalogue.Status);
        Assert.Equal("Active tariff", result.Catalogue.RevisionName);
        Assert.Equal("verified", result.Trade.Status);
        Assert.NotNull(result.Benchmark);
        Assert.Empty(fixture.Requests);
    }

    [Fact]
    public async Task PresentActiveTariffAndEmptyTradeDataAreSeparateResults()
    {
        using var fixture = new Fixture(NoData());
        fixture.Db.HsCodes.Add(new HsCode { Id = Guid.NewGuid(), RevisionId = fixture.Revision.Id, Code = "851713", DescriptionEn = "Smartphones" });
        await fixture.Db.SaveChangesAsync();
        var result = await fixture.Check();
        Assert.Equal("present", result.Catalogue.Status);
        Assert.Equal("no_data", result.Trade.Status);
        Assert.Null(result.Benchmark!.UnitValue);
    }

    [Fact]
    public async Task NullHsCodeCanMatchTheTariffNumberUsedByTheDashboard()
    {
        using var fixture = new Fixture(ValidBenchmark());
        var hs = new HsCode { Id = Guid.NewGuid(), RevisionId = fixture.Revision.Id, Code = null, DescriptionEn = "Smartphones" };
        fixture.Db.HsCodes.Add(hs);
        fixture.Db.NationalTariffLines.Add(new NationalTariffLine { Id = Guid.NewGuid(), HsCodeId = hs.Id, Code = "TEST", TariffItemNo = "8517.13.00", DescriptionEn = "Smartphones" });
        await fixture.Db.SaveChangesAsync();
        Assert.Equal("present", (await fixture.Check()).Catalogue.Status);
    }

    [Fact]
    public async Task NoActiveRevisionDoesNotFallBackToArchivedCatalogue()
    {
        using var fixture = new Fixture(ValidBenchmark());
        fixture.Revision.Status = "Archived";
        await fixture.Db.SaveChangesAsync();
        var result = await fixture.Check();
        Assert.Equal("missing", result.Catalogue.Status);
        Assert.Null(result.Catalogue.RevisionName);
    }

    [Fact]
    public async Task ProviderRateLimitReturnsAnApiErrorWithCatalogueResult()
    {
        using var fixture = new Fixture(null);
        var result = await fixture.Check();
        Assert.Equal("api_error", result.Trade.Status);
        Assert.Equal(503, result.Trade.HttpStatus);
        Assert.Null(result.Benchmark);
        Assert.Equal("missing", result.Catalogue.Status);
        Assert.Single(fixture.Requests);
    }

    [Fact]
    public async Task RejectsInvalidInputBeforeProviderCalls()
    {
        using var fixture = new Fixture(null);
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.Check("1006", fixture.Db, CancellationToken.None));
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.Check("851713", fixture.Db, CancellationToken.None, "pack"));
        Assert.Empty(fixture.Requests);
    }

    private static CustomsTradeBenchmark ValidBenchmark(bool mirror = false) => new("851713", 2025, mirror ? "Supplier countries" : "Ethiopia", "USD", "u",
        100, 10, 10, "https://comtradeapi.un.org/public/v1/preview/C/A/HS?" + (mirror ? "partnerCode=231&flowCode=X" : "reporterCode=231&partnerCode=0&flowCode=M")
        + "&period=2025&cmdCode=851713&partner2Code=0&customsCode=C00&motCode=0&maxRecords=500",
        "Category benchmark only.", mirror, mirror ? "Supplier exports" : "Ethiopia imports", mirror ? "FOB" : "CIF",
        [new(mirror ? 156 : 231, mirror ? "China" : "Ethiopia")], false);

    private static CustomsTradeBenchmark NoData() => new("851713", null, "Ethiopia", "USD", null, null, null, null, null,
        "No usable reported quantity.", false, "No usable trade benchmark", null, [], false);

    private sealed class Fixture : HttpMessageHandler, IHttpClientFactory
    {
        private readonly MemoryCache cache = new(new MemoryCacheOptions());
        private readonly HttpClient http;
        public CustomsDbContext Db { get; } = new(new DbContextOptionsBuilder<CustomsDbContext>().UseInMemoryDatabase($"benchmark-check-{Guid.NewGuid()}").Options);
        public HsRevision Revision { get; } = new() { Id = Guid.NewGuid(), Name = "Active tariff", Status = "Active", EffectiveDate = new(2022, 1, 1) };
        public CustomsTradeBenchmarkController Controller { get; }
        public List<Uri> Requests { get; } = [];
        public Fixture(CustomsTradeBenchmark? benchmark)
        {
            http = new HttpClient(this, disposeHandler: false) { BaseAddress = new Uri("https://comtradeapi.un.org/") };
            if (benchmark is not null) cache.Set($"comtrade:benchmark:v4:851713:{DateTimeOffset.UtcNow.Year - 1}:u", benchmark);
            Controller = new(new ComtradeBenchmarkClient(this, cache));
            Db.HsRevisions.Add(Revision);
            Db.SaveChanges();
        }
        public async Task<BenchmarkFetchCheck> Check() => Assert.IsType<BenchmarkFetchCheck>(
            Assert.IsType<OkObjectResult>(await Controller.Check("8517.13.00", Db, CancellationToken.None, " U ")).Value);
        public HttpClient CreateClient(string name) => http;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Add(request.RequestUri!);
            var response = new HttpResponseMessage(HttpStatusCode.TooManyRequests);
            response.Headers.RetryAfter = new(System.TimeSpan.FromSeconds(20));
            return Task.FromResult(response);
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing) { http.Dispose(); cache.Dispose(); Db.Dispose(); }
            base.Dispose(disposing);
        }
    }
}
