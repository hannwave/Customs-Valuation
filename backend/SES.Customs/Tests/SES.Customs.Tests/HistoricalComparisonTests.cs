using SES.Customs.Core.Models;
using Xunit;

namespace SES.Customs.Tests;

public class HistoricalComparisonTests
{
    [Theory]
    [InlineData("Apple iPhone 15 128 GB", true)]
    [InlineData("Apple iPhone 15 Pro 128GB", false)]
    [InlineData("Apple iPhone 15 256GB", false)]
    [InlineData("Apple iPhone 15 128GB case", false)]
    [InlineData("Apple iPhone 15 128GB refurbished", false)]
    [InlineData("Apple iPhone 15", false)]
    [InlineData("Apple iPhone 16 128GB", false)]
    public void ExactMatchingRejectsDifferentModelsStorageAndAccessories(string title, bool expected)
        => Assert.Equal(expected, HistoricalComparison.Matches(new("Apple", "iPhone 15", "128GB"), title, "New"));

    [Fact]
    public void StandardVariantMatchesModelWithoutStorage()
        => Assert.True(HistoricalComparison.Matches(new("Sony", "WH-1000XM5", "standard"), "Sony WH-1000XM5 Wireless Headphones", null));

    [Fact]
    public void MissingValuesAreNotZerosAndMedianIsNotMean()
    {
        Assert.Null(HistoricalComparison.Median([]));
        Assert.Equal(20m, HistoricalComparison.Median([10, 20, 300]));
        Assert.Equal(15m, HistoricalComparison.Median([10, 20]));
        Assert.Null(HistoricalComparison.Percent(null, 100));
        Assert.Null(HistoricalComparison.Percent(100, null));
        Assert.Null(HistoricalComparison.Percent(100, 0));
        Assert.Equal(25m, HistoricalComparison.Percent(125, 100));
    }
}
