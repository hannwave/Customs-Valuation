namespace SES.Customs.API.Integrations.LocalMarket;

public sealed class LocalMarketOptions
{
    public const string SectionName = "LocalMarketSources";
    public string JijiBaseUrl { get; init; } = "https://jiji.com.et";
    public string EthioShopApiUrl { get; init; } = "https://storeth.ethio.shop/wp-json/wc/store/v1";
    public string TeleGebeyaInfoUrl { get; init; } = "https://www.ethiotelecom.et/zemengebeya/";
}
