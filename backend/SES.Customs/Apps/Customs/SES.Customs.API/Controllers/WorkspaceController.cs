using System.Text;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Integrations.PricesApi;
using SES.Customs.API.Security;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using static SES.Customs.API.Security.WorkspaceAccess;

namespace SES.Customs.API.Controllers;

public sealed record LocationChange(CustomsLocation Location, string? Reason);
public sealed record ScopeChange(Guid LocationId, bool IncludeChildren, string Responsibilities, string? Reason);
public sealed record EmployeeCreate(string Username, string FullName, string Email, string Password, string Role, Guid LocationId, string EmployeeNumber, string Phone, string Responsibilities, string Reason, bool IncludeChildren = false);
public sealed record EmployeeChange(string Status, Guid LocationId, string Responsibilities, string? Reason, bool IncludeChildren = false);
public sealed record EmployeeArchive(string Reason);
public sealed record DecisionInput(Guid? HsCodeId, Guid? LocationId, decimal SelectedReferenceValue, string Currency, string Decision, string? Justification, string? Evidence, Guid? Version,
    string? ProductName = null, string? PurchaseCountryCode = null, string? PurchaseCountryName = null, string? SelectedPriceSource = null, string? ValuationMethod = null, string? ProductPhotoUrl = null, Guid? ImporterDeclarationId = null);
public sealed record ProfileChange(string Username, string Email, string FullName, string Phone);
public sealed record PasswordChange(string CurrentPassword, string NewPassword, string ConfirmPassword);
public sealed record DecisionTransition(Guid Version, string? Justification, string Outcome = "Approved");
public sealed class DecisionReceiptForm
{
    public Guid? ImporterDeclarationId { get; set; }
    public Guid? HsCodeId { get; set; }
    public Guid? LocationId { get; set; }
    public decimal SelectedReferenceValue { get; set; }
    public string Currency { get; set; } = "";
    public string Decision { get; set; } = "";
    public string? Justification { get; set; }
    public string? Evidence { get; set; }
    public string ProductName { get; set; } = "";
    public string PurchaseCountryCode { get; set; } = "";
    public string SelectedPriceSource { get; set; } = "";
    public string ValuationMethod { get; set; } = "";
    public string? ProductPhotoUrl { get; set; }
    public decimal DeclaredPriceAmount { get; set; }
    public string DeclaredPriceCurrency { get; set; } = "";
    public decimal? FobPriceAmount { get; set; }
    public string? FobPriceCurrency { get; set; }
    public decimal? FreightAmount { get; set; }
    public decimal? InsuranceAmount { get; set; }
    public IFormFile? Receipt { get; set; }
}

