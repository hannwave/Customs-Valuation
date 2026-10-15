using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Security;
using SES.Customs.API.Services;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

public sealed class IdentityChangeForm
{
    public string? FullName { get; set; }
    public string? LegalName { get; set; }
    public string? Tin { get; set; }
    public string Reason { get; set; } = "";
    public IFormFile? Document { get; set; }
}

public sealed record IdentityChangeDecision(string Action, string? Note, Guid ExpectedVersion);

internal static class IdentityChanges
{
    public const string Module = "ImporterChangeRequests";
    public static readonly string[] Statuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

    public static object View(ImporterChangeRequest x, string? importerName = null, string? email = null, string? importerType = null) => new
    {
        x.Id, x.AccountId, x.Status, x.Reason, x.ReviewNote, x.ReviewedAt, x.CreatedAt, x.Version,
        importerName, email, importerType,
        changes = Changes(x).Select(c => new { field = c.Field, label = c.Label, current = c.Current, requested = c.Requested }).ToArray(),
        document = new { fileName = x.DocumentFileName, contentType = x.DocumentContentType, size = x.DocumentSize, sha256 = x.DocumentSha256 },
    };

    public static IEnumerable<(string Field, string Label, string Current, string Requested)> Changes(ImporterChangeRequest x)
    {
        if (x.RequestedFullName is not null) yield return ("FULL_NAME", "Full name", x.CurrentFullName, x.RequestedFullName);
        if (x.RequestedLegalName is not null) yield return ("LEGAL_NAME", "Registered name", x.CurrentLegalName, x.RequestedLegalName);
        if (x.RequestedTin is not null) yield return ("TIN", "TIN", x.CurrentTin, x.RequestedTin);
    }

    public static object Snapshot(ImporterChangeRequest x) => new
    {
        x.Status, changes = Changes(x).Select(c => new { c.Label, c.Current, c.Requested }).ToArray(), x.Reason, document = x.DocumentFileName, x.DocumentSha256, x.ReviewNote
    };

    public static string Summary(ImporterChangeRequest x) => string.Join("; ", Changes(x).Select(c => $"{c.Label}: “{c.Current}” → “{c.Requested}”"));
}

