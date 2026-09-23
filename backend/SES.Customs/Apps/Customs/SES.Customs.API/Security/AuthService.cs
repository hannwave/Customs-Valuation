using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Security;

public sealed record AuthUser(Guid Id, string Username, string Email, string FullName, string Role, bool Active, string Status, Guid? PrimaryLocationId, string PasswordHash);
public sealed record RegistrationRequest(Guid Id, string FullName, string StaffId, string Email, string? Phone, string Department, string Role, Guid? LocationId, string Status, DateTimeOffset SubmittedAt);

public sealed class AuthService(CustomsDbContext db)
{
    private const string DemoOfficerUsername = "officer";
    private const string DemoOfficerEmail = "officer@customs.gov.et";
    public static readonly Guid DefaultLocationId = new("10000000-0000-0000-0000-000000000001");
    public static readonly Guid OfficerId = new("20000000-0000-0000-0000-000000000001");
    public static readonly Guid AdminId = new("30000000-0000-0000-0000-000000000001");
    public static readonly Guid SysadminId = new("40000000-0000-0000-0000-000000000001");

    public async Task EnsureSeededAsync(CancellationToken ct = default)
    {
        var location = await db.CustomsLocations.FirstOrDefaultAsync(l => l.Status == "ACTIVE" && (l.SupportsValuation || l.SupportsInspection), ct);
        if (location is null)
        {
            location = new CustomsLocation
            {
                Id = DefaultLocationId,
                OfficialCode = "ET-KAL-001",
                Name = "Kality Customs Station",
                DisplayName = "Addis Ababa Kality Customs Station",
                LocationType = "CUSTOMS_STATION",
                Region = "Addis Ababa",
                CityWoreda = "Akaki Kality",
                Status = "ACTIVE",
                SupportsValuation = true,
                SupportsInspection = true,
                SupportsImport = true,
                SupportsExport = true,
                EffectiveFrom = DateTimeOffset.UtcNow.AddDays(-365),
                CreatedBy = "system",
                CreatedAt = DateTimeOffset.UtcNow
            };
            db.CustomsLocations.Add(location);
            await db.SaveChangesAsync(ct);
        }

        if (!await db.AuthAccounts.AnyAsync(ct))
        {
            var officer = Seed(OfficerId, "officer", "officer@customs.gov.et", "Demo Customs Officer", "CustomsOfficer", "DemoPass1!");
            officer.PrimaryLocationId = location.Id;
            var admin = Seed(AdminId, "admin", "admin@customs.gov.et", "Demo Customs Administrator", "CustomsAdministrator", "DemoPass1!");
            admin.PrimaryLocationId = location.Id;
            var sysadmin = Seed(SysadminId, "sysadmin", "sysadmin@customs.gov.et", "Demo System Administrator", "SystemAdministrator", "DemoPass1!");

            db.AuthAccounts.AddRange(officer, admin, sysadmin);
            await db.SaveChangesAsync(ct);

            db.UserLocationScopes.AddRange(
                new UserLocationScope
                {
                    Id = Guid.NewGuid(),
                    UserId = officer.Id,
                    CustomsLocationId = location.Id,
                    IncludeChildLocations = true,
                    Responsibilities = "Valuation and assessment officer",
                    EffectiveFrom = DateTimeOffset.UtcNow.AddDays(-365),
                    CreatedBy = "system"
                },
                new UserLocationScope
                {
                    Id = Guid.NewGuid(),
                    UserId = admin.Id,
                    CustomsLocationId = location.Id,
                    IncludeChildLocations = true,
                    Responsibilities = "Customs Administrator",
                    EffectiveFrom = DateTimeOffset.UtcNow.AddDays(-365),
                    CreatedBy = "system"
                }
            );
            await db.SaveChangesAsync(ct);
        }
        else
        {
            var officers = await db.AuthAccounts.Where(u => u.Role == "CustomsOfficer" && u.PrimaryLocationId == null).ToListAsync(ct);
            foreach (var off in officers)
            {
                off.PrimaryLocationId = location.Id;
                if (!await db.UserLocationScopes.AnyAsync(s => s.UserId == off.Id && s.CustomsLocationId == location.Id, ct))
                {
                    db.UserLocationScopes.Add(new UserLocationScope
                    {
                        Id = Guid.NewGuid(),
                        UserId = off.Id,
                        CustomsLocationId = location.Id,
                        IncludeChildLocations = true,
                        Responsibilities = "Valuation and assessment officer",
                        EffectiveFrom = DateTimeOffset.UtcNow.AddDays(-365),
                        CreatedBy = "system"
                    });
                }
            }
            if (officers.Count > 0)
            {
                await db.SaveChangesAsync(ct);
            }

            // Keep the demo officer permanently usable even when the account was
            // created before office scopes were introduced or was later marked
            // pending/inactive in the local demo database.
            var demoOfficer = await db.AuthAccounts.FirstOrDefaultAsync(u => u.Username == DemoOfficerUsername || u.Email == DemoOfficerEmail, ct);
            if (demoOfficer is null)
            {
                demoOfficer = Seed(OfficerId, DemoOfficerUsername, DemoOfficerEmail, "Demo Customs Officer", AccessRules.Officer, "DemoPass1!");
                db.AuthAccounts.Add(demoOfficer);
            }
            demoOfficer.Role = AccessRules.Officer;
            demoOfficer.Active = true;
            demoOfficer.Status = "ACTIVE";
            demoOfficer.PrimaryLocationId = location.Id;
            demoOfficer.UpdatedAt = DateTimeOffset.UtcNow;
            var demoScope = await db.UserLocationScopes.FirstOrDefaultAsync(s => s.UserId == demoOfficer.Id && s.CustomsLocationId == location.Id, ct);
            if (demoScope is null)
            {
                db.UserLocationScopes.Add(new UserLocationScope
                {
                    Id = Guid.NewGuid(), UserId = demoOfficer.Id, CustomsLocationId = location.Id,
                    IncludeChildLocations = true, Responsibilities = "Valuation and assessment officer",
                    EffectiveFrom = DateTimeOffset.UtcNow.AddDays(-365), CreatedBy = "system"
                });
            }
            else
            {
                demoScope.EffectiveTo = null;
                demoScope.Responsibilities = "Valuation and assessment officer";
            }
            await db.SaveChangesAsync(ct);
        }

        if (!await db.HsCodes.AnyAsync(ct))
        {
            var revId = Guid.Parse("11111111-1111-4111-8111-111111111111");
            if (!await db.HsRevisions.AnyAsync(x => x.Id == revId, ct))
            {
                db.HsRevisions.Add(new HsRevision
                {
                    Id = revId,
                    Name = "HS 2022 · National Tariff Schedule",
                    Number = 2022,
                    EffectiveDate = new DateOnly(2022, 1, 1),
                    Status = "Active",
                    SourceReference = "Customs Commission of Ethiopia"
                });
            }

            var sampleLines = new[]
            {
                (Id: Guid.Parse("44444444-4444-4444-4444-444444444444"), Code: "851713", Item: "8517.1390", Desc: "Smartphones, for cellular networks or for other wireless networks (including Apple iPhone)", Duty: "15%"),
                (Id: Guid.Parse("55555555-5555-5555-5555-555555555555"), Code: "240210", Item: "2402.1000", Desc: "Cigars, cheroots and cigarillos, containing tobacco", Duty: "35%"),
                (Id: Guid.Parse("66666666-6666-6666-6666-666666666666"), Code: "240220", Item: "2402.2000", Desc: "Cigarettes containing tobacco", Duty: "35%"),
                (Id: Guid.Parse("77777777-7777-7777-7777-777777777777"), Code: "847130", Item: "8471.3000", Desc: "Portable automatic data processing machines, weighing not more than 10 kg (laptops/notebooks)", Duty: "10%"),
                (Id: Guid.Parse("88888888-8888-8888-8888-888888888888"), Code: "870323", Item: "8703.2390", Desc: "Motor cars and vehicles designed for transport of persons (1500 cc to 3000 cc)", Duty: "35%"),
                (Id: Guid.Parse("22222222-2222-4222-8222-222222222222"), Code: "850440", Item: "8504.4000", Desc: "Static converters (e.g. electrical inverters and chargers)", Duty: "15%"),
                (Id: Guid.Parse("33333333-3333-4333-8333-333333333333"), Code: "090111", Item: "0901.1100", Desc: "Coffee, not roasted, not decaffeinated", Duty: "Free")
            };

            foreach (var item in sampleLines)
            {
                db.HsCodes.Add(new HsCode
                {
                    Id = item.Id,
                    RevisionId = revId,
                    Code = item.Code,
                    DescriptionEn = item.Desc,
                    HeadingNumber = item.Code.Length >= 4 ? item.Code[..4] : item.Code
                });

                db.NationalTariffLines.Add(new NationalTariffLine
                {
                    Id = Guid.NewGuid(),
                    HsCodeId = item.Id,
                    Code = item.Code,
                    TariffItemNo = item.Item,
                    DescriptionEn = item.Desc,
                    Duty = item.Duty,
                    EffectiveDate = new DateOnly(2022, 1, 1),
                    SourceReference = "Ethiopian Tariff 2022"
                });
            }

            await db.SaveChangesAsync(ct);
        }
    }