[ApiController, Route("api/workspace"), Authorize, ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class WorkspaceController(CustomsDbContext db, WorkspaceAccess access, HistoricalFxClient fx) : ControllerBase
{
    private const long MaximumReceiptBytes = 8 * 1024 * 1024;
    private static readonly HashSet<string> ReceiptTypes = new(StringComparer.OrdinalIgnoreCase) { "application/pdf", "image/jpeg", "image/png" };
    // REGION and BRANCH are retained for compatibility with the existing
    // organization data and database constraint. New locations can continue
    // using the more specific operational types below.
    public static readonly string[] LocationTypes = ["REGION", "BRANCH", "HEAD_OFFICE", "BRANCH_OFFICE", "CUSTOMS_STATION", "CHECKPOINT", "INSPECTION_POINT", "DRY_PORT", "AIRPORT", "CARGO_OFFICE", "INDUSTRIAL_PARK", "RAIL_STATION", "FREE_TRADE_ZONE", "SPECIAL_ECONOMIC_ZONE", "TAX_CENTER", "COORDINATION_OFFICE", "WAREHOUSE", "OTHER"];
    public static readonly string[] LocationStatuses = ["ACTIVE", "INACTIVE", "TEMPORARILY_CLOSED", "PLANNED", "ARCHIVED"];
    private const decimal EthiopiaMinimumLatitude = 3.35m;
    private const decimal EthiopiaMaximumLatitude = 14.95m;
    private const decimal EthiopiaMinimumLongitude = 33.00m;
    private const decimal EthiopiaMaximumLongitude = 48.05m;
    public static readonly string[] EmployeeResponsibilityOptions = ["Valuation", "Inspection", "Import", "Export", "Transit"];

    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var user = await db.AuthAccounts.AsNoTracking().FirstOrDefaultAsync(u => u.Id == access.UserId, ct);
        if (user is null)
        {
            user = await db.AuthAccounts.AsNoTracking().FirstOrDefaultAsync(u => u.Username == User.Identity!.Name, ct);
            if (user is null) return Unauthorized(new { message = "User not found. Sign in to continue." });
        }
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
        // The operational dashboard is also the entry point for Customs
        // Officers (valuation search, their pending work and recent activity).
        // Keep the role-specific projections below while allowing officers to
        // reach the endpoint they are shown in the portal.
        access.Require(AccessRules.SystemAdmin, AccessRules.CustomsAdmin, AccessRules.Officer);
        var scope = await access.Locations(ct);
        var locations = await db.CustomsLocations.AsNoTracking().Where(l => scope.Contains(l.Id)).OrderBy(l => l.Name).ToListAsync(ct);
        var now = DateTimeOffset.UtcNow; var today = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        var grants = await db.UserLocationScopes.AsNoTracking().Where(s => s.EffectiveFrom <= now && (s.EffectiveTo == null || s.EffectiveTo > now)).ToListAsync(ct);
        List<AuthAccountEntity> allUsers = access.Role == AccessRules.Officer ? [] : await db.AuthAccounts.AsNoTracking().OrderBy(u => u.FullName).ToListAsync(ct);
        var managedUsers = allUsers.Where(u => AccessRules.NormalizeRole(u.Role) != AccessRules.SystemAdmin &&
            AccessRules.CanManageOfficer(access.Role, scope, u.Role, grants.Where(g => g.UserId == u.Id).Select(g => g.CustomsLocationId))).ToList();
        var dashboardEmployees = access.Role == AccessRules.CustomsAdmin
            ? managedUsers.Where(u => AccessRules.NormalizeRole(u.Role) == AccessRules.Officer).ToList()
            : managedUsers;
        // Keep valuation records out of the Customs Administrator and Officer
        // dashboard load. Their operational dashboard must not depend on the
        // valuation review workflow; System Administrator projections retain
        // their existing global records.
        List<ValuationDecision> decisions = [];
        if (access.Role == AccessRules.SystemAdmin)
        {
            // Legacy databases may contain incomplete draft rows from before
            // HS-code validation was enforced.
            decisions = await VisibleDecisions().AsNoTracking()
                .Where(d => d.HsCodeId != Guid.Empty)
                .OrderByDescending(d => d.RecordedAt).ToListAsync(ct);
        }
        var hsIds = decisions.Where(d => d.HsCodeId.HasValue).Select(d => d.HsCodeId!.Value).Distinct().ToList();
        var hsCodes = await db.HsCodes.AsNoTracking().Where(h => hsIds.Contains(h.Id)).ToDictionaryAsync(h => h.Id, ct);
        var auditQuery = db.AuditLogs.AsNoTracking().Where(a => access.IsSystem || access.Role == AccessRules.CustomsAdmin && a.LocationId != null && scope.Contains(a.LocationId.Value) || access.Role == AccessRules.Officer && a.UserId == access.UserId.ToString());
        var audit = await auditQuery.OrderByDescending(a => a.OccurredAt).Take(8).ToListAsync(ct);
        // The newest dated revision can be archived (for example the former v5
        // catalogue), so dashboard counts must follow the revision explicitly
        // marked Active before falling back to the newest available revision.
        var revision = await db.HsRevisions.AsNoTracking()
            .Where(r => r.Status == "Active")
            .OrderByDescending(r => r.EffectiveDate)
            .ThenByDescending(r => r.Number)
            .FirstOrDefaultAsync(ct);
        revision ??= await db.HsRevisions.AsNoTracking()
            .OrderByDescending(r => r.EffectiveDate)
            .ThenByDescending(r => r.Number)
            .FirstOrDefaultAsync(ct);
        var activeHs = revision == null ? 0 : await db.HsCodes.CountAsync(h => h.RevisionId == revision.Id, ct);
        var sources = await db.PriceSources.AsNoTracking().Where(source => source.Pool != PricePool.Local).OrderBy(s => s.Pool).ThenBy(s => s.Name).ToListAsync(ct);
        var visibleBranches = locations.Count(l => l.LocationType == "BRANCH");
        var activeLocations = locations.Count(l => (access.Role != AccessRules.CustomsAdmin || l.LocationType == "BRANCH") && l.Status == "ACTIVE" && l.EffectiveFrom <= now && (l.EffectiveTo == null || l.EffectiveTo > now));
        var officers = dashboardEmployees.Count(u => AccessRules.NormalizeRole(u.Role) == AccessRules.Officer && u.Active);
        var administrators = managedUsers.Count(u => AccessRules.NormalizeRole(u.Role) == AccessRules.CustomsAdmin && u.Active);
        var submitted = decisions.Count(d => d.Status == "Submitted");
        var pendingOfficerApplications = access.Role == AccessRules.CustomsAdmin
            ? await db.RegistrationRequests.CountAsync(r => r.Status == "Pending" && r.Role == AccessRules.Officer && r.LocationId.HasValue && scope.Contains(r.LocationId.Value), ct)
            : 0;
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
                new { key = "locations", label = "Assigned branches", value = activeLocations.ToString("N0"), detail = $"{visibleBranches:N0} total visible", tone = "blue" },
                new { key = "officers", label = "Active Officers", value = officers.ToString("N0"), detail = $"{dashboardEmployees.Count:N0} managed Officers", tone = "teal" },
                new { key = "officerApplications", label = "Pending Officer Applications", value = pendingOfficerApplications.ToString("N0"), detail = "Awaiting your review", tone = pendingOfficerApplications > 0 ? "gold" : "green" },
                new { key = "suspended", label = "Suspended accounts", value = dashboardEmployees.Count(u => u.Status == "SUSPENDED").ToString("N0"), detail = "Within my assigned location", tone = "red" }
            ],
            _ => [
                new { key = "pending", label = "My pending cases", value = ownPending.ToString("N0"), detail = "Draft or returned", tone = "blue" },
                new { key = "review", label = "Cases under review", value = submitted.ToString("N0"), detail = "Submitted", tone = "gold" },
                new { key = "today", label = "Decisions today", value = todayCount.ToString("N0"), detail = "Recorded by me", tone = "teal" }
            ]
        };
        return Ok(new {
            role = access.Role, generatedAt = now, kpis, activeRevision = revision == null ? null : new { revision.Id, revision.Name, revision.Number, revision.EffectiveDate, revision.Status, codeCount = activeHs },
            locations = locations.Select(l => new { l.Id, l.OfficialCode, l.Name, l.DisplayName, l.LocationType, l.ParentLocationId, l.Status, l.SupportsImport, l.SupportsExport, l.SupportsTransit, l.SupportsValuation, l.SupportsInspection }),
            employees = dashboardEmployees.Select(u => new { user = PublicEmployee(u), locationId = u.PrimaryLocationId, assignments = grants.Where(g => g.UserId == u.Id).Select(g => new { g.CustomsLocationId, g.IncludeChildLocations, g.Responsibilities }) }),
            decisions = decisions.Select(d => new { d.Id, d.HsCodeId, hsCode = d.HsCodeId.HasValue ? hsCodes.GetValueOrDefault(d.HsCodeId.Value)?.Code ?? "" : "", product = d.HsCodeId.HasValue ? hsCodes.GetValueOrDefault(d.HsCodeId.Value)?.DescriptionEn ?? "Unknown product" : "Product classification deferred to Phase 2", d.SelectedReferenceValue, d.Currency, d.Decision, d.Status, d.RecordedAt, d.LocationId, d.DeclaredPriceAmount, d.DeclaredPriceCurrency, d.DeclaredPriceConvertedAmount, d.DeclaredPriceConvertedCurrency, d.ReceiptFileName }),
            sources = sources.Select(s => new { s.Id, s.Name, pool = s.Pool.ToString(), s.IsApproved }), audit
        });
    }
    [HttpGet("notifications")]
    public async Task<IActionResult> Notifications(CancellationToken ct)
    {
        access.Require(AccessRules.CustomsAdmin);
        var scope = await access.Locations(ct);
        var pendingOfficerApplications = await db.RegistrationRequests.CountAsync(r => r.Status == "Pending" && r.Role == AccessRules.Officer && r.LocationId.HasValue && scope.Contains(r.LocationId.Value), ct);
        return Ok(new { generatedAt = DateTimeOffset.UtcNow, pendingOfficerApplications });
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
        var changeNote = input.Reason?.Trim() ?? "";
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
        value.Id = entity.Id; value.CreatedBy = createdBy; value.CreatedAt = createdAt.ToUniversalTime();
        value.EffectiveFrom = value.EffectiveFrom.ToUniversalTime();
        value.EffectiveTo = value.EffectiveTo?.ToUniversalTime();
        value.LastVerifiedAt = value.LastVerifiedAt?.ToUniversalTime();
        value.OfficialCode = value.OfficialCode!.ToUpperInvariant(); value.Name = value.Name.Trim();
        value.DisplayName = string.IsNullOrWhiteSpace(value.DisplayName) ? value.Name : value.DisplayName.Trim();
        value.UpdatedBy = access.UserId.ToString(); value.UpdatedAt = DateTimeOffset.UtcNow; value.Version = Guid.NewGuid();
        if (value.Status == "ARCHIVED") value.EffectiveTo ??= DateTimeOffset.UtcNow;
        if (id == null) db.CustomsLocations.Add(value); else db.Entry(entity).CurrentValues.SetValues(value);
        db.CustomsLocationHistory.Add(new() { Id = Guid.NewGuid(), CustomsLocationId = value.Id, ChangedAt = value.UpdatedAt, ChangedBy = access.UserId.ToString(), ChangeReason = changeNote, PreviousValueJson = before?.GetRawText() ?? "null", NewValueJson = JsonSerializer.Serialize(value) });
        access.Audit(id == null ? "LOCATION_CREATED" : "LOCATION_UPDATED", "Locations", value.Id, before, value, changeNote, value.Id);
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
        await RequireEmployeeLocation(input.LocationId, role, ct);
        var username = (input.Username ?? "").Trim();
        var email = (input.Email ?? "").Trim().ToLowerInvariant();
        var fullName = (input.FullName ?? "").Trim();
        var employeeNumber = (input.EmployeeNumber ?? "").Trim();
        var password = input.Password ?? "";
        var reason = (input.Reason ?? "").Trim();
        Validate(Regex.IsMatch(username, "^[a-zA-Z0-9_.-]{3,120}$") && fullName.Length > 0 && System.Net.Mail.MailAddress.TryCreate(email, out _), "Provide a valid username, name and email.");
        Validate(employeeNumber.Length > 0 && employeeNumber.Length <= 80, "Provide an employee or staff ID.");
        Validate(Regex.IsMatch(password, "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$"), "Use a strong password with 8+ characters, uppercase, lowercase, number and symbol.");
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
        db.UserLocationScopes.Add(new UserLocationScope { Id = Guid.NewGuid(), UserId = user.Id, CustomsLocationId = input.LocationId, IncludeChildLocations = input.IncludeChildren, Responsibilities = role == AccessRules.Officer ? responsibilities : "Customs Administrator", EffectiveFrom = now, CreatedBy = access.UserId.ToString() });
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
        Validate(new[] { "ACTIVE", "PENDING_VALIDATION", "SUSPENDED", "INACTIVE", "LOCKED" }.Contains(input.Status), "Invalid account status.");
        await RequireEmployeeLocation(input.LocationId, user.Role, ct);
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
        var currentScope = await db.UserLocationScopes.Where(s => s.UserId == id && (s.EffectiveTo == null || s.EffectiveTo > now)).OrderByDescending(s => s.EffectiveFrom).FirstOrDefaultAsync(ct);
        if (currentScope is null)
            db.UserLocationScopes.Add(new UserLocationScope { Id = Guid.NewGuid(), UserId = id, CustomsLocationId = input.LocationId, IncludeChildLocations = input.IncludeChildren, Responsibilities = responsibilities, EffectiveFrom = now, CreatedBy = access.UserId.ToString() });
        else
        {
            currentScope.CustomsLocationId = input.LocationId;
            currentScope.IncludeChildLocations = input.IncludeChildren;
            currentScope.Responsibilities = responsibilities;
            currentScope.EffectiveTo = null;
        }
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

    private async Task RequireEmployeeLocation(Guid locationId, string? role, CancellationToken ct)
    {
        await access.RequireLocation(locationId, true, ct);
        var location = await db.CustomsLocations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId, ct);
        Validate(location?.LocationType == "BRANCH", "Employees must be assigned to an active branch.");
        if (AccessRules.NormalizeRole(role) == AccessRules.Officer)
            Validate(location!.SupportsValuation || location.SupportsInspection, "Assign Customs Officers to a branch that supports valuation or inspection work.");
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

    private IQueryable<ValuationDecision> VisibleDecisions()
    {
        var subject = access.UserId.ToString();
        return db.ValuationDecisions.Where(d => d.HsCodeId != Guid.Empty && (
            access.IsSystem ||
            access.Role == AccessRules.Officer && d.OfficerSubjectId == subject));
    }
    [HttpGet("decisions")]
    public async Task<IActionResult> Decisions(CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin, AccessRules.Officer);
        return Ok(await VisibleDecisions().AsNoTracking().OrderByDescending(d => d.RecordedAt).ToListAsync(ct));
    }
    [HttpPost("decisions")]
    public Task<IActionResult> CreateDecision(DecisionInput input, CancellationToken ct) => SaveDecision(null, input, ct);
    [HttpPost("decisions/with-receipt"), RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> CreateDecisionWithReceipt([FromForm] DecisionReceiptForm form, CancellationToken ct)
    {
        access.Require(AccessRules.Officer);
        Validate(form.DeclaredPriceAmount > 0, "Enter the positive price paid by the customer.");
        var sourceCurrency = NormalizeCurrency(form.DeclaredPriceCurrency);
        var targetCurrency = NormalizeCurrency(form.Currency);
        Validate(sourceCurrency is not null && targetCurrency is not null, "Use three-letter ISO currencies for the paid price and system value.");
        Validate(form.Receipt is { Length: > 0 }, "Attach the customer's PDF, JPG, or PNG receipt.");
        Validate(form.Receipt!.Length <= MaximumReceiptBytes, "The receipt must be 8 MB or smaller.");
        Validate(ReceiptTypes.Contains(form.Receipt.ContentType), "Receipt format must be PDF, JPG, or PNG.");

        await using var stream = new MemoryStream();
        await form.Receipt.CopyToAsync(stream, ct);
        var bytes = stream.ToArray();
        Validate(IsValidReceiptSignature(bytes, form.Receipt.ContentType), "The receipt content does not match its declared PDF or image format.");
        var conversion = await ConvertDeclaredPrice(form.DeclaredPriceAmount, sourceCurrency!, targetCurrency!, ct);
        var purchaseCountryCode = form.PurchaseCountryCode.Trim().ToUpperInvariant();
        var purchaseCountryName = CountryName(purchaseCountryCode);
        Validate(purchaseCountryName is not null, "Select a valid country where the item was bought.");
        string? fobCifCalculationJson = null;
        if (string.Equals(form.SelectedPriceSource?.Trim(), "originFobCif", StringComparison.OrdinalIgnoreCase))
        {
            // FOB plus freight and insurance is the standard basis. An importer declaration must be approved and carry its
            // Certificate of Origin; an officer's own valuation search records the FOB invoice it was given.
            ImporterDeclaration? declaration = null;
            ImporterDocument? certificate = null;
            if (form.ImporterDeclarationId.HasValue)
            {
                declaration = await db.ImporterDeclarations.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.Id == form.ImporterDeclarationId.Value, ct);
                Validate(declaration is not null && declaration.Status == "ASSESSMENT_READY" && declaration.LocationId == form.LocationId,
                    "The importer declaration must be approved for valuation in the selected office.");
                certificate = await db.ImporterDocuments.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.DeclarationId == declaration!.Id && x.Kind == "CERTIFICATE_OF_ORIGIN", ct);
                Validate(certificate is not null, "A Certificate of Origin is required for origin-country FOB valuation.");
            }
            Validate(form.FobPriceAmount is > 0 and <= 1_000_000_000_000_000m,
                "Enter a positive FOB amount within the supported range.");
            Validate(form.FreightAmount.HasValue && form.InsuranceAmount.HasValue,
                "Enter explicit freight and insurance amounts. Use zero when there is no charge.");
            var freight = form.FreightAmount!.Value;
            var insurance = form.InsuranceAmount!.Value;
            Validate(freight is >= 0 and <= 1_000_000_000_000_000m && insurance is >= 0 and <= 1_000_000_000_000_000m,
                "Freight and insurance must be zero or positive and within the supported range.");
            var fobCurrency = NormalizeCurrency(form.FobPriceCurrency);
            Validate(fobCurrency is not null, "Use a three-letter ISO currency for the FOB amount and transport costs.");
            var originalCifAmount = form.FobPriceAmount!.Value + freight + insurance;
            Validate(originalCifAmount > 0, "The FOB amount plus freight and insurance must be positive.");
            var cifConversion = await ConvertDeclaredPrice(originalCifAmount, fobCurrency!, targetCurrency!, ct);
            form.SelectedReferenceValue = cifConversion.Amount;
            form.ValuationMethod = "Origin-country FOB plus freight and insurance (CIF)";
            fobCifCalculationJson = JsonSerializer.Serialize(new
            {
                basis = "FOB + freight + insurance",
                originCountryCode = declaration?.OriginCountryCode ?? purchaseCountryCode,
                originCountryName = declaration?.OriginCountryName ?? purchaseCountryName,
                certificateOfOrigin = certificate is null ? null : new { certificate.FileName, certificate.ContentType, certificate.Sha256, certificate.UploadedAt },
                fobAmount = form.FobPriceAmount.Value,
                freightAmount = freight,
                insuranceAmount = insurance,
                originalCifAmount,
                originalCurrency = fobCurrency,
                customsValueCifAmount = cifConversion.Amount,
                customsValueCurrency = targetCurrency,
                exchangeRate = cifConversion.Rate,
                exchangeRateSource = cifConversion.Source,
                exchangeRateDate = cifConversion.Date
            });
        }
        else
        {
            Validate(form.FobPriceAmount is null && form.FreightAmount is null && form.InsuranceAmount is null,
                "FOB and transport inputs require the origin-country FOB price source.");
        }
        var input = new DecisionInput(form.HsCodeId, form.LocationId, form.SelectedReferenceValue, targetCurrency!, form.Decision, form.Justification, form.Evidence, null,
            form.ProductName, purchaseCountryCode, purchaseCountryName, form.SelectedPriceSource, form.ValuationMethod, form.ProductPhotoUrl, form.ImporterDeclarationId);
        var receipt = new ReceiptEvidence(
            form.DeclaredPriceAmount, sourceCurrency!, conversion.Amount, targetCurrency!, conversion.Rate,
            conversion.Source, conversion.Date, Path.GetFileName(form.Receipt.FileName), form.Receipt.ContentType,
            bytes.LongLength, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(), DateTimeOffset.UtcNow,
            access.UserId.ToString(), bytes);
        return await SaveDecision(null, input, ct, receipt, fobCifCalculationJson);
    }
    [HttpGet("decisions/{id:guid}/receipt")]
    public async Task<IActionResult> Receipt(Guid id, CancellationToken ct)
    {
        var decision = await VisibleDecisions().AsNoTracking().SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found.");
        if (decision.ReceiptData is not { Length: > 0 }) return NotFound(new { message = "No receipt was captured for this legacy valuation record." });
        access.AuditAccess("DOCUMENT_OPENED", "Valuations", decision.Id, decision.LocationId, null, $"commercial invoice or receipt · {decision.ReceiptFileName}");
        await db.SaveChangesAsync(ct);
        return File(decision.ReceiptData, decision.ReceiptContentType, decision.ReceiptFileName);
    }
    private static readonly string[] DecisionDocumentKinds = ["PACKING_LIST", "CERTIFICATE_OF_ORIGIN"];

    /// <summary>Attaches the packing list or certificate of origin to the officer's own valuation (the receipt is sent on creation).</summary>
    [HttpPost("decisions/{id:guid}/documents"), RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadDecisionDocument(Guid id, [FromForm] string kind, IFormFile file, CancellationToken ct)
    {
        access.Require(AccessRules.Officer);
        var normalized = (kind ?? "").Trim().ToUpperInvariant();
        Validate(DecisionDocumentKinds.Contains(normalized), "Upload a packing list or certificate of origin.");
        Validate(file is { Length: > 0 } && file.Length <= MaximumReceiptBytes, "The document must be a PDF, JPG or PNG of 8 MB or smaller.");
        Validate(ReceiptTypes.Contains(file!.ContentType), "Document format must be PDF, JPG, or PNG.");
        var decision = await VisibleDecisions().SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found.");
        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, ct);
        var bytes = stream.ToArray();
        Validate(IsValidReceiptSignature(bytes, file.ContentType), "The document content does not match its declared PDF or image format.");
        var existing = await db.ValuationDecisionDocuments.SingleOrDefaultAsync(d => d.ValuationDecisionId == decision.Id && d.Kind == normalized, ct);
        var document = existing ?? new ValuationDecisionDocument { Id = Guid.NewGuid(), ValuationDecisionId = decision.Id, Kind = normalized };
        document.FileName = Path.GetFileName(file.FileName); document.ContentType = file.ContentType; document.Size = bytes.LongLength;
        document.Sha256 = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(); document.Content = bytes;
        document.UploadedAt = DateTimeOffset.UtcNow; document.UploadedBy = access.UserId.ToString();
        if (existing is null) db.ValuationDecisionDocuments.Add(document);
        await db.SaveChangesAsync(ct);
        return Ok(new { document.Kind, document.FileName, document.ContentType, document.Size, document.Sha256, document.UploadedAt });
    }

    [HttpGet("decisions/{id:guid}/documents")]
    public async Task<IActionResult> DecisionDocuments(Guid id, CancellationToken ct)
    {
        var decision = await VisibleDecisions().AsNoTracking().SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found.");
        var documents = await db.ValuationDecisionDocuments.AsNoTracking().Where(d => d.ValuationDecisionId == decision.Id)
            .Select(d => new { d.Kind, d.FileName, d.ContentType, d.Size, d.UploadedAt }).ToListAsync(ct);
        return Ok(new { receipt = decision.ReceiptData is { Length: > 0 } ? new { decision.ReceiptFileName, decision.ReceiptContentType } : null, documents });
    }

    [HttpGet("decisions/{id:guid}/documents/{kind}")]
    public async Task<IActionResult> DecisionDocument(Guid id, string kind, CancellationToken ct)
    {
        var decision = await VisibleDecisions().AsNoTracking().SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found.");
        var normalized = kind.Trim().ToUpperInvariant();
        var document = await db.ValuationDecisionDocuments.AsNoTracking().SingleOrDefaultAsync(d => d.ValuationDecisionId == decision.Id && d.Kind == normalized, ct);
        if (document is null) return NotFound(new { message = "Document not found." });
        access.AuditAccess("DOCUMENT_OPENED", "Valuations", decision.Id, decision.LocationId, null, $"{document.Kind.Replace('_', ' ').ToLowerInvariant()} · {document.FileName}");
        await db.SaveChangesAsync(ct);
        return File(document.Content, document.ContentType, document.FileName);
    }

    [HttpGet("audit/{auditId:guid}/receipt")]
    public async Task<IActionResult> AuditReceipt(Guid auditId, CancellationToken ct)
    {
        var audit = await db.AuditLogs.AsNoTracking().SingleOrDefaultAsync(item => item.Id == auditId, ct) ?? throw new WorkspaceException(404, "Audit record not found.");
        var snapshot = await db.ValuationAuditSnapshots.AsNoTracking().SingleOrDefaultAsync(item => item.AuditLogId == auditId, ct) ?? throw new WorkspaceException(404, "This audit record has no receipt reference.");
        var allowed = access.IsSystem ||
            access.Role == AccessRules.Officer && audit.UserId == access.UserId.ToString() ||
            access.Role == AccessRules.CustomsAdmin && await db.AuthAccounts.AsNoTracking().AnyAsync(user => user.Id == access.UserId && user.PrimaryLocationId == snapshot.OfficerLocationId, ct);
        if (!allowed) return Forbid();
        var decision = await db.ValuationDecisions.AsNoTracking().SingleOrDefaultAsync(item => item.Id == snapshot.ValuationDecisionId, ct) ?? throw new WorkspaceException(404, "Valuation record not found.");
        if (decision.ReceiptData is not { Length: > 0 }) return NotFound(new { message = "The receipt file is no longer available." });
        return File(decision.ReceiptData, decision.ReceiptContentType);
    }
    [HttpPut("decisions/{id:guid}")]
    public Task<IActionResult> UpdateDecision(Guid id, DecisionInput input, CancellationToken ct) => SaveDecision(id, input, ct);
    private async Task<IActionResult> SaveDecision(Guid? id, DecisionInput input, CancellationToken ct, ReceiptEvidence? receipt = null, string? fobCifCalculationJson = null)
    {
        access.Require(AccessRules.Officer);
        Validate(id.HasValue || receipt is not null, "Attach the customer's PDF, JPG, or PNG receipt when creating a valuation record.");
        CustomsLocation? office = null;
        if (input.LocationId.HasValue)
        {
            await access.RequireLocation(input.LocationId.Value, true, ct);
            office = await db.CustomsLocations.FindAsync([input.LocationId.Value], ct);
            Validate(office is not null && office.Status == "ACTIVE" && office.LocationType == "BRANCH", "The valuation must use an active branch location.");
            Validate(office!.SupportsValuation || office.SupportsInspection, "The valuation office must support valuation or inspection work.");
        }
        Validate(input.SelectedReferenceValue > 0 && Regex.IsMatch(input.Currency ?? "", "^[A-Z]{3}$"), "Enter a positive reference value and a three-letter currency.");
        Validate(!string.IsNullOrWhiteSpace(input.Decision), "Record the valuation decision.");
        Validate(!string.IsNullOrWhiteSpace(input.ProductName) && input.ProductName.Trim().Length <= 300, "Record a product name of 300 characters or fewer.");
        var purchaseCountryCode = input.PurchaseCountryCode?.Trim().ToUpperInvariant() ?? "";
        var purchaseCountryName = CountryName(purchaseCountryCode);
        Validate(purchaseCountryName is not null, "Select a valid country where the item was bought.");
        Validate((input.SelectedPriceSource?.Trim().Length ?? 0) is > 0 and <= 80, "Record the selected price source.");
        if (string.Equals(input.SelectedPriceSource?.Trim(), "originFobCif", StringComparison.OrdinalIgnoreCase))
            Validate(!string.IsNullOrWhiteSpace(fobCifCalculationJson) && fobCifCalculationJson != "{}", "FOB-based customs values must be calculated from the FOB amount, freight and insurance.");
        else
            Validate(fobCifCalculationJson is null, "An FOB calculation may only be saved with the origin-country FOB price source.");
        Validate((input.ValuationMethod?.Trim().Length ?? 0) is > 0 and <= 120, "Record the valuation method.");
        var productPhotoUrl = input.ProductPhotoUrl?.Trim() ?? "";
        Validate(productPhotoUrl.Length <= 2048 && (productPhotoUrl.Length == 0 || Uri.TryCreate(productPhotoUrl, UriKind.Absolute, out var photoUri) && photoUri.Scheme is "http" or "https"), "The product photo reference must be a valid HTTPS or HTTP URL.");
        var officerNoteIssue = OfficerNoteQuality.Check(input.Justification);
        Validate(officerNoteIssue is null, officerNoteIssue ?? "");
        if (input.HsCodeId.HasValue)
            Validate(await db.HsCodes.AnyAsync(h => h.Id == input.HsCodeId.Value, ct), "The selected HS code was not found.");
        ImporterDeclaration? importerDeclaration = null;
        if (input.ImporterDeclarationId.HasValue)
        {
            importerDeclaration = await db.ImporterDeclarations.SingleOrDefaultAsync(x => x.Id == input.ImporterDeclarationId.Value, ct);
            Validate(importerDeclaration is not null && importerDeclaration.Status == "ASSESSMENT_READY" && importerDeclaration.LocationId == input.LocationId,
                "This importer declaration is not ready for valuation in the selected office.");
            Validate(input.HsCodeId == importerDeclaration!.ConfirmedHsCodeId, "Use the HS code verified by the officer for this importer declaration.");
            Validate(!await db.ValuationDecisions.AnyAsync(x => x.ImporterDeclarationId == importerDeclaration.Id, ct), "This importer declaration already has a valuation case.");
        }
        var entity = id == null ? new ValuationDecision { Id = Guid.NewGuid(), OfficerSubjectId = access.UserId.ToString(), RecordedAt = DateTimeOffset.UtcNow } : await VisibleDecisions().SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found.");
        Validate(entity.OfficerSubjectId == access.UserId.ToString() && entity.Status is "Draft" or "Returned", "Only your own draft or returned decisions may be edited.");
        if (id != null) Validate(entity.Version == input.Version, "Decision changed. Refresh before editing.");
        JsonElement? before = id == null ? null : JsonSerializer.SerializeToElement(entity);
        var all = await db.CustomsLocations.AsNoTracking().ToListAsync(ct); var hierarchy = new List<object>(); var current = office; var seen = new HashSet<Guid>();
        while (current != null && seen.Add(current.Id)) { hierarchy.Add(new { current.Id, current.OfficialCode, current.Name, current.ParentLocationId }); current = all.Find(l => l.Id == current.ParentLocationId); }
        object locationSnapshot = hierarchy.Count == 0 ? new { scope = "UnassignedOfficerWorkspace" } : hierarchy;
        entity.LocationId = input.LocationId; entity.LocationSnapshotJson = JsonSerializer.Serialize(locationSnapshot);
        entity.ProductName = input.ProductName!.Trim(); entity.PurchaseCountryCode = purchaseCountryCode; entity.PurchaseCountryName = purchaseCountryName!;
        if (importerDeclaration is not null) { entity.ImporterDeclarationId = importerDeclaration.Id; importerDeclaration.Status = "IN_ASSESSMENT"; importerDeclaration.UpdatedAt = DateTimeOffset.UtcNow; importerDeclaration.Version = Guid.NewGuid(); }
        entity.SelectedPriceSource = input.SelectedPriceSource!.Trim(); entity.ValuationMethod = input.ValuationMethod!.Trim(); entity.ProductPhotoUrl = productPhotoUrl;
        entity.HsCodeId = input.HsCodeId; entity.SelectedReferenceValue = input.SelectedReferenceValue; entity.Currency = input.Currency!;
        entity.Decision = input.Decision.Trim(); entity.Justification = input.Justification?.Trim() ?? ""; entity.Status = "Draft"; entity.Version = Guid.NewGuid();
        // Narrative evidence records source URLs/record IDs and context without altering underlying observations.
        entity.EvidenceNotes = input.Evidence?.Trim() ?? "";
        entity.FobCifCalculationJson = fobCifCalculationJson ?? "{}";
        if (receipt is not null)
        {
            entity.DeclaredPriceAmount = receipt.OriginalAmount; entity.DeclaredPriceCurrency = receipt.OriginalCurrency;
            entity.DeclaredPriceConvertedAmount = receipt.ConvertedAmount; entity.DeclaredPriceConvertedCurrency = receipt.ConvertedCurrency;
            entity.DeclaredPriceExchangeRate = receipt.ExchangeRate; entity.DeclaredPriceExchangeRateSource = receipt.ExchangeRateSource;
            entity.DeclaredPriceExchangeRateDate = receipt.ExchangeRateDate; entity.ReceiptFileName = receipt.FileName;
            entity.ReceiptContentType = receipt.ContentType; entity.ReceiptFileSize = receipt.FileSize; entity.ReceiptSha256 = receipt.Sha256;
            entity.ReceiptUploadedAt = receipt.UploadedAt; entity.ReceiptUploadedBy = receipt.UploadedBy; entity.ReceiptData = receipt.Data;
        }
        if (id == null) db.ValuationDecisions.Add(entity);
        var audit = access.Audit(id == null ? "VALUATION_CREATED" : "VALUATION_UPDATED", "Valuations", entity.Id, before, entity, entity.Justification, input.LocationId);
        var officer = await db.AuthAccounts.AsNoTracking().SingleOrDefaultAsync(user => user.Id == access.UserId, ct);
        var hs = entity.HsCodeId.HasValue ? await db.HsCodes.AsNoTracking().Where(item => item.Id == entity.HsCodeId.Value).Select(item => new { item.Code, item.DescriptionEn }).SingleOrDefaultAsync(ct) : null;
        db.ValuationAuditSnapshots.Add(ValuationAuditSnapshotFactory.Create(audit, entity, null, hs?.Code, hs?.DescriptionEn, officer, office));
        await db.SaveChangesAsync(ct); return Ok(entity);
    }
    [HttpPost("decisions/{id:guid}/submit")]
    public async Task<IActionResult> Submit(Guid id, DecisionTransition input, CancellationToken ct)
    {
        access.Require(AccessRules.Officer);
        var decision = await VisibleDecisions().SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found.");
        Validate(decision.OfficerSubjectId == access.UserId.ToString() && decision.Status == "Draft" && decision.Version == input.Version, "Only your current saved draft may be submitted.");
        Validate(decision.DeclaredPriceAmount > 0 && decision.ReceiptData is { Length: > 0 }, "Capture the customer's price paid and attach a PDF, JPG, or PNG receipt before submission.");
        Validate(decision.LocationId.HasValue, "Assign an active valuation office before submitting this valuation.");
        await access.RequireLocation(decision.LocationId!.Value, true, ct);
        var office = await db.CustomsLocations.FindAsync([decision.LocationId.Value], ct);
        Validate(office is not null && office.LocationType == "BRANCH" && (office.SupportsValuation || office.SupportsInspection), "The valuation office must support valuation or inspection work.");
        var before = JsonSerializer.SerializeToElement(decision); decision.Status = "Submitted"; decision.SubmittedAt = DateTimeOffset.UtcNow; decision.Version = Guid.NewGuid();
        var audit = access.Audit("VALUATION_SUBMITTED", "Valuations", id, before, decision, decision.Justification, decision.LocationId);
        var officer = Guid.TryParse(decision.OfficerSubjectId, out var officerId) ? await db.AuthAccounts.AsNoTracking().SingleOrDefaultAsync(user => user.Id == officerId, ct) : null;
        var hs = decision.HsCodeId.HasValue ? await db.HsCodes.AsNoTracking().Where(item => item.Id == decision.HsCodeId.Value).Select(item => new { item.Code, item.DescriptionEn }).SingleOrDefaultAsync(ct) : null;
        db.ValuationAuditSnapshots.Add(ValuationAuditSnapshotFactory.Create(audit, decision, null, hs?.Code, hs?.DescriptionEn, officer, office));
        await db.SaveChangesAsync(ct); return Ok(decision);
    }
    [HttpPost("decisions/{id:guid}/review")]
    public async Task<IActionResult> Review(Guid id, DecisionTransition input, CancellationToken ct)
    {
        access.Require(AccessRules.SystemAdmin);
        var decision = await VisibleDecisions().SingleOrDefaultAsync(d => d.Id == id, ct) ?? throw new WorkspaceException(404, "Decision not found in your assigned location.");
        Validate(decision.Status == "Submitted" && decision.Version == input.Version && (input.Outcome is "Approved" or "Returned"), "Only a current submitted decision may be approved or returned.");
        var reviewNote = input.Justification?.Trim() ?? "";
        // Approving needs no note; returning a valuation must tell the officer what to fix.
        Validate(input.Outcome != "Returned" || reviewNote.Length >= 10, "Explain what the officer must correct before returning the valuation.");
        var before = JsonSerializer.SerializeToElement(decision); decision.Status = input.Outcome; decision.ReviewedBy = access.UserId.ToString(); decision.ReviewedAt = DateTimeOffset.UtcNow; decision.ReviewJustification = reviewNote; decision.Version = Guid.NewGuid();
        var audit = access.Audit("VALUATION_REVIEWED", "Valuations", id, before, decision, reviewNote, decision.LocationId);
        var officer = Guid.TryParse(decision.OfficerSubjectId, out var officerId) ? await db.AuthAccounts.AsNoTracking().SingleOrDefaultAsync(user => user.Id == officerId, ct) : null;
        var office = decision.LocationId.HasValue ? await db.CustomsLocations.AsNoTracking().SingleOrDefaultAsync(location => location.Id == decision.LocationId.Value, ct) : null;
        var hs = decision.HsCodeId.HasValue ? await db.HsCodes.AsNoTracking().Where(item => item.Id == decision.HsCodeId.Value).Select(item => new { item.Code, item.DescriptionEn }).SingleOrDefaultAsync(ct) : null;
        db.ValuationAuditSnapshots.Add(ValuationAuditSnapshotFactory.Create(audit, decision, null, hs?.Code, hs?.DescriptionEn, officer, office));
        await db.SaveChangesAsync(ct); return Ok(decision);
    }
    [HttpGet("audit")]
    public async Task<IActionResult> Audit(CancellationToken ct, int page = 1, int pageSize = 20,
        string? search = null, string? category = null, string? eventType = null,
        Guid? caseId = null, DateTimeOffset? from = null, DateTimeOffset? to = null,
        string? officer = null, string? region = null, string? branch = null, Guid? eventId = null, string? source = null)
    {
        var subject = access.UserId.ToString();
        var query = await ScopedAudit(subject, ct);
        Validate(!from.HasValue || !to.HasValue || from.Value < to.Value, "The end date must follow the start date.");
        var categories = (category ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(c => c.ToUpperInvariant()).ToArray();
        Validate(categories.All(c => AuditTaxonomy.Categories.Contains(c) || c is "VALUATIONS" or "IMPORTER" or "CHANGES"), "Choose a valid audit category.");
        var availableTotal = await query.CountAsync(ct);
        if (caseId.HasValue)
        {
            // A case is a valuation decision or an importer declaration; a declaration that was valued shares one history with its decision.
            var caseDecisionIds = db.ValuationDecisions.Where(d => d.Id == caseId.Value || d.ImporterDeclarationId == caseId.Value).Select(d => d.Id);
            var caseDeclarationIds = db.ValuationDecisions.Where(d => d.Id == caseId.Value && d.ImporterDeclarationId != null).Select(d => d.ImporterDeclarationId!.Value);
            var assessments = db.ValuationPhase2s.Where(p => caseDecisionIds.Contains(p.ValuationDecisionId)).Select(p => p.Id);
            var snapshots = db.ValuationAuditSnapshots.Where(s => caseDecisionIds.Contains(s.ValuationDecisionId)).Select(s => s.AuditLogId);
            query = query.Where(a => a.RecordId == caseId.Value || caseDecisionIds.Contains(a.RecordId) || assessments.Contains(a.RecordId) || snapshots.Contains(a.Id)
                || (a.Module == ImporterDeclarationsModule && caseDeclarationIds.Contains(a.RecordId)));
        }
        if (categories.Length > 0)
        {
            var wanted = categories.Select(c => c switch { "VALUATIONS" or "IMPORTER" => AuditTaxonomy.Case, "CHANGES" => AuditTaxonomy.Staff, _ => c }).Distinct().ToArray();
            query = query.Where(a => wanted.Contains(a.Category));
            if (categories.Contains("IMPORTER")) query = query.Where(a => a.Source == AuditTaxonomy.ImporterPortal);
            if (categories.Contains("VALUATIONS")) query = query.Where(a => a.Source == AuditTaxonomy.ValuationSearch);
        }
        if (!string.IsNullOrWhiteSpace(source)) query = query.Where(a => a.Source == source.ToUpperInvariant());
        if (eventId.HasValue) query = query.Where(a => a.Id == eventId.Value);
        query = SES.Customs.API.Queries.AuditHistoryQuery.Filter(query, null, eventType, from, to, officer);
        if (!string.IsNullOrWhiteSpace(branch) || !string.IsNullOrWhiteSpace(region))
        {
            var regions = db.CustomsLocations.Where(l => region == null || l.Name.Contains(region) || (l.DisplayName != null && l.DisplayName.Contains(region))).Select(l => l.Id);
            var locationIds = db.CustomsLocations.Where(l => (branch == null || l.Name.Contains(branch) || (l.DisplayName != null && l.DisplayName.Contains(branch))) && (region == null || regions.Contains(l.Id) || (l.ParentLocationId.HasValue && regions.Contains(l.ParentLocationId.Value)))).Select(l => l.Id);
            var assessmentIds = db.ValuationPhase2s.Where(p => db.ValuationDecisions.Any(d => d.Id == p.ValuationDecisionId && d.LocationId.HasValue && locationIds.Contains(d.LocationId.Value))).Select(p => p.Id);
            query = query.Where(a => (a.LocationId.HasValue && locationIds.Contains(a.LocationId.Value)) || (a.Module == "EthiopianImportTaxAssessment" && assessmentIds.Contains(a.RecordId)));
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            search = search.Trim();
            var matchingSnapshots = db.ValuationAuditSnapshots.Where(s => s.ProductName.Contains(search) || s.HsCode.Contains(search) || s.PurchaseCountryName.Contains(search) || s.OfficerName.Contains(search)).Select(s => s.AuditLogId);
            query = query.Where(a => a.Username.Contains(search) || a.Action.Contains(search) || a.Module.Contains(search) || (a.Justification != null && a.Justification.Contains(search)) || (a.NewValueJson != null && a.NewValueJson.Contains(search)) || matchingSnapshots.Contains(a.Id));
        }
        pageSize = Math.Clamp(pageSize, 1, 100);
        var total = await query.CountAsync(ct);
        page = Math.Clamp(page, 1, Math.Max(1, (int)Math.Ceiling(total / (double)pageSize)));
        var records = await SES.Customs.API.Queries.AuditHistoryQuery.Page(query, page, pageSize, caseId.HasValue).ToListAsync(ct);
        var auditIds = records.Select(record => record.Id).ToArray();
        var valuationSnapshots = await db.ValuationAuditSnapshots.AsNoTracking()
            .Where(snapshot => auditIds.Contains(snapshot.AuditLogId))
            .ToDictionaryAsync(snapshot => snapshot.AuditLogId, ct);
        var locations = await db.CustomsLocations.AsNoTracking().ToListAsync(ct);
        var supervisors = await db.AuthAccounts.AsNoTracking().Where(u => u.Role == AccessRules.CustomsAdmin && u.Active).ToListAsync(ct);
        var phase2Ids = records.Where(r => r.Module == "EthiopianImportTaxAssessment").Select(r => r.RecordId).ToArray();
        var phase2Locations = await db.ValuationPhase2s.AsNoTracking().Where(p => phase2Ids.Contains(p.Id)).Join(db.ValuationDecisions.AsNoTracking(), p => p.ValuationDecisionId, d => d.Id, (p, d) => new { p.Id, d.LocationId }).ToDictionaryAsync(x => x.Id, x => x.LocationId, ct);
        var phase2Details = await db.ValuationPhase2s.AsNoTracking().Include(p => p.TaxLines).Where(p => phase2Ids.Contains(p.Id)).ToListAsync(ct);
        Guid? DecisionFor(AuditLog record) => valuationSnapshots.TryGetValue(record.Id, out var snapshot) ? snapshot.ValuationDecisionId
            : phase2Details.FirstOrDefault(p => p.Id == record.RecordId)?.ValuationDecisionId
            ?? (record.Module is "Valuation" or "Valuations" ? record.RecordId : null);
        var recordDecisionIds = records.Select(DecisionFor).OfType<Guid>().Distinct().ToArray();
        var decisionDeclarations = await db.ValuationDecisions.AsNoTracking().Where(d => recordDecisionIds.Contains(d.Id) && d.ImporterDeclarationId != null)
            .ToDictionaryAsync(d => d.Id, d => d.ImporterDeclarationId!.Value, ct);
        Guid? DeclarationFor(AuditLog record) => record.Module == ImporterDeclarationsModule ? record.RecordId
            : DecisionFor(record) is Guid decisionId && decisionDeclarations.TryGetValue(decisionId, out var declarationId) ? declarationId : null;
        var declarationIds = records.Select(DeclarationFor).OfType<Guid>().Distinct().ToArray();
        var declarations = await db.ImporterDeclarations.AsNoTracking().Where(d => declarationIds.Contains(d.Id))
            .Select(d => new { d.Id, d.ImporterId, d.Reference, d.Status, d.ProductName, d.Brand, d.Model, d.Quantity, d.Unit, d.OriginCountryCode, d.OriginCountryName, d.ImportPurpose,
                d.InvoiceAmount, d.InvoiceCurrency, d.FreightAmount, d.InsuranceAmount, d.SuggestedTariffLineId, d.ConfirmedTariffLineId, d.SubmittedAt })
            .ToDictionaryAsync(d => d.Id, ct);
        var importerIds = declarations.Values.Select(d => d.ImporterId).Distinct().ToArray();
        var importers = await db.ImporterProfiles.AsNoTracking().Where(p => importerIds.Contains(p.AccountId))
            .Select(p => new { p.AccountId, p.LegalName, p.TradeName, p.Tin }).ToDictionaryAsync(p => p.AccountId, ct);
        var declarationCases = (await db.ValuationDecisions.AsNoTracking().Where(d => d.ImporterDeclarationId != null && declarationIds.Contains(d.ImporterDeclarationId.Value))
            .Select(d => new { d.Id, DeclarationId = d.ImporterDeclarationId!.Value, d.RecordedAt }).ToListAsync(ct))
            .GroupBy(d => d.DeclarationId).ToDictionary(g => g.Key, g => g.OrderByDescending(d => d.RecordedAt).First().Id);
        // Importer events store tariff lines as ids; resolve them, and the declarations' own lines, to readable codes.
        var tariffLineIds = records.Where(r => r.Module == ImporterDeclarationsModule).SelectMany(r => TariffLineIds(r.PreviousValueJson).Concat(TariffLineIds(r.NewValueJson)))
            .Concat(declarations.Values.SelectMany(d => new[] { d.SuggestedTariffLineId, d.ConfirmedTariffLineId }).OfType<Guid>()).Distinct().ToArray();
        var tariffLines = await db.NationalTariffLines.AsNoTracking().Where(t => tariffLineIds.Contains(t.Id))
            .Select(t => new { t.Id, t.TariffItemNo, t.Code, t.DescriptionEn }).ToListAsync(ct);
        var subjectAccountIds = records.Where(r => r.SubjectUserId.HasValue).Select(r => r.SubjectUserId!.Value).Distinct().ToArray();
        var subjectAccounts = await db.AuthAccounts.AsNoTracking().Where(a => subjectAccountIds.Contains(a.Id)).Select(a => new { a.Id, a.FullName, a.Username, a.Role, a.Email }).ToDictionaryAsync(a => a.Id, ct);
        var verificationProfileIds = records.Where(r => r.Module == "ImporterVerification").Select(r => r.RecordId).Distinct().ToArray();
        var verificationProfiles = await db.ImporterProfiles.AsNoTracking().Where(p => verificationProfileIds.Contains(p.Id))
            .Select(p => new { p.Id, p.AccountId, p.LegalName, p.TradeName, p.Tin, p.ImporterType, p.VerificationStatus }).ToDictionaryAsync(p => p.Id, ct);
        return Ok(new { total, availableTotal, page, pageSize, items = records.Select(record =>
        {
            var resolvedLocationId = record.LocationId ?? (phase2Locations.TryGetValue(record.RecordId, out var phase2LocationId) ? phase2LocationId : null);
            var location = resolvedLocationId is Guid locationId ? locations.FirstOrDefault(l => l.Id == locationId) : null;
            var region = location?.LocationType == "REGION" ? location : location?.ParentLocationId is Guid parent ? locations.FirstOrDefault(l => l.Id == parent) : null;
            var supervisor = location is null ? null : supervisors.FirstOrDefault(u => u.PrimaryLocationId == location.Id || u.PrimaryLocationId == region?.Id);
            valuationSnapshots.TryGetValue(record.Id, out var valuationSnapshot);
            var newValueJson = record.NewValueJson;
            // Historical values must come from the event, never from today's assessment.
            var declarationId = DeclarationFor(record);
            var declaration = declarationId is Guid knownDeclaration && declarations.TryGetValue(knownDeclaration, out var foundDeclaration) ? foundDeclaration : null;
            var importer = declaration is not null && importers.TryGetValue(declaration.ImporterId, out var foundImporter) ? foundImporter : null;
            var caseReference = DecisionFor(record)
                ?? (record.Module == ImporterDeclarationsModule ? declarationCases.TryGetValue(record.RecordId, out var linkedDecision) ? linkedDecision : record.RecordId : null);
            return new
            {
                record.Id, record.UserId, record.Username, record.OccurredAt, record.Action, record.Module, record.RecordId, record.LocationId, caseReference,
                record.PreviousValueJson, NewValueJson = newValueJson, record.Decision, record.Justification, record.IpDeviceInformation,
                regionName = region?.DisplayName ?? region?.Name,
                branchName = location?.LocationType == "BRANCH" ? location.DisplayName ?? location.Name : null,
                supervisorName = supervisor?.FullName ?? supervisor?.Username,
                source = !string.IsNullOrEmpty(record.Source) ? record.Source : declarationId.HasValue ? "IMPORTER_PORTAL" : record.Module is "Valuation" or "Valuations" or "EthiopianImportTaxAssessment" ? "VALUATION_SEARCH" : null,
                record.Category, record.ActorRole,
                subject = record.SubjectUserId is Guid subjectId && subjectAccounts.TryGetValue(subjectId, out var subjectAccount)
                    ? new { subjectAccount.Id, name = subjectAccount.FullName, subjectAccount.Username, subjectAccount.Email, role = AccessRules.NormalizeRole(subjectAccount.Role) ?? subjectAccount.Role } : null,
                importerProfile = verificationProfiles.TryGetValue(record.RecordId, out var profileForEvent)
                    ? new { profileForEvent.Id, profileForEvent.AccountId, profileForEvent.LegalName, profileForEvent.TradeName, profileForEvent.Tin, profileForEvent.ImporterType, currentStatus = profileForEvent.VerificationStatus } : null,
                importerDeclaration = declaration is null ? null : new
                {
                    declaration.Id, declaration.Reference, currentStatus = declaration.Status, declaration.ProductName, declaration.Brand, declaration.Model, declaration.Quantity, declaration.Unit,
                    declaration.OriginCountryCode, declaration.OriginCountryName, declaration.ImportPurpose, declaration.InvoiceAmount, declaration.InvoiceCurrency,
                    declaration.FreightAmount, declaration.InsuranceAmount, declaration.SuggestedTariffLineId, declaration.ConfirmedTariffLineId, declaration.SubmittedAt,
                    importerName = importer is null ? null : string.IsNullOrWhiteSpace(importer.TradeName) || importer.TradeName == importer.LegalName ? importer.LegalName : importer.LegalName + " (" + importer.TradeName + ")",
                    importerTin = importer?.Tin,
                    valuationDecisionId = declarationCases.TryGetValue(declaration.Id, out var declarationCase) ? declarationCase : (Guid?)null
                },
                valuation = valuationSnapshot is null ? null : new
                {
                    valuationSnapshot.ValuationDecisionId,
                    valuationSnapshot.ValuationPhase2Id,
                    valuationSnapshot.ProductId,
                    valuationSnapshot.ProductName,
                    valuationSnapshot.HsCode,
                    valuationSnapshot.HsDescription,
                    valuationSnapshot.PurchaseCountryCode,
                    valuationSnapshot.PurchaseCountryName,
                    valuationSnapshot.OriginCountry,
                    valuationSnapshot.SelectedPriceAmount,
                    valuationSnapshot.SelectedPriceCurrency,
                    valuationSnapshot.SelectedPriceSource,
                    valuationSnapshot.ValuationMethod,
                    valuationSnapshot.TotalTaxDue,
                    valuationSnapshot.CustomsDutyAmount,
                    valuationSnapshot.ExciseAdValoremAmount,
                    valuationSnapshot.ExciseSpecificAmount,
                    valuationSnapshot.ExciseTotalAmount,
                    valuationSnapshot.VatAmount,
                    valuationSnapshot.SurtaxAmount,
                    valuationSnapshot.OtherTaxAmount,
                    valuationSnapshot.TaxCurrency,
                    taxBreakdown = JsonSerializer.Deserialize<JsonElement>(valuationSnapshot.TaxBreakdownJson),
                    valuationSnapshot.OfficerAccountId,
                    valuationSnapshot.OfficerName,
                    valuationSnapshot.OfficerLocationId,
                    valuationSnapshot.OfficerLocationName,
                    valuationSnapshot.ProductPhotoUrl,
                    receiptAvailable = valuationSnapshot.ReceiptValuationDecisionId.HasValue,
                    valuationSnapshot.ReceiptFileName,
                    valuationSnapshot.ReceiptContentType,
                    decisionDetails = JsonSerializer.Deserialize<JsonElement>(valuationSnapshot.DecisionDetailsJson)
                }
            };
        }).ToArray(), tariffLines = tariffLines.ToDictionary(t => t.Id.ToString(), t => new { code = string.IsNullOrWhiteSpace(t.TariffItemNo) ? t.Code : t.TariffItemNo, description = t.DescriptionEn }) });
    }

    /// <summary>
    /// Which audit events the signed-in staff member may see. System administrators: everything. Customs administrators: every event in
    /// their region (officers' case work, importer verifications, personnel and branch changes). Customs officers: their own actions plus
    /// the full history of every case and importer they handled. Importers read their own activity from /api/importer-activity.
    /// </summary>
    private async Task<IQueryable<AuditLog>> ScopedAudit(string subject, CancellationToken ct)
    {
        var all = db.AuditLogs.AsNoTracking();
        if (access.IsSystem) return all;
        if (access.Role == AccessRules.CustomsAdmin)
        {
            var region = (await access.Locations(ct)).ToList();
            return all.Where(a => a.UserId == subject || (a.RegionLocationId.HasValue && region.Contains(a.RegionLocationId.Value)) || (a.LocationId.HasValue && region.Contains(a.LocationId.Value)));
        }
        if (access.Role != AccessRules.Officer) throw new WorkspaceException(403, "Your role cannot read the audit trail.");
        var touched = db.AuditLogs.Where(a => a.UserId == subject && a.Category != AuditTaxonomy.Security).Select(a => a.RecordId);
        var cases = db.ValuationDecisions.Where(d => touched.Contains(d.Id) || (d.ImporterDeclarationId != null && touched.Contains(d.ImporterDeclarationId.Value)));
        var caseIds = cases.Select(d => d.Id);
        var declarationIds = cases.Where(d => d.ImporterDeclarationId != null).Select(d => d.ImporterDeclarationId!.Value);
        var assessmentIds = db.ValuationPhase2s.Where(p => caseIds.Contains(p.ValuationDecisionId)).Select(p => p.Id);
        return all.Where(a => a.UserId == subject
            || (a.Category != AuditTaxonomy.Security && (touched.Contains(a.RecordId) || caseIds.Contains(a.RecordId) || declarationIds.Contains(a.RecordId) || assessmentIds.Contains(a.RecordId))));
    }

    private const string ImporterDeclarationsModule = "ImporterDeclarations";

    private static IEnumerable<Guid> TariffLineIds(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            var root = JsonSerializer.Deserialize<JsonElement>(json);
            if (root.ValueKind != JsonValueKind.Object) return [];
            return new[] { "SuggestedTariffLineId", "ConfirmedTariffLineId" }
                .Select(name => root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String && value.TryGetGuid(out var id) ? id : (Guid?)null)
                .OfType<Guid>().ToArray();
        }
        catch (JsonException) { return []; }
    }

    private static string? ProductName(string? evidenceNotes)
    {
        if (string.IsNullOrWhiteSpace(evidenceNotes)) return null;
        try
        {
            using var document = JsonDocument.Parse(evidenceNotes);
            return document.RootElement.TryGetProperty("product", out var product) ? product.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? EvidenceValue(string? evidenceNotes, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(evidenceNotes)) return null;
        try
        {
            using var document = JsonDocument.Parse(evidenceNotes);
            if (!document.RootElement.TryGetProperty(propertyName, out var value) || value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return null;
            return value.ValueKind == JsonValueKind.String ? value.GetString() : value.GetRawText();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task<DeclaredPriceConversion> ConvertDeclaredPrice(decimal amount, string from, string to, CancellationToken ct)
    {
        var date = DateOnly.FromDateTime(DateTime.UtcNow);
        if (from == to) return new(amount, 1m, "Same currency", date);
        var rates = await fx.RatesAsync(date, ct);
        rates.TryGetValue(from, out var sourceEtb);
        rates.TryGetValue(to, out var targetEtb);
        Validate(sourceEtb > 0 && targetEtb > 0, $"An approved {from} to {to} exchange rate is unavailable.");
        var rate = sourceEtb / targetEtb;
        return new(Math.Round(amount * rate, 2, MidpointRounding.AwayFromZero), Math.Round(rate, 12), "NBE reference rate (Frankfurter primary; configured fallback)", date);
    }

    private static string? NormalizeCurrency(string? value)
    {
        var currency = value?.Trim().ToUpperInvariant() ?? "";
        return currency.Length == 3 && currency.All(char.IsLetter) ? currency : null;
    }

    private static string? CountryName(string? value)
    {
        var code = value?.Trim().ToUpperInvariant() ?? "";
        if (!Regex.IsMatch(code, "^[A-Z]{2}$")) return null;
        if (code == "XK") return "Kosovo";
        try { return new RegionInfo(code).EnglishName; }
        catch (ArgumentException) { return null; }
    }

    private static bool IsValidReceiptSignature(byte[] data, string contentType) => contentType.ToLowerInvariant() switch
    {
        "application/pdf" => data.Length >= 5 && data[0] == '%' && data[1] == 'P' && data[2] == 'D' && data[3] == 'F' && data[4] == '-',
        "image/jpeg" => data.Length >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff,
        "image/png" => data.Length >= 8 && data.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a }),
        _ => false
    };

    private sealed record DeclaredPriceConversion(decimal Amount, decimal Rate, string Source, DateOnly Date);
    private sealed record ReceiptEvidence(decimal OriginalAmount, string OriginalCurrency, decimal ConvertedAmount, string ConvertedCurrency,
        decimal ExchangeRate, string ExchangeRateSource, DateOnly ExchangeRateDate, string FileName, string ContentType,
        long FileSize, string Sha256, DateTimeOffset UploadedAt, string UploadedBy, byte[] Data);
}
