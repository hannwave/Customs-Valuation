namespace SES.Customs.Core.Models;

// Office and hierarchy snapshots preserve the context of an operational decision.
public sealed class ValuationDecision
{
    public Guid Id { get; set; }
    // Classification is intentionally deferred to Phase 2. Phase 1 evaluates
    // the product and supporting price evidence without requiring an HS code.
    public Guid? HsCodeId { get; set; }
    public decimal SelectedReferenceValue { get; set; }
    public string Currency { get; set; } = "";
    // Phase 1 may populate this explicitly. The Phase 2 handoff falls back to
    // SelectedReferenceValue for decisions created by the current skeleton.
    public decimal? InitialDuty { get; set; }
    public string InitialDutyCurrency { get; set; } = "";
    public string Decision { get; set; } = "";
    public string Justification { get; set; } = "";
    public string OfficerSubjectId { get; set; } = "";
    public DateTimeOffset RecordedAt { get; set; }
    public List<DecisionEvidence> Evidence { get; set; } = [];
    public Guid? LocationId { get; set; }
    public string LocationSnapshotJson { get; set; } = "{}";
    public string EvidenceNotes { get; set; } = "";
    public string Status { get; set; } = "Draft";
    public DateTimeOffset? SubmittedAt { get; set; }
    public string? ReviewedBy { get; set; }
    public string? ReviewJustification { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
}
public sealed class DecisionEvidence
{
    public Guid Id { get; set; }
    public Guid DecisionId { get; set; }
    // Exactly one must be set; the database constraint and FKs enforce this.
    public Guid? InternationalPriceId { get; set; }
    public Guid? LocalPriceId { get; set; }
    public Guid? HistoricalCustomsPriceId { get; set; }
    public string EvidenceSnapshotJson { get; set; } = "{}";
    public string ComparisonRuleVersion { get; set; } = "";
}
public sealed class AuditLog
{
    public Guid? LocationId { get; set; }
    public Guid Id { get; set; }
    public string UserId { get; set; } = "";
    public string Username { get; set; } = "";
    public DateTimeOffset OccurredAt { get; set; }
    public string Action { get; set; } = "";
    public string Module { get; set; } = "";
    public Guid RecordId { get; set; }
    public string? PreviousValueJson { get; set; }
    public string? NewValueJson { get; set; }
    public string? Decision { get; set; }
    public string? Justification { get; set; }
    public string? IpDeviceInformation { get; set; }
}
