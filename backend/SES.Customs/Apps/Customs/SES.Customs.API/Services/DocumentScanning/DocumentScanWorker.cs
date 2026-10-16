using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SES.Customs.API.Integrations.Ocr;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Services.DocumentScanning;

/// <summary>
/// Scans importer uploads one at a time in the background. Any document whose current file has no scan yet is queued,
/// which covers new uploads, replaced files and documents uploaded before scanning existed. Declaration documents go first.
/// </summary>
public sealed class DocumentScanWorker(IServiceScopeFactory scopes, IOptions<OcrOptions> options, ILogger<DocumentScanWorker> logger) : BackgroundService
{
    private static readonly TimeSpan Idle = TimeSpan.FromSeconds(20);
    private static readonly SemaphoreSlim Wake = new(0);

    /// <summary>Starts the next scan straight away instead of waiting for the next poll, e.g. after an upload or a rescan request.</summary>
    public static void Nudge() { if (Wake.CurrentCount == 0) Wake.Release(); }

    internal static readonly OcrField[] DeclarationFields =
    [
        new("document type", "What kind of document this page is, judged from its title and layout: commercial invoice, proforma invoice, packing list, certificate of origin, bill of lading, air waybill, other trade document - say which, or not a trade document - say in a few words what it is instead (for example: not a trade document - recipe)."),
        new("title", "The main heading printed on the page."),
        new("goods description", "Description of the goods, including brand and model if shown."),
        new("hs code", "HS or tariff code of the goods."),
        new("country of origin"),
        new("quantity", "Quantity of goods with its unit."),
        new("total amount", "Grand total amount with its currency."),
        new("seller", "Exporter, seller or shipper name."),
        new("buyer", "Importer, consignee or buyer name."),
        new("document number", "Invoice, packing list or certificate number."),
    ];

    internal static readonly OcrField[] VerificationFields =
    [
        new("document type", "What kind of document this is: trade licence, TIN certificate, commercial registration certificate, VAT registration certificate, customs agent licence, national ID, Fayda ID, passport, residence permit, kebele ID, utility bill or lease (proof of address), authorisation letter, other official document - say which, or not an official document - say in a few words what it is instead."),
        new("title", "The main heading printed on the document."),
        new("holder name", "The person or company the document is issued to."),
        new("tin", "Taxpayer identification number."),
        new("registration number", "Licence, registration, certificate or ID number."),
        new("expiry date", "Expiry or valid-until date, as YYYY-MM-DD."),
    ];

    internal const string Instructions = "Write none for a field that is not on the page. Keep every value short and copy numbers exactly as printed.";

