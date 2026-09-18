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
        if (IsSystem) return (await db.CustomsLocations.AsNoTracking().Select(l => l.Id).ToListAsync(ct)).ToHashSet();
        var locationId = await db.AuthAccounts.AsNoTracking().Where(u => u.Id == UserId).Select(u => u.PrimaryLocationId).SingleOrDefaultAsync(ct);
        return locationId.HasValue ? [locationId.Value] : [];
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
        if (!IsSystem) throw new WorkspaceException(403, "Only System Administrators can manage employee accounts.");
        var now = DateTimeOffset.UtcNow;
        var targetLocation = target.PrimaryLocationId;
        var ownLocation = await db.AuthAccounts.AsNoTracking().Where(u => u.Id == UserId).Select(u => u.PrimaryLocationId).SingleOrDefaultAsync(ct);
        if (AccessRules.NormalizeRole(target.Role) == AccessRules.SystemAdmin || !targetLocation.HasValue || targetLocation != ownLocation)
            throw new WorkspaceException(403, "This employee is outside your permitted account-management area.");
    }
    public void Audit(string action, string module, Guid id, object? before, object? after, string reason, Guid? location = null)
    {
        db.AuditLogs.Add(new AuditLog {
            Id = Guid.NewGuid(), UserId = UserId.ToString(), Username = http.HttpContext?.User.Identity?.Name ?? "",
            Action = action, Module = module, RecordId = id, LocationId = location, OccurredAt = DateTimeOffset.UtcNow,
            PreviousValueJson = before == null ? null : JsonSerializer.Serialize(before), NewValueJson = after == null ? null : JsonSerializer.Serialize(after),
            Justification = reason, IpDeviceInformation = $"{http.HttpContext?.Connection.RemoteIpAddress} | {http.HttpContext?.Request.Headers.UserAgent}"
        });
    }
    public static object PublicUser(AuthAccountEntity u) => new { u.Id, u.Username, u.Email, u.FullName, role = AccessRules.NormalizeRole(u.Role), roleCode = AccessRules.Code(u.Role), u.Active, u.Status, u.PrimaryLocationId, u.EmployeeNumber, u.Phone, u.CreatedAt, u.UpdatedAt, u.LastLoginAt };
    public static object PublicEmployee(AuthAccountEntity u) => new { u.Id, u.Email, u.FullName, role = AccessRules.NormalizeRole(u.Role), roleCode = AccessRules.Code(u.Role), u.Active, u.Status, u.PrimaryLocationId, u.EmployeeNumber, u.Phone, u.CreatedAt, u.UpdatedAt, u.LastLoginAt };
}
