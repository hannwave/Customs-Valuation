namespace SES.Customs.Core.Models;

public enum PricePool { International, Local, HistoricalCustoms }
public enum LocalPriceCategory { Wholesale, Retail, Manufacturer, Distributor, SupplierQuotation }

// Shared fields only. EF maps the three concrete types to separate physical tables.
public abstract class PriceEvidence
{
    public Guid Id { get; set; }
    public Guid HsCodeId { get; set; }
    public Guid SourceId { get; set; }
    public string SourceReference { get; set; } = "";
    public string ProductDescription { get; set; } = "";
    public string? BrandModel { get; set; }
    public string? QualityGrade { get; set; }
    public decimal Quantity { get; set; }
    public string QuantityUnit { get; set; } = "";
    public decimal OriginalValue { get; set; }
    public string OriginalCurrency { get; set; } = "";
    public decimal? UnitPrice { get; set; }
    public DateOnly PriceDate { get; set; }
    public Guid? ExchangeRateId { get; set; }
    public decimal? ConvertedValue { get; set; }
    public string? ConvertedCurrency { get; set; }
    public DateTimeOffset RetrievedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
public sealed class InternationalReferencePrice : PriceEvidence
{
    public string ImportCountryCode { get; set; } = "";
    public string SourceCountryCode { get; set; } = "";
    public string TradeFlow { get; set; } = "";
    public string TradePeriod { get; set; } = "";
    public string? Incoterm { get; set; }
    public decimal? Freight { get; set; }
    public decimal? Insurance { get; set; }
}
public sealed class LocalMarketPrice : PriceEvidence
{
    public Guid MarketId { get; set; }
    public string SupplierReference { get; set; } = "";
    public LocalPriceCategory PriceType { get; set; }
    public bool? VatIncluded { get; set; }
    public bool? OtherTaxesIncluded { get; set; }
    public bool? TransportIncluded { get; set; }
    public DateOnly? VerificationDate { get; set; }
}
// Proposed extension for SRS section 26; confirm with the data owner before migration.
public sealed class HistoricalCustomsPrice : PriceEvidence
{
    public string DeclarationReference { get; set; } = "";
    public string AuthorizationReference { get; set; } = "";
    public string ValuationMethod { get; set; } = "";
    public string SourceCountryCode { get; set; } = "";
    public string? Incoterm { get; set; }
}
public sealed class PriceSource
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public PricePool Pool { get; set; }
    public string ApprovalReference { get; set; } = "";
    public bool IsApproved { get; set; }
}
public sealed class LocalMarket
{
    public Guid Id { get; set; }
    public string NameEn { get; set; } = "";
    public string? NameAm { get; set; }
    public string Region { get; set; } = "";
}
public sealed class ExchangeRate
{
    public Guid Id { get; set; }
    public string OriginalCurrency { get; set; } = "";
    public string ConvertedCurrency { get; set; } = "ETB";
    // Explicit direction: converted currency units for one original currency unit.
    public decimal Rate { get; set; }
    public DateOnly RateDate { get; set; }
    public string NbeSourceReference { get; set; } = "";
    public DateTimeOffset RetrievedAt { get; set; }
}
