namespace SES.Customs.Core.Models;

public sealed class MarketPriceSnapshot
{
    public Guid Id { get; set; }
    public string Source { get; set; } = "";
    public string ListingId { get; set; } = "";
    public string Title { get; set; } = "";
    public string Url { get; set; } = "";
    public string Condition { get; set; } = "";
    public decimal Price { get; set; }
    public string Currency { get; set; } = "ETB";
    public DateOnly ObservedDate { get; set; }
}
