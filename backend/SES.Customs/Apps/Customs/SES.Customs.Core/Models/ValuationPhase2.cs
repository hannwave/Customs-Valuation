namespace SES.Customs.Core.Models;

// Phase 2 is deliberately a child of the Phase 1 decision. This keeps the
// original duty and evidence intact while allowing the tax rules to evolve.
public sealed class ValuationPhase2
{
    public Guid Id { get; set; }
    public Guid ValuationDecisionId { get; set; }
    public Guid? OriginalHsCodeId { get; set; }
    public Guid? SelectedHsCodeId { get; set; }
    public decimal CustomsValueAmount { get; set; }
    public string CustomsValueCurrency { get; set; } = "ETB";
    public decimal Quantity { get; set; } = 1m;
    public string Unit { get; set; } = "PCS";
    public string OriginCountry { get; set; } = "";
    public string ProductCategory { get; set; } = "";
    public string ExemptionCodes { get; set; } = "";
    public bool OriginPreferenceClaimed { get; set; }
    public bool ExciseTaxApplicable { get; set; }
    public bool IsCommercialImport { get; set; } = true;
    public bool WithholdingApplicable { get; set; }
    public string AdjustmentReason { get; set; } = "";
    public bool OfficerConfirmed { get; set; }
    public decimal InitialDutyAmount { get; set; }
    public string InitialDutyCurrency { get; set; } = "ETB";
    public string TargetCurrency { get; set; } = "ETB";
    // Target-currency units for one initial-duty-currency unit.
    public decimal ExchangeRate { get; set; } = 1m;
    public string ExchangeRateSource { get; set; } = "Same currency";
    public DateOnly? ExchangeRateDate { get; set; }
    public decimal ExemptionAmount { get; set; }
    public decimal WaiverAmount { get; set; }
    public decimal ManualAdjustmentAmount { get; set; }
    public string ManualAdjustmentType { get; set; } = "Fixed";
    public string Notes { get; set; } = "";
    public string Status { get; set; } = "InProgress";
    public decimal TotalAdditionalTax { get; set; }
    public decimal TotalTax { get; set; }
    public decimal FinalAmount { get; set; }
    public string CalculationRuleVersion { get; set; } = "ethiopian-import-tax-rules-v2";
    public DateTimeOffset? CalculatedAt { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public List<ValuationPhase2TaxLine> TaxLines { get; set; } = [];
}

public sealed class ValuationPhase2TaxLine
{
    public Guid Id { get; set; }
    public Guid ValuationPhase2Id { get; set; }
    public string Name { get; set; } = "Tax 1";
    public string CalculationType { get; set; } = "Percentage";
    // Percentage points when CalculationType is Percentage, otherwise amount.
    public decimal Value { get; set; }
    public string Currency { get; set; } = "ETB";
    public int Order { get; set; }
    public string CalculationBasis { get; set; } = "InitialDuty";
    public decimal RecommendedValue { get; set; }
    public decimal BaseAmount { get; set; }
    public decimal CalculatedAmount { get; set; }
    public string Notes { get; set; } = "";
    public string Status { get; set; } = "Recommended";
    public string SourceReference { get; set; } = "";
    public bool IsApplicable { get; set; } = true;
}
