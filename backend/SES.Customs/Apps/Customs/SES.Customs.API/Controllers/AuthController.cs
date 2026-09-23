using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using SES.Customs.API.Security;

namespace SES.Customs.API.Controllers;

public sealed record LoginRequest(string Identity, string Password);
public sealed record RegistrationRequestDto(string FullName, string StaffId, string Email, string? Phone, string Department, string Role, string Password, string ConfirmPassword);
public sealed record CreateUserRequest(string Username, string FullName, string Email, string Role, string Password);

[ApiController, Route("api/auth")]
public sealed class AuthController(AuthService auth, IConfiguration configuration) : ControllerBase
{
    [AllowAnonymous, HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Identity) || string.IsNullOrWhiteSpace(request.Password)) return BadRequest(new { message = "Username/email and password are required." });
        var user = await auth.FindAsync(request.Identity, ct);
        if (user is null || !AuthService.Verify(user, request.Password)) return Unauthorized(new { message = "Invalid username or password." });
        if (!user.Active || !string.Equals(user.Status, "ACTIVE", StringComparison.OrdinalIgnoreCase))
            return StatusCode(StatusCodes.Status403Forbidden, new { code = "ACCOUNT_PENDING_VALIDATION", message = $"This account is {LoginStatus(user.Status)}. A System Administrator must validate the officer account before sign-in." });
        await auth.RecordLoginAsync(user.Id, ct);
        return Ok(new { accessToken = Token(user), tokenType = "Bearer", expiresIn = 3600, user = new { user.Id, user.Username, user.Email, user.FullName, user.Role } });
    }

    [AllowAnonymous, HttpPost("register")]
    public async Task<IActionResult> Register(RegistrationRequestDto request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.StaffId) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Department) || string.IsNullOrWhiteSpace(request.Password)) return BadRequest(new { message = "Complete all required fields." });
        if (SES.Customs.Core.Models.AccessRules.NormalizeRole(request.Role) != SES.Customs.Core.Models.AccessRules.Officer) return BadRequest(new { message = "Public registration is available only for Customs Officer accounts. A System Administrator creates Customs Administrator accounts." });
        if (request.Password != request.ConfirmPassword) return BadRequest(new { message = "Passwords do not match." });
        if (!System.Text.RegularExpressions.Regex.IsMatch(request.Password, "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z]).{8,}$")) return BadRequest(new { message = "Password does not meet the requirements." });
        await auth.AddRegistrationAsync(request.FullName, request.StaffId, request.Email, request.Phone, request.Department, request.Role, request.Password, ct);
        return Accepted(new { message = "Registration request submitted for administrator approval." });
    }

    [Authorize, HttpGet("me")]
    public IActionResult Me() { var role = User.FindFirstValue(ClaimTypes.Role) ?? ""; return Ok(new { id = User.FindFirstValue(JwtRegisteredClaimNames.Sub), username = User.Identity?.Name, email = User.FindFirstValue(ClaimTypes.Email), fullName = User.FindFirstValue("full_name"), role, roleCode = SES.Customs.Core.Models.AccessRules.Code(role), permissions = SES.Customs.Core.Models.AccessRules.Permissions(role) }); }

    [Authorize(Policy = "SystemAdministrator"), HttpPost("users")]
    public async Task<IActionResult> CreateUser(CreateUserRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.Role)) return BadRequest(new { message = "Username, name, email and role are required." });
        try { var user = await auth.CreateAsync(request.Username, request.Email, request.FullName, request.Role, request.Password, ct: ct); return Created("api/auth/users", new { user.Id, user.Username, user.Email, user.FullName, user.Role, user.Active }); }
        catch (InvalidOperationException ex) { return Conflict(new { message = ex.Message }); }
    }

    [Authorize(Policy = "SystemAdministrator"), HttpGet("users")]
    public async Task<IActionResult> Users(CancellationToken ct) => Ok(new { users = (await auth.UsersAsync(ct)).Select(u => new { u.Id, u.Username, u.Email, u.FullName, u.Role, u.Active }) });

    [Authorize(Policy = "SystemAdministrator"), HttpGet("registration-requests")]
    public async Task<IActionResult> RegistrationRequests(CancellationToken ct) => Ok(new { requests = (await auth.PendingAsync(ct)).Select(r => new { r.Id, r.FullName, r.StaffId, r.Email, r.Phone, r.Department, r.Role, r.Status, r.SubmittedAt }) });

    [Authorize(Policy = "SystemAdministrator"), HttpPost("registration-requests/{id:guid}/approve")]
    public async Task<IActionResult> ApproveRegistration(Guid id, CancellationToken ct)
    {
        try { var user = await auth.ApproveAsync(id, ct); return Ok(new { message = "Registration approved.", user = new { user.Id, user.Username, user.Email, user.FullName, user.Role, user.Active } }); }
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

    private static string LoginStatus(string status) => status switch
    {
        "PENDING_VALIDATION" or "Pending" => "pending validation",
        "SUSPENDED" => "suspended",
        "LOCKED" => "locked",
        "INACTIVE" => "inactive",
        _ => "not active"
    };
}
