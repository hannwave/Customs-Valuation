namespace SES.Customs.Core.Models;

/// <summary>
/// OCR check of one uploaded importer document. Each scan belongs to the exact file contents (SHA-256),
/// so replacing a document queues a fresh scan and an officer never sees a verdict for an older file.
/// </summary>
public sealed class DocumentScan
{
    public Guid Id { get; set; }
    /// <summary>DocumentScanSources: a declaration document or an importer verification document.</summary>
    public string Source { get; set; } = "";
    public Guid DocumentId { get; set; }
    /// <summary>The declaration or importer profile the document belongs to.</summary>
    public Guid OwnerId { get; set; }
    public string Kind { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public string Status { get; set; } = DocumentScanStatus.Pending;
    /// <summary>DocumentScanFlags: healthy, suspicious or unrelated. Empty until the scan completes.</summary>
    public string Flag { get; set; } = "";
    /// <summary>0–100: how well the document matches what was expected.</summary>
    public int Score { get; set; }
    /// <summary>What the scanner thinks the document is, e.g. "Packing list".</summary>
    public string DetectedType { get; set; } = "";
    public string Summary { get; set; } = "";
    /// <summary>The individual checks: [{ check, result: pass|warn|fail|info, detail }].</summary>
    public string FindingsJson { get; set; } = "[]";
    /// <summary>The fields read from the page, as returned by the OCR engine.</summary>
    public string ExtractedText { get; set; } = "";
    public string Engine { get; set; } = "";
    public double? Confidence { get; set; }
    public int Attempts { get; set; }
    public string Error { get; set; } = "";
    public DateTimeOffset QueuedAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset? NextAttemptAt { get; set; }
    public long? ProcessingMs { get; set; }
}

public static class DocumentScanSources
{
    public const string Declaration = "DECLARATION";
    public const string Verification = "VERIFICATION";
}

public static class DocumentScanStatus
{
    public const string Pending = "PENDING";
    public const string Scanning = "SCANNING";
    public const string Completed = "COMPLETED";
    /// <summary>The OCR service could not read the file after every retry; the officer checks it by hand.</summary>
    public const string Failed = "FAILED";
}

public static class DocumentScanFlags
{
    public const string Healthy = "HEALTHY";
    public const string Suspicious = "SUSPICIOUS";
    public const string Unrelated = "UNRELATED";
}
