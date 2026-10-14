using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Services;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

/// <summary>Tax and duty rates of the national tariff, as stored from the ERCA tariff book.</summary>
[ApiController, Route("api/tariff"), Authorize]
public sealed class TariffTaxesController(CustomsDbContext db) : ControllerBase
{
    [HttpGet("tax-types")]
    public async Task<IActionResult> TaxTypes(CancellationToken ct) =>
        Ok(await db.TariffTaxTypes.AsNoTracking().OrderBy(x => x.DisplayOrder).Select(x => new { x.Code, x.Name, x.Description, x.Scope }).ToListAsync(ct));

    /// <summary>Current tariff lines whose national code, item number or HS code starts with the given digits, with every listed rate.</summary>
    [HttpGet("lines")]
    public async Task<IActionResult> Lines([FromQuery] string code, CancellationToken ct)
    {
        var digits = new string((code ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length is < 4 or > 11) return BadRequest(new { message = "Enter 4 to 11 digits of an HS or national tariff code." });
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var dotted = digits.Length > 4 ? $"{digits[..4]}.{digits[4..]}" : digits;
        var lines = await db.NationalTariffLines.AsNoTracking()
            .Where(x => (x.EndDate == null || x.EndDate >= today) && x.EffectiveDate <= today &&
                ((x.NationalCode != null && x.NationalCode.StartsWith(digits)) || (x.TariffItemNo != null && x.TariffItemNo.StartsWith(dotted))))
            .OrderBy(x => x.NationalCode ?? x.Code).Take(200)
            .Select(x => new { x.Id, x.HsCodeId, x.NationalCode, x.TariffItemNo, x.DescriptionEn, x.Unit, x.Duty, x.SourceReference, x.EffectiveDate,
                rates = x.TaxRates.OrderBy(r => r.TaxCode).Select(r => new { r.TaxCode, r.Rate, r.RetrievedAt }).ToList() })
            .ToListAsync(ct);
        return Ok(lines);
    }

    [HttpGet("lines/{id:guid}/taxes")]
    public async Task<IActionResult> LineTaxes(Guid id, CancellationToken ct)
    {
        var line = await db.NationalTariffLines.AsNoTracking().Where(x => x.Id == id)
            .Select(x => new { x.Id, x.NationalCode, x.TariffItemNo, x.DescriptionEn, x.Unit,
                rates = x.TaxRates.Select(r => new { r.TaxCode, r.Rate, r.SourceReference, r.RetrievedAt }).ToList() })
            .SingleOrDefaultAsync(ct);
        if (line is null) return NotFound(new { message = "Tariff line not found." });
        var types = TariffTaxCodes.All.OrderBy(x => x.DisplayOrder).ToList();
        return Ok(new { line.Id, line.NationalCode, line.TariffItemNo, line.DescriptionEn, line.Unit,
            taxes = types.Select(type => { var rate = line.rates.FirstOrDefault(r => r.TaxCode == type.Code);
                return new { type.Code, type.Name, type.Scope, listed = rate is not null, rate = rate?.Rate, rate?.SourceReference, rate?.RetrievedAt }; }) });
    }

    /// <summary>Applies an ERCA tariff export (JSON rows). Use dryRun=true to preview the changes without saving.</summary>
    [Authorize(Policy = "SystemAdministrator"), HttpPost("erca-import"), RequestSizeLimit(30_000_000)]
    public async Task<IActionResult> ImportErca(IFormFile file, [FromQuery] bool dryRun, [FromQuery] DateOnly? retrievedOn, [FromServices] ErcaTariffImporter importer, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest(new { message = "Upload the ERCA tariff JSON file." });
        using var reader = new StreamReader(file.OpenReadStream());
        IReadOnlyList<ErcaTariffRow> rows;
        try { rows = ErcaTariffImporter.Parse(await reader.ReadToEndAsync(ct)); }
        catch (System.Text.Json.JsonException) { return BadRequest(new { message = "The file is not a valid ERCA tariff JSON export." }); }
        try { return Ok(await importer.ApplyAsync(rows, retrievedOn ?? DateOnly.FromDateTime(DateTime.UtcNow), dryRun, User.FindFirstValue(ClaimTypes.Name) ?? "system", ct)); }
        catch (InvalidOperationException ex) { return BadRequest(new { message = ex.Message }); }
    }
}
