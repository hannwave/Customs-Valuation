using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Security;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

/// <summary>Messages to the signed-in importer about their account and declarations.</summary>
[ApiController, Route("api/importer-notifications"), Authorize(Roles = "Importer"), ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class ImporterNotificationsController(CustomsDbContext db, WorkspaceAccess access) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var mine = db.ImporterNotifications.AsNoTracking().Where(x => x.ImporterId == access.UserId);
        var items = await mine.OrderByDescending(x => x.CreatedAt).Take(30)
            .Select(x => new { x.Id, x.DeclarationId, x.Kind, x.Title, x.Message, x.Link, x.CreatedAt, x.ReadAt }).ToListAsync(ct);
        return Ok(new { unread = await mine.CountAsync(x => x.ReadAt == null, ct), items });
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> Read(Guid id, CancellationToken ct)
    {
        var notification = await db.ImporterNotifications.FirstOrDefaultAsync(x => x.Id == id && x.ImporterId == access.UserId, ct);
        if (notification is null) return NotFound(new { message = "Notification not found." });
        notification.ReadAt ??= DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> ReadAll(CancellationToken ct)
    {
        var unread = await db.ImporterNotifications.Where(x => x.ImporterId == access.UserId && x.ReadAt == null).ToListAsync(ct);
        var now = DateTimeOffset.UtcNow;
        foreach (var notification in unread) notification.ReadAt = now;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