    public async Task<AuthUser?> FindAsync(string identity, CancellationToken ct = default)
    {
        await EnsureSeededAsync(ct);
        var entity = await db.AuthAccounts.FirstOrDefaultAsync(u => u.Username == identity || u.Email == identity, ct);
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
        var requestedRole = SES.Customs.Core.Models.AccessRules.NormalizeRole(request.Role) ?? throw new InvalidOperationException("The requested role is invalid.");
        var location = request.LocationId.HasValue
            ? await db.CustomsLocations.FirstOrDefaultAsync(l => l.Id == request.LocationId.Value && l.Status == "ACTIVE" && l.EffectiveFrom <= DateTimeOffset.UtcNow && (l.EffectiveTo == null || l.EffectiveTo > DateTimeOffset.UtcNow), ct)
            : await db.CustomsLocations.FirstOrDefaultAsync(l => l.Status == "ACTIVE" && (l.SupportsValuation || l.SupportsInspection), ct);
        if (requestedRole == SES.Customs.Core.Models.AccessRules.Officer && location is not null && !location.SupportsValuation && !location.SupportsInspection)
            throw new InvalidOperationException("Choose an active valuation or inspection office for the officer.");
        if (requestedRole == SES.Customs.Core.Models.AccessRules.CustomsAdmin && location is not null && !string.Equals(location.LocationType, "BRANCH", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Choose an active customs branch for the administrator.");
        location ??= await db.CustomsLocations.FirstOrDefaultAsync(l => l.Status == "ACTIVE" && (l.SupportsValuation || l.SupportsInspection), ct);
        if (location is null) throw new InvalidOperationException("No active valuation office is configured.");
        var baseUsername = string.IsNullOrWhiteSpace(request.Username) ? request.Email.Split('@')[0].Replace(".", "", StringComparison.Ordinal).ToLowerInvariant() : request.Username.Trim();
        var username = baseUsername; var suffix = 2;
        while (await db.AuthAccounts.AnyAsync(u => u.Username == username, ct)) username = $"{baseUsername}{suffix++}";
        if (await db.AuthAccounts.AnyAsync(u => u.Email == request.Email, ct)) throw new InvalidOperationException("The requested email is already in use.");
        var now = DateTimeOffset.UtcNow;
        var user = new AuthAccountEntity { Id = Guid.NewGuid(), Username = username, Email = request.Email, FullName = request.FullName, EmployeeNumber = request.StaffId, Phone = request.Phone ?? "", Role = requestedRole, Active = true, Status = "ACTIVE", PrimaryLocationId = location.Id, RegionKey = location.Region, RegionJoinedAt = now, PasswordHash = request.PasswordHash, CreatedAt = now };
        db.AuthAccounts.Add(user);
        db.UserLocationScopes.Add(new UserLocationScope { Id = Guid.NewGuid(), UserId = user.Id, CustomsLocationId = location.Id, IncludeChildLocations = true, Responsibilities = requestedRole == SES.Customs.Core.Models.AccessRules.Officer ? "Valuation and assessment officer" : "Customs Administrator", EffectiveFrom = now, CreatedBy = "approval" });
        request.Status = "Approved"; request.ReviewedAt = now;
        await db.SaveChangesAsync(ct); return Map(user);
    }
    public async Task DenyAsync(Guid id, string reason, Guid reviewerId, CancellationToken ct = default)
    {
        var request = await db.RegistrationRequests.FirstOrDefaultAsync(r => r.Id == id && r.Status == "Pending", ct) ?? throw new KeyNotFoundException("Registration request not found.");
        request.Status = "Denied"; request.ReviewedAt = DateTimeOffset.UtcNow; request.ReviewedBy = reviewerId.ToString(); request.ReviewReason = reason;
        await db.SaveChangesAsync(ct);
    }
    private static AuthAccountEntity Seed(Guid id, string username, string email, string fullName, string role, string password) => new() { Id = id, Username = username, Email = email, FullName = fullName, Role = role, Active = true, Status = "ACTIVE", PasswordHash = Hash(password), CreatedAt = DateTimeOffset.UtcNow };
    private static AuthUser Map(AuthAccountEntity u) => new(u.Id, u.Username, u.Email, u.FullName, SES.Customs.Core.Models.AccessRules.NormalizeRole(u.Role) ?? u.Role, u.Active, u.Status, u.PrimaryLocationId, u.PasswordHash);
    private static RegistrationRequest Map(RegistrationRequestEntity r) => new(r.Id, r.FullName, r.StaffId, r.Email, r.Phone, r.Department, r.Role, r.LocationId, r.Status, r.SubmittedAt);
    public static string Hash(string password) { var salt = RandomNumberGenerator.GetBytes(16); var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 120_000, HashAlgorithmName.SHA256, 32); return $"pbkdf2.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}"; }
}
