using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SES.Customs.API.Integrations.PriceWatcha;
namespace SES.Customs.API.Controllers;
[ApiController, Route("api/pricewatcha"), Authorize(Policy = "OfficerOnly")]
public sealed class PriceWatchaController(PriceWatchaClient client) : ControllerBase
{
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string? q, CancellationToken ct)
    { if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2) return BadRequest(new { message = "Enter a product search containing at least two characters." }); if (!client.IsConfigured) return Problem(statusCode: 503, title: "PriceWatcha is not configured", detail: "Configure PriceWatcha:ApiKey on the server."); try { return Ok(await client.SearchWithHistoryAsync(q, ct)); } catch (HttpRequestException ex) { return Problem(statusCode: 502, title: "PriceWatcha request failed", detail: ex.Message); } }
}
