using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using SES.Customs.API.Controllers;
using SES.Customs.API.Integrations.Comtrade;
using Xunit;

namespace SES.Customs.Tests;

public sealed class ComtradeBenchmarkTests
{
    [Theory]
    [InlineData(5, 10)]
    [InlineData(6, 20)]
    [InlineData(9, 10000)]
    [InlineData(11, 120)]
    public async Task UsesNumericUnitsWhenPreviewDescriptionsAreNull(int unitCode, int expectedQuantity)
    {
        using var fixture = new Fixture(_ => Data(Row(unit: unitCode, value: 120000)));
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.Equal("u", result.Unit);
        Assert.Equal(expectedQuantity, result.Quantity);
        Assert.Equal(Math.Round(120000m / expectedQuantity, 2), result.UnitValue);
        Assert.False(result.IsMirror);
        Assert.Equal("CIF", result.ValuationBasis);
        Assert.Single(fixture.Requests);
    }

    [Theory]
    [InlineData(8, "kg")]
    [InlineData(10, "pack")]
    public async Task DoesNotPretendWeightsOrPackagesAreItems(int unitCode, string expectedUnit)
    {
        using var fixture = new Fixture(_ => Data(Row(unit: unitCode)));
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.Equal(expectedUnit, result.Unit);
        Assert.Equal(10m, result.Quantity);
    }

    [Fact]
    public async Task UsesExplicitAlternativeItemQuantityAndPreservesEstimatedFlag()
    {
        var row = Row(unit: 8, quantity: 100, value: 300);
        row["altQty"] = 15;
        row["altQtyUnitCode"] = 5;
        row["isAltQtyEstimated"] = true;
        using var fixture = new Fixture(_ => Data(row));
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.Equal("u", result.Unit);
        Assert.Equal(20m, result.UnitValue);
        Assert.True(result.QuantityEstimated);
    }

    [Fact]
    public async Task PrefersOlderEthiopiaImportsToNewerSupplierReports()
    {
        using var fixture = new Fixture(uri => uri.Query.Contains("period=2023") ? Data(Row(year: 2023)) : Data());
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.Equal(2023, result.Period);
        Assert.False(result.IsMirror);
        Assert.Equal(3, fixture.Requests.Count);
        Assert.All(fixture.Requests, uri => Assert.Contains("reporterCode=231", uri.Query));
    }

    [Theory]
    [InlineData("100630", "341803946.55", "190490947.412", "0.56")]
    [InlineData("240210", "605.24", "78304.831", "129.38")]
    public async Task AcceptsMatchingRiceAndCigarCategoryTotalsAggregatedFromTariffLines(string code, string quantity, string value, string expectedPrice)
    {
        var culture = System.Globalization.CultureInfo.InvariantCulture;
        var row = Row(year: 2023, unit: 8, quantity: decimal.Parse(quantity, culture), value: decimal.Parse(value, culture), code: code, aggregate: true);
        using var fixture = new Fixture(uri => uri.Query.Contains("period=2023") ? Data(row) : Data());
        var result = await fixture.Client.SearchAsync(code, CancellationToken.None);
        Assert.False(result.IsMirror);
        Assert.Equal(2023, result.Period);
        Assert.Equal("CIF", result.ValuationBasis);
        Assert.Equal("kg", result.Unit);
        Assert.Equal(decimal.Parse(expectedPrice, culture), result.UnitValue);
        Assert.Equal(decimal.Parse(quantity, culture), result.Quantity);
        Assert.Equal(231, Assert.Single(result.Reporters).Code);
        Assert.Equal(3, fixture.Requests.Count);
    }

    [Fact]
    public async Task AcceptsMatchingAggregatedSupplierTotalsWithoutIncludingParentOrWorldTotals()
    {
        var china = Row(reporter: 156, mirror: true, quantity: 10, value: 100, aggregate: true);
        var usa = Row(reporter: 842, mirror: true, quantity: 30, value: 900);
        using var fixture = new Fixture(uri => uri.Query.Contains("flowCode=M") ? Data() : Data(
            china, china, usa, Row(reporter: 528, mirror: true, code: "8517", aggregate: true, value: 100000),
            Row(reporter: 0, mirror: true, aggregate: true, value: 100000)));
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.True(result.IsMirror);
        Assert.Equal(2, result.ReporterCount);
        Assert.Equal(25m, result.UnitValue);
        Assert.Equal(1000m, result.TradeValue);
        Assert.Equal(40m, result.Quantity);
    }

