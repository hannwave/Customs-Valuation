using SES.Customs.Core.Features.ManufacturerPrices.Service;
using Xunit;

namespace SES.Customs.Tests;

public sealed class ManufacturerPriceMatcherTests
{
    [Theory]
    [InlineData("i phone 13", "apple.com")]
    [InlineData("Samsung Galaxy S25", "samsung.com")]
    [InlineData("Dell XPS 13", "dell.com")]
    public void InfersKnownManufacturerSites(string query, string expected)
        => Assert.Equal(expected, ManufacturerPriceMatcher.InferDomain(query));

    [Fact]
    public void AcceptsOnlyPagesOnTheSelectedSite()
    {
        Assert.True(ManufacturerPriceMatcher.IsOfficialUrl("https://www.apple.com/shop/buy-iphone/iphone-13", "apple.com"));
        Assert.False(ManufacturerPriceMatcher.IsOfficialUrl("https://apple.com.retail.example/iphone-13", "apple.com"));
        Assert.False(ManufacturerPriceMatcher.IsOfficialUrl("http://apple.com/iphone-13", "apple.com"));
        Assert.False(ManufacturerPriceMatcher.TryResolveSite("iPhone 13", "http://localhost:8080/iphone-13", out _, out _));
    }

    [Theory]
    [InlineData("iPhone 13 128GB", "Buy iPhone 13 128 GB - Apple", true)]
    [InlineData("iPhone 13", "iPhone 13 Pro - Apple", false)]
    [InlineData("iPhone 13", "iPhone 14 - Apple", false)]
    [InlineData("iPhone 13", "iPhone 13 Silicone Case - Apple", false)]
    [InlineData("iPhone 13", "iPhone 13 Cases and Protection - Apple", false)]
    [InlineData("iPhone 13", "iPhone 13 and iPhone 14 - Apple", false)]
    [InlineData("iPhone 13 128GB", "iPhone 13 256GB - Apple", false)]
    [InlineData("iPhone 13 128GB", "iPhone 13 128GB and 256GB - Apple", false)]
    public void KeepsModelsAndStorageVariantsSeparate(string query, string title, bool expected)
        => Assert.Equal(expected, ManufacturerPriceMatcher.MatchesProduct(query, title));

    [Theory]
    [InlineData("iPhone 12", "iPhone 12 - Apple Support", "https://support.apple.com/hu-hu/111876", false)]
    [InlineData("iPhone 12", "iPhone 12 and iPhone 11 - Apple", "https://www.apple.com/iphone/compare/?modelList=iphone-12,iphone-11", false)]
    [InlineData("iPhone 12", "iPhone 12 cases", "https://www.apple.com/shop/accessories/all/cases-protection/iphone-12", false)]
    [InlineData("iPhone 17", "Buy iPhone 17 - Apple", "https://www.apple.com/shop/buy-iphone/iphone-17", true)]
    public void ExcludesSupportComparisonAndAccessoryPages(string query, string title, string url, bool expected)
        => Assert.Equal(expected, ManufacturerPriceMatcher.IsLikelyProductPage(query, title, url));
}
