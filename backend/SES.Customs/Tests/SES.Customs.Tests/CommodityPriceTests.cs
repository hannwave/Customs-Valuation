using SES.Customs.API.Integrations.Commodities;
using Xunit;

namespace SES.Customs.Tests;

public sealed class CommodityPriceTests
{
    [Theory]
    [InlineData("740311", "COPPER")]
    [InlineData("7408.11", "COPPER")]
    [InlineData("260111", "IRON_ORE")]
    [InlineData("720851", "STEEL")]
    [InlineData("710691", "SILVER")]
    [InlineData("710812", "GOLD")]
    [InlineData("711011", "PLATINUM")]
    [InlineData("760110", "ALUMINIUM")]
    [InlineData("100199", "WHEAT")]
    [InlineData("090111", "COFFEE")]
    public void RawMaterialTariffItemsMatchTheirExchangeCommodity(string hsCode, string expected) =>
        Assert.Equal(expected, CommodityPriceClient.ForHsCode(hsCode)?.Key);

    [Theory]
    [InlineData("851713")]
    [InlineData("847130")]
    [InlineData("610910")]
    public void ManufacturedGoodsHaveNoBaseMarketPrice(string hsCode) => Assert.Null(CommodityPriceClient.ForHsCode(hsCode));

    [Fact]
    public void QuotesConvertToUsdPerKilogram()
    {
        var copper = CommodityPriceClient.Catalogue.Single(item => item.Key == "COPPER");
        var silver = CommodityPriceClient.Catalogue.Single(item => item.Key == "SILVER");
        var wheat = CommodityPriceClient.Catalogue.Single(item => item.Key == "WHEAT");

        // USD 6.664/lb copper ≈ USD 14.69/kg; USD 56.23/troy oz silver ≈ USD 1,807.84/kg; 664.5 US cents/bushel wheat ≈ USD 0.244/kg.
        Assert.Equal(14.69m, Math.Round(6.664m / copper.PriceDivisor * copper.QuoteUnitsPerValueUnit, 2));
        Assert.Equal(1807.84m, Math.Round(56.23m / silver.PriceDivisor * silver.QuoteUnitsPerValueUnit, 2));
        Assert.Equal(0.244m, Math.Round(664.5m / wheat.PriceDivisor * wheat.QuoteUnitsPerValueUnit, 3));
    }
}
