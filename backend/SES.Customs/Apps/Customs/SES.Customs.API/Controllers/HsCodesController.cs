using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SES.Customs.Core.Features.HsCodes.Contract.Query;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using System.Text.Json;
using System.Text.Json.Serialization;
namespace SES.Customs.API.Controllers;
[ApiController]
[Route("api")]
public sealed class HsCodesController(IMediator mediator, IConfiguration configuration, IWebHostEnvironment environment, IServiceScopeFactory scopeFactory) : ControllerBase
{
    private bool CanRead() => (environment.IsDevelopment() && configuration.GetValue<bool>("Skeleton:UseDemoData"))
        || User.IsInRole("CustomsOfficer") || User.IsInRole("CustomsAdministrator") || User.IsInRole("SystemAdministrator");
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

    [Authorize(Policy = "SystemAdministrator"), RequestSizeLimit(20_000_000), HttpPost("hs-codes/import")]
    public async Task<IActionResult> Import([FromForm] IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { message = "Attach a tariff_items JSON file." });
        await using var stream = file.OpenReadStream();
        var rows = await JsonSerializer.DeserializeAsync<List<TariffImportRow>>(stream, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }, ct);
        if (rows is null || rows.Count == 0) return BadRequest(new { message = "The tariff file contains no records." });
        var invalid = rows.Count(r => Normalize(r.HsCode).Length != 6 || Normalize(r.TariffItemNo).Length != 8 || string.IsNullOrWhiteSpace(r.Description));
        if (invalid > 0) return BadRequest(new { message = $"The tariff file contains {invalid} invalid records." });
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        var revision = await db.HsRevisions.FirstOrDefaultAsync(r => r.Number == 5, ct);
        if (revision is null) { revision = new HsRevision { Id = Guid.NewGuid(), Name = "Ethiopian Tariff Items v5", Number = 5, EffectiveDate = new DateOnly(2025, 1, 1), Status = "Active", SourceReference = file.FileName }; db.HsRevisions.Add(revision); }
        var codes = rows.GroupBy(r => Normalize(r.HsCode), StringComparer.OrdinalIgnoreCase).Select(g => new { Code = g.Key, Description = Clean(g.First().Description) }).ToArray();
        var existing = await db.HsCodes.Where(c => c.RevisionId == revision.Id).ToDictionaryAsync(c => c.Code, ct);
        foreach (var code in codes) { if (!existing.ContainsKey(code.Code)) { var entity = new HsCode { Id = Guid.NewGuid(), RevisionId = revision.Id, Code = code.Code, DescriptionEn = code.Description }; db.HsCodes.Add(entity); existing[code.Code] = entity; } else existing[code.Code].DescriptionEn = code.Description; }
        await db.SaveChangesAsync(ct);
        var oldLines = await db.NationalTariffLines.Where(l => l.HsCodeId != Guid.Empty && existing.Values.Select(c => c.Id).Contains(l.HsCodeId)).ToListAsync(ct); db.NationalTariffLines.RemoveRange(oldLines);
        db.NationalTariffLines.AddRange(rows.Select(r => new NationalTariffLine { Id = Guid.NewGuid(), HsCodeId = existing[Normalize(r.HsCode)].Id, Code = Normalize(r.TariffItemNo), DescriptionEn = Clean(r.Description), Unit = r.Unit?.Trim() ?? "", Duty = r.Duty?.Trim() ?? "", SourceReference = file.FileName, EffectiveDate = revision.EffectiveDate }));
        await db.SaveChangesAsync(ct);
        return Ok(new { revisionId = revision.Id, hsCodes = codes.Length, tariffItems = rows.Count, source = file.FileName });
    }

    private static string Normalize(string? value) => (value ?? "").Replace(".", "", StringComparison.Ordinal).Trim();
    private static string Clean(string value) => value.Trim().TrimStart('-', ' ');
    private sealed record TariffImportRow([property: JsonPropertyName("hs_code")] string? HsCode, [property: JsonPropertyName("tariff_item_no")] string? TariffItemNo, [property: JsonPropertyName("description")] string Description, [property: JsonPropertyName("unit")] string? Unit, [property: JsonPropertyName("duty")] string? Duty);
}
