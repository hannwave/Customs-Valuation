using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Security;

public sealed record AuthUser(Guid Id, string Username, string Email, string FullName, string Role, bool Active, string Status, Guid? PrimaryLocationId, string PasswordHash);
public sealed record RegistrationRequest(Guid Id, string FullName, string StaffId, string Email, string? Phone, string Department, string Role, Guid? LocationId, string Status, DateTimeOffset SubmittedAt);

public sealed class AuthService(CustomsDbContext db)
{
    public async Task EnsureSeededAsync(CancellationToken ct = default)
    {
        if (await db.AuthAccounts.AnyAsync(ct)) return;
        db.AuthAccounts.AddRange(
            Seed("officer", "officer@customs.gov.et", "Demo Customs Officer", "CustomsOfficer", "DemoPass1!"),
            Seed("admin", "admin@customs.gov.et", "Demo Customs Administrator", "CustomsAdministrator", "DemoPass1!"),
            Seed("sysadmin", "sysadmin@customs.gov.et", "Demo System Administrator", "SystemAdministrator", "DemoPass1!"));
        await db.SaveChangesAsync(ct);
    }

    public async Task<AuthUser?> FindAsync(string identity, CancellationToken ct = default)
    {
        await EnsureSeededAsync(ct);
        var entity = await db.AuthAccounts.FirstOrDefaultAsync(u => u.Active && (u.Username == identity || u.Email == identity), ct);
        return entity is null ? null : Map(entity);
    }

