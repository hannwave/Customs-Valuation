using SES.Customs.Core.Features.LocalPrices.Service;
using SES.Customs.Core.Models;
using Xunit;

namespace SES.Customs.Tests;

public sealed class LocalMarketClassificationTests
{
    private static MarketplaceListing Listing(string title, decimal price, string id, ProductCondition condition = ProductCondition.New, string seller = "seller-1") =>
        new("Test Market", id, $"https://example.test/{id}", title, null, seller, "Addis Ababa", price, "ETB",
            DateTimeOffset.UtcNow, DateTimeOffset.UtcNow, null, null, condition, MarketPriceType.Retail);

    [Fact]
    public void ExcludesAccessoriesBeforeStatistics()
    {
        var target = new TargetProductProfile("851713", "iPhone 13", ProductType: "Smartphone", Model: "iPhone 13");
        var result = LocalMarketClassificationEngine.Analyze(target, [
            Listing("Apple iPhone 13 128GB", 85_000, "1"),
            Listing("iPhone 13 Cable", 1_000, "2"),
            Listing("iPhone 13 Case", 500, "3")]);
        Assert.Equal(1, result.Collection.ValidObservations);
        Assert.Equal(2, result.Collection.RejectedIrrelevant);
        Assert.Equal(85_000m, result.RepresentativePrice.Value);
    }

    [Fact]
    public void SeparatesVariants()
    {
        var target = new TargetProductProfile("851713", "iPhone 13 128GB", ProductType: "Smartphone", Model: "iPhone 13", Variant: "128GB");
        var result = LocalMarketClassificationEngine.Analyze(target, [
            Listing("iPhone 13 128GB", 85_000, "1"),
            Listing("iPhone 13 256GB", 96_000, "2"),
            Listing("iPhone 13 Pro 128GB", 120_000, "3")]);
        Assert.Equal(1, result.Collection.ValidObservations);
        Assert.Equal(2, result.Collection.WrongVariant);
    }

    [Fact]
    public void NormalizesBrandModelNumberWordsAndCapacitySpacing()
    {
        var target = new TargetProductProfile("851713", "Apple iPhone13 128GB", ProductType: "Smartphone", Brand: "Apple", Model: "iPhone 13", Variant: "128GB");
        var result = LocalMarketClassificationEngine.Analyze(target, [Listing("iPhone thirteen 128 GB Blue", 85_000, "1")]);
        Assert.Equal(1, result.Collection.ValidObservations);
        Assert.Equal(85_000m, result.RepresentativePrice.Value);
    }

    [Fact]
    public void SeparatesCondition()
    {
        var target = new TargetProductProfile("851713", "iPhone 13", ProductType: "Smartphone", Model: "iPhone 13", Condition: ProductCondition.New);
        var result = LocalMarketClassificationEngine.Analyze(target, [
            Listing("New iPhone 13", 90_000, "1"),
            Listing("Used iPhone 13", 65_000, "2", ProductCondition.Used)]);
        Assert.Equal(1, result.Collection.ValidObservations);
        Assert.Equal(1, result.Collection.IncompatibleCondition);
    }

    [Fact]
    public void CountsProbableRepostsOnce()
    {
        var target = new TargetProductProfile("851713", "iPhone 13", ProductType: "Smartphone", Model: "iPhone 13");
        var result = LocalMarketClassificationEngine.Analyze(target, [
            Listing("iPhone 13", 87_000, "1"), Listing("iPhone 13", 87_000, "2"), Listing("iPhone 13", 87_000, "3")]);
        Assert.Equal(1, result.Collection.ValidObservations);
        Assert.Equal(2, result.Collection.Duplicates);
    }

    [Fact]
    public void FlagsOutlierButKeepsItVisible()
    {
        var target = new TargetProductProfile("851713", "iPhone 13", ProductType: "Smartphone", Model: "iPhone 13");
        var prices = new[] { 84_000m, 85_000m, 86_000m, 87_000m, 88_000m, 89_000m, 160_000m };
        var listings = prices.Select((price, index) => Listing($"iPhone 13 item {index}", price, index.ToString(), seller: $"seller-{index}")).ToArray();
        var result = LocalMarketClassificationEngine.Analyze(target, listings);
        Assert.Single(result.Observations, item => item.IsPotentialOutlier);
        Assert.Equal(160_000m, result.Observations.Single(item => item.IsPotentialOutlier).Listing.Price);
        Assert.Equal(7, result.StatisticsIncludingOutliers!.Count);
        Assert.Equal(6, result.RobustStatistics!.Count);
    }

    [Fact]
    public void UsesCleanMedianAsRepresentativePrice()
    {
        var target = new TargetProductProfile("851713", "iPhone 13", ProductType: "Smartphone", Model: "iPhone 13");
        var prices = new[] { 84_000m, 85_000m, 86_000m, 87_000m, 88_000m };
        var result = LocalMarketClassificationEngine.Analyze(target,
            prices.Select((price, index) => Listing($"iPhone 13 item {index}", price, index.ToString(), seller: $"seller-{index}")).ToArray());
        Assert.Equal(86_000m, result.RepresentativePrice.Value);
        Assert.Equal("Median", result.RepresentativePrice.Method);
    }
}
