using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Security;
using SES.Customs.API.Services;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

public sealed record ImporterVerificationReview(string Action, string? Note, Guid ExpectedVersion);

/// <summary>An importer's own verification record.</summary>
[ApiController, Route("api/importer-profile"), Authorize(Roles = "Importer"), ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class ImporterProfileController(CustomsDbContext db, WorkspaceAccess access, ImporterProfileService profiles) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var profile = await db.ImporterProfiles.AsNoTracking().Include(x => x.Documents).FirstOrDefaultAsync(x => x.AccountId == access.UserId, ct);
        if (profile is null) return NotFound(new { code = "PROFILE_MISSING", message = "Complete importer verification to submit declarations." });
        var region = await db.CustomsLocations.AsNoTracking().Where(l => l.Id == profile.RegionLocationId).Select(l => l.Name).FirstOrDefaultAsync(ct);
        return Ok(ImporterProfileService.View(profile, region));
    }

    [HttpPut, RequestSizeLimit(45_000_000)]
    public async Task<IActionResult> Submit([FromForm] ImporterProfileForm form, CancellationToken ct)
    {
        var account = await db.AuthAccounts.AsNoTracking().SingleAsync(x => x.Id == access.UserId, ct);
        var existing = await db.ImporterProfiles.Include(x => x.Documents).FirstOrDefaultAsync(x => x.AccountId == access.UserId, ct);
        if (existing is not null && (existing.VerificationStatus != ImporterVerification.InformationRequested || existing.Version != form.ExpectedVersion))
            return Conflict(new { message = existing.VerificationStatus == ImporterVerification.InformationRequested ? "Your verification changed. Refresh and try again." : "Your verification is not open for changes." });
        var profile = await profiles.ApplyAsync(existing, account.Id, account.FullName, form, ct);
        if (existing is null) db.ImporterProfiles.Add(profile);
        profiles.Audit(profile, account.Id, account.Username, existing is null ? "IMPORTER_VERIFICATION_SUBMITTED" : "IMPORTER_VERIFICATION_RESUBMITTED", null);
        await db.SaveChangesAsync(ct);
        return Ok(ImporterProfileService.View(profile));
    }

    [HttpGet("documents/{kind}")]
    public async Task<IActionResult> Document(string kind, CancellationToken ct)
    {
        var document = await db.ImporterProfileDocuments.AsNoTracking()
            .Where(d => d.Kind == kind.ToUpperInvariant() && db.ImporterProfiles.Any(p => p.Id == d.ProfileId && p.AccountId == access.UserId))
            .FirstOrDefaultAsync(ct);
        return document is null ? NotFound(new { message = "Document not found." }) : File(document.Content, document.ContentType);
    }
}