    private sealed record Candidate(string Source, Guid DocumentId, Guid OwnerId, string Kind, string Sha256);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled) { logger.LogInformation("Document scanning is disabled."); return; }
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        await ResetInterruptedAsync(stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            var worked = false;
            try { worked = await RunOnceAsync(stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception exception) { logger.LogWarning(exception, "Document scan cycle failed."); }
            if (!worked) await Wake.WaitAsync(Idle, stoppingToken).ContinueWith(_ => { }, CancellationToken.None);
        }
    }

    /// <summary>A scan cut off by a restart goes back to the queue.</summary>
    private async Task ResetInterruptedAsync(CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
            foreach (var scan in await db.DocumentScans.Where(s => s.Status == DocumentScanStatus.Scanning).ToListAsync(ct)) scan.Status = DocumentScanStatus.Pending;
            await db.SaveChangesAsync(ct);
        }
        catch (Exception exception) when (exception is not OperationCanceledException) { logger.LogWarning(exception, "Could not reset interrupted document scans."); }
    }

    /// <summary>Queues unscanned documents and scans the next one. Returns false when there was nothing to do.</summary>
    internal async Task<bool> RunOnceAsync(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        await QueueNewAsync(db, ct);
        var now = DateTimeOffset.UtcNow;
        // Each page takes minutes, so work an officer is about to open goes first: declarations awaiting review, then
        // pending verifications, then everything else (e.g. documents uploaded before scanning existed).
        var next = await db.DocumentScans.Where(s => s.Status == DocumentScanStatus.Pending && (s.NextAttemptAt == null || s.NextAttemptAt <= now))
            .Select(s => new
            {
                Scan = s,
                Rank = s.Source == DocumentScanSources.Declaration
                    ? db.ImporterDeclarations.Any(d => d.Id == s.OwnerId && (d.Status == "SUBMITTED" || d.Status == "INFORMATION_REQUESTED")) ? 0 : 2
                    : db.ImporterProfiles.Any(p => p.Id == s.OwnerId && (p.VerificationStatus == ImporterVerification.Pending || p.VerificationStatus == ImporterVerification.InformationRequested)) ? 1 : 3,
            })
            .OrderBy(x => x.Rank).ThenBy(x => x.Scan.QueuedAt).Select(x => x.Scan).FirstOrDefaultAsync(ct);
        if (next is null) return false;

        var ocr = scope.ServiceProvider.GetRequiredService<IOcrClient>();
        if (!await ocr.ReadyAsync(ct)) { logger.LogInformation("OCR service ({Engine}) is not ready; document scans wait.", ocr.GetType().Name); await Task.Delay(TimeSpan.FromSeconds(60), ct); return false; }
        await ScanAsync(db, ocr, next, ct);
        return true;
    }

    private static async Task QueueNewAsync(CustomsDbContext db, CancellationToken ct)
    {
        var declarationDocs = await db.ImporterDocuments.AsNoTracking()
            .Where(d => !db.DocumentScans.Any(s => s.DocumentId == d.Id && s.Sha256 == d.Sha256))
            .OrderBy(d => d.UploadedAt).Take(50)
            .Select(d => new Candidate(DocumentScanSources.Declaration, d.Id, d.DeclarationId, d.Kind, d.Sha256)).ToListAsync(ct);
        var verificationDocs = await db.ImporterProfileDocuments.AsNoTracking()
            .Where(d => !db.DocumentScans.Any(s => s.DocumentId == d.Id && s.Sha256 == d.Sha256))
            .OrderBy(d => d.UploadedAt).Take(50)
            .Select(d => new Candidate(DocumentScanSources.Verification, d.Id, d.ProfileId, d.Kind, d.Sha256)).ToListAsync(ct);
        if (declarationDocs.Count + verificationDocs.Count == 0) return;
        var now = DateTimeOffset.UtcNow;
        foreach (var candidate in declarationDocs.Concat(verificationDocs))
            db.DocumentScans.Add(new DocumentScan { Id = Guid.NewGuid(), Source = candidate.Source, DocumentId = candidate.DocumentId, OwnerId = candidate.OwnerId,
                Kind = candidate.Kind, Sha256 = candidate.Sha256, Status = DocumentScanStatus.Pending, QueuedAt = now });
        await db.SaveChangesAsync(ct);
    }

    private async Task ScanAsync(CustomsDbContext db, IOcrClient ocr, DocumentScan scan, CancellationToken ct)
    {
        var settings = options.Value;
        scan.Status = DocumentScanStatus.Scanning; scan.StartedAt = DateTimeOffset.UtcNow; scan.Attempts++; scan.Error = "";
        await db.SaveChangesAsync(ct);
        var watch = Stopwatch.StartNew();
        try
        {
            var verdict = scan.Source == DocumentScanSources.Declaration ? await ScanDeclarationDocumentAsync(db, ocr, scan, ct) : await ScanVerificationDocumentAsync(db, ocr, scan, ct);
            if (verdict is null) { db.DocumentScans.Remove(scan); await db.SaveChangesAsync(ct); return; }
            scan.Status = DocumentScanStatus.Completed; scan.Flag = verdict.Flag; scan.Score = verdict.Score; scan.DetectedType = Cut(verdict.DetectedType, 120);
            scan.Summary = Cut(verdict.Summary, 1000); scan.FindingsJson = JsonSerializer.Serialize(verdict.Findings.Select(f => new { check = f.Check, result = f.Result, detail = f.Detail }));
            scan.CompletedAt = DateTimeOffset.UtcNow; scan.NextAttemptAt = null; scan.ProcessingMs = watch.ElapsedMilliseconds;
            await Audit(db, scan, ct);
            await db.SaveChangesAsync(ct);
            logger.LogInformation("Scanned {Source} document {Kind} in {Seconds}s: {Flag}.", scan.Source, scan.Kind, watch.Elapsed.TotalSeconds.ToString("0"), scan.Flag);
        }
        catch (OcrUnreadableFileException exception)
        {
            // A file the engine cannot even open is itself worth an officer's attention.
            scan.Status = DocumentScanStatus.Completed; scan.Flag = DocumentScanFlags.Suspicious; scan.Score = 10; scan.DetectedType = "Damaged or unreadable file";
            scan.Summary = "The file could not be opened by the scanner — it may be damaged, empty, or not really a PDF or image. Open it and confirm it shows the document.";
            scan.FindingsJson = JsonSerializer.Serialize(new[] { new { check = "File opens", result = DocumentScanAnalyzer.Fail, detail = Cut(exception.Message, 300) } });
            scan.Error = ""; scan.CompletedAt = DateTimeOffset.UtcNow; scan.NextAttemptAt = null; scan.ProcessingMs = watch.ElapsedMilliseconds;
            await Audit(db, scan, ct);
            await db.SaveChangesAsync(CancellationToken.None);
        }
        catch (Exception exception) when (exception is OcrException or HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            scan.Error = Cut(exception is TaskCanceledException ? "The OCR service did not answer in time." : exception.Message, 1000);
            scan.ProcessingMs = watch.ElapsedMilliseconds;
            if (scan.Attempts >= settings.MaxAttempts) { scan.Status = DocumentScanStatus.Failed; scan.CompletedAt = DateTimeOffset.UtcNow; scan.NextAttemptAt = null; }
            else { scan.Status = DocumentScanStatus.Pending; scan.NextAttemptAt = DateTimeOffset.UtcNow.AddMinutes(Math.Pow(3, scan.Attempts)); }
            await db.SaveChangesAsync(CancellationToken.None);
            logger.LogWarning("Document scan attempt {Attempt} failed: {Error}", scan.Attempts, scan.Error);
        }
    }

    private static async Task<ScanVerdict?> ScanDeclarationDocumentAsync(CustomsDbContext db, IOcrClient ocr, DocumentScan scan, CancellationToken ct)
    {
        var document = await db.ImporterDocuments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == scan.DocumentId && d.Sha256 == scan.Sha256, ct);
        var declaration = await db.ImporterDeclarations.AsNoTracking().FirstOrDefaultAsync(d => d.Id == scan.OwnerId, ct);
        if (document is null || declaration is null) return null; // replaced or removed while queued
        var result = await ocr.ReadFieldsAsync(document.Content, document.ContentType, document.FileName, DeclarationFields, Instructions, ct);
        Record(scan, result);
        var lineId = declaration.ConfirmedTariffLineId ?? declaration.SuggestedTariffLineId;
        var line = await db.NationalTariffLines.AsNoTracking().Where(l => l.Id == lineId).Select(l => new { l.TariffItemNo, l.Code, l.HsCodeId }).FirstOrDefaultAsync(ct);
        var hs = line is null ? "" : !string.IsNullOrWhiteSpace(line.TariffItemNo) ? line.TariffItemNo : line.Code ?? "";
        if (hs.Length == 0 && line is not null) hs = await db.HsCodes.AsNoTracking().Where(h => h.Id == line.HsCodeId).Select(h => h.Code).FirstOrDefaultAsync(ct) ?? "";
        var names = await ImporterNames(db, declaration.ImporterId, ct);
        var duplicate = await db.ImporterDocuments.AsNoTracking().AnyAsync(d => d.DeclarationId == declaration.Id && d.Id != document.Id && d.Sha256 == document.Sha256, ct);
        var foreign = await db.ImporterDocuments.AsNoTracking().AnyAsync(d => d.Sha256 == document.Sha256 && db.ImporterDeclarations.Any(x => x.Id == d.DeclarationId && x.ImporterId != declaration.ImporterId), ct);
        return DocumentScanAnalyzer.AnalyzeDeclarationDocument(result.Text, new DeclarationScanContext(document.Kind, declaration.ProductName, declaration.Brand, declaration.Model, hs,
            declaration.OriginCountryCode, declaration.OriginCountryName, declaration.Quantity, declaration.Unit, declaration.InvoiceAmount, declaration.InvoiceCurrency, names, duplicate, foreign));
    }

    private static async Task<ScanVerdict?> ScanVerificationDocumentAsync(CustomsDbContext db, IOcrClient ocr, DocumentScan scan, CancellationToken ct)
    {
        var document = await db.ImporterProfileDocuments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == scan.DocumentId && d.Sha256 == scan.Sha256, ct);
        var profile = await db.ImporterProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.Id == scan.OwnerId, ct);
        if (document is null || profile is null) return null;
        var result = await ocr.ReadFieldsAsync(document.Content, document.ContentType, document.FileName, VerificationFields, Instructions, ct);
        Record(scan, result);
        var names = await ImporterNames(db, profile.AccountId, ct);
        var duplicate = await db.ImporterProfileDocuments.AsNoTracking().AnyAsync(d => d.ProfileId == profile.Id && d.Id != document.Id && d.Sha256 == document.Sha256, ct);
        var foreign = await db.ImporterProfileDocuments.AsNoTracking().AnyAsync(d => d.Sha256 == document.Sha256 && d.ProfileId != profile.Id, ct);
        return DocumentScanAnalyzer.AnalyzeVerificationDocument(result.Text, new VerificationScanContext(document.Kind, names, profile.Tin,
            [profile.TradeLicenseNumber, profile.BusinessRegistrationNumber, profile.VatNumber, profile.AgentLicenseNumber, profile.IdNumber], duplicate, foreign));
    }

    private static void Record(DocumentScan scan, OcrResult result)
    {
        scan.ExtractedText = result.Text.Length > 8000 ? result.Text[..8000] : result.Text;
        scan.Engine = Cut(result.Engine, 80); scan.Confidence = result.Confidence;
    }

    private static async Task<List<string>> ImporterNames(CustomsDbContext db, Guid accountId, CancellationToken ct)
    {
        var profile = await db.ImporterProfiles.AsNoTracking().Where(p => p.AccountId == accountId).Select(p => new { p.LegalName, p.TradeName }).FirstOrDefaultAsync(ct);
        var account = await db.AuthAccounts.AsNoTracking().Where(a => a.Id == accountId).Select(a => a.FullName).FirstOrDefaultAsync(ct);
        return new[] { profile?.LegalName, profile?.TradeName, account }.Where(n => !string.IsNullOrWhiteSpace(n)).Select(n => n!).Distinct().ToList();
    }

    /// <summary>Each verdict is an audit event in the case (or verification) history; importers never see it.</summary>
    private static async Task Audit(CustomsDbContext db, DocumentScan scan, CancellationToken ct)
    {
        var declaration = scan.Source == DocumentScanSources.Declaration;
        var owner = declaration
            ? await db.ImporterDeclarations.AsNoTracking().Where(d => d.Id == scan.OwnerId).Select(d => new { Subject = d.ImporterId, Location = (Guid?)d.LocationId, d.Reference }).FirstOrDefaultAsync(ct)
            : await db.ImporterProfiles.AsNoTracking().Where(p => p.Id == scan.OwnerId).Select(p => new { Subject = p.AccountId, Location = (Guid?)p.RegionLocationId, Reference = p.LegalName }).FirstOrDefaultAsync(ct);
        var label = DocumentScanAnalyzer.KindLabels.TryGetValue(scan.Kind, out var name) ? name : scan.Kind;
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(), UserId = "", Username = "Document scanner", OccurredAt = DateTimeOffset.UtcNow,
            Action = declaration ? "IMPORTER_DECLARATION_DOCUMENT_SCANNED" : "IMPORTER_VERIFICATION_DOCUMENT_SCANNED",
            Module = declaration ? "ImporterDeclarations" : "ImporterVerification", RecordId = scan.OwnerId, LocationId = owner?.Location, SubjectUserId = owner?.Subject,
            Decision = scan.Flag, Justification = $"{label}: {scan.Summary}",
            NewValueJson = JsonSerializer.Serialize(new { scan.Kind, scan.Flag, scan.Score, scan.DetectedType, scan.Sha256, reference = owner?.Reference }),
        });
    }

    private static string Cut(string value, int length) => value.Length <= length ? value : value[..length];
}
