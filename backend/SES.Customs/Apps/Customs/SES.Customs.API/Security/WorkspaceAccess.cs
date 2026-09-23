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
        var all = await db.CustomsLocations.AsNoTracking().ToListAsync(ct);
        if (IsSystem) return all.Select(l => l.Id).ToHashSet();
        var actor = await db.AuthAccounts.AsNoTracking().SingleAsync(u => u.Id == UserId, ct);
        var region = await ActorRegion(ct);
        if (Role == AccessRules.CustomsAdmin && region != null)
            return all.Where(location => string.Equals(ResolveRegion(location, all), region, StringComparison.OrdinalIgnoreCase)).Select(location => location.Id).ToHashSet();
        return actor.PrimaryLocationId.HasValue ? [actor.PrimaryLocationId.Value] : [];
    }
    public async Task RequireLocation(Guid id, bool operational, CancellationToken ct)
    {
        if (!(await Locations(ct)).Contains(id)) throw new WorkspaceException(403, "This location is outside your assigned location.");
        if (operational)
        {
            var location = await db.CustomsLocations.FindAsync([id], ct);
            Validate(location != null && location.Status == "ACTIVE" && location.EffectiveFrom <= DateTimeOffset.UtcNow && (location.EffectiveTo == null || location.EffectiveTo > DateTimeOffset.UtcNow), "Choose an active, effective office.");
        }
    }
    public async Task RequireEmployee(AuthAccountEntity target, CancellationToken ct)
    {
        if (IsSystem) return;
        if (Role != AccessRules.CustomsAdmin || AccessRules.NormalizeRole(target.Role) != AccessRules.Officer)
            throw new WorkspaceException(403, "Customs Administrators may manage Customs Officers only.");
        var scope = await Locations(ct);
        if (!target.PrimaryLocationId.HasValue || !scope.Contains(target.PrimaryLocationId.Value))
            throw new WorkspaceException(403, "This employee is outside your permitted region.");
        var ownRegion = await ActorRegion(ct);
        var targetRegion = !string.IsNullOrWhiteSpace(target.RegionKey) ? target.RegionKey.Trim().ToUpperInvariant() : await RegionKey(target.PrimaryLocationId.Value, ct);
        if (ownRegion != null && !string.Equals(ownRegion, targetRegion, StringComparison.OrdinalIgnoreCase))
            throw new WorkspaceException(403, "This employee belongs to another region.");
    }
    public async Task<string?> ActorRegion(CancellationToken ct)
    {
        if (IsSystem) return null;
        var actor = await db.AuthAccounts.AsNoTracking().SingleAsync(u => u.Id == UserId, ct);
        if (!string.IsNullOrWhiteSpace(actor.RegionKey)) return actor.RegionKey.Trim().ToUpperInvariant();
        return actor.PrimaryLocationId is Guid primary ? await RegionKey(primary, ct) : null;
    }
    public async Task<string> RegionKey(Guid locationId, CancellationToken ct)
    {
        var all = await db.CustomsLocations.AsNoTracking().ToListAsync(ct);
        var location = all.FirstOrDefault(item => item.Id == locationId) ?? throw new WorkspaceException(400, "Location not found.");
        return ResolveRegion(location, all);
    }
    private static string ResolveRegion(CustomsLocation location, IReadOnlyCollection<CustomsLocation> all)
    {
        var current = location;
        var visited = new HashSet<Guid>();
        while (visited.Add(current.Id))
        {
            if (!string.IsNullOrWhiteSpace(current.Region)) return current.Region.Trim().ToUpperInvariant();
            if (current.ParentLocationId is not Guid parent) return current.OfficialCode.Trim().ToUpperInvariant();
            current = all.FirstOrDefault(item => item.Id == parent) ?? current;
        }
        return location.OfficialCode.Trim().ToUpperInvariant();
    }
    public void Audit(string action, string module, Guid id, object? before, object? after, string reason, Guid? location = null)
    {
        db.AuditLogs.Add(new AuditLog {
            Id = Guid.NewGuid(), UserId = UserId.ToString(), Username = http.HttpContext?.User.Identity?.Name ?? "",
            Action = action, Module = module, RecordId = id, LocationId = location, SubjectUserId = module == "Users" ? id : null, OccurredAt = DateTimeOffset.UtcNow,
            PreviousValueJson = before == null ? null : JsonSerializer.Serialize(before), NewValueJson = after == null ? null : JsonSerializer.Serialize(after),
            Justification = reason, IpDeviceInformation = $"{http.HttpContext?.Connection.RemoteIpAddress} | {http.HttpContext?.Request.Headers.UserAgent}"
        });
    }
    public static object PublicUser(AuthAccountEntity u) => new { u.Id, u.Username, u.Email, u.FullName, role = AccessRules.NormalizeRole(u.Role), roleCode = AccessRules.Code(u.Role), u.Active, u.Status, u.PrimaryLocationId, u.RegionKey, u.RegionJoinedAt, u.ArchivedAt, u.ArchivedBy, u.ArchiveReason, u.Version, u.EmployeeNumber, u.Phone, u.Responsibilities, u.CreatedAt, u.UpdatedAt, u.LastLoginAt };
    public static object PublicEmployee(AuthAccountEntity u) => new { u.Id, u.Username, u.Email, u.FullName, role = AccessRules.NormalizeRole(u.Role), roleCode = AccessRules.Code(u.Role), u.Active, u.Status, u.PrimaryLocationId, u.RegionKey, u.RegionJoinedAt, u.ArchivedAt, u.ArchivedBy, u.ArchiveReason, u.Version, u.EmployeeNumber, u.Phone, u.Responsibilities, u.CreatedAt, u.UpdatedAt, u.LastLoginAt };
    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);
    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);
}
