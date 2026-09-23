namespace SES.Customs.Infrastructure.Context;

public sealed class CustomsLocation
{
    public Guid Id { get; set; }
    public string OfficialCode { get; set; } = "";
    public string Name { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string LocationType { get; set; } = "BRANCH_OFFICE";
    public Guid? ParentLocationId { get; set; }
    public string Region { get; set; } = "";
    public string Zone { get; set; } = "";
    public string CityWoreda { get; set; } = "";
    public string BorderCountry { get; set; } = "";
    public string Status { get; set; } = "ACTIVE";
    public DateTimeOffset EffectiveFrom { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? EffectiveTo { get; set; }
    public bool IsEntryPoint { get; set; }
    public bool IsExitPoint { get; set; }
    public bool SupportsImport { get; set; }
    public bool SupportsExport { get; set; }
    public bool SupportsTransit { get; set; }
    public bool SupportsValuation { get; set; }
    public bool SupportsInspection { get; set; }
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string Source { get; set; } = "";
    public string SourceReference { get; set; } = "";
    public DateTimeOffset? LastVerifiedAt { get; set; }
    public string CreatedBy { get; set; } = "";
    public string UpdatedBy { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid Version { get; set; } = Guid.NewGuid();
}
public sealed class CustomsLocationHistory
{
    public Guid Id { get; set; }
    public Guid CustomsLocationId { get; set; }
    public DateTimeOffset ChangedAt { get; set; }
    public string ChangedBy { get; set; } = "";
    public string ChangeReason { get; set; } = "";
    public string PreviousValueJson { get; set; } = "{}";
    public string NewValueJson { get; set; } = "{}";
}

// Retained for officer and administrator scope assignments used by the
// valuation workflow. The newer primary-location model is supported alongside
// these explicit assignments for existing records and audit history.
public sealed class UserLocationScope
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid CustomsLocationId { get; set; }
    public bool IncludeChildLocations { get; set; }
    public string Responsibilities { get; set; } = "";
    public DateTimeOffset EffectiveFrom { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? EffectiveTo { get; set; }
    public string CreatedBy { get; set; } = "";
}
