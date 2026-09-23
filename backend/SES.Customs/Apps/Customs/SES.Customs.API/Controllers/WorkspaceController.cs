using System.Text;
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
public sealed record EmployeeCreate(string Username, string FullName, string Email, string Password, string Role, Guid LocationId, string EmployeeNumber, string Phone, string Responsibilities, string Reason);
public sealed record EmployeeChange(string Status, Guid LocationId, string Responsibilities, string Reason);
public sealed record EmployeeArchive(string Reason);
public sealed record ProfileChange(string Username, string Email, string FullName, string Phone);
public sealed record PasswordChange(string CurrentPassword, string NewPassword, string ConfirmPassword);
public sealed record DecisionInput(Guid HsCodeId, Guid? LocationId, decimal SelectedReferenceValue, string Currency, string Decision, string Justification, string Evidence, Guid? Version);
public sealed record DecisionTransition(Guid Version, string Justification, string Outcome = "Approved");

[ApiController, Route("api/workspace"), Authorize, ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class WorkspaceController(CustomsDbContext db, WorkspaceAccess access) : ControllerBase
{
    public static readonly string[] LocationTypes = ["REGION", "BRANCH"];
    public static readonly string[] LocationStatuses = ["ACTIVE", "INACTIVE", "TEMPORARILY_CLOSED", "PLANNED", "ARCHIVED"];
    private const decimal EthiopiaMinimumLatitude = 3.35m;
    private const decimal EthiopiaMaximumLatitude = 14.95m;
    private const decimal EthiopiaMinimumLongitude = 33.00m;
    private const decimal EthiopiaMaximumLongitude = 48.05m;
    public static readonly string[] EmployeeResponsibilityOptions = ["Valuation", "Inspection", "Import", "Export", "Transit"];

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var user = await db.AuthAccounts.AsNoTracking().SingleAsync(u => u.Id == access.UserId, ct);
        var scope = await access.Locations(ct);
        return Ok(new { user = PublicUser(user), permissions = AccessRules.Permissions(access.Role), locations = await db.CustomsLocations.AsNoTracking().Where(l => scope.Contains(l.Id)).OrderBy(l => l.Name).ToListAsync(ct), locationTypes = LocationTypes, locationStatuses = LocationStatuses, employeeResponsibilities = EmployeeResponsibilityOptions });
    }
    [HttpGet("profile")]
    public async Task<IActionResult> Profile(CancellationToken ct)
    {
        var user = await db.AuthAccounts.AsNoTracking().SingleAsync(u => u.Id == access.UserId, ct);
        var location = user.PrimaryLocationId.HasValue ? await db.CustomsLocations.AsNoTracking().FirstOrDefaultAsync(l => l.Id == user.PrimaryLocationId.Value, ct) : null;
        return Ok(new {
            user = new { user.Username, user.Email, user.FullName, role = AccessRules.NormalizeRole(user.Role), roleCode = AccessRules.Code(user.Role), user.EmployeeNumber, user.Phone },
            location
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
        List<AuthAccountEntity> allUsers = access.Role == AccessRules.Officer ? [] : await db.AuthAccounts.AsNoTracking().OrderBy(u => u.FullName).ToListAsync(ct);
        var managedUsers = allUsers.Where(u => AccessRules.NormalizeRole(u.Role) != AccessRules.SystemAdmin &&
            (access.IsSystem || u.PrimaryLocationId.HasValue && scope.Contains(u.PrimaryLocationId.Value))).ToList();
        // Legacy databases may contain incomplete draft rows from before HS-code
        // validation was enforced. Keep those rows out of dashboard projections;
        // they cannot be displayed or used as valuation records safely.
        var decisions = await (await VisibleDecisions(ct)).AsNoTracking()
            .Where(d => d.HsCodeId != Guid.Empty)
            .OrderByDescending(d => d.RecordedAt).Take(100).ToListAsync(ct);
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
                new { key = "locations", label = "Assigned offices", value = activeLocations.ToString("N0"), detail = $"{locations.Count:N0} total visible", tone = "blue" },
                new { key = "officers", label = "Active Officers", value = officers.ToString("N0"), detail = $"{managedUsers.Count:N0} managed accounts", tone = "teal" },
                new { key = "pending", label = "Pending valuations", value = submitted.ToString("N0"), detail = "Awaiting review", tone = submitted > 0 ? "gold" : "green" },
                new { key = "returned", label = "Returned valuations", value = returned.ToString("N0"), detail = "Sent back for correction", tone = returned > 0 ? "gold" : "green" },
                new { key = "today", label = "Decisions today", value = todayCount.ToString("N0"), detail = "Across my assigned location", tone = "blue" },
                new { key = "suspended", label = "Suspended accounts", value = managedUsers.Count(u => u.Status == "SUSPENDED").ToString("N0"), detail = "Within my assigned location", tone = "red" }
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
            employees = managedUsers.Take(12).Select(u => new { user = PublicEmployee(u), locationId = u.PrimaryLocationId }),
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
        Validate(value.Latitude.HasValue && value.Longitude.HasValue, "Latitude and longitude are required for every customs region and branch.");
        var latitude = value.Latitude.GetValueOrDefault();
        var longitude = value.Longitude.GetValueOrDefault();
        Validate(
            latitude >= EthiopiaMinimumLatitude && latitude <= EthiopiaMaximumLatitude
            && longitude >= EthiopiaMinimumLongitude && longitude <= EthiopiaMaximumLongitude,
            "Coordinates must fall within Ethiopia.");
        Validate(value.EffectiveTo == null || value.EffectiveTo > value.EffectiveFrom, "The end date must follow the effective date.");
        var all = await db.CustomsLocations.ToListAsync(ct);
        var entity = id == null ? new CustomsLocation { Id = Guid.NewGuid(), CreatedBy = access.UserId.ToString() } : all.SingleOrDefault(l => l.Id == id) ?? throw new WorkspaceException(404, "Location not found.");
        if (id != null) Validate(entity.Version == value.Version, "The location has changed. Refresh before editing.");

        // Two-level hierarchy enforcement for Regions and Branches
        if (value.LocationType == "REGION")
        {
            Validate(!value.ParentLocationId.HasValue, "A region is a top-level location and cannot have a parent location.");
        }
        else if (value.LocationType == "BRANCH")
        {
            Validate(value.ParentLocationId.HasValue, "A branch must be placed inside an existing region.");
            var parentRegion = all.SingleOrDefault(l => l.Id == value.ParentLocationId!.Value);
            Validate(parentRegion != null && parentRegion.LocationType == "REGION", "The selected parent must be an existing region.");
        }

        if (value.ParentLocationId.HasValue)
        {
            Validate(all.Any(l => l.Id == value.ParentLocationId), "Parent location not found.");
            var descendants = AccessRules.Descendants(all.Select(l => (l.Id, l.ParentLocationId)), entity.Id);
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
        var scope = await access.Locations(ct);
        var query = db.AuthAccounts.AsNoTracking();
        if (!access.IsSystem)
            query = query.Where(u => u.PrimaryLocationId.HasValue && scope.Contains(u.PrimaryLocationId.Value));

        // Role aliases are normalized in application code because EF cannot translate
        // AccessRules.NormalizeRole into SQL. Keep the location restriction in SQL,
        // then apply the role visibility rule to the small result set in memory.
        var users = await query.OrderBy(u => u.FullName).ToListAsync(ct);
        return Ok(users.Where(u => access.IsSystem
                                   ? AccessRules.NormalizeRole(u.Role) == AccessRules.CustomsAdmin
                                   : AccessRules.NormalizeRole(u.Role) == AccessRules.Officer)
            .Select(u => new { user = PublicEmployee(u), locationId = u.PrimaryLocationId }));
    }
    [HttpPost("employees")]
    public async Task<IActionResult> CreateEmployee(EmployeeCreate input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var role = AccessRules.NormalizeRole(input.Role);
        Validate(role == AccessRules.Officer || access.IsSystem && role == AccessRules.CustomsAdmin, "Customs Administrators can create Customs Officers only.");
        await RequireEmployeeLocation(input.LocationId, ct);
        var username = (input.Username ?? "").Trim();
        var email = (input.Email ?? "").Trim().ToLowerInvariant();
        var fullName = (input.FullName ?? "").Trim();
        var employeeNumber = (input.EmployeeNumber ?? "").Trim();
        var password = input.Password ?? "";
        var reason = (input.Reason ?? "").Trim();
        Validate(Regex.IsMatch(username, "^[a-zA-Z0-9_.-]{3,120}$") && fullName.Length > 0 && System.Net.Mail.MailAddress.TryCreate(email, out _), "Provide a valid username, name and email.");
        Validate(employeeNumber.Length > 0 && employeeNumber.Length <= 80, "Provide an employee or staff ID.");
        Validate(Regex.IsMatch(password, "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$"), "Use a strong password with 8+ characters, uppercase, lowercase, number and symbol.");
        Validate(reason.Length >= 10, "Explain the account creation in at least 10 characters.");
        var (responsibilities, invalidResponsibilities) = NormalizeResponsibilities(input.Responsibilities);
        Validate(invalidResponsibilities.Length == 0, "Use only supported responsibilities: Valuation, Inspection, Import, Export or Transit.");
        Validate(role != AccessRules.Officer || responsibilities.Length > 0, "Select at least one responsibility for a Customs Officer.");
        var phone = (input.Phone ?? "").Trim();
        Validate(phone.Length <= 40, "Phone number is too long.");
        Validate(!await db.AuthAccounts.AnyAsync(u => u.Username == username || u.Email == email, ct), "That username or email is already used.");
        Validate(!await db.AuthAccounts.AnyAsync(u => u.EmployeeNumber == employeeNumber, ct), "That employee or staff ID is already used.");
        var now = DateTimeOffset.UtcNow;
        var region = await access.RegionKey(input.LocationId, ct);
        var user = new AuthAccountEntity { Id = Guid.NewGuid(), Username = username, FullName = fullName, Email = email, Role = role!, Active = true, Status = "ACTIVE", PasswordHash = AuthService.Hash(password), CreatedAt = now, PrimaryLocationId = input.LocationId, RegionKey = region, RegionJoinedAt = now, EmployeeNumber = employeeNumber, Phone = phone, Responsibilities = responsibilities };
        db.AuthAccounts.Add(user);
        access.Audit("USER_CREATED", "Users", user.Id, null, PublicUser(user), reason, input.LocationId);
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
        Validate((input.Reason ?? "").Trim().Length >= 10, "Explain this change in at least 10 characters.");
        await RequireEmployeeLocation(input.LocationId, ct);
        var (requestedResponsibilities, invalidResponsibilities) = NormalizeResponsibilities(input.Responsibilities);
        Validate(invalidResponsibilities.Length == 0, "Use only supported responsibilities: Valuation, Inspection, Import, Export or Transit.");
        var responsibilities = string.IsNullOrWhiteSpace(input.Responsibilities) ? user.Responsibilities : requestedResponsibilities;
        Validate(AccessRules.NormalizeRole(user.Role) != AccessRules.Officer || responsibilities.Length > 0, "Select at least one responsibility for a Customs Officer.");
        var before = PublicUser(user);
        var now = DateTimeOffset.UtcNow;
        var nextRegion = await access.RegionKey(input.LocationId, ct);
        user.RegionJoinedAt = string.Equals(user.RegionKey, nextRegion, StringComparison.OrdinalIgnoreCase) ? user.RegionJoinedAt ?? now : now;
        user.RegionKey = nextRegion; user.PrimaryLocationId = input.LocationId; user.Status = input.Status; user.Active = input.Status == "ACTIVE"; user.Responsibilities = responsibilities; user.UpdatedAt = now;
        if (user.Active) { user.ArchivedAt = null; user.ArchivedBy = null; user.ArchiveReason = null; }
        access.Audit("OFFICER_ACCESS_CHANGED", "Users", id, before, PublicUser(user), input.Reason!.Trim(), input.LocationId);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Ok(PublicUser(user));
    }

    [HttpPost("employees/{id:guid}/archive")]
    public async Task<IActionResult> ArchiveEmployee(Guid id, EmployeeArchive input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var user = await db.AuthAccounts.FindAsync([id], ct) ?? throw new WorkspaceException(404, "Employee not found.");
        await access.RequireEmployee(user, ct);
        Validate(AccessRules.NormalizeRole(user.Role) != AccessRules.SystemAdmin && id != access.UserId, "System administrators and your own account cannot be archived here.");
        var reason = (input.Reason ?? "").Trim();
        Validate(reason.Length >= 10, "Explain the archive in at least 10 characters.");
        var before = PublicUser(user);
        var now = DateTimeOffset.UtcNow;
        user.Active = false; user.Status = "INACTIVE"; user.ArchivedAt = now; user.ArchivedBy = access.UserId; user.ArchiveReason = reason; user.UpdatedAt = now; user.Version = Guid.NewGuid();
        access.Audit("USER_ARCHIVED", "Users", id, before, PublicUser(user), reason, user.PrimaryLocationId);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return Ok(PublicUser(user));
    }

    [HttpGet("employees/{id:guid}/audit")]
    public async Task<IActionResult> EmployeeAudit(Guid id, CancellationToken ct)
    {
        var employee = await db.AuthAccounts.AsNoTracking().SingleOrDefaultAsync(u => u.Id == id, ct) ?? throw new WorkspaceException(404, "Employee not found.");
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        await access.RequireEmployee(employee, ct);
        return Ok(await EmployeeAuditQuery(id, employee).OrderByDescending(a => a.OccurredAt).Take(500).ToListAsync(ct));
    }

    [HttpGet("employees/{id:guid}/audit/export")]
    public async Task<IActionResult> ExportEmployeeAudit(Guid id, CancellationToken ct)
    {
        var employee = await db.AuthAccounts.AsNoTracking().SingleOrDefaultAsync(u => u.Id == id, ct) ?? throw new WorkspaceException(404, "Employee not found.");
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin);
        await access.RequireEmployee(employee, ct);
        var rows = await EmployeeAuditQuery(id, employee).OrderByDescending(a => a.OccurredAt).Take(500).ToListAsync(ct);
        var csv = new StringBuilder("Occurred at,Actor,Action,Module,Record ID,Location ID,Reason\r\n");
        foreach (var row in rows)
            csv.AppendJoin(',', Csv(row.OccurredAt.ToString("O")), Csv(row.Username), Csv(row.Action), Csv(row.Module), Csv(row.RecordId.ToString()), Csv(row.LocationId?.ToString() ?? ""), Csv(row.Justification ?? "")).Append("\r\n");
        return File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv", $"employee-{id:N}-activity.csv");
    }

    private IQueryable<AuditLog> EmployeeAuditQuery(Guid id, AuthAccountEntity employee)
    {
        var query = db.AuditLogs.AsNoTracking().Where(a => a.SubjectUserId == id || (a.UserId == id.ToString() && a.Module != "Users"));
        if (!access.IsSystem && employee.RegionJoinedAt is DateTimeOffset joinedAt)
            query = query.Where(a => a.OccurredAt >= joinedAt);
        return query;
    }

    private async Task RequireEmployeeLocation(Guid locationId, CancellationToken ct)
    {
        await access.RequireLocation(locationId, true, ct);
        var location = await db.CustomsLocations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct);
        Validate(location?.LocationType == "BRANCH", "Employees must be assigned to an active branch.");
    }

    private static (string Normalized, string[] Invalid) NormalizeResponsibilities(string? value)
    {
        var values = (value ?? "")
            .Split([',', ';', '|'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(item => item.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var selected = values
            .Where(item => EmployeeResponsibilityOptions.Contains(item, StringComparer.OrdinalIgnoreCase))
            .Select(item => EmployeeResponsibilityOptions.First(option => option.Equals(item, StringComparison.OrdinalIgnoreCase)))
            .ToArray();
        var invalid = values.Where(item => !EmployeeResponsibilityOptions.Contains(item, StringComparer.OrdinalIgnoreCase)).ToArray();
        return (string.Join(", ", selected), invalid);
    }

    private static string Csv(string value)
    {
        var trimmed = value.TrimStart();
        var safe = trimmed.Length > 0 && "=+-@".Contains(trimmed[0]) ? "'" + value : value;
        return $"\"{safe.Replace("\"", "\"\"")}\"";
    }

    private async Task<IQueryable<ValuationDecision>> VisibleDecisions(CancellationToken ct)
    {
        var scope = await access.Locations(ct); var subject = access.UserId.ToString();
        return db.ValuationDecisions.Where(d => d.HsCodeId != Guid.Empty && (
            access.IsSystem ||
            access.Role == AccessRules.CustomsAdmin && d.LocationId != null && scope.Contains(d.LocationId.Value) ||
            access.Role == AccessRules.Officer && d.OfficerSubjectId == subject));
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
        var decision = await (await VisibleDecisions(ct)).SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found in your assigned location.");
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
