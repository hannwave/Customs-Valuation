using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace SES.Customs.Tests;

public sealed class LocalMarketApiIntegrationTests
{
    [Fact]
    [Trait("Category", "Integration")]
    public async Task AuthenticatedSearchReturnsPersistedClassifiedAnalysis()
    {
        var baseUrl = Environment.GetEnvironmentVariable("CUSTOMS_API_BASE_URL");
        var username = Environment.GetEnvironmentVariable("CUSTOMS_API_TEST_USER");
        var password = Environment.GetEnvironmentVariable("CUSTOMS_API_TEST_PASSWORD");
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password)) return;

        using var client = new HttpClient { BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/"), Timeout = TimeSpan.FromSeconds(90) };
        using var login = await client.PostAsJsonAsync("api/auth/login", new { identity = username, password });
        login.EnsureSuccessStatusCode();
        var loginJson = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginJson.GetProperty("accessToken").GetString());

        using var response = await client.PostAsJsonAsync("api/local-market/search", new
        {
            hsCode = "610910", query = "shirt", sources = "ethioshop", productType = "Clothing",
            condition = "New", priceType = "Retail", relevanceThreshold = 80,
            outlierMethod = "Iqr", includeOutliers = false, maximumAgeDays = 180
        });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var analysis = body.GetProperty("analysis");
        Assert.True(analysis.GetProperty("collection").GetProperty("rawListings").GetInt32() > 0);
        Assert.True(analysis.GetProperty("representativePrice").GetProperty("comparableListings").GetInt32() > 0);
        Assert.Equal("Median", analysis.GetProperty("representativePrice").GetProperty("method").GetString());
        Assert.NotEqual(JsonValueKind.Null, analysis.GetProperty("robustStatistics").ValueKind);
        Assert.NotEmpty(analysis.GetProperty("observations").EnumerateArray());
    }
}
