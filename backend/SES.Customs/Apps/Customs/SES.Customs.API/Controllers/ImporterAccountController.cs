using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Security;
using SES.Customs.API.Services;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

public sealed record ImporterAccountChange(string? FullName, string? Email, string? Phone);
public sealed record ImporterPasswordChange(string? CurrentPassword, string? NewPassword, string? ConfirmPassword);

/// <summary>
/// The importer's own sign-in account: name, contact details, profile picture and password. Business and identity
/// details stay on the verification record, because changing them needs an officer to verify them again.
/// </summary>
[ApiController, Route("api/importer-profile/account"), Authorize(Roles = "Importer"), ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class ImporterAccountController(CustomsDbContext db, WorkspaceAccess access) : ControllerBase
{
    private const long MaxPhotoBytes = 3 * 1024 * 1024;
    private static readonly HashSet<string> PhotoTypes = new(StringComparer.OrdinalIgnoreCase) { "image/jpeg", "image/png", "image/webp" };

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var user = await db.AuthAccounts.AsNoTracking().SingleAsync(u => u.Id == access.UserId, ct);
        var photo = await db.AccountPhotos.AsNoTracking().Where(p => p.AccountId == user.Id).Select(p => (DateTimeOffset?)p.UpdatedAt).FirstOrDefaultAsync(ct);
        return Ok(View(user, photo));
    }

    [HttpPatch]
    public async Task<IActionResult> Update(ImporterAccountChange input, CancellationToken ct)
    {
        var user = await db.AuthAccounts.SingleAsync(u => u.Id == access.UserId, ct);
        var fullName = Regex.Replace(input.FullName ?? "", @"\s+", " ").Trim();
        var email = (input.Email ?? "").Trim().ToLowerInvariant();
        var phone = (input.Phone ?? "").Trim();
        // Once the importer has a verification record the name is part of the verified identity: it changes only through an approved change request.
        var verified = await db.ImporterProfiles.AnyAsync(p => p.AccountId == user.Id, ct);
        if (verified)
        {
            Require(fullName.Length == 0 || fullName == user.FullName, "Your name is verified by Customs. Use “Request a change” on your profile to update it.");
            fullName = user.FullName;
        }
        Require(fullName.Length is >= 2 and <= 200, "Enter your full name.");
        Require(System.Net.Mail.MailAddress.TryCreate(email, out var parsed) && parsed.Address == email && email.Length <= 200, "Enter a valid email address.");
        Require(phone.Length == 0 || Regex.IsMatch(phone, @"^\+?[0-9 ()-]{7,20}$"), "Enter a valid phone number, for example +251 911 234 567.");
        Require(!await db.AuthAccounts.AnyAsync(u => u.Id != user.Id && u.Email == email, ct), "That email is already used by another account.");
        var before = new { user.FullName, user.Email, user.Phone };
        user.FullName = fullName; user.Email = email; user.Phone = phone; user.UpdatedAt = DateTimeOffset.UtcNow;
        access.Audit("IMPORTER_ACCOUNT_UPDATED", "Users", user.Id, before, new { user.FullName, user.Email, user.Phone }, "Importer updated their own account details.");
        await db.SaveChangesAsync(ct);
        var photo = await db.AccountPhotos.AsNoTracking().Where(p => p.AccountId == user.Id).Select(p => (DateTimeOffset?)p.UpdatedAt).FirstOrDefaultAsync(ct);
        return Ok(View(user, photo));
    }

    [HttpPost("password")]
    public async Task<IActionResult> ChangePassword(ImporterPasswordChange input, CancellationToken ct)
    {
        var user = await db.AuthAccounts.SingleAsync(u => u.Id == access.UserId, ct);
        Require(!string.IsNullOrWhiteSpace(input.CurrentPassword), "Enter your current password.");
        Require(AuthService.VerifyHash(user.PasswordHash, input.CurrentPassword!), "Your current password is incorrect.");
        Require(input.NewPassword == input.ConfirmPassword, "The new passwords do not match.");
        Require(Regex.IsMatch(input.NewPassword ?? "", "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$"), "Use at least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.");
        Require(input.NewPassword != input.CurrentPassword, "Choose a password different from your current one.");
        user.PasswordHash = AuthService.Hash(input.NewPassword!);
        user.UpdatedAt = DateTimeOffset.UtcNow;
        access.Audit("PASSWORD_CHANGED", "Users", user.Id, null, new { changed = true }, "Importer changed their own password.");
        await db.SaveChangesAsync(ct);
        return Ok(new { message = "Password changed." });
    }

    [HttpGet("photo")]
    public async Task<IActionResult> Photo(CancellationToken ct)
    {
        var photo = await db.AccountPhotos.AsNoTracking().FirstOrDefaultAsync(p => p.AccountId == access.UserId, ct);
        if (photo is null) return NotFound(new { message = "No profile picture." });
        Response.Headers.CacheControl = "private, max-age=300";
        return File(photo.Content, photo.ContentType);
    }

    [HttpPut("photo"), RequestSizeLimit(4 * 1024 * 1024)]
    public async Task<IActionResult> UploadPhoto(IFormFile file, CancellationToken ct)
    {
        Require(file is { Length: > 0 } && file.Length <= MaxPhotoBytes, "Choose a JPG, PNG or WebP picture of 3 MB or smaller.");
        Require(PhotoTypes.Contains(file!.ContentType), "Choose a JPG, PNG or WebP picture.");
        await using var stream = new MemoryStream();
        await file.CopyToAsync(stream, ct);
        var bytes = stream.ToArray();
        Require(IsImage(bytes, file.ContentType), "The file is not a valid picture.");
        var photo = await db.AccountPhotos.FirstOrDefaultAsync(p => p.AccountId == access.UserId, ct);
        if (photo is null) { photo = new AccountPhotoEntity { AccountId = access.UserId }; db.AccountPhotos.Add(photo); }
        photo.ContentType = file.ContentType.ToLowerInvariant(); photo.Content = bytes; photo.UpdatedAt = DateTimeOffset.UtcNow;
        access.Audit("PROFILE_PHOTO_UPDATED", "Users", access.UserId, null, new { photo.ContentType, size = bytes.Length }, "Importer changed their profile picture.");
        await db.SaveChangesAsync(ct);
        return Ok(new { photoUpdatedAt = photo.UpdatedAt });
    }

    [HttpDelete("photo")]
    public async Task<IActionResult> RemovePhoto(CancellationToken ct)
    {
        var photo = await db.AccountPhotos.FirstOrDefaultAsync(p => p.AccountId == access.UserId, ct);
        if (photo is not null)
        {
            db.AccountPhotos.Remove(photo);
            access.Audit("PROFILE_PHOTO_REMOVED", "Users", access.UserId, null, null, "Importer removed their profile picture.");
            await db.SaveChangesAsync(ct);
        }
        return NoContent();
    }

    private static object View(AuthAccountEntity user, DateTimeOffset? photoUpdatedAt) => new
    {
        user.Id, user.Username, user.FullName, user.Email, user.Phone, user.CreatedAt, user.LastLoginAt, user.UpdatedAt,
        hasPhoto = photoUpdatedAt.HasValue, photoUpdatedAt,
    };

    private static bool IsImage(byte[] bytes, string contentType) => contentType.ToLowerInvariant() switch
    {
        "image/jpeg" => bytes.Length > 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF,
        "image/png" => bytes.Length > 8 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47,
        "image/webp" => bytes.Length > 12 && bytes[0] == 0x52 && bytes[1] == 0x49 && bytes[2] == 0x46 && bytes[3] == 0x46 && bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50,
        _ => false,
    };

    private static void Require(bool condition, string message) { if (!condition) throw new WorkspaceException(400, message); }
}