/// <summary>Officers verify importers who registered in the officer's region.</summary>
[ApiController, Route("api/importer-verifications"), Authorize(Roles = "CustomsOfficer"), ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class ImporterVerificationsController(CustomsDbContext db, WorkspaceAccess access, ImporterProfileService profiles) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] string? q, CancellationToken ct)
    {
        var region = await OfficerRegion(ct);
        var regional = db.ImporterProfiles.AsNoTracking().Where(x => x.RegionKey == region);
        var counts = await regional.GroupBy(x => x.VerificationStatus).Select(g => new { status = g.Key, count = g.Count() }).ToListAsync(ct);
        var query = from p in regional join a in db.AuthAccounts.AsNoTracking() on p.AccountId equals a.Id select new { p, a };
        if (!string.IsNullOrWhiteSpace(status)) { var wanted = status.Trim().ToUpperInvariant(); query = query.Where(x => x.p.VerificationStatus == wanted); }
        var term = q?.Trim().ToLower() ?? "";
        if (term.Length > 100) return BadRequest(new { message = "Search with 100 characters or fewer." });
        if (term.Length > 0) query = query.Where(x => x.p.LegalName.ToLower().Contains(term) || x.p.TradeName.ToLower().Contains(term) || x.p.Tin.Contains(term) || x.a.Email.ToLower().Contains(term) || x.a.FullName.ToLower().Contains(term) || x.p.City.ToLower().Contains(term));
        var rows = await query.OrderByDescending(x => x.p.SubmittedAt).Take(500)
            .Select(x => new { x.p.Id, x.p.ImporterType, x.p.VerificationStatus, x.p.LegalName, x.p.TradeName, x.p.Tin, x.p.City, x.p.Phone, x.p.SubmittedAt, x.p.ReviewedAt, applicant = x.a.FullName, x.a.Email }).ToListAsync(ct);
        return Ok(new { region, counts = ImporterVerification.Statuses.ToDictionary(s => s, s => counts.FirstOrDefault(c => c.status == s)?.count ?? 0), items = rows });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var profile = await Accessible(id, ct);
        var account = await db.AuthAccounts.AsNoTracking().Where(a => a.Id == profile.AccountId).Select(a => new { a.FullName, a.Email, a.CreatedAt }).SingleAsync(ct);
        var region = await db.CustomsLocations.AsNoTracking().Where(l => l.Id == profile.RegionLocationId).Select(l => l.Name).FirstOrDefaultAsync(ct);
        var history = await db.AuditLogs.AsNoTracking().Where(x => x.Module == "ImporterVerification" && x.RecordId == profile.Id).OrderByDescending(x => x.OccurredAt).Take(50)
            .Select(x => new { x.OccurredAt, x.Action, x.Username, x.Decision, note = x.Justification }).ToListAsync(ct);
        return Ok(new { profile = ImporterProfileService.View(profile, region), account, duplicates = await profiles.DuplicatesAsync(profile, ct), history, allowedActions = ImporterVerification.AllowedActions(profile.VerificationStatus) });
    }

    [HttpGet("{id:guid}/documents/{kind}")]
    public async Task<IActionResult> Document(Guid id, string kind, CancellationToken ct)
    {
        var profile = await Accessible(id, ct);
        var document = profile.Documents.FirstOrDefault(d => d.Kind == kind.ToUpperInvariant());
        return document is null ? NotFound(new { message = "Document not found." }) : File(document.Content, document.ContentType);
    }

    [HttpPost("{id:guid}/review")]
    public async Task<IActionResult> Review(Guid id, ImporterVerificationReview input, CancellationToken ct)
    {
        var profile = await Accessible(id, ct);
        if (profile.Version != input.ExpectedVersion) return Conflict(new { message = "This importer changed. Refresh before deciding." });
        var action = input.Action?.Trim().ToUpperInvariant() ?? "";
        var note = input.Note?.Trim() ?? "";
        if (note.Length > 2000) return BadRequest(new { message = "Review notes must be 2,000 characters or fewer." });
        var next = ImporterVerification.NextStatus(profile.VerificationStatus, action);
        if (next is null) return Conflict(new { message = $"This action is not available while the importer is {profile.VerificationStatus.Replace('_', ' ').ToLowerInvariant()}." });
        if (ImporterVerification.ActionNeedsReason(action) && note.Length < 10) return BadRequest(new { message = "Explain the reason in at least 10 characters so the importer knows what to do." });
        profile.VerificationStatus = next;
        profile.ReviewNote = note; profile.ReviewedById = access.UserId; profile.ReviewedAt = DateTimeOffset.UtcNow;
        profile.UpdatedAt = profile.ReviewedAt.Value; profile.Version = Guid.NewGuid();
        profiles.Audit(profile, access.UserId, User.Identity?.Name ?? "", $"IMPORTER_VERIFICATION_{action}", note);
        var (title, message) = action switch
        {
            "VERIFY" => ("Your importer account is verified", "You can now submit import declarations."),
            "REINSTATE" => ("Your importer account is reinstated", "You can submit import declarations again."),
            "REQUEST_INFORMATION" => ("More information needed for your account", note),
            "REJECT" => ("Your importer registration was not approved", note),
            "SUSPEND" => ("Your importer account is suspended", note),
            _ => ("Your importer account was updated", note)
        };
        db.ImporterNotifications.Add(ImporterNotification.Create(profile.AccountId, null, $"ACCOUNT_{action}", title, message, "/importer/account"));
        await db.SaveChangesAsync(ct);
        return Ok(ImporterProfileService.View(profile));
    }

    private async Task<string> OfficerRegion(CancellationToken ct) =>
        await access.ActorRegion(ct) ?? throw new WorkspaceException(403, "Your account is not assigned to a customs region.");

    private async Task<ImporterProfile> Accessible(Guid id, CancellationToken ct)
    {
        var profile = await db.ImporterProfiles.Include(x => x.Documents).FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new WorkspaceException(404, "Application not found.");
        if (!string.Equals(profile.RegionKey, await OfficerRegion(ct), StringComparison.OrdinalIgnoreCase))
            throw new WorkspaceException(403, "This importer registered in another region.");
        return profile;
    }
}