    public async Task RecordLoginAsync(Guid id, CancellationToken ct = default)
    {
        var user = await db.AuthAccounts.FindAsync([id], ct);
        if (user is null) return;
        user.LastLoginAt = DateTimeOffset.UtcNow;
        db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = id.ToString(), SubjectUserId = id, Username = user.Username, OccurredAt = user.LastLoginAt.Value, Action = "USER_SIGNED_IN", Module = "Users", RecordId = id, LocationId = user.PrimaryLocationId });
        await db.SaveChangesAsync(ct);
    }

    public static bool Verify(AuthUser user, string password)
    {
        return VerifyHash(user.PasswordHash, password);
    }

    public static bool VerifyHash(string passwordHash, string password)
    {
        var parts = passwordHash.Split('.', 3);
        if (parts.Length != 3) return false;
        try { var salt = Convert.FromBase64String(parts[1]); var expected = Convert.FromBase64String(parts[2]); var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, 120_000, HashAlgorithmName.SHA256, expected.Length); return CryptographicOperations.FixedTimeEquals(actual, expected); }
        catch (FormatException) { return false; }
    }

    public async Task<RegistrationRequest> AddRegistrationAsync(string username, string fullName, string staffId, string email, string? phone, string department, string role, Guid locationId, string password, CancellationToken ct = default)
    {
        var location = await db.CustomsLocations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == locationId && l.Status == "ACTIVE", ct) ?? throw new InvalidOperationException("Choose an active customs branch.");
        if (await db.AuthAccounts.AnyAsync(u => u.Username == username || u.Email == email, ct) || await db.RegistrationRequests.AnyAsync(r => r.Status == "Pending" && (r.Username == username || r.Email == email), ct)) throw new InvalidOperationException("That username or email is already in use or awaiting review.");
        var normalizedRole = SES.Customs.Core.Models.AccessRules.NormalizeRole(role) ?? throw new InvalidOperationException("Invalid requested role.");
        var request = new RegistrationRequestEntity { Id = Guid.NewGuid(), Username = username, FullName = fullName, StaffId = staffId, Email = email, Phone = phone, Department = department, Role = normalizedRole, LocationId = location.Id, PasswordHash = Hash(password), Status = "Pending", SubmittedAt = DateTimeOffset.UtcNow };
        db.RegistrationRequests.Add(request); await db.SaveChangesAsync(ct); return Map(request);
    }

    public async Task<IReadOnlyCollection<RegistrationRequest>> PendingAsync(CancellationToken ct = default)
    {
        var requests = await db.RegistrationRequests.AsNoTracking().Where(r => r.Status == "Pending").OrderByDescending(r => r.SubmittedAt).ToListAsync(ct);
        return requests.Select(Map).ToArray();
    }
    public async Task<IReadOnlyCollection<AuthUser>> UsersAsync(CancellationToken ct = default)
    {
        await EnsureSeededAsync(ct);
        var users = await db.AuthAccounts.AsNoTracking().OrderBy(u => u.FullName).ToListAsync(ct);
        return users.Select(Map).ToArray();
    }

    public async Task<AuthUser> CreateAsync(string username, string email, string fullName, string role, string password, bool passwordIsHash = false, CancellationToken ct = default)
    {
        var normalizedRole = SES.Customs.Core.Models.AccessRules.NormalizeRole(role) ?? throw new InvalidOperationException("Invalid role.");
        var user = new AuthAccountEntity { Id = Guid.NewGuid(), Username = username, Email = email, FullName = fullName, Role = normalizedRole, Active = true, Status = "ACTIVE", PasswordHash = passwordIsHash ? password : Hash(password), CreatedAt = DateTimeOffset.UtcNow };
        db.AuthAccounts.Add(user); await db.SaveChangesAsync(ct); return Map(user);
    }

    public async Task<AuthUser> ApproveAsync(Guid id, CancellationToken ct = default)
    {
        var request = await db.RegistrationRequests.FirstOrDefaultAsync(r => r.Id == id && r.Status == "Pending", ct) ?? throw new KeyNotFoundException("Registration request not found.");
        if (request.LocationId is null || !await db.CustomsLocations.AnyAsync(l => l.Id == request.LocationId && l.Status == "ACTIVE" && l.LocationType == "BRANCH", ct)) throw new InvalidOperationException("The requested branch is no longer active.");
        if (await db.AuthAccounts.AnyAsync(u => u.Username == request.Username || u.Email == request.Email, ct)) throw new InvalidOperationException("The requested username or email is already in use.");
        var user = new AuthAccountEntity { Id = Guid.NewGuid(), Username = request.Username, Email = request.Email, FullName = request.FullName, EmployeeNumber = request.StaffId, Phone = request.Phone ?? "", Role = request.Role, Active = true, Status = "ACTIVE", PrimaryLocationId = request.LocationId, PasswordHash = request.PasswordHash, CreatedAt = DateTimeOffset.UtcNow };
        db.AuthAccounts.Add(user); request.Status = "Approved"; request.ReviewedAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(ct); return Map(user);
    }
    public async Task DenyAsync(Guid id, string reason, Guid reviewerId, CancellationToken ct = default)
    {
        var request = await db.RegistrationRequests.FirstOrDefaultAsync(r => r.Id == id && r.Status == "Pending", ct) ?? throw new KeyNotFoundException("Registration request not found.");
        request.Status = "Denied"; request.ReviewedAt = DateTimeOffset.UtcNow; request.ReviewedBy = reviewerId.ToString(); request.ReviewReason = reason; await db.SaveChangesAsync(ct);
    }

    private static AuthAccountEntity Seed(string username, string email, string fullName, string role, string password) => new() { Id = Guid.NewGuid(), Username = username, Email = email, FullName = fullName, Role = role, Active = true, PasswordHash = Hash(password), CreatedAt = DateTimeOffset.UtcNow };
    private static AuthUser Map(AuthAccountEntity u) => new(u.Id, u.Username, u.Email, u.FullName, SES.Customs.Core.Models.AccessRules.NormalizeRole(u.Role) ?? u.Role, u.Active, u.Status, u.PrimaryLocationId, u.PasswordHash);
    private static RegistrationRequest Map(RegistrationRequestEntity r) => new(r.Id, r.FullName, r.StaffId, r.Email, r.Phone, r.Department, r.Role, r.LocationId, r.Status, r.SubmittedAt);
    public static string Hash(string password) { var salt = RandomNumberGenerator.GetBytes(16); var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 120_000, HashAlgorithmName.SHA256, 32); return $"pbkdf2.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}"; }
}
