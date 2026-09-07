using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SES.Customs.Core.Features.HsCodes.Contract.Query;
namespace SES.Customs.API.Controllers;
[ApiController]
[Route("api")]
public sealed class HsCodesController(IMediator mediator, IConfiguration configuration, IWebHostEnvironment environment) : ControllerBase
{
    private bool CanRead() => (environment.IsDevelopment() && configuration.GetValue<bool>("Skeleton:UseDemoData"))
        || User.IsInRole("CustomsOfficer") || User.IsInRole("CustomsAdministrator");
    [AllowAnonymous, HttpGet("hs-codes")]
    public async Task<IActionResult> Search([FromQuery] string? search, [FromQuery] Guid? revisionId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
    {
        if (!CanRead()) return Challenge();
        try { return Ok(await mediator.Send(new SearchHsCodesQuery(search, revisionId, page, pageSize), ct)); }
        catch (ArgumentException ex) { return Problem(statusCode: 400, title: "Invalid search", detail: ex.Message); }
    }
    [AllowAnonymous, HttpGet("hs-codes/{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        if (!CanRead()) return Challenge();
        var result = await mediator.Send(new GetHsCodeQuery(id), ct);
        return result is null ? Problem(statusCode: 404, title: "HS code not found") : Ok(result);
    }
    [AllowAnonymous, HttpGet("hs-revisions")]
    public async Task<IActionResult> Revisions(CancellationToken ct)
    {
        if (!CanRead()) return Challenge();
        return Ok(await mediator.Send(new GetHsRevisionsQuery(), ct));
    }
}
