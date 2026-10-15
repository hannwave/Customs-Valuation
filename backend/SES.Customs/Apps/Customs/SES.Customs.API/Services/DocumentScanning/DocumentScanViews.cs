using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Security;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Services.DocumentScanning;

/// <summary>Officer-facing views of document scans. Only the scan of each document's current file counts.</summary>
public static class DocumentScanViews
{
    public sealed record FlagCounts(int Healthy, int Suspicious, int Unrelated, int Pending, int Failed)
    {
        /// <summary>The single badge a list shows: the worst finished verdict, else whether scanning is still running.</summary>
        public string Overall => Unrelated > 0 ? DocumentScanFlags.Unrelated : Suspicious > 0 ? DocumentScanFlags.Suspicious
            : Pending > 0 ? DocumentScanStatus.Pending : Failed > 0 ? DocumentScanStatus.Failed : Healthy > 0 ? DocumentScanFlags.Healthy : "";
    }

    /// <summary>Scan detail per document kind, for the current file of each document.</summary>
    public static async Task<Dictionary<string, object>> ForDocumentsAsync(CustomsDbContext db, IEnumerable<(Guid Id, string Kind, string Sha256)> documents, CancellationToken ct)
    {
        var list = documents.ToList();
        var ids = list.Select(d => d.Id).ToList();
        var scans = await db.DocumentScans.AsNoTracking().Where(s => ids.Contains(s.DocumentId)).ToListAsync(ct);
        return list.ToDictionary(d => d.Kind, d =>
        {
            var scan = scans.FirstOrDefault(s => s.DocumentId == d.Id && s.Sha256 == d.Sha256);
            return scan is null ? new { kind = d.Kind, status = DocumentScanStatus.Pending, flag = "", queuedAt = (DateTimeOffset?)null } as object : View(scan);
        });
    }

    public static object View(DocumentScan scan)
    {
        JsonElement findings;
        try { findings = JsonSerializer.Deserialize<JsonElement>(string.IsNullOrWhiteSpace(scan.FindingsJson) ? "[]" : scan.FindingsJson); }
        catch (JsonException) { findings = JsonSerializer.Deserialize<JsonElement>("[]"); }
        return new
        {
            kind = scan.Kind, status = scan.Status, flag = scan.Flag, score = scan.Score, detectedType = scan.DetectedType, summary = scan.Summary, findings,
            extracted = DocumentScanAnalyzer.ParseFields(scan.ExtractedText).Where(f => f.Value.Length > 0 && !f.Value.Equals("none", StringComparison.OrdinalIgnoreCase))
                .Select(f => new { field = f.Key, value = f.Value }).ToArray(),
            engine = scan.Engine, confidence = scan.Confidence, attempts = scan.Attempts, error = scan.Error,
            scan.QueuedAt, scan.StartedAt, scan.CompletedAt, scan.NextAttemptAt, scan.ProcessingMs,
        };
    }

    /// <summary>Verdict counts per declaration or importer profile, for queue badges.</summary>
    public static async Task<Dictionary<Guid, FlagCounts>> CountsAsync(CustomsDbContext db, string source, IReadOnlyCollection<Guid> ownerIds, CancellationToken ct)
    {
        var documents = source == DocumentScanSources.Declaration
            ? await db.ImporterDocuments.AsNoTracking().Where(d => ownerIds.Contains(d.DeclarationId)).Select(d => new { d.Id, Owner = d.DeclarationId, d.Sha256 }).ToListAsync(ct)
            : await db.ImporterProfileDocuments.AsNoTracking().Where(d => ownerIds.Contains(d.ProfileId)).Select(d => new { d.Id, Owner = d.ProfileId, d.Sha256 }).ToListAsync(ct);
        var scans = await db.DocumentScans.AsNoTracking().Where(s => s.Source == source && ownerIds.Contains(s.OwnerId))
            .Select(s => new { s.DocumentId, s.Sha256, s.Status, s.Flag }).ToListAsync(ct);
        return documents.GroupBy(d => d.Owner).ToDictionary(g => g.Key, g =>
        {
            var current = g.Select(d => scans.FirstOrDefault(s => s.DocumentId == d.Id && s.Sha256 == d.Sha256)).ToList();
            return new FlagCounts(
                current.Count(s => s?.Flag == DocumentScanFlags.Healthy), current.Count(s => s?.Flag == DocumentScanFlags.Suspicious), current.Count(s => s?.Flag == DocumentScanFlags.Unrelated),
                current.Count(s => s is null || s.Status is DocumentScanStatus.Pending or DocumentScanStatus.Scanning), current.Count(s => s?.Status == DocumentScanStatus.Failed));
        });
    }

    public static object? Badge(FlagCounts? counts) => counts is null ? null : new { overall = counts.Overall, healthy = counts.Healthy, suspicious = counts.Suspicious, unrelated = counts.Unrelated, pending = counts.Pending, failed = counts.Failed };

    /// <summary>Queues the current file again (officer request), e.g. after the OCR service was down.</summary>
    public static async Task RescanAsync(CustomsDbContext db, Guid documentId, string sha256, CancellationToken ct)
    {
        var scan = await db.DocumentScans.FirstOrDefaultAsync(s => s.DocumentId == documentId && s.Sha256 == sha256, ct);
        if (scan is null) return; // not scanned yet: the worker queues it on its own
        if (scan.Status == DocumentScanStatus.Scanning) throw new WorkspaceException(409, "This document is being scanned right now.");
        scan.Status = DocumentScanStatus.Pending; scan.Attempts = 0; scan.Error = ""; scan.NextAttemptAt = null; scan.QueuedAt = DateTimeOffset.UtcNow;
    }
}
