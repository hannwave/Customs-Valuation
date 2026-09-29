namespace SES.Customs.Core.Models;

/// <summary>
/// Immutable, valuation-specific details attached one-to-one to a generic
/// audit log event. Snapshot values preserve what the officer saw and selected
/// even when the live valuation, tariff, user, or office changes later.
/// </summary>
public sealed class ValuationAuditSnapshot
{
    public Guid AuditLogId { get; set; }
    public Guid ValuationDecisionId { get; set; }
    public Guid? ValuationPhase2Id { get; set; }
    public Guid? ProductId { get; set; }
    public string ProductName { get; set; } = "";
    public string HsCode { get; set; } = "";
    public string HsDescription { get; set; } = "";
    public string PurchaseCountryCode { get; set; } = "";
    public string PurchaseCountryName { get; set; } = "";
    public string OriginCountry { get; set; } = "";
    public decimal SelectedPriceAmount { get; set; }
    public string SelectedPriceCurrency { get; set; } = "";
    public string SelectedPriceSource { get; set; } = "";
    public string ValuationMethod { get; set; } = "";
    public decimal? TotalTaxDue { get; set; }
    public decimal? CustomsDutyAmount { get; set; }
    public decimal? ExciseAdValoremAmount { get; set; }
    public decimal? ExciseSpecificAmount { get; set; }
    public decimal? ExciseTotalAmount { get; set; }
    public decimal? VatAmount { get; set; }
    public decimal? SurtaxAmount { get; set; }
    public decimal? OtherTaxAmount { get; set; }
    public string TaxCurrency { get; set; } = "";
    public string TaxBreakdownJson { get; set; } = "[]";
    public Guid? OfficerAccountId { get; set; }
    public string OfficerName { get; set; } = "";
    public Guid? OfficerLocationId { get; set; }
    public string OfficerLocationName { get; set; } = "";
    public string ProductPhotoUrl { get; set; } = "";
    public Guid? ReceiptValuationDecisionId { get; set; }
    public string ReceiptFileName { get; set; } = "";
    public string ReceiptContentType { get; set; } = "";
    public string DecisionDetailsJson { get; set; } = "{}";
}
