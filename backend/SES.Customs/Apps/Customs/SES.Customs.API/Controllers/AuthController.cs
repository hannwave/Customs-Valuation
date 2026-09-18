using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SES.Customs.API.Security;

namespace SES.Customs.API.Controllers;

public sealed record LoginRequest(string Identity, string Password);
public sealed record RegistrationRequestDto(string Username, string FullName, string StaffId, string Email, string? Phone, string Department, string Role, Guid LocationId, string Password, string ConfirmPassword);
public sealed record AdministratorRegistrationRequestDto(string Username, string FullName, string StaffId, string Email, string? Phone, string Department, Guid RegionId, Guid BranchId, string Password, string ConfirmPassword);
public sealed record RegistrationReviewDto(string Reason);
public sealed record CreateUserRequest(string Username, string FullName, string Email, string Role, string Password);

[ApiController, Route("api/auth")]
public sealed class AuthController(AuthService auth, IConfiguration configuration, SES.Customs.Infrastructure.Context.CustomsDbContext db) : ControllerBase
{
    [AllowAnonymous, HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Identity) || string.IsNullOrWhiteSpace(request.Password)) return BadRequest(new { message = "Username/email and password are required." });
        var user = await auth.FindAsync(request.Identity, ct);
        if (user is null || !AuthService.Verify(user, request.Password)) return Unauthorized(new { message = "Invalid username or password." });
        await auth.RecordLoginAsync(user.Id, ct);
        return Ok(new { accessToken = Token(user), tokenType = "Bearer", expiresIn = 3600, user = new { user.Id, user.Username, user.Email, user.FullName, user.Role } });
    }

    [AllowAnonymous, HttpPost("register")]
    public async Task<IActionResult> Register(RegistrationRequestDto request, CancellationToken ct)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.Username ?? "", "^[a-zA-Z0-9_.-]{3,120}$")) return BadRequest(new { message = "Use a username with 3-120 letters, numbers, dots, hyphens or underscores." });
        if (request.LocationId == Guid.Empty || string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.StaffId) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Department) || string.IsNullOrWhiteSpace(request.Password)) return BadRequest(new { message = "Complete all required fields." });
        if (SES.Customs.Core.Models.AccessRules.NormalizeRole(request.Role) != SES.Customs.Core.Models.AccessRules.Officer) return BadRequest(new { message = "Public registration is available only for Customs Officer accounts. A System Administrator creates Customs Administrator accounts." });
        if (request.Password != request.ConfirmPassword) return BadRequest(new { message = "Passwords do not match." });
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.Password, "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z]).{8,}$")) return BadRequest(new { message = "Password does not meet the requirements." });
        try { await auth.AddRegistrationAsync(request.Username?.Trim() ?? "", request.FullName?.Trim() ?? "", request.StaffId?.Trim() ?? "", request.Email?.Trim().ToLowerInvariant() ?? "", request.Phone?.Trim(), request.Department?.Trim() ?? "", request.Role ?? "", request.LocationId, request.Password ?? "", ct); }
        catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        return Accepted(new { message = "Registration request submitted for administrator approval." });
    }

    [AllowAnonymous, HttpPost("register-administrator")]
    public async Task<IActionResult> RegisterAdministrator(AdministratorRegistrationRequestDto request, CancellationToken ct)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.Username ?? "", "^[a-zA-Z0-9_.-]{3,120}$")) return BadRequest(new { message = "Use a username with 3-120 letters, numbers, dots, hyphens or underscores." });
        if (request.RegionId == Guid.Empty || request.BranchId == Guid.Empty || string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.StaffId) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Department) || string.IsNullOrWhiteSpace(request.Password)) return BadRequest(new { message = "Complete all required fields." });
        if (request.Password != request.ConfirmPassword) return BadRequest(new { message = "Passwords do not match." });
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.Password, "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z]).{8,}$")) return BadRequest(new { message = "Password does not meet the requirements." });
        try
        {
            var branch = await db.CustomsLocations.AsNoTracking().SingleOrDefaultAsync(l => l.Id == request.BranchId && l.ParentLocationId == request.RegionId && l.LocationType == "BRANCH" && l.Status == "ACTIVE", ct);
            if (branch is null) return BadRequest(new { message = "Choose an active branch belonging to the selected region." });
            await auth.AddRegistrationAsync(request.Username?.Trim() ?? "", request.FullName?.Trim() ?? "", request.StaffId?.Trim() ?? "", request.Email?.Trim().ToLowerInvariant() ?? "", request.Phone?.Trim(), request.Department?.Trim() ?? "", SES.Customs.Core.Models.AccessRules.CustomsAdmin, request.BranchId, request.Password ?? "", ct);
        }
        catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
        return Accepted(new { message = "Customs Administrator application submitted for System Administrator review." });
    }

    [AllowAnonymous, HttpGet("registration-locations")]
    public async Task<IActionResult> RegistrationLocations([FromServices] SES.Customs.Infrastructure.Context.CustomsDbContext db, CancellationToken ct) => Ok(await db.CustomsLocations.AsNoTracking().Where(l => l.Status == "ACTIVE" && l.LocationType == "BRANCH" && l.EffectiveFrom <= DateTimeOffset.UtcNow && (l.EffectiveTo == null || l.EffectiveTo > DateTimeOffset.UtcNow)).OrderBy(l => l.Name).Select(l => new { l.Id, l.OfficialCode, l.Name, l.DisplayName, l.LocationType, l.ParentLocationId, l.Region, l.Zone }).ToListAsync(ct));

    [AllowAnonymous, HttpGet("administrator-registration-locations")]
    public async Task<IActionResult> AdministratorRegistrationLocations(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        return Ok(await db.CustomsLocations.AsNoTracking().Where(l => l.Status == "ACTIVE" && (l.LocationType == "REGION" || l.LocationType == "BRANCH") && l.EffectiveFrom <= now && (l.EffectiveTo == null || l.EffectiveTo > now)).OrderBy(l => l.LocationType).ThenBy(l => l.Name).Select(l => new { l.Id, l.OfficialCode, l.Name, l.DisplayName, l.LocationType, l.ParentLocationId, l.Region, l.Zone }).ToListAsync(ct));
    }

    [Authorize, HttpGet("me")]
    public IActionResult Me() { var role = User.FindFirstValue(ClaimTypes.Role) ?? ""; return Ok(new { id = User.FindFirstValue(JwtRegisteredClaimNames.Sub), username = User.Identity?.Name, email = User.FindFirstValue(ClaimTypes.Email), fullName = User.FindFirstValue("full_name"), role, roleCode = SES.Customs.Core.Models.AccessRules.Code(role), permissions = SES.Customs.Core.Models.AccessRules.Permissions(role) }); }

    [Authorize(Policy = "SystemAdministrator"), HttpPost("users")]
    public async Task<IActionResult> CreateUser(CreateUserRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.Role)) return BadRequest(new { message = "Username, name, email and role are required." });
        try { var user = await auth.CreateAsync(request.Username, request.Email, request.FullName, request.Role, request.Password, ct: ct); return Created("api/auth/users", new { user.Id, user.Email, user.FullName, user.Role, user.Active }); }
        catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
    }

    [Authorize(Policy = "SystemAdministrator"), HttpGet("users")]
    public async Task<IActionResult> Users(CancellationToken ct) => Ok(new { users = (await auth.UsersAsync(ct)).Select(u => new { u.Id, u.Email, u.FullName, u.Role, u.Active }) });

    [Authorize(Policy = "SystemAdministrator"), HttpGet("registration-requests")]
    public async Task<IActionResult> RegistrationRequests(CancellationToken ct) => Ok(new { requests = (await auth.PendingAsync(ct)).Where(r => r.Role == SES.Customs.Core.Models.AccessRules.CustomsAdmin).Select(r => new { r.Id, r.FullName, r.StaffId, r.Email, r.Phone, r.Department, r.Role, locationId = r.LocationId, r.Status, r.SubmittedAt }) });

    [Authorize(Policy = "SystemAdministrator"), HttpPost("registration-requests/{id:guid}/approve")]
    public async Task<IActionResult> ApproveRegistration(Guid id, CancellationToken ct)
    {
        try { var user = await auth.ApproveAsync(id, ct); return Ok(new { message = "Registration approved.", user = new { user.Id, user.Email, user.FullName, user.Role, user.Active, user.PrimaryLocationId } }); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
    }

    [Authorize(Policy = "SystemAdministrator"), HttpPost("registration-requests/{id:guid}/deny")]
    public async Task<IActionResult> DenyRegistration(Guid id, RegistrationReviewDto input, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.Reason) || input.Reason.Trim().Length < 10) return BadRequest(new { message = "Provide a denial reason of at least 10 characters." });
        try { await auth.DenyAsync(id, input.Reason.Trim(), Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!), ct); return Ok(new { message = "Registration denied." }); }
        catch (KeyNotFoundException ex) { return NotFound(new { message = ex.Message }); }
    }

    [AllowAnonymous, HttpPost("forgot-password")]
    public IActionResult ForgotPassword() => Ok(new { message = "If the account exists, reset instructions will be sent through the approved identity provider." });

    private string Token(AuthUser user)
    {
        var settings = configuration.GetSection("Jwt");
        var key = settings["Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured.");
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()), new Claim(JwtRegisteredClaimNames.UniqueName, user.Username), new Claim(ClaimTypes.Name, user.Username), new Claim(ClaimTypes.Email, user.Email), new Claim("full_name", user.FullName), new Claim(ClaimTypes.Role, SES.Customs.Core.Models.AccessRules.NormalizeRole(user.Role) ?? user.Role) };
        var token = new JwtSecurityToken(settings["Issuer"] ?? "SES.Customs", settings["Audience"] ?? "SES.Customs.Portal", claims, DateTime.UtcNow, DateTime.UtcNow.AddHours(1), credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