    [Fact]
    public async Task ItemTariffUsesSupplierCountsRatherThanReplacingPhoneBenchmarkWithImportWeight()
    {
        var imports = Row(unit: 8, quantity: 20, value: 1000, aggregate: true);
        using var fixture = new Fixture(uri => uri.Query.Contains("flowCode=M") ? Data(imports)
            : Data(Row(reporter: 156, mirror: true, quantity: 100, value: 2000, aggregate: true)));
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None, "u");
        Assert.Equal("u", result.Unit);
        Assert.True(result.IsMirror);
        Assert.Equal(20m, result.UnitValue);
        Assert.Equal(4, fixture.Requests.Count);
    }

    [Fact]
    public async Task KilogramTariffUsesWeightEvenWhenAlternativeCountsExistAndCachesUnitsSeparately()
    {
        var row = Row(unit: 8, quantity: 10, value: 100, aggregate: true);
        row["altQty"] = 50;
        row["altQtyUnitCode"] = 5;
        using var fixture = new Fixture(_ => Data(row));
        var weight = await fixture.Client.SearchAsync("851713", CancellationToken.None, "kg");
        var count = await fixture.Client.SearchAsync("851713", CancellationToken.None, "u");
        Assert.Equal("kg", weight.Unit);
        Assert.Equal(10m, weight.UnitValue);
        Assert.Equal("u", count.Unit);
        Assert.Equal(2m, count.UnitValue);
        Assert.Equal(2, fixture.Requests.Count);
        Assert.Same(weight, await fixture.Client.SearchAsync("851713", CancellationToken.None, "kg"));
        Assert.Same(count, await fixture.Client.SearchAsync("851713", CancellationToken.None, "u"));
        Assert.Equal(2, fixture.Requests.Count);
    }

    [Fact]
    public async Task MissingRequestedCountsRemainExplicitlyLabelledWeightReference()
    {
        using var fixture = new Fixture(uri => uri.Query.Contains("flowCode=M") ? Data(Row(unit: 8, quantity: 10, value: 100)) : Data());
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None, "u");
        Assert.Equal("kg", result.Unit);
        Assert.False(result.IsMirror);
        Assert.Equal(10m, result.UnitValue);
        Assert.Contains("No benchmark in the requested unit (u)", result.Message);
        Assert.Contains("no weight-to-item conversion", result.Message);
        Assert.Equal(6, fixture.Requests.Count);
    }

    [Fact]
    public async Task FallsBackToQuantityWeightedCompatibleExportsWithoutDoubleCounting()
    {
        var china = Row(reporter: 156, mirror: true, quantity: 10, value: 100);
        var usa = Row(reporter: 842, mirror: true, quantity: 30, value: 900);
        var weightOnly = Row(reporter: 276, mirror: true, unit: 8, quantity: 200, value: 100000);
        var noQuantity = Row(unit: -1, quantity: 0);
        noQuantity["netWgt"] = 10000;
        using var fixture = new Fixture(uri => uri.Query.Contains("flowCode=M") ? Data(noQuantity)
            : Data(china, china, usa, weightOnly, Row(reporter: 528, year: 2024, mirror: true, value: 100000)));
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.True(result.IsMirror);
        Assert.Equal(2025, result.Period);
        Assert.Equal("FOB", result.ValuationBasis);
        Assert.Equal(1000m, result.TradeValue);
        Assert.Equal(40m, result.Quantity);
        Assert.Equal(25m, result.UnitValue);
        Assert.Equal(new[] { 156, 842 }, result.Reporters.Select(reporter => reporter.Code));
        Assert.Equal(2, result.ReporterCount);
        Assert.Contains("not all Ethiopian imports", result.Message);
        Assert.Contains("not equivalent to a CIF", result.Message);
        Assert.DoesNotContain("reporterCode=", result.SourceUrl!);
        Assert.Contains("partnerCode=231", result.SourceUrl!);
        Assert.Equal(4, fixture.Requests.Count);
    }

    [Fact]
    public async Task ExcludesConflictingReporterTotalsAndUnrelatedDimensions()
    {
        var nonmatching = new[] { "cmdCode", "flowCode", "partnerCode", "partner2Code", "customsCode", "motCode", "period", "reporterCode", "isOriginalClassification" }
            .Select(field => { var row = Row(reporter: 528, mirror: true, value: 100000); row[field] = field switch
            {
                "cmdCode" => "851712", "flowCode" => "M", "customsCode" => "C01", "period" => 2024,
                "reporterCode" => 97, "isOriginalClassification" => false, _ => 1
            }; return row; }).ToArray();
        using var fixture = new Fixture(uri => uri.Query.Contains("flowCode=M") ? Data() : Data([
            Row(reporter: 156, mirror: true, value: 100), Row(reporter: 156, mirror: true, value: 200),
            Row(reporter: 842, mirror: true, value: 300), .. nonmatching]));
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.Single(result.Reporters);
        Assert.Equal(842, result.Reporters[0].Code);
        Assert.Equal(30m, result.UnitValue);
    }

    [Fact]
    public async Task SeparatesReportedValuesFromExplicitFobValues()
    {
        var unspecified = Row(reporter: 842, mirror: true, value: 100);
        unspecified["fobvalue"] = null;
        using var fixture = new Fixture(uri => uri.Query.Contains("flowCode=M") ? Data()
            : Data(Row(reporter: 156, mirror: true, value: 200), unspecified));
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.Equal("FOB", result.ValuationBasis);
        Assert.Equal(200m, result.TradeValue);
        Assert.Equal(1, result.ReporterCount);
    }

    [Fact]
    public async Task MissingQuantityIsNoDataNotAnInventedPriceAndIsCached()
    {
        using var fixture = new Fixture(_ => Data());
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.Null(result.UnitValue);
        Assert.Null(result.Period);
        Assert.Empty(result.Reporters);
        Assert.Equal(6, fixture.Requests.Count);
        Assert.Same(result, await fixture.Client.SearchAsync("851713", CancellationToken.None));
        Assert.Equal(6, fixture.Requests.Count);
    }

    [Theory]
    [InlineData("{\"count\":0}")]
    [InlineData("{\"error\":\"Provider failure\",\"data\":[]}")]
    [InlineData("{\"data\":null}")]
    [InlineData("not JSON")]
    public async Task InvalidProviderResponseIsNotCachedAsNoData(string body)
    {
        using var fixture = new Fixture(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) });
        await Assert.ThrowsAnyAsync<JsonException>(() => fixture.Client.SearchAsync("851713", CancellationToken.None));
        await Assert.ThrowsAnyAsync<JsonException>(() => fixture.Client.SearchAsync("851713", CancellationToken.None));
        Assert.Equal(2, fixture.Requests.Count);
    }

    [Fact]
    public async Task RetriesRateLimitOnceAndThenReturnsValidData()
    {
        var attempts = 0;
        using var fixture = new Fixture(_ => ++attempts == 1 ? new HttpResponseMessage(HttpStatusCode.TooManyRequests) : Data(Row()));
        var result = await fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.Equal(10m, result.UnitValue);
        Assert.Equal(2, fixture.Requests.Count);
    }

    [Theory]
    [InlineData(429, 503)]
    [InlineData(503, 502)]
    public async Task PersistentProviderFailureIsActionableAndNotCached(int upstreamStatus, int expectedStatus)
    {
        using var fixture = new Fixture(_ => new HttpResponseMessage((HttpStatusCode)upstreamStatus));
        var exception = await Assert.ThrowsAsync<ComtradeUnavailableException>(() => fixture.Client.SearchAsync("851713", CancellationToken.None));
        Assert.Equal(expectedStatus, exception.StatusCode);
        Assert.Equal(2, fixture.Requests.Count);
        var controller = new CustomsTradeBenchmarkController(fixture.Client);
        var result = Assert.IsType<ObjectResult>(await controller.Search("851713", CancellationToken.None));
        Assert.Equal(expectedStatus, result.StatusCode);
        Assert.Equal(4, fixture.Requests.Count);
    }

    [Fact]
    public async Task ConcurrentIdenticalLookupsReuseOneUpstreamResponse()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var fixture = new Fixture(async (_, ct) => { await release.Task.WaitAsync(ct); return Data(Row()); });
        var first = fixture.Client.SearchAsync("851713", CancellationToken.None);
        var second = fixture.Client.SearchAsync("851713", CancellationToken.None);
        Assert.Single(fixture.Requests);
        release.SetResult();
        var results = await Task.WhenAll(first, second);
        Assert.Same(results[0], results[1]);
        Assert.Single(fixture.Requests);
    }

    [Fact]
    public async Task CancelledLookupReleasesGateForNextRequest()
    {
        var attempts = 0;
        using var fixture = new Fixture(async (_, ct) =>
        {
            if (++attempts == 1) await Task.Delay(Timeout.Infinite, ct);
            return Data(Row());
        });
        using var cancellation = new CancellationTokenSource();
        var first = fixture.Client.SearchAsync("851713", cancellation.Token);
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
        Assert.Equal(10m, (await fixture.Client.SearchAsync("851713", CancellationToken.None)).UnitValue);
    }

    [Fact]
    public async Task NormalizesTariffLineAndRejectsShortHsCodeWithoutCallingProvider()
    {
        using var fixture = new Fixture(_ => Data(Row()));
        var controller = new CustomsTradeBenchmarkController(fixture.Client);
        Assert.IsType<BadRequestObjectResult>(await controller.Search("85.17", CancellationToken.None));
        Assert.IsType<BadRequestObjectResult>(await controller.Search("851713", CancellationToken.None, "box"));
        Assert.Empty(fixture.Requests);
        var result = Assert.IsType<OkObjectResult>(await controller.Search("8517.13.00", CancellationToken.None));
        Assert.Equal("851713", Assert.IsType<CustomsTradeBenchmark>(result.Value).HsCode);
    }

    private static Dictionary<string, object?> Row(int reporter = 231, int year = 2025, bool mirror = false, int unit = 5, decimal quantity = 10, decimal value = 100, string code = "851713", bool aggregate = false) => new()
    {
        ["cmdCode"] = code, ["period"] = year.ToString(), ["reporterCode"] = reporter,
        ["flowCode"] = mirror ? "X" : "M", ["partnerCode"] = mirror ? 231 : 0,
        ["partner2Code"] = 0, ["customsCode"] = "C00", ["motCode"] = 0,
        ["qtyUnitCode"] = unit, ["qtyUnitAbbr"] = null, ["qty"] = quantity,
        ["primaryValue"] = value, [mirror ? "fobvalue" : "cifvalue"] = value,
        ["isOriginalClassification"] = true, ["isAggregate"] = aggregate
    };

    private static HttpResponseMessage Data(params Dictionary<string, object?>[] rows) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(JsonSerializer.Serialize(new { error = "", data = rows }))
    };

    private sealed class Fixture : HttpMessageHandler, IHttpClientFactory
    {
        private readonly Func<Uri, CancellationToken, Task<HttpResponseMessage>> respond;
        private readonly MemoryCache cache = new(new MemoryCacheOptions());
        private readonly HttpClient http;
        public List<Uri> Requests { get; } = [];
        public ComtradeBenchmarkClient Client { get; }

        public Fixture(Func<Uri, HttpResponseMessage> respond) : this((uri, _) => Task.FromResult(respond(uri))) { }
        public Fixture(Func<Uri, CancellationToken, Task<HttpResponseMessage>> respond)
        {
            this.respond = respond;
            http = new HttpClient(this, disposeHandler: false) { BaseAddress = new Uri("https://comtradeapi.un.org/") };
            Client = new ComtradeBenchmarkClient(this, cache, new AdvancingClock());
        }
        public HttpClient CreateClient(string name) => http;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Requests.Add(request.RequestUri!);
            return respond(request.RequestUri!, ct);
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing) { http.Dispose(); cache.Dispose(); }
            base.Dispose(disposing);
        }
    }

    // Advance past request pacing without real sleeps; all requests stay in 2026.
    private sealed class AdvancingClock : TimeProvider
    {
        private int ticks;
        public override DateTimeOffset GetUtcNow() => new DateTimeOffset(2026, 9, 28, 0, 0, 0, TimeSpan.Zero).AddSeconds(Interlocked.Increment(ref ticks) * 20);
    }
}
