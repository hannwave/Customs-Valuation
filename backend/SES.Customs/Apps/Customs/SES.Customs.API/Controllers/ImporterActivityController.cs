using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Security;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

/// <summary>
/// The importer's own audit trail: their declarations, verification and account, in plain language.
/// Staff appear by role and office only; internal valuation evidence and officer working notes are never included.
/// </summary>
[ApiController, Route("api/importer-activity"), Authorize(Roles = "Importer"), ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class ImporterActivityController(CustomsDbContext db, WorkspaceAccess access) : ControllerBase
{
    private sealed record Label(string Title, string Tone, bool ShowNote);

    /// <summary>Events an importer may see, with the wording they see. Anything not listed stays internal.</summary>
    private static readonly Dictionary<string, Label> Labels = new()
    {
        ["IMPORTER_DECLARATION_SUBMITTED"] = new("Declaration submitted", "info", false),
        ["IMPORTER_DECLARATION_RESUBMITTED"] = new("Declaration resubmitted with your response", "info", false),
        ["IMPORTER_DECLARATION_EDITED"] = new("Declaration edited before review", "info", false),
        ["IMPORTER_DECLARATION_REVIEW_STARTED"] = new("Officer review started", "info", false),
        ["IMPORTER_DECLARATION_VERIFIED"] = new("Approved for valuation", "success", true),
        ["IMPORTER_DECLARATION_ASSESSMENT_READY"] = new("Approved for valuation", "success", true),
        ["IMPORTER_DECLARATION_INFORMATION_REQUESTED"] = new("Officer requested more information", "warning", true),
        ["IMPORTER_DECLARATION_REJECTED"] = new("Declaration rejected", "danger", true),
        ["IMPORTER_DECLARATION_RECLASSIFIED"] = new("Tariff classification changed", "warning", true),
        ["VALUATION_SUBMITTED"] = new("Customs value set", "info", false),
        ["IMPORTER_DECLARATION_ASSESSED"] = new("Assessment issued — duties and taxes payable", "success", false),
        ["IMPORTER_VERIFICATION_SUBMITTED"] = new("Verification submitted", "info", false),
        ["IMPORTER_VERIFICATION_RESUBMITTED"] = new("Verification updated and resubmitted", "info", false),
        ["IMPORTER_VERIFICATION_VERIFY"] = new("Importer account verified", "success", true),
        ["IMPORTER_VERIFICATION_REQUEST_INFORMATION"] = new("Officer requested more verification information", "warning", true),
        ["IMPORTER_VERIFICATION_REJECT"] = new("Verification not approved", "danger", true),
        ["IMPORTER_VERIFICATION_SUSPEND"] = new("Importer account suspended", "danger", true),
        ["IMPORTER_VERIFICATION_REINSTATE"] = new("Importer account reinstated", "success", true),
        ["IDENTITY_CHANGE_REQUESTED"] = new("Change of details requested", "info", true),
        ["IDENTITY_CHANGE_CANCELLED"] = new("Change request cancelled", "neutral", false),
        ["IDENTITY_CHANGE_APPROVED"] = new("Change of details approved", "success", true),
        ["IDENTITY_CHANGE_REJECTED"] = new("Change of details not approved", "danger", true),
        ["IMPORTER_ACCOUNT_UPDATED"] = new("Contact details updated", "neutral", false),
        ["PROFILE_PHOTO_UPDATED"] = new("Profile picture changed", "neutral", false),
        ["PROFILE_PHOTO_REMOVED"] = new("Profile picture removed", "neutral", false),
        ["PASSWORD_CHANGED"] = new("Password changed", "neutral", false),
        ["USER_SIGNED_IN"] = new("Signed in", "neutral", false),
        ["SIGN_IN_FAILED"] = new("Failed sign-in attempt (wrong password)", "warning", false),
    };

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? category, [FromQuery] int page = 1, CancellationToken ct = default)
    {
        var me = access.UserId; var meText = me.ToString();
        var declarations = db.ImporterDeclarations.Where(d => d.ImporterId == me).Select(d => d.Id);
        var decisions = db.ValuationDecisions.Where(d => d.ImporterDeclarationId != null && declarations.Contains(d.ImporterDeclarationId.Value)).Select(d => d.Id);
        var actions = Labels.Keys.ToArray();
        var query = db.AuditLogs.AsNoTracking().Where(a => actions.Contains(a.Action) && (
            declarations.Contains(a.RecordId) || decisions.Contains(a.RecordId) || a.SubjectUserId == me || a.UserId == meText));
        var wanted = (category ?? "").ToUpperInvariant();
        if (wanted is AuditTaxonomy.Case or AuditTaxonomy.Verification or AuditTaxonomy.Account or AuditTaxonomy.Security) query = query.Where(a => a.Category == wanted);
        var total = await query.CountAsync(ct);
        const int pageSize = 30;
        page = Math.Clamp(page, 1, Math.Max(1, (int)Math.Ceiling(total / (double)pageSize)));
        var rows = await query.OrderByDescending(a => a.OccurredAt).ThenByDescending(a => a.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        var recordIds = rows.Select(r => r.RecordId).Distinct().ToList();
        var decisionToDeclaration = await db.ValuationDecisions.AsNoTracking().Where(d => recordIds.Contains(d.Id) && d.ImporterDeclarationId != null)
            .ToDictionaryAsync(d => d.Id, d => d.ImporterDeclarationId!.Value, ct);
        var declarationIds = recordIds.Concat(decisionToDeclaration.Values).Distinct().ToList();
        var mine = await db.ImporterDeclarations.AsNoTracking().Where(d => d.ImporterId == me && declarationIds.Contains(d.Id))
            .Select(d => new { d.Id, d.Reference, d.ProductName, d.Brand, d.Model }).ToDictionaryAsync(d => d.Id, ct);
        var locationIds = rows.Select(r => r.LocationId).OfType<Guid>().Distinct().ToList();
        var offices = await db.CustomsLocations.AsNoTracking().Where(l => locationIds.Contains(l.Id)).ToDictionaryAsync(l => l.Id, l => string.IsNullOrWhiteSpace(l.DisplayName) ? l.Name : l.DisplayName, ct);

        var categories = await db.AuditLogs.AsNoTracking().Where(a => actions.Contains(a.Action) && (declarations.Contains(a.RecordId) || decisions.Contains(a.RecordId) || a.SubjectUserId == me || a.UserId == meText))
            .GroupBy(a => a.Category).Select(g => new { g.Key, count = g.Count() }).ToListAsync(ct);

        return Ok(new
        {
            total, page, pageSize,
            counts = categories.ToDictionary(c => c.Key, c => c.count),
            items = rows.Select(r =>
            {
                var label = Labels[r.Action];
                var declarationId = mine.ContainsKey(r.RecordId) ? r.RecordId : decisionToDeclaration.TryGetValue(r.RecordId, out var linked) ? linked : (Guid?)null;
                var declaration = declarationId is Guid id && mine.TryGetValue(id, out var found) ? found : null;
                var byMe = r.UserId == meText;
                var office = r.LocationId is Guid location && offices.TryGetValue(location, out var name) ? name : null;
                var actor = byMe ? "You" : r.ActorRole switch
                {
                    AccessRules.Officer => office is null ? "Customs Officer" : $"Customs Officer · {office}",
                    AccessRules.CustomsAdmin => office is null ? "Customs Administrator" : $"Customs Administrator · {office}",
                    AccessRules.SystemAdmin => "Customs system administrator",
                    _ => "Ethiopian Customs Commission",
                };
                return new
                {
                    r.Id, r.OccurredAt, r.Category, r.Action, title = label.Title, tone = label.Tone, actor, byMe,
                    note = label.ShowNote && !byMe ? r.Justification : r.Action == "IDENTITY_CHANGE_REQUESTED" ? r.Justification : null,
                    declaration = declaration is null ? null : new
                    {
                        declaration.Id, declaration.Reference,
                        title = string.IsNullOrWhiteSpace(declaration.Model) || declaration.Model == "Generic" ? declaration.ProductName : $"{declaration.Brand} {declaration.Model}".Trim(),
                    },
                    link = declaration is not null ? $"/importer/declarations/{declaration.Id}" : r.Category == AuditTaxonomy.Verification ? "/importer/account" : r.Category == AuditTaxonomy.Account ? "/importer/profile" : null,
                };
            }),
        });
    }
}
