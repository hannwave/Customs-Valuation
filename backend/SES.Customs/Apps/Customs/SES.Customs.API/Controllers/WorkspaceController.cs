using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Security;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using static SES.Customs.API.Security.WorkspaceAccess;

namespace SES.Customs.API.Controllers;

public sealed record LocationChange(CustomsLocation Location, string Reason);
public sealed record ScopeChange(Guid LocationId, bool IncludeChildren, string Responsibilities, string Reason);
public sealed record EmployeeCreate(string Username, string FullName, string Email, string Password, string Role, Guid LocationId, bool IncludeChildren, string EmployeeNumber, string Phone);
public sealed record EmployeeChange(string Status, Guid LocationId, bool IncludeChildren, string Responsibilities, string Reason);
public sealed record ProfileChange(string Username, string Email, string FullName, string Phone);
public sealed record PasswordChange(string CurrentPassword, string NewPassword, string ConfirmPassword);
public sealed record DecisionInput(Guid HsCodeId, Guid? LocationId, decimal SelectedReferenceValue, string Currency, string Decision, string Justification, string Evidence, Guid? Version);
public sealed record DecisionTransition(Guid Version, string Justification, string Outcome = "Approved");

[ApiController, Route("api/workspace"), Authorize, ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class WorkspaceController(CustomsDbContext db, WorkspaceAccess access) : ControllerBase
{
    public static readonly string[] LocationTypes = ["HEAD_OFFICE", "BRANCH_OFFICE", "CUSTOMS_STATION", "CHECKPOINT", "INSPECTION_POINT", "DRY_PORT", "AIRPORT", "CARGO_OFFICE", "INDUSTRIAL_PARK", "RAIL_STATION", "FREE_TRADE_ZONE", "SPECIAL_ECONOMIC_ZONE", "TAX_CENTER", "COORDINATION_OFFICE", "WAREHOUSE", "OTHER"];
    public static readonly string[] LocationStatuses = ["ACTIVE", "INACTIVE", "TEMPORARILY_CLOSED", "PLANNED", "ARCHIVED"];

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var user = await db.AuthAccounts.AsNoTracking().SingleAsync(u => u.Id == access.UserId, ct);
        var scope = await access.Locations(ct);
        return Ok(new { user = PublicUser(user), permissions = AccessRules.Permissions(access.Role), locations = await db.CustomsLocations.AsNoTracking().Where(l => scope.Contains(l.Id)).OrderBy(l => l.Name).ToListAsync(ct), locationTypes = LocationTypes, locationStatuses = LocationStatuses });
    }
    [HttpGet("profile")]
    public async Task<IActionResult> Profile(CancellationToken ct)
    {
        var user = await db.AuthAccounts.AsNoTracking().SingleAsync(u => u.Id == access.UserId, ct);
        var now = DateTimeOffset.UtcNow;
        var assignments = await db.UserLocationScopes.AsNoTracking()
            .Where(s => s.UserId == access.UserId && s.EffectiveFrom <= now && (s.EffectiveTo == null || s.EffectiveTo > now))
            .OrderBy(s => s.EffectiveFrom)
            .ToListAsync(ct);
        var locationIds = assignments.Select(s => s.CustomsLocationId).Distinct().ToList();
        var locations = await db.CustomsLocations.AsNoTracking().Where(l => locationIds.Contains(l.Id)).OrderBy(l => l.Name).ToListAsync(ct);
        return Ok(new {
            user = new { user.Username, user.Email, user.FullName, role = AccessRules.NormalizeRole(user.Role), roleCode = AccessRules.Code(user.Role), user.EmployeeNumber, user.Phone },
            assignments = assignments.Select(s => new { s.Id, s.CustomsLocationId, s.IncludeChildLocations, s.Responsibilities, location = locations.FirstOrDefault(l => l.Id == s.CustomsLocationId) })
        });
    }
    [HttpPatch("profile")]
    public async Task<IActionResult> UpdateProfile(ProfileChange input, CancellationToken ct)
    {
        var user = await db.AuthAccounts.SingleAsync(u => u.Id == access.UserId, ct);
        var username = (input.Username ?? "").Trim();
        var email = (input.Email ?? "").Trim().ToLowerInvariant();
        var fullName = (input.FullName ?? "").Trim();
        var phone = (input.Phone ?? "").Trim();
        Validate(Regex.IsMatch(username, "^[a-zA-Z0-9_.-]{3,120}$"), "Use a username with 3-120 letters, numbers, dots, hyphens or underscores.");
        Validate(System.Net.Mail.MailAddress.TryCreate(email, out _), "Enter a valid email address.");
        Validate(fullName.Length is >= 2 and <= 200, "Enter your full name.");
        Validate(phone.Length <= 40, "Phone number is too long.");
        Validate(!await db.AuthAccounts.AnyAsync(u => u.Id != user.Id && u.Username == username, ct), "That username is already used.");
        Validate(!await db.AuthAccounts.AnyAsync(u => u.Id != user.Id && u.Email == email, ct), "That email is already used.");
        var before = new { user.Username, user.Email, user.FullName, user.Phone };
        user.Username = username; user.Email = email; user.FullName = fullName; user.Phone = phone; user.UpdatedAt = DateTimeOffset.UtcNow;
        access.Audit("PROFILE_UPDATED", "Users", user.Id, before, new { user.Username, user.Email, user.FullName, user.Phone }, "User updated their own profile.");
        await db.SaveChangesAsync(ct);
        return Ok(new { user = new { user.Username, user.Email, user.FullName, role = AccessRules.NormalizeRole(user.Role), roleCode = AccessRules.Code(user.Role), user.EmployeeNumber, user.Phone } });
    }
    [HttpPost("profile/password")]
    public async Task<IActionResult> ChangePassword(PasswordChange input, CancellationToken ct)
    {
        var user = await db.AuthAccounts.SingleAsync(u => u.Id == access.UserId, ct);
        Validate(!string.IsNullOrWhiteSpace(input.CurrentPassword), "Enter your current password.");
        Validate(AuthService.VerifyHash(user.PasswordHash, input.CurrentPassword), "Current password is incorrect.");
        Validate(input.NewPassword == input.ConfirmPassword, "New passwords do not match.");
        Validate(Regex.IsMatch(input.NewPassword ?? "", "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$"), "Use a strong password with 8+ characters, uppercase, lowercase, number and symbol.");
        user.PasswordHash = AuthService.Hash(input.NewPassword!);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        access.Audit("PASSWORD_CHANGED", "Users", user.Id, null, new { changed = true }, "User changed their own password.");
        await db.SaveChangesAsync(ct);
        return Ok(new { message = "Password changed." });
    }
    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard(CancellationToken ct)
    {
        var scope = await access.Locations(ct);
        var locations = await db.CustomsLocations.AsNoTracking().Where(l => scope.Contains(l.Id)).OrderBy(l => l.Name).ToListAsync(ct);
        var now = DateTimeOffset.UtcNow; var today = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        var grants = await db.UserLocationScopes.AsNoTracking().Where(s => s.EffectiveFrom <= now && (s.EffectiveTo == null || s.EffectiveTo > now)).ToListAsync(ct);
        List<AuthAccountEntity> allUsers = access.Role == AccessRules.Officer ? [] : await db.AuthAccounts.AsNoTracking().OrderBy(u => u.FullName).ToListAsync(ct);
        var managedUsers = allUsers.Where(u => AccessRules.NormalizeRole(u.Role) != AccessRules.SystemAdmin &&
            AccessRules.CanManageOfficer(access.Role, scope, u.Role, grants.Where(g => g.UserId == u.Id).Select(g => g.CustomsLocationId))).ToList();
        var decisions = await (await VisibleDecisions(ct)).AsNoTracking().OrderByDescending(d => d.RecordedAt).Take(100).ToListAsync(ct);
        var hsIds = decisions.Select(d => d.HsCodeId).Distinct().ToList();
        var hsCodes = await db.HsCodes.AsNoTracking().Where(h => hsIds.Contains(h.Id)).ToDictionaryAsync(h => h.Id, ct);
        var auditQuery = db.AuditLogs.AsNoTracking().Where(a => access.IsSystem || access.Role == AccessRules.CustomsAdmin && a.LocationId != null && scope.Contains(a.LocationId.Value) || access.Role == AccessRules.Officer && a.UserId == access.UserId.ToString());
        var audit = await auditQuery.OrderByDescending(a => a.OccurredAt).Take(8).ToListAsync(ct);
        var revision = await db.HsRevisions.AsNoTracking().OrderByDescending(r => r.EffectiveDate).ThenByDescending(r => r.Number).FirstOrDefaultAsync(ct);
        var activeHs = revision == null ? 0 : await db.HsCodes.CountAsync(h => h.RevisionId == revision.Id, ct);
        var sources = await db.PriceSources.AsNoTracking().OrderBy(s => s.Pool).ThenBy(s => s.Name).ToListAsync(ct);
        var outliers = await db.LocalMarketObservations.CountAsync(o => o.IsPotentialOutlier && o.ManualReviewStatus == ManualReviewStatus.Unreviewed, ct);
        var activeLocations = locations.Count(l => l.Status == "ACTIVE" && l.EffectiveFrom <= now && (l.EffectiveTo == null || l.EffectiveTo > now));
        var officers = managedUsers.Count(u => AccessRules.NormalizeRole(u.Role) == AccessRules.Officer && u.Active);
        var administrators = managedUsers.Count(u => AccessRules.NormalizeRole(u.Role) == AccessRules.CustomsAdmin && u.Active);
        var submitted = decisions.Count(d => d.Status == "Submitted");
        var returned = decisions.Count(d => d.Status == "Returned");
        var ownPending = decisions.Count(d => d.Status is "Draft" or "Returned");
        var todayCount = decisions.Count(d => d.RecordedAt >= today);
        var securityAlerts = allUsers.Count(u => u.Status is "SUSPENDED" or "LOCKED");
        object[] kpis = access.Role switch
        {
            AccessRules.SystemAdmin => [
                new { key = "locations", label = "Active Customs locations", value = activeLocations.ToString("N0"), detail = $"{locations.Count:N0} registered", tone = "blue" },
                new { key = "admins", label = "Customs Administrators", value = administrators.ToString("N0"), detail = "Active accounts", tone = "teal" },
                new { key = "officers", label = "Customs Officers", value = officers.ToString("N0"), detail = "Active accounts", tone = "blue" },
                new { key = "hs", label = "Active HS codes", value = activeHs.ToString("N0"), detail = revision?.Name ?? "No revision", tone = "gold" },
                new { key = "sources", label = "Approved data sources", value = $"{sources.Count(s => s.IsApproved):N0} / {sources.Count:N0}", detail = $"{sources.Count(s => !s.IsApproved):N0} need review", tone = "teal" },
                new { key = "security", label = "Security alerts", value = securityAlerts.ToString("N0"), detail = "Suspended or locked", tone = securityAlerts > 0 ? "red" : "green" }
            ],
            AccessRules.CustomsAdmin => [
                new { key = "locations", label = "Offices under my scope", value = activeLocations.ToString("N0"), detail = $"{locations.Count:N0} total visible", tone = "blue" },
                new { key = "officers", label = "Active Officers", value = officers.ToString("N0"), detail = $"{managedUsers.Count:N0} managed accounts", tone = "teal" },
                new { key = "pending", label = "Pending valuations", value = submitted.ToString("N0"), detail = "Awaiting review", tone = submitted > 0 ? "gold" : "green" },
                new { key = "returned", label = "Returned valuations", value = returned.ToString("N0"), detail = "Sent back for correction", tone = returned > 0 ? "gold" : "green" },
                new { key = "today", label = "Decisions today", value = todayCount.ToString("N0"), detail = "Across my scope", tone = "blue" },
                new { key = "suspended", label = "Suspended accounts", value = managedUsers.Count(u => u.Status == "SUSPENDED").ToString("N0"), detail = "Within my scope", tone = "red" }
            ],
            _ => [
                new { key = "pending", label = "My pending cases", value = ownPending.ToString("N0"), detail = "Draft or returned", tone = "blue" },
                new { key = "review", label = "Cases under review", value = submitted.ToString("N0"), detail = "Submitted", tone = "gold" },
                new { key = "flagged", label = "Flagged observations", value = outliers.ToString("N0"), detail = "Evidence requiring attention", tone = outliers > 0 ? "red" : "green" },
                new { key = "today", label = "Decisions today", value = todayCount.ToString("N0"), detail = "Recorded by me", tone = "teal" }
            ]
        };
        return Ok(new {
            role = access.Role, generatedAt = now, kpis, activeRevision = revision == null ? null : new { revision.Id, revision.Name, revision.Number, revision.EffectiveDate, revision.Status, codeCount = activeHs },
            locations = locations.Select(l => new { l.Id, l.OfficialCode, l.Name, l.DisplayName, l.LocationType, l.ParentLocationId, l.Status, l.SupportsImport, l.SupportsExport, l.SupportsTransit, l.SupportsValuation, l.SupportsInspection }),
            employees = managedUsers.Take(12).Select(u => new { user = PublicUser(u), assignments = grants.Where(g => g.UserId == u.Id).Select(g => new { g.CustomsLocationId, g.IncludeChildLocations, g.Responsibilities }) }),
            decisions = decisions.Take(12).Select(d => new { d.Id, d.HsCodeId, hsCode = hsCodes.GetValueOrDefault(d.HsCodeId)?.Code ?? "", product = hsCodes.GetValueOrDefault(d.HsCodeId)?.DescriptionEn ?? "Unknown product", d.SelectedReferenceValue, d.Currency, d.Decision, d.Status, d.RecordedAt, d.LocationId }),
            sources = sources.Select(s => new { s.Id, s.Name, pool = s.Pool.ToString(), s.IsApproved }), audit
        });
    }
    [HttpGet("locations")]
    public async Task<IActionResult> Locations(CancellationToken ct)
    {
        var scope = await access.Locations(ct);
        return Ok(await db.CustomsLocations.AsNoTracking().Where(l => scope.Contains(l.Id)).OrderBy(l => l.Name).ToListAsync(ct));
    }
    [HttpPost("locations")]
    public Task<IActionResult> CreateLocation(LocationChange input, CancellationToken ct) => SaveLocation(null, input, ct);
    [HttpPut("locations/{id:guid}")]
    public Task<IActionResult> UpdateLocation(Guid id, LocationChange input, CancellationToken ct) => SaveLocation(id, input, ct);
    private async Task<IActionResult> SaveLocation(Guid? id, LocationChange input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin);
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var value = input.Location;
        Validate(!string.IsNullOrWhiteSpace(value.Name) && value.Name.Length <= 200 && Regex.IsMatch(value.OfficialCode ?? "", "^[A-Za-z0-9_-]{1,40}$"), "Provide a name and unique official code (letters, digits, hyphen or underscore).");
        Validate(LocationTypes.Contains(value.LocationType) && LocationStatuses.Contains(value.Status), "Choose a valid location type and status.");
        Validate(input.Reason.Trim().Length >= 10, "Explain the change in at least 10 characters.");
        Validate(value.Latitude is null or (>= -90 and <= 90) && value.Longitude is null or (>= -180 and <= 180), "Coordinates are outside the valid range.");
        Validate(value.EffectiveTo == null || value.EffectiveTo > value.EffectiveFrom, "The end date must follow the effective date.");
        var all = await db.CustomsLocations.ToListAsync(ct);
        var entity = id == null ? new CustomsLocation { Id = Guid.NewGuid(), CreatedBy = access.UserId.ToString() } : all.SingleOrDefault(l => l.Id == id) ?? throw new WorkspaceException(404, "Location not found.");
        if (id != null) Validate(entity.Version == value.Version, "The location has changed. Refresh before editing.");
        if (value.ParentLocationId.HasValue)
        {
            Validate(all.Any(l => l.Id == value.ParentLocationId), "Parent location not found.");
            var descendants = AccessRules.Expand(all.Select(l => (l.Id, l.ParentLocationId)), [(entity.Id, true)]);
            Validate(!descendants.Contains(value.ParentLocationId.Value), "A location cannot be its own parent or be moved under a descendant.");
        }
        JsonElement? before = id == null ? null : JsonSerializer.SerializeToElement(entity);
        if (id != null) Validate(entity.OfficialCode.Equals(value.OfficialCode, StringComparison.OrdinalIgnoreCase), "Official codes are permanent. Change the location name or parent while retaining its code.");
        var createdBy = entity.CreatedBy; var createdAt = entity.CreatedAt;
        value.Id = entity.Id; value.CreatedBy = createdBy; value.CreatedAt = createdAt;
        value.OfficialCode = value.OfficialCode!.ToUpperInvariant(); value.Name = value.Name.Trim();
        value.DisplayName = string.IsNullOrWhiteSpace(value.DisplayName) ? value.Name : value.DisplayName.Trim();
        value.UpdatedBy = access.UserId.ToString(); value.UpdatedAt = DateTimeOffset.UtcNow; value.Version = Guid.NewGuid();
        if (value.Status == "ARCHIVED") value.EffectiveTo ??= DateTimeOffset.UtcNow;
        if (id == null) db.CustomsLocations.Add(value); else db.Entry(entity).CurrentValues.SetValues(value);
        db.CustomsLocationHistory.Add(new() { Id = Guid.NewGuid(), CustomsLocationId = value.Id, ChangedAt = value.UpdatedAt, ChangedBy = access.UserId.ToString(), ChangeReason = input.Reason, PreviousValueJson = before?.GetRawText() ?? "null", NewValueJson = JsonSerializer.Serialize(value) });
        access.Audit(id == null ? "LOCATION_CREATED" : "LOCATION_UPDATED", "Locations", value.Id, before, value, input.Reason, value.Id);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Ok(value);
    }
    [HttpGet("locations/{id:guid}/history")]
    public async Task<IActionResult> History(Guid id, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin); // History may contain former, out-of-scope parents.
        return Ok(await db.CustomsLocationHistory.AsNoTracking().Where(h => h.CustomsLocationId == id).OrderByDescending(h => h.ChangedAt).Take(200).ToListAsync(ct));
    }
    [HttpGet("employees")]
    public async Task<IActionResult> Employees(CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        var scope = await access.Locations(ct); var now = DateTimeOffset.UtcNow;
        var grants = await db.UserLocationScopes.AsNoTracking().Where(s => s.EffectiveFrom <= now && (s.EffectiveTo == null || s.EffectiveTo > now)).ToListAsync(ct);
        var ids = grants.Where(s => scope.Contains(s.CustomsLocationId)).Select(s => s.UserId).Distinct().ToList();
        var users = await db.AuthAccounts.AsNoTracking().Where(u => access.IsSystem || ids.Contains(u.Id)).OrderBy(u => u.FullName).ToListAsync(ct);
        return Ok(users.Where(u => AccessRules.NormalizeRole(u.Role) != AccessRules.SystemAdmin && AccessRules.CanManageOfficer(access.Role, scope, u.Role, grants.Where(g => g.UserId == u.Id).Select(g => g.CustomsLocationId)))
            .Select(u => new { user = PublicUser(u), assignments = grants.Where(g => g.UserId == u.Id) }));
    }
    [HttpPost("employees")]
    public async Task<IActionResult> CreateEmployee(EmployeeCreate input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var role = AccessRules.NormalizeRole(input.Role);
        Validate(role == AccessRules.Officer || access.IsSystem && role == AccessRules.CustomsAdmin, "Only system administrators can create Customs Administrators.");
        Validate(!input.IncludeChildren || role == AccessRules.CustomsAdmin, "Only Customs Administrator scopes may include child locations.");
        await access.RequireLocation(input.LocationId, true, ct);
        Validate(Regex.IsMatch(input.Username ?? "", "^[a-zA-Z0-9_.-]{3,120}$") && !string.IsNullOrWhiteSpace(input.FullName) && System.Net.Mail.MailAddress.TryCreate(input.Email, out _), "Provide a valid username, name and email.");
        Validate(Regex.IsMatch(input.Password ?? "", "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$"), "Use a strong password with 8+ characters, uppercase, lowercase, number and symbol.");
        var user = new AuthAccountEntity { Id = Guid.NewGuid(), Username = input.Username!, FullName = input.FullName.Trim(), Email = input.Email.Trim().ToLowerInvariant(), Role = role!, Active = true, PasswordHash = AuthService.Hash(input.Password!), CreatedAt = DateTimeOffset.UtcNow, PrimaryLocationId = input.LocationId, EmployeeNumber = input.EmployeeNumber, Phone = input.Phone };
        db.AuthAccounts.Add(user);
        db.UserLocationScopes.Add(new() { Id = Guid.NewGuid(), UserId = user.Id, CustomsLocationId = input.LocationId, IncludeChildLocations = input.IncludeChildren, CreatedBy = access.UserId.ToString() });
        access.Audit("USER_CREATED", "Users", user.Id, null, PublicUser(user), "Created account and initial office assignment.", input.LocationId);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Ok(PublicUser(user));
    }
    [HttpPatch("employees/{id:guid}")]
    public async Task<IActionResult> UpdateEmployee(Guid id, EmployeeChange input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var user = await db.AuthAccounts.FindAsync([id], ct) ?? throw new WorkspaceException(404, "Employee not found.");
        await access.RequireEmployee(user, ct);
        Validate(AccessRules.NormalizeRole(user.Role) != AccessRules.SystemAdmin && id != access.UserId, "System administrators and your own account cannot be changed here.");
        Validate(new[] { "ACTIVE", "SUSPENDED", "INACTIVE", "LOCKED" }.Contains(input.Status), "Invalid account status.");
        Validate(input.Reason.Trim().Length >= 10, "Explain this change in at least 10 characters.");
        await access.RequireLocation(input.LocationId, true, ct);
        var before = PublicUser(user);
        var now = DateTimeOffset.UtcNow;
        var targetRole = AccessRules.NormalizeRole(user.Role);
        Validate(!input.IncludeChildren || targetRole == AccessRules.CustomsAdmin, "Only Customs Administrator scopes may include child locations.");
        var activeScopes = await db.UserLocationScopes.Where(s => s.UserId == id && (s.EffectiveTo == null || s.EffectiveTo > now)).ToListAsync(ct);
        if (targetRole == AccessRules.Officer)
        {
            foreach (var old in activeScopes) old.EffectiveTo = now;
            db.UserLocationScopes.Add(new() { Id = Guid.NewGuid(), UserId = id, CustomsLocationId = input.LocationId, Responsibilities = input.Responsibilities, CreatedBy = access.UserId.ToString() });
        }
        else
        {
            var scope = activeScopes.FirstOrDefault(s => s.CustomsLocationId == input.LocationId);
            if (scope is null) db.UserLocationScopes.Add(new() { Id = Guid.NewGuid(), UserId = id, CustomsLocationId = input.LocationId, IncludeChildLocations = input.IncludeChildren, Responsibilities = input.Responsibilities, CreatedBy = access.UserId.ToString() });
            else { scope.IncludeChildLocations = input.IncludeChildren; scope.Responsibilities = input.Responsibilities; }
        }
        user.PrimaryLocationId = input.LocationId; user.Status = input.Status; user.Active = input.Status == "ACTIVE"; user.UpdatedAt = now;
        access.Audit("OFFICER_ACCESS_CHANGED", "Users", id, before, new { user = PublicUser(user), input.Responsibilities }, input.Reason, input.LocationId);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Ok(PublicUser(user));
    }
    [HttpPost("employees/{id:guid}/scopes")]
    public async Task<IActionResult> AddScope(Guid id, ScopeChange input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin);
        var user = await db.AuthAccounts.FindAsync([id], ct) ?? throw new WorkspaceException(404, "Account not found.");
        Validate(AccessRules.NormalizeRole(user.Role) is AccessRules.CustomsAdmin or AccessRules.Officer, "Scopes apply to Customs Administrators and Officers.");
        Validate(!input.IncludeChildren || AccessRules.NormalizeRole(user.Role) == AccessRules.CustomsAdmin, "Officers require explicit office assignments.");
        Validate(input.Reason.Trim().Length >= 10, "Explain the assignment in at least 10 characters.");
        await access.RequireLocation(input.LocationId, true, ct);
        var grant = new UserLocationScope { Id = Guid.NewGuid(), UserId = id, CustomsLocationId = input.LocationId, IncludeChildLocations = input.IncludeChildren, Responsibilities = input.Responsibilities, CreatedBy = access.UserId.ToString() };
        db.UserLocationScopes.Add(grant); user.PrimaryLocationId ??= input.LocationId;
        access.Audit("SCOPE_ASSIGNED", "Users", id, null, grant, input.Reason, input.LocationId);
        await db.SaveChangesAsync(ct); return Ok(grant);
    }
    [HttpDelete("employees/{id:guid}/scopes/{scopeId:guid}")]
    public async Task<IActionResult> RevokeScope(Guid id, Guid scopeId, [FromQuery] string reason, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin); Validate(reason.Trim().Length >= 10, "Explain the revocation.");
        var grant = await db.UserLocationScopes.SingleOrDefaultAsync(s => s.Id == scopeId && s.UserId == id, ct) ?? throw new WorkspaceException(404, "Scope not found.");
        var before = JsonSerializer.SerializeToElement(grant); grant.EffectiveTo = DateTimeOffset.UtcNow;
        access.Audit("SCOPE_REVOKED", "Users", id, before, grant, reason, grant.CustomsLocationId);
        await db.SaveChangesAsync(ct); return NoContent();
    }

    private async Task<IQueryable<ValuationDecision>> VisibleDecisions(CancellationToken ct)
    {
        var scope = await access.Locations(ct); var subject = access.UserId.ToString();
        return db.ValuationDecisions.Where(d =>
            access.IsSystem ||
            access.Role == AccessRules.CustomsAdmin && d.LocationId != null && scope.Contains(d.LocationId.Value) ||
            access.Role == AccessRules.Officer && d.OfficerSubjectId == subject);
    }
    [HttpGet("decisions")]
    public async Task<IActionResult> Decisions(CancellationToken ct) => Ok(await (await VisibleDecisions(ct)).AsNoTracking().OrderByDescending(d => d.RecordedAt).Take(200).ToListAsync(ct));
    [HttpPost("decisions")]
    public Task<IActionResult> CreateDecision(DecisionInput input, CancellationToken ct) => SaveDecision(null, input, ct);
    [HttpPut("decisions/{id:guid}")]
    public Task<IActionResult> UpdateDecision(Guid id, DecisionInput input, CancellationToken ct) => SaveDecision(id, input, ct);
    private async Task<IActionResult> SaveDecision(Guid? id, DecisionInput input, CancellationToken ct)
    {
        access.Require(AccessRules.Officer);
        CustomsLocation? office = null;
        if (input.LocationId.HasValue)
        {
            await access.RequireLocation(input.LocationId.Value, true, ct);
            office = await db.CustomsLocations.FindAsync([input.LocationId.Value], ct);
            Validate(office!.SupportsValuation || office.SupportsInspection, "This office does not support valuation or inspection work.");
        }
        Validate(input.SelectedReferenceValue > 0 && Regex.IsMatch(input.Currency ?? "", "^[A-Z]{3}$"), "Enter a positive reference value and a three-letter currency.");
        Validate(input.Justification.Trim().Length >= 10 && !string.IsNullOrWhiteSpace(input.Decision) && input.Evidence.Trim().Length >= 10, "Record the decision, evidence references and a meaningful justification.");
        Validate(await db.HsCodes.AnyAsync(h => h.Id == input.HsCodeId, ct), "Select a valid HS code.");
        var entity = id == null ? new ValuationDecision { Id = Guid.NewGuid(), OfficerSubjectId = access.UserId.ToString(), RecordedAt = DateTimeOffset.UtcNow } : await (await VisibleDecisions(ct)).SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found.");
        Validate(entity.OfficerSubjectId == access.UserId.ToString() && entity.Status is "Draft" or "Returned", "Only your own draft or returned decisions may be edited.");
        if (id != null) Validate(entity.Version == input.Version, "Decision changed. Refresh before editing.");
        JsonElement? before = id == null ? null : JsonSerializer.SerializeToElement(entity);
        var all = await db.CustomsLocations.AsNoTracking().ToListAsync(ct); var hierarchy = new List<object>(); var current = office; var seen = new HashSet<Guid>();
        while (current != null && seen.Add(current.Id)) { hierarchy.Add(new { current.Id, current.OfficialCode, current.Name, current.ParentLocationId }); current = all.Find(l => l.Id == current.ParentLocationId); }
        object locationSnapshot = hierarchy.Count == 0 ? new { scope = "UnassignedOfficerWorkspace" } : hierarchy;
        entity.LocationId = input.LocationId; entity.LocationSnapshotJson = JsonSerializer.Serialize(locationSnapshot);
        entity.HsCodeId = input.HsCodeId; entity.SelectedReferenceValue = input.SelectedReferenceValue; entity.Currency = input.Currency!;
        entity.Decision = input.Decision.Trim(); entity.Justification = input.Justification.Trim(); entity.Status = "Draft"; entity.Version = Guid.NewGuid();
        // Narrative evidence records source URLs/record IDs and context without altering underlying observations.
        entity.EvidenceNotes = input.Evidence.Trim();
        if (id == null) db.ValuationDecisions.Add(entity);
        access.Audit(id == null ? "VALUATION_CREATED" : "VALUATION_UPDATED", "Valuations", entity.Id, before, entity, input.Justification, input.LocationId);
        await db.SaveChangesAsync(ct); return Ok(entity);
    }
    [HttpPost("decisions/{id:guid}/submit")]
    public async Task<IActionResult> Submit(Guid id, DecisionTransition input, CancellationToken ct)
    {
        access.Require(AccessRules.Officer);
        var decision = await (await VisibleDecisions(ct)).SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found.");
        Validate(decision.OfficerSubjectId == access.UserId.ToString() && decision.Status == "Draft" && decision.Version == input.Version, "Only your current saved draft may be submitted.");
        await access.RequireLocation(decision.LocationId!.Value, true, ct);
        var before = JsonSerializer.SerializeToElement(decision); decision.Status = "Submitted"; decision.SubmittedAt = DateTimeOffset.UtcNow; decision.Version = Guid.NewGuid();
        access.Audit("VALUATION_SUBMITTED", "Valuations", id, before, decision, decision.Justification, decision.LocationId); await db.SaveChangesAsync(ct); return Ok(decision);
    }
    [HttpPost("decisions/{id:guid}/review")]
    public async Task<IActionResult> Review(Guid id, DecisionTransition input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        var decision = await (await VisibleDecisions(ct)).SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found in your scope.");
        Validate(decision.Status == "Submitted" && decision.Version == input.Version && input.Outcome is "Approved" or "Returned", "Only a current submitted decision may be approved or returned.");
        Validate(input.Justification.Trim().Length >= 10, "A review justification is required.");
        var before = JsonSerializer.SerializeToElement(decision); decision.Status = input.Outcome; decision.ReviewedBy = access.UserId.ToString(); decision.ReviewedAt = DateTimeOffset.UtcNow; decision.ReviewJustification = input.Justification; decision.Version = Guid.NewGuid();
        access.Audit("VALUATION_REVIEWED", "Valuations", id, before, decision, input.Justification, decision.LocationId); await db.SaveChangesAsync(ct); return Ok(decision);
    }
    [HttpGet("audit")]
    public async Task<IActionResult> Audit(CancellationToken ct)
    {
        var scope = await access.Locations(ct); var subject = access.UserId.ToString();
        var query = db.AuditLogs.AsNoTracking().Where(a => access.IsSystem || access.Role == AccessRules.CustomsAdmin && a.LocationId != null && scope.Contains(a.LocationId.Value) || access.Role == AccessRules.Officer && a.UserId == subject);
        return Ok(await query.OrderByDescending(a => a.OccurredAt).Take(200).ToListAsync(ct));
    }
}