/// <summary>An importer asks to change verified identity details (name, registered name, TIN) with a supporting document.</summary>
[ApiController, Route("api/importer-profile/change-requests"), Authorize(Roles = "Importer"), ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class ImporterChangeRequestsController(CustomsDbContext db, WorkspaceAccess access) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Mine(CancellationToken ct) =>
        Ok((await db.ImporterChangeRequests.AsNoTracking().Where(x => x.AccountId == access.UserId).OrderByDescending(x => x.CreatedAt).Take(20).ToListAsync(ct)).Select(x => IdentityChanges.View(x)));

    [HttpPost, RequestSizeLimit(12_000_000)]
    public async Task<IActionResult> Create([FromForm] IdentityChangeForm form, CancellationToken ct)
    {
        var account = await db.AuthAccounts.AsNoTracking().SingleAsync(a => a.Id == access.UserId, ct);
        var profile = await db.ImporterProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.AccountId == access.UserId, ct);
        WorkspaceAccess.Validate(!await db.ImporterChangeRequests.AnyAsync(x => x.AccountId == access.UserId && x.Status == "PENDING", ct),
            "You already have a change request waiting for an officer. Cancel it first to send a different one.");
        string? Clean(string? value) => value is null ? null : Regex.Replace(value, @"\s+", " ").Trim();
        var fullName = Clean(form.FullName); var legalName = Clean(form.LegalName);
        var tin = form.Tin is null ? null : Regex.Replace(form.Tin, "\\D", "");
        if (fullName == account.FullName || fullName?.Length == 0) fullName = null;
        if (legalName == profile?.LegalName || legalName?.Length == 0) legalName = null;
        if (tin == profile?.Tin || tin?.Length == 0) tin = null;
        WorkspaceAccess.Validate(fullName is not null || legalName is not null || tin is not null, "Change at least one detail: your name, registered name or TIN.");
        WorkspaceAccess.Validate(fullName is null || fullName.Length is >= 2 and <= 200, "Enter the new full name (2 to 200 characters).");
        WorkspaceAccess.Validate(profile is not null, "Complete your importer verification first. Until then you can edit your name directly on your profile.");
        WorkspaceAccess.Validate(legalName is null || legalName.Length is >= 2 and <= 200, "Enter the new registered name (2 to 200 characters).");
        WorkspaceAccess.Validate(tin is null || ImporterVerification.IsValidTin(tin), "Enter the new 10-digit Taxpayer Identification Number (TIN).");
        var reason = (form.Reason ?? "").Trim();
        WorkspaceAccess.Validate(reason.Length is >= 10 and <= 1000, "Explain why the details changed (at least 10 characters).");
        WorkspaceAccess.Validate(form.Document is not null, "Attach a document that proves the change, such as an ID, a renewed trade licence or a TIN certificate.");
        var document = await UploadedDocumentReader.ReadAsync(form.Document!, ct);

        var request = new ImporterChangeRequest
        {
            Id = Guid.NewGuid(), AccountId = account.Id, ProfileId = profile?.Id, RegionLocationId = profile?.RegionLocationId, RegionKey = profile?.RegionKey ?? "",
            CurrentFullName = account.FullName, RequestedFullName = fullName, CurrentLegalName = profile?.LegalName ?? "", RequestedLegalName = legalName,
            CurrentTin = profile?.Tin ?? "", RequestedTin = tin, Reason = reason,
            DocumentFileName = document.FileName, DocumentContentType = document.ContentType, DocumentSize = document.Content.LongLength, DocumentSha256 = document.Sha256, DocumentContent = document.Content,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.ImporterChangeRequests.Add(request);
        var audit = access.Audit("IDENTITY_CHANGE_REQUESTED", IdentityChanges.Module, request.Id, null, IdentityChanges.Snapshot(request), $"{IdentityChanges.Summary(request)}. Reason: {reason}", request.RegionLocationId);
        audit.SubjectUserId = account.Id;
        await db.SaveChangesAsync(ct);
        return Ok(IdentityChanges.View(request));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        var request = await db.ImporterChangeRequests.FirstOrDefaultAsync(x => x.Id == id && x.AccountId == access.UserId, ct) ?? throw new WorkspaceException(404, "Change request not found.");
        WorkspaceAccess.Validate(request.Status == "PENDING", "Only a request that is still waiting can be cancelled.");
        request.Status = "CANCELLED"; request.Version = Guid.NewGuid();
        var audit = access.Audit("IDENTITY_CHANGE_CANCELLED", IdentityChanges.Module, request.Id, null, IdentityChanges.Snapshot(request), "Importer cancelled the change request.", request.RegionLocationId);
        audit.SubjectUserId = request.AccountId;
        await db.SaveChangesAsync(ct);
        return Ok(IdentityChanges.View(request));
    }

    [HttpGet("{id:guid}/document")]
    public async Task<IActionResult> Document(Guid id, CancellationToken ct)
    {
        var request = await db.ImporterChangeRequests.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.AccountId == access.UserId, ct) ?? throw new WorkspaceException(404, "Change request not found.");
        return File(request.DocumentContent, request.DocumentContentType);
    }
}

