using System.Text.Json;
using System.Text;
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
public sealed record EmployeeCreate(string Username, string FullName, string Email, string Password, string Role, Guid LocationId, bool IncludeChildren, string EmployeeNumber, string Phone, string Reason);
public sealed record EmployeeChange(string Status, Guid LocationId, bool IncludeChildren, string Responsibilities, string Reason, string FullName, string Email, string EmployeeNumber, string Phone, Guid Version);
public sealed record EmployeeArchive(string Reason, Guid Version);
public sealed record DecisionInput(Guid HsCodeId, Guid? LocationId, decimal SelectedReferenceValue, string Currency, string Decision, string Justification, string Evidence, Guid? Version);
public sealed record DecisionTransition(Guid Version, string Justification, string Outcome = "Approved");

[ApiController, Route("api/workspace"), Authorize, ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class WorkspaceController(CustomsDbContext db, WorkspaceAccess access) : ControllerBase
{
    public static readonly string[] LocationTypes = ["REGIONAL_STATE", "CHARTERED_CITY", "HEAD_OFFICE", "BRANCH_OFFICE", "CUSTOMS_STATION", "CHECKPOINT", "INSPECTION_POINT", "DRY_PORT", "AIRPORT", "CARGO_OFFICE", "INDUSTRIAL_PARK", "RAIL_STATION", "FREE_TRADE_ZONE", "SPECIAL_ECONOMIC_ZONE", "TAX_CENTER", "COORDINATION_OFFICE", "WAREHOUSE", "OTHER"];
    public static readonly string[] LocationStatuses = ["ACTIVE", "INACTIVE", "TEMPORARILY_CLOSED", "PLANNED", "ARCHIVED"];

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var user = await db.AuthAccounts.AsNoTracking().SingleAsync(u => u.Id == access.UserId, ct);
        var scope = await access.Locations(ct);
        return Ok(new { user = PublicUser(user), permissions = AccessRules.Permissions(access.Role), locations = await db.CustomsLocations.AsNoTracking().Where(l => scope.Contains(l.Id)).OrderBy(l => l.Name).ToListAsync(ct), locationTypes = LocationTypes, locationStatuses = LocationStatuses });
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
        if (access.Role == AccessRules.CustomsAdmin)
        {
            var ownRegion = await OwnRegion(ct);
            managedUsers = managedUsers.Where(u => ownRegion == null || u.RegionKey == ownRegion).ToList();
        }
        var decisions = await (await VisibleDecisions(ct)).AsNoTracking().OrderByDescending(d => d.RecordedAt).Take(100).ToListAsync(ct);
        var hsIds = decisions.Select(d => d.HsCodeId).Distinct().ToList();
        var hsCodes = await db.HsCodes.AsNoTracking().Where(h => hsIds.Contains(h.Id)).ToDictionaryAsync(h => h.Id, ct);
        var audit = (await VisibleAudit(ct)).Take(8).ToList();
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
                new { key = "officers", label = "Active officers", value = officers.ToString("N0"), detail = $"{managedUsers.Count:N0} managed accounts", tone = "teal" },
                new { key = "suspended", label = "Suspended officers", value = managedUsers.Count(u => u.Status == "SUSPENDED").ToString("N0"), detail = "Within my region", tone = "gold" },
                new { key = "archived", label = "Archived officers", value = managedUsers.Count(u => u.ArchivedAt != null).ToString("N0"), detail = "History retained", tone = "blue" },
                new { key = "activity", label = "Recent audit events", value = audit.Count.ToString("N0"), detail = "Latest visible actions", tone = "blue" }
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
        var ownRegion = await OwnRegion(ct);
        return Ok(users.Where(u => AccessRules.NormalizeRole(u.Role) != AccessRules.SystemAdmin && AccessRules.CanManageOfficer(access.Role, scope, u.Role, grants.Where(g => g.UserId == u.Id).Select(g => g.CustomsLocationId)) && (ownRegion == null || u.RegionKey == ownRegion))
            .Select(u => new { user = PublicUser(u), assignments = grants.Where(g => g.UserId == u.Id) }));
    }
    private async Task<string?> OwnRegion(CancellationToken ct)
    {
        return await access.ActorRegion(ct);
    }
    private async Task RequireOwnRegion(string region, CancellationToken ct)
    {
        var own = await OwnRegion(ct);
        Validate(own == null || own == region, "Choose an office within your region.");
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
        Validate((input.Reason ?? "").Trim().Length >= 10, "Explain this account creation in at least 10 characters.");
        var number = (input.EmployeeNumber ?? "").Trim();
        Validate(number.Length == 0 || !await db.AuthAccounts.AnyAsync(u => u.EmployeeNumber == number, ct), "Employee number is already in use.");
        var now = DateTimeOffset.UtcNow;
        var region = await access.RegionKey(input.LocationId, ct);
        await RequireOwnRegion(region, ct);
        var user = new AuthAccountEntity { Id = Guid.NewGuid(), Username = input.Username!, FullName = input.FullName.Trim(), Email = input.Email.Trim().ToLowerInvariant(), Role = role!, Active = true, PasswordHash = AuthService.Hash(input.Password!), CreatedAt = now, PrimaryLocationId = input.LocationId, EmployeeNumber = number, Phone = (input.Phone ?? "").Trim(), RegionKey = region, RegionJoinedAt = now };
        db.AuthAccounts.Add(user);
        db.UserLocationScopes.Add(new() { Id = Guid.NewGuid(), UserId = user.Id, CustomsLocationId = input.LocationId, IncludeChildLocations = input.IncludeChildren, CreatedBy = access.UserId.ToString(), EffectiveFrom = now });
        access.Audit("USER_CREATED", "Users", user.Id, null, PublicUser(user), input.Reason!.Trim(), input.LocationId);
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
        Validate(user.ArchivedAt == null, "Archived employees cannot be edited.");
        Validate(user.Version == input.Version, "This employee changed. Refresh before editing.");
        Validate(new[] { "ACTIVE", "SUSPENDED", "INACTIVE", "LOCKED" }.Contains(input.Status), "Invalid account status.");
        Validate((input.Reason ?? "").Trim().Length >= 10, "Explain this change in at least 10 characters.");
        Validate(!string.IsNullOrWhiteSpace(input.FullName) && System.Net.Mail.MailAddress.TryCreate(input.Email, out _), "Provide a valid name and email.");
        await access.RequireLocation(input.LocationId, true, ct);
        var newRegion = await access.RegionKey(input.LocationId, ct);
        await RequireOwnRegion(newRegion, ct);
        var number = (input.EmployeeNumber ?? "").Trim();
        Validate(number.Length == 0 || !await db.AuthAccounts.AnyAsync(u => u.Id != id && u.EmployeeNumber == number, ct), "Employee number is already in use.");
        var before = PublicUser(user);
        var now = DateTimeOffset.UtcNow;
        var targetRole = AccessRules.NormalizeRole(user.Role);
        Validate(!input.IncludeChildren || targetRole == AccessRules.CustomsAdmin, "Only Customs Administrator scopes may include child locations.");
        var activeScopes = await db.UserLocationScopes.Where(s => s.UserId == id && (s.EffectiveTo == null || s.EffectiveTo > now)).ToListAsync(ct);
        if (targetRole == AccessRules.Officer)
        {
            var current = activeScopes.SingleOrDefault(s => s.CustomsLocationId == input.LocationId);
            if (current == null || activeScopes.Count != 1)
            {
                foreach (var old in activeScopes) old.EffectiveTo = now;
                db.UserLocationScopes.Add(new() { Id = Guid.NewGuid(), UserId = id, CustomsLocationId = input.LocationId, Responsibilities = input.Responsibilities, CreatedBy = access.UserId.ToString(), EffectiveFrom = now });
            }
            else current.Responsibilities = input.Responsibilities;
        }
        else
        {
            if (user.RegionKey != newRegion)
            {
                foreach (var old in activeScopes) old.EffectiveTo = now;
                db.UserLocationScopes.Add(new() { Id = Guid.NewGuid(), UserId = id, CustomsLocationId = input.LocationId, IncludeChildLocations = input.IncludeChildren, Responsibilities = input.Responsibilities, CreatedBy = access.UserId.ToString(), EffectiveFrom = now });
            }
            else
            {
                var scope = activeScopes.FirstOrDefault(s => s.CustomsLocationId == input.LocationId);
                if (scope is null) db.UserLocationScopes.Add(new() { Id = Guid.NewGuid(), UserId = id, CustomsLocationId = input.LocationId, IncludeChildLocations = input.IncludeChildren, Responsibilities = input.Responsibilities, CreatedBy = access.UserId.ToString(), EffectiveFrom = now });
                else { scope.IncludeChildLocations = input.IncludeChildren; scope.Responsibilities = input.Responsibilities; }
            }
        }
        user.RegionJoinedAt = AccessRules.RegionJoinAfterChange(user.RegionKey, newRegion, user.RegionJoinedAt, now);
        user.RegionKey = newRegion; user.PrimaryLocationId = input.LocationId; user.Status = input.Status; user.Active = input.Status == "ACTIVE"; user.UpdatedAt = now;
        user.FullName = input.FullName.Trim(); user.Email = input.Email.Trim().ToLowerInvariant(); user.EmployeeNumber = number; user.Phone = (input.Phone ?? "").Trim(); user.Version = Guid.NewGuid();
        access.Audit("OFFICER_ACCESS_CHANGED", "Users", id, before, new { user = PublicUser(user), input.Responsibilities }, input.Reason!, input.LocationId);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Ok(PublicUser(user));
    }
    [HttpPost("employees/{id:guid}/archive")]
    public async Task<IActionResult> ArchiveEmployee(Guid id, EmployeeArchive input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        var user = await db.AuthAccounts.FindAsync([id], ct) ?? throw new WorkspaceException(404, "Employee not found.");
        await access.RequireEmployee(user, ct);
        Validate(id != access.UserId && user.ArchivedAt == null && user.Version == input.Version, "Employee changed or is already archived. Refresh before archiving.");
        Validate((input.Reason ?? "").Trim().Length >= 10, "Explain the archive in at least 10 characters.");
        var before = PublicUser(user);
        user.ArchivedAt = DateTimeOffset.UtcNow; user.ArchivedBy = access.UserId; user.ArchiveReason = input.Reason!.Trim();
        user.Status = "ARCHIVED"; user.Active = false; user.UpdatedAt = user.ArchivedAt; user.Version = Guid.NewGuid();
        access.Audit("USER_ARCHIVED", "Users", id, before, PublicUser(user), input.Reason, user.PrimaryLocationId);
        await db.SaveChangesAsync(ct);
        return Ok(PublicUser(user));
    }
    [HttpPost("employees/{id:guid}/scopes")]
    public async Task<IActionResult> AddScope(Guid id, ScopeChange input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin);
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var user = await db.AuthAccounts.FindAsync([id], ct) ?? throw new WorkspaceException(404, "Account not found.");
        Validate(AccessRules.NormalizeRole(user.Role) is AccessRules.CustomsAdmin or AccessRules.Officer, "Scopes apply to Customs Administrators and Officers.");
        Validate(!input.IncludeChildren || AccessRules.NormalizeRole(user.Role) == AccessRules.CustomsAdmin, "Officers require explicit office assignments.");
        Validate(input.Reason.Trim().Length >= 10, "Explain the assignment in at least 10 characters.");
        await access.RequireLocation(input.LocationId, true, ct);
        Validate(user.ArchivedAt == null, "Archived employees cannot receive assignments.");
        var region = await access.RegionKey(input.LocationId, ct);
        if (AccessRules.NormalizeRole(user.Role) == AccessRules.CustomsAdmin && user.RegionKey.Length > 0)
            Validate(user.RegionKey == region, "A Customs Administrator may have scopes in only one region.");
        var now = DateTimeOffset.UtcNow;
        if (AccessRules.NormalizeRole(user.Role) == AccessRules.Officer)
            Validate(!await db.UserLocationScopes.AnyAsync(s => s.UserId == id && s.EffectiveFrom <= now && (s.EffectiveTo == null || s.EffectiveTo > now), ct), "An officer may have only one active office assignment. Use employee edit to transfer them.");
        else
            Validate(!await db.UserLocationScopes.AnyAsync(s => s.UserId == id && s.CustomsLocationId == input.LocationId && s.EffectiveFrom <= now && (s.EffectiveTo == null || s.EffectiveTo > now), ct), "This administrator already has an active assignment to that office.");
        var grant = new UserLocationScope { Id = Guid.NewGuid(), UserId = id, CustomsLocationId = input.LocationId, IncludeChildLocations = input.IncludeChildren, Responsibilities = input.Responsibilities, CreatedBy = access.UserId.ToString() };
        db.UserLocationScopes.Add(grant);
        if (AccessRules.NormalizeRole(user.Role) == AccessRules.Officer) user.PrimaryLocationId = input.LocationId;
        else user.PrimaryLocationId ??= input.LocationId;
        user.RegionKey = region; user.RegionJoinedAt = now; user.Version = Guid.NewGuid();
        access.Audit("SCOPE_ASSIGNED", "Users", id, null, grant, input.Reason, input.LocationId);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Ok(grant);
    }
    [HttpDelete("employees/{id:guid}/scopes/{scopeId:guid}")]
    public async Task<IActionResult> RevokeScope(Guid id, Guid scopeId, [FromQuery] string reason, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin); Validate(reason.Trim().Length >= 10, "Explain the revocation.");
        var grant = await db.UserLocationScopes.SingleOrDefaultAsync(s => s.Id == scopeId && s.UserId == id, ct) ?? throw new WorkspaceException(404, "Scope not found.");
        Validate(grant.EffectiveTo == null || grant.EffectiveTo > DateTimeOffset.UtcNow, "This assignment is already inactive.");
        var before = JsonSerializer.SerializeToElement(grant); grant.EffectiveTo = DateTimeOffset.UtcNow;
        var user = await db.AuthAccounts.FindAsync([id], ct);
        if (user != null && user.PrimaryLocationId == grant.CustomsLocationId)
        {
            var replacement = await db.UserLocationScopes.AsNoTracking().Where(s => s.UserId == id && s.Id != scopeId && s.EffectiveFrom <= DateTimeOffset.UtcNow && (s.EffectiveTo == null || s.EffectiveTo > DateTimeOffset.UtcNow)).FirstOrDefaultAsync(ct);
            user.PrimaryLocationId = replacement?.CustomsLocationId;
            if (replacement != null) user.RegionKey = await access.RegionKey(replacement.CustomsLocationId, ct);
            user.Version = Guid.NewGuid();
        }
        access.Audit("SCOPE_REVOKED", "Users", id, before, grant, reason, grant.CustomsLocationId);
        await db.SaveChangesAsync(ct); return NoContent();
    }

    private async Task<IQueryable<ValuationDecision>> VisibleDecisions(CancellationToken ct)
    {
        var scope = await access.Locations(ct); var subject = access.UserId.ToString();
        var region = await OwnRegion(ct);
        return db.ValuationDecisions.Where(d =>
            access.IsSystem ||
            access.Role == AccessRules.CustomsAdmin && d.LocationId != null && scope.Contains(d.LocationId.Value) &&
                db.AuthAccounts.Any(u => u.Id.ToString() == d.OfficerSubjectId && (u.Role == AccessRules.Officer || u.Role == "CUSTOMS_OFFICER") && u.RegionJoinedAt <= d.RecordedAt &&
                    (region == null || u.RegionKey == region) && u.PrimaryLocationId != null && scope.Contains(u.PrimaryLocationId.Value)) ||
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
        access.Audit(id == null ? "VALUATION_CREATED" : "VALUATION_UPDATED", "Valuations", entity.Id, before, entity, input.Justification, input.LocationId, access.UserId);
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
        access.Audit("VALUATION_SUBMITTED", "Valuations", id, before, decision, decision.Justification, decision.LocationId, access.UserId); await db.SaveChangesAsync(ct); return Ok(decision);
    }
    [HttpPost("decisions/{id:guid}/review")]
    public async Task<IActionResult> Review(Guid id, DecisionTransition input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        var decision = await (await VisibleDecisions(ct)).SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found in your scope.");
        Validate(decision.Status == "Submitted" && decision.Version == input.Version && input.Outcome is "Approved" or "Returned", "Only a current submitted decision may be approved or returned.");
        Validate(input.Justification.Trim().Length >= 10, "A review justification is required.");
        var before = JsonSerializer.SerializeToElement(decision); decision.Status = input.Outcome; decision.ReviewedBy = access.UserId.ToString(); decision.ReviewedAt = DateTimeOffset.UtcNow; decision.ReviewJustification = input.Justification; decision.Version = Guid.NewGuid();
        access.Audit("VALUATION_REVIEWED", "Valuations", id, before, decision, input.Justification, decision.LocationId, Guid.TryParse(decision.OfficerSubjectId, out var officerId) ? officerId : null); await db.SaveChangesAsync(ct); return Ok(decision);
    }
    [HttpGet("audit")]
    public async Task<IActionResult> Audit(CancellationToken ct)
    {
        return Ok((await VisibleAudit(ct)).Take(200));
    }
    private async Task<List<AuditLog>> VisibleAudit(CancellationToken ct)
    {
        if (access.IsSystem) return await db.AuditLogs.AsNoTracking().OrderByDescending(a => a.OccurredAt).Take(200).ToListAsync(ct);
        if (access.Role == AccessRules.Officer) return await db.AuditLogs.AsNoTracking().Where(a => a.UserId == access.UserId.ToString()).OrderByDescending(a => a.OccurredAt).Take(200).ToListAsync(ct);
        var scope = await access.Locations(ct);
        var now = DateTimeOffset.UtcNow;
        var grants = await db.UserLocationScopes.AsNoTracking().Where(s => s.EffectiveFrom <= now && (s.EffectiveTo == null || s.EffectiveTo > now)).ToListAsync(ct);
        var users = await db.AuthAccounts.AsNoTracking().Where(u => u.Role == AccessRules.Officer || u.Role == "CUSTOMS_OFFICER").ToListAsync(ct);
        var ownRegion = await OwnRegion(ct);
        var permitted = users.Where(u => AccessRules.CanManageOfficer(access.Role, scope, u.Role, grants.Where(g => g.UserId == u.Id).Select(g => g.CustomsLocationId)) && (ownRegion == null || u.RegionKey == ownRegion))
            .ToDictionary(u => u.Id, u => AccessRules.ActivityStart(u.RegionJoinedAt, u.CreatedAt));
        var ids = permitted.Keys.ToList();
        if (ids.Count == 0) return [];
        var candidates = await db.AuditLogs.AsNoTracking().Where(a => a.SubjectUserId != null && ids.Contains(a.SubjectUserId.Value)).OrderByDescending(a => a.OccurredAt).Take(5000).ToListAsync(ct);
        return candidates.Where(a => a.SubjectUserId is Guid id && a.OccurredAt >= permitted[id]).Take(200).ToList();
    }
    [HttpGet("employees/{id:guid}/audit")]
    public async Task<IActionResult> EmployeeAudit(Guid id, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] string? action, CancellationToken ct)
        => Ok(await EmployeeAuditRows(id, from, to, action, ct));

    [HttpGet("employees/{id:guid}/audit/export")]
    public async Task<IActionResult> ExportEmployeeAudit(Guid id, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] string? action, CancellationToken ct)
    {
        var rows = await EmployeeAuditRows(id, from, to, action, ct);
        static string Cell(object? value)
        {
            var content = value?.ToString() ?? "";
            if (content.Length > 0 && "=+-@\t\r".Contains(content[0])) content = "'" + content;
            return "\"" + content.Replace("\"", "\"\"") + "\"";
        }
        var csv = new StringBuilder("OccurredAt,Action,Module,Actor,SubjectUserId,LocationId,Justification,PreviousValue,NewValue\r\n");
        foreach (var row in rows) csv.AppendJoin(',', new object?[] { row.OccurredAt, row.Action, row.Module, row.Username, row.SubjectUserId, row.LocationId, row.Justification, row.PreviousValueJson, row.NewValueJson }.Select(Cell)).Append("\r\n");
        return File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv", $"employee-{id}-audit.csv");
    }
    private async Task<List<AuditLog>> EmployeeAuditRows(Guid id, DateTimeOffset? from, DateTimeOffset? to, string? action, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        var user = await db.AuthAccounts.AsNoTracking().SingleOrDefaultAsync(u => u.Id == id, ct) ?? throw new WorkspaceException(404, "Employee not found.");
        await access.RequireEmployee(user, ct);
        var joined = access.IsSystem ? DateTimeOffset.MinValue : AccessRules.ActivityStart(user.RegionJoinedAt, user.CreatedAt);
        var lower = from > joined ? from.Value : joined;
        var query = db.AuditLogs.AsNoTracking().Where(a => a.SubjectUserId == id && a.OccurredAt >= lower);
        if (to.HasValue) query = query.Where(a => a.OccurredAt <= to.Value);
        if (!string.IsNullOrWhiteSpace(action)) query = query.Where(a => a.Action == action);
        return await query.OrderByDescending(a => a.OccurredAt).Take(1000).ToListAsync(ct);
    }
}
