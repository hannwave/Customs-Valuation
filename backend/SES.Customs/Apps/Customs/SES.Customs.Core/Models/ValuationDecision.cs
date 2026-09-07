namespace SES.Customs.Core.Models;

// Persistence skeleton only. Creation must use a validated, audited command in phase 4.
public sealed class ValuationDecision
{
    public Guid Id { get; set; }
    public Guid HsCodeId { get; set; }
    public decimal SelectedReferenceValue { get; set; }
    public string Currency { get; set; } = "";
    public string Decision { get; set; } = "";
    public string Justification { get; set; } = "";
    public string OfficerSubjectId { get; set; } = "";
    public DateTimeOffset RecordedAt { get; set; }
    public List<DecisionEvidence> Evidence { get; set; } = [];
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
