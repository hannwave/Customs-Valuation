namespace SES.Customs.Core.Models;

/// <summary>
/// An importer's request to change identity details that officers verified (name, legal name, TIN).
/// The change is applied only after a Customs Officer in the importer's region checks the supporting document and approves it.
/// </summary>
public sealed class ImporterChangeRequest
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public Guid? ProfileId { get; set; }
    public Guid? RegionLocationId { get; set; }
    public string RegionKey { get; set; } = "";

    public string CurrentFullName { get; set; } = "";
    public string? RequestedFullName { get; set; }
    public string CurrentLegalName { get; set; } = "";
    public string? RequestedLegalName { get; set; }
    public string CurrentTin { get; set; } = "";
    public string? RequestedTin { get; set; }
    public string Reason { get; set; } = "";

    public string DocumentFileName { get; set; } = "";
    public string DocumentContentType { get; set; } = "";
    public long DocumentSize { get; set; }
    public string DocumentSha256 { get; set; } = "";
    public byte[] DocumentContent { get; set; } = [];

    /// <summary>PENDING, APPROVED, REJECTED or CANCELLED.</summary>
    public string Status { get; set; } = "PENDING";
    public string ReviewNote { get; set; } = "";
    public Guid? ReviewedById { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
}
