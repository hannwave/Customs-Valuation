using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Security;

public sealed class WorkspaceException(int status, string message) : Exception(message) { public int Status { get; } = status; }
public sealed class WorkspaceExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        var status = context.Exception is WorkspaceException w ? w.Status : context.Exception is DbUpdateException ? 409 : 0;
        if (status == 0) return;
        context.Result = new ObjectResult(new { message = context.Exception is WorkspaceException ? context.Exception.Message : "This record changed or conflicts with an existing record. Refresh and try again." }) { StatusCode = status };
        context.ExceptionHandled = true;
    }
}

public sealed class WorkspaceAccess(CustomsDbContext db, IHttpContextAccessor http)
{
    public Guid UserId => Guid.TryParse(http.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.HttpContext?.User.FindFirstValue("sub"), out var id) ? id : throw new WorkspaceException(401, "Sign in to continue.");
    public string Role => AccessRules.NormalizeRole(http.HttpContext?.User.FindFirstValue(ClaimTypes.Role)) ?? "";
    public bool IsSystem => Role == AccessRules.SystemAdmin;
    public void Require(params string[] roles) { if (!roles.Contains(Role)) throw new WorkspaceException(403, "Your role cannot perform this operation."); }
    public static void Validate(bool valid, string message) { if (!valid) throw new WorkspaceException(400, message); }

    public async Task<HashSet<Guid>> Locations(CancellationToken ct)
    {
        var all = await db.CustomsLocations.AsNoTracking().Select(l => new { l.Id, l.ParentLocationId }).ToListAsync(ct);
        if (IsSystem) return all.Select(x => x.Id).ToHashSet();
        var now = DateTimeOffset.UtcNow;
        var grants = await db.UserLocationScopes.AsNoTracking().Where(s => s.UserId == UserId && s.EffectiveFrom <= now && (s.EffectiveTo == null || s.EffectiveTo > now)).ToListAsync(ct);
        return AccessRules.Expand(all.Select(l => (l.Id, l.ParentLocationId)), grants.Select(s => (s.CustomsLocationId, Role == AccessRules.CustomsAdmin && s.IncludeChildLocations)));
    }
    public async Task RequireLocation(Guid id, bool operational, CancellationToken ct)
    {
        if (!(await Locations(ct)).Contains(id)) throw new WorkspaceException(403, "This location is outside your assigned scope.");
        if (operational)
        {
            var location = await db.CustomsLocations.FindAsync([id], ct);
            Validate(location != null && location.Status == "ACTIVE" && location.EffectiveFrom <= DateTimeOffset.UtcNow && (location.EffectiveTo == null || location.EffectiveTo > DateTimeOffset.UtcNow), "Choose an active, effective office.");
        }
    }
    public async Task RequireEmployee(AuthAccountEntity target, CancellationToken ct)
    {
        if (IsSystem) return;
        var now = DateTimeOffset.UtcNow;
        var assignments = await db.UserLocationScopes.Where(s => s.UserId == target.Id && s.EffectiveFrom <= now && (s.EffectiveTo == null || s.EffectiveTo > now)).Select(s => s.CustomsLocationId).ToListAsync(ct);
        if (!AccessRules.CanManageOfficer(Role, await Locations(ct), target.Role, assignments))
            throw new WorkspaceException(403, "You can manage only officers whose assignments are entirely within your scope.");
        var ownRegion = await ActorRegion(ct);
        var targetRegion = target.PrimaryLocationId is Guid targetOffice ? await RegionKey(targetOffice, ct) : target.RegionKey;
        if (ownRegion != null && ownRegion != targetRegion)
            throw new WorkspaceException(403, "This officer belongs to another region.");
    }
    public async Task<string?> ActorRegion(CancellationToken ct)
    {
        if (IsSystem) return null;
        var actor = await db.AuthAccounts.AsNoTracking().SingleAsync(u => u.Id == UserId, ct);
        var now = DateTimeOffset.UtcNow;
        var offices = await db.UserLocationScopes.AsNoTracking().Where(s => s.UserId == UserId && s.EffectiveFrom <= now && (s.EffectiveTo == null || s.EffectiveTo > now))
            .Select(s => s.CustomsLocationId).Distinct().ToListAsync(ct);
        if (actor.PrimaryLocationId is Guid primary && offices.Count == 0) offices.Add(primary);
        var regions = new HashSet<string>();
        foreach (var office in offices) regions.Add(await RegionKey(office, ct));
        if (regions.Count > 1) throw new WorkspaceException(403, "Administrator scopes cross regions. Ask a System Administrator to correct the assignments.");
        return regions.SingleOrDefault();
    }
    public async Task<string> RegionKey(Guid locationId, CancellationToken ct)
    {
        var all = await db.CustomsLocations.AsNoTracking().Select(l => new { l.Id, l.ParentLocationId, l.OfficialCode, l.Region }).ToListAsync(ct);
        var current = all.FirstOrDefault(l => l.Id == locationId) ?? throw new WorkspaceException(400, "Location not found.");
        var visited = new HashSet<Guid>();
        while (visited.Add(current.Id))
        {
            if (!string.IsNullOrWhiteSpace(current.Region))
            {
                var key = current.Region.Trim().ToUpperInvariant();
                Validate(key.Length <= 120, "Region names must be 120 characters or fewer.");
                return key;
            }
            if (current.ParentLocationId is not Guid parent) break;
            current = all.FirstOrDefault(l => l.Id == parent) ?? current;
        }
        return current.OfficialCode.Trim().ToUpperInvariant();
    }
    public void Audit(string action, string module, Guid id, object? before, object? after, string reason, Guid? location = null, Guid? subjectUserId = null)
    {
        db.AuditLogs.Add(new AuditLog {
            Id = Guid.NewGuid(), UserId = UserId.ToString(), Username = http.HttpContext?.User.Identity?.Name ?? "",
            Action = action, Module = module, RecordId = id, LocationId = location, SubjectUserId = subjectUserId ?? (module == "Users" ? id : null), OccurredAt = DateTimeOffset.UtcNow,
            PreviousValueJson = before == null ? null : JsonSerializer.Serialize(before), NewValueJson = after == null ? null : JsonSerializer.Serialize(after),
            Justification = reason, IpDeviceInformation = $"{http.HttpContext?.Connection.RemoteIpAddress} | {http.HttpContext?.Request.Headers.UserAgent}"
        });
    }
    public static object PublicUser(AuthAccountEntity u) => new { u.Id, u.Username, u.Email, u.FullName, role = AccessRules.NormalizeRole(u.Role), roleCode = AccessRules.Code(u.Role), u.Active, u.Status, u.PrimaryLocationId, u.RegionKey, u.RegionJoinedAt, u.ArchivedAt, u.ArchivedBy, u.ArchiveReason, u.Version, u.EmployeeNumber, u.Phone, u.CreatedAt, u.UpdatedAt, u.LastLoginAt };
}
