namespace SES.Customs.API.Integrations.PriceWatcha;
public sealed class PriceWatchaOptions { public const string SectionName = "PriceWatcha"; public string BaseUrl { get; set; } = "https://pricewatcha.com/api/v1"; public string ApiKey { get; set; } = ""; }