/// <summary>Officers in the importer's region check the supporting document against the requested change and approve or reject it.</summary>
[ApiController, Route("api/importer-verifications/change-requests"), Authorize(Roles = "CustomsOfficer"), ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class IdentityChangeReviewController(CustomsDbContext db, WorkspaceAccess access) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, CancellationToken ct)
    {
        var region = await Region(ct);
        var regional = db.ImporterChangeRequests.AsNoTracking().Where(x => x.RegionKey == region);
        var counts = await regional.GroupBy(x => x.Status).Select(g => new { status = g.Key, count = g.Count() }).ToListAsync(ct);
        var wanted = (status ?? "PENDING").ToUpperInvariant();
        var rows = await (from x in regional.Where(x => wanted == "ALL" || x.Status == wanted)
                          join a in db.AuthAccounts.AsNoTracking() on x.AccountId equals a.Id
                          join p in db.ImporterProfiles.AsNoTracking() on x.AccountId equals p.AccountId into profiles
                          from p in profiles.DefaultIfEmpty()
                          orderby x.CreatedAt descending
                          select new { x, a.FullName, a.Email, legal = p == null ? null : p.LegalName, type = p == null ? null : p.ImporterType }).Take(200).ToListAsync(ct);
        return Ok(new
        {
            counts = IdentityChanges.Statuses.ToDictionary(s => s, s => counts.FirstOrDefault(c => c.status == s)?.count ?? 0),
            items = rows.Select(r => IdentityChanges.View(r.x, r.legal ?? r.FullName, r.Email, r.type)),
        });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var request = await Accessible(id, ct);
        var account = await db.AuthAccounts.AsNoTracking().Where(a => a.Id == request.AccountId).Select(a => new { a.FullName, a.Email }).SingleAsync(ct);
        var profile = await db.ImporterProfiles.AsNoTracking().Where(p => p.AccountId == request.AccountId).Select(p => new { p.Id, p.LegalName, p.ImporterType, p.Tin, p.VerificationStatus }).FirstOrDefaultAsync(ct);
        var tinTaken = request.RequestedTin is null ? 0 : await db.ImporterProfiles.CountAsync(p => p.AccountId != request.AccountId && p.Tin == request.RequestedTin, ct);
        return Ok(new { request = IdentityChanges.View(request, profile?.LegalName ?? account.FullName, account.Email, profile?.ImporterType), profile, tinTaken });
    }

    [HttpGet("{id:guid}/document")]
    public async Task<IActionResult> Document(Guid id, CancellationToken ct)
    {
        var request = await Accessible(id, ct);
        access.AuditAccess("DOCUMENT_OPENED", IdentityChanges.Module, request.Id, request.RegionLocationId, request.AccountId, $"change request evidence · {request.DocumentFileName}");
        await db.SaveChangesAsync(ct);
        return File(request.DocumentContent, request.DocumentContentType);
    }

    [HttpPost("{id:guid}/decision")]
    public async Task<IActionResult> Decide(Guid id, IdentityChangeDecision input, CancellationToken ct)
    {
        var request = await Accessible(id, ct);
        var action = (input.Action ?? "").Trim().ToUpperInvariant();
        var note = (input.Note ?? "").Trim();
        WorkspaceAccess.Validate(action is "APPROVE" or "REJECT", "Choose approve or reject.");
        WorkspaceAccess.Validate(request.Status == "PENDING", "This request has already been decided.");
        WorkspaceAccess.Validate(request.Version == input.ExpectedVersion, "The request changed since you opened it. Refresh and try again.");
        WorkspaceAccess.Validate(action == "APPROVE" || note.Length >= 10, "Write a reason of at least 10 characters for the importer.");
        WorkspaceAccess.Validate(note.Length <= 2000, "The note must be 2,000 characters or fewer.");

        var account = await db.AuthAccounts.SingleAsync(a => a.Id == request.AccountId, ct);
        var profile = await db.ImporterProfiles.FirstOrDefaultAsync(p => p.AccountId == request.AccountId, ct);
        var before = new { account.FullName, legalName = profile?.LegalName, tin = profile?.Tin };
        if (action == "APPROVE")
        {
            if (request.RequestedTin is not null)
                WorkspaceAccess.Validate(!await db.ImporterProfiles.AnyAsync(p => p.AccountId != request.AccountId && p.Tin == request.RequestedTin, ct), "Another importer is already registered with the requested TIN.");
            if (request.RequestedFullName is not null) { account.FullName = request.RequestedFullName; account.UpdatedAt = DateTimeOffset.UtcNow; }
            if (profile is not null)
            {
                if (request.RequestedLegalName is not null) profile.LegalName = request.RequestedLegalName;
                if (request.RequestedTin is not null) profile.Tin = request.RequestedTin;
                if (request.RequestedLegalName is not null || request.RequestedTin is not null) { profile.UpdatedAt = DateTimeOffset.UtcNow; profile.Version = Guid.NewGuid(); }
            }
        }
        request.Status = action == "APPROVE" ? "APPROVED" : "REJECTED";
        request.ReviewNote = note; request.ReviewedAt = DateTimeOffset.UtcNow; request.ReviewedById = access.UserId; request.Version = Guid.NewGuid();
        var audit = access.Audit(action == "APPROVE" ? "IDENTITY_CHANGE_APPROVED" : "IDENTITY_CHANGE_REJECTED", IdentityChanges.Module, request.Id,
            before, action == "APPROVE" ? new { account.FullName, legalName = profile?.LegalName, tin = profile?.Tin } : IdentityChanges.Snapshot(request),
            string.IsNullOrWhiteSpace(note) ? $"Approved: {IdentityChanges.Summary(request)}" : note, request.RegionLocationId);
        audit.SubjectUserId = request.AccountId;
        db.ImporterNotifications.Add(ImporterNotification.Create(request.AccountId, null, action == "APPROVE" ? "ACCOUNT_CHANGE_APPROVED" : "ACCOUNT_CHANGE_REJECTED",
            action == "APPROVE" ? "Your details were updated" : "Your change request was not approved",
            action == "APPROVE" ? $"A Customs Officer approved the change: {IdentityChanges.Summary(request)}." : note, "/importer/profile"));
        await db.SaveChangesAsync(ct);
        return Ok(IdentityChanges.View(request));
    }

    private async Task<string> Region(CancellationToken ct) => await access.ActorRegion(ct) ?? throw new WorkspaceException(403, "Your account is not assigned to a customs region.");

    private async Task<ImporterChangeRequest> Accessible(Guid id, CancellationToken ct)
    {
        var request = await db.ImporterChangeRequests.FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new WorkspaceException(404, "Change request not found.");
        if (!string.Equals(request.RegionKey, await Region(ct), StringComparison.OrdinalIgnoreCase)) throw new WorkspaceException(403, "This importer registered in another region.");
        return request;
    }
}
