using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Security;

public sealed record AuthUser(Guid Id, string Username, string Email, string FullName, string Role, bool Active, string Status, Guid? PrimaryLocationId, string PasswordHash);
public sealed record RegistrationRequest(Guid Id, string FullName, string StaffId, string Email, string? Phone, string Department, string Role, string PasswordHash, string Status, DateTimeOffset SubmittedAt);

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
        await db.SaveChangesAsync(ct);
    }

    public static bool Verify(AuthUser user, string password)
    {
        var parts = user.PasswordHash.Split('.', 3);
        if (parts.Length != 3) return false;
        try { var salt = Convert.FromBase64String(parts[1]); var expected = Convert.FromBase64String(parts[2]); var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, 120_000, HashAlgorithmName.SHA256, expected.Length); return CryptographicOperations.FixedTimeEquals(actual, expected); }
        catch (FormatException) { return false; }
    }

    public async Task<RegistrationRequest> AddRegistrationAsync(string fullName, string staffId, string email, string? phone, string department, string role, string password, CancellationToken ct = default)
    {
        var request = new RegistrationRequestEntity { Id = Guid.NewGuid(), FullName = fullName, StaffId = staffId, Email = email, Phone = phone, Department = department, Role = SES.Customs.Core.Models.AccessRules.Officer, PasswordHash = Hash(password), Status = "Pending", SubmittedAt = DateTimeOffset.UtcNow };
        db.RegistrationRequests.Add(request); await db.SaveChangesAsync(ct); return Map(request);
    }

    public async Task<IReadOnlyCollection<RegistrationRequest>> PendingAsync(CancellationToken ct = default) => await db.RegistrationRequests.AsNoTracking().Where(r => r.Status == "Pending").OrderByDescending(r => r.SubmittedAt).Select(r => Map(r)).ToArrayAsync(ct);
    public async Task<IReadOnlyCollection<AuthUser>> UsersAsync(CancellationToken ct = default) { await EnsureSeededAsync(ct); return await db.AuthAccounts.AsNoTracking().OrderBy(u => u.FullName).Select(u => Map(u)).ToArrayAsync(ct); }

    public async Task<AuthUser> CreateAsync(string username, string email, string fullName, string role, string password, bool passwordIsHash = false, CancellationToken ct = default)
    {
        var normalizedRole = SES.Customs.Core.Models.AccessRules.NormalizeRole(role) ?? throw new InvalidOperationException("Invalid role.");
        var user = new AuthAccountEntity { Id = Guid.NewGuid(), Username = username, Email = email, FullName = fullName, Role = normalizedRole, Active = true, Status = "ACTIVE", PasswordHash = passwordIsHash ? password : Hash(password), CreatedAt = DateTimeOffset.UtcNow };
        db.AuthAccounts.Add(user); await db.SaveChangesAsync(ct); return Map(user);
    }

    public async Task<AuthUser> ApproveAsync(Guid id, CancellationToken ct = default)
    {
        var request = await db.RegistrationRequests.FirstOrDefaultAsync(r => r.Id == id && r.Status == "Pending", ct) ?? throw new KeyNotFoundException("Registration request not found.");
        var baseUsername = request.Email.Split('@')[0].Replace(".", "", StringComparison.Ordinal).ToLowerInvariant(); var username = baseUsername; var suffix = 2;
        while (await db.AuthAccounts.AnyAsync(u => u.Username == username, ct)) username = $"{baseUsername}{suffix++}";
        var user = new AuthAccountEntity { Id = Guid.NewGuid(), Username = username, Email = request.Email, FullName = request.FullName, EmployeeNumber = request.StaffId, Phone = request.Phone ?? "", Role = SES.Customs.Core.Models.AccessRules.Officer, Active = true, Status = "ACTIVE", PasswordHash = request.PasswordHash, CreatedAt = DateTimeOffset.UtcNow };
        db.AuthAccounts.Add(user); request.Status = "Approved"; await db.SaveChangesAsync(ct); return Map(user);
    }

    private static AuthAccountEntity Seed(string username, string email, string fullName, string role, string password) => new() { Id = Guid.NewGuid(), Username = username, Email = email, FullName = fullName, Role = role, Active = true, PasswordHash = Hash(password), CreatedAt = DateTimeOffset.UtcNow };
    private static AuthUser Map(AuthAccountEntity u) => new(u.Id, u.Username, u.Email, u.FullName, SES.Customs.Core.Models.AccessRules.NormalizeRole(u.Role) ?? u.Role, u.Active, u.Status, u.PrimaryLocationId, u.PasswordHash);
    private static RegistrationRequest Map(RegistrationRequestEntity r) => new(r.Id, r.FullName, r.StaffId, r.Email, r.Phone, r.Department, r.Role, r.PasswordHash, r.Status, r.SubmittedAt);
    public static string Hash(string password) { var salt = RandomNumberGenerator.GetBytes(16); var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 120_000, HashAlgorithmName.SHA256, 32); return $"pbkdf2.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}"; }
}
