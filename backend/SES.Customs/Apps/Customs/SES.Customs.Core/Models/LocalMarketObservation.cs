namespace SES.Customs.Core.Models;

public enum LocalObservationStatus
{
    Raw, Processing, ValidForStatistics, RejectedIrrelevant, WrongBrand, WrongModel,
    WrongVariant, IncompatibleCondition, IncompatibleUnit, InvalidPrice, Duplicate,
    PotentialOutlier, ManuallyApproved, ManuallyRejected
}
public enum ProductCondition { New, Used, Refurbished, Unknown }
public enum MarketPriceType { Retail, Wholesale, Distributor, Manufacturer, SupplierQuotation, Unknown }
public enum LocalOutlierMethod { Iqr, Mad, None }
public enum ManualReviewStatus { Unreviewed, Approved, Rejected, ConfirmedOutlier }

public sealed class LocalMarketObservation
{
    public Guid Id { get; set; }
    public Guid HsCodeId { get; set; }
    public Guid SourceId { get; set; }
    public string SourceListingId { get; set; } = "";
    public string Marketplace { get; set; } = "";
    public string ListingUrl { get; set; } = "";
    public string ListingTitle { get; set; } = "";
    public string? ListingDescription { get; set; }
    public string? SellerName { get; set; }
    public string? Location { get; set; }
    public decimal RawPrice { get; set; }
    public string RawCurrency { get; set; } = "";
    public DateTimeOffset RetrievalDate { get; set; }
    public DateTimeOffset? ListingDate { get; set; }
    public string? ImageUrl { get; set; }
    public string? RawCategory { get; set; }
    public string SearchQuery { get; set; } = "";
    public string TargetProfileJson { get; set; } = "{}";
    public string? Brand { get; set; }
    public string? Model { get; set; }
    public string? Variant { get; set; }
    public string? ProductType { get; set; }
    public ProductCondition Condition { get; set; }
    public MarketPriceType PriceType { get; set; }
    public decimal OriginalQuantity { get; set; } = 1;
    public string OriginalUnit { get; set; } = "piece";
    public decimal NormalizedQuantity { get; set; } = 1;
    public string NormalizedUnit { get; set; } = "piece";
    public decimal? NormalizedPrice { get; set; }
    public string NormalizedCurrency { get; set; } = "ETB";
    public decimal? NormalizedUnitPrice { get; set; }
    public int RelevanceScore { get; set; }
    public LocalObservationStatus ClassificationStatus { get; set; }
    public string ClassificationReason { get; set; } = "";
    public string MatchedKeywordsJson { get; set; } = "[]";
    public string ExcludedKeywordsJson { get; set; } = "[]";
    public bool IsDuplicate { get; set; }
    public Guid? DuplicateOfId { get; set; }
    public bool IsPotentialOutlier { get; set; }
    public LocalOutlierMethod OutlierMethod { get; set; }
    public decimal? OutlierScore { get; set; }
    public string? OutlierReason { get; set; }
    public ManualReviewStatus ManualReviewStatus { get; set; }
    public string? ReviewedBy { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public string? ReviewJustification { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
