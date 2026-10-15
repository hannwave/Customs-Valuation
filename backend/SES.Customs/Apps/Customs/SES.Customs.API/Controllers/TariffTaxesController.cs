using SES.Customs.API.Integrations.Hs;
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

    /// <summary>
    /// Plain-language descriptions for HS / tariff codes, so every screen can show the item description next to a code.
    /// Accepts 4-digit headings, 6-digit HS codes, 8-digit tariff item numbers (with or without the dot) and 11-digit national codes; falls back to the 6-digit HS description, then the WCO nomenclature.
    /// </summary>
    [HttpGet("describe")]
    public async Task<IActionResult> Describe([FromQuery] string? codes, CancellationToken ct)
    {
        var requested = (codes ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Distinct().Take(100).ToList();
        if (requested.Count == 0) return Ok(new Dictionary<string, string>());
        var digitsOf = requested.ToDictionary(code => code, code => new string(code.Where(char.IsDigit).ToArray()));
        var national = digitsOf.Values.Where(d => d.Length == 11).Distinct().ToList();
        var items = digitsOf.Values.Where(d => d.Length == 8).Select(d => $"{d[..4]}.{d[4..]}").Distinct().ToList();
        var hs6 = digitsOf.Values.Where(d => d.Length >= 6).Select(d => d[..6]).Distinct().ToList();
        var hsKeys = hs6.Concat(hs6.Select(d => $"{d[..4]}.{d[4..]}")).ToList();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var lines = national.Count + items.Count == 0 ? [] : await db.NationalTariffLines.AsNoTracking()
            .Where(x => (x.EndDate == null || x.EndDate >= today) && ((x.NationalCode != null && national.Contains(x.NationalCode)) || (x.TariffItemNo != null && items.Contains(x.TariffItemNo))))
            .Select(x => new { x.NationalCode, x.TariffItemNo, x.DescriptionEn, x.HsCodeId }).ToListAsync(ct);
        var hsRows = await db.HsCodes.AsNoTracking().Where(x => x.Code != null && hsKeys.Contains(x.Code))
            .Select(x => new { x.Id, x.Code, x.DescriptionEn }).ToListAsync(ct);
        var hsById = hsRows.GroupBy(x => x.Id).ToDictionary(g => g.Key, g => g.First().DescriptionEn);
        var hsByDigits = hsRows.GroupBy(x => new string(x.Code!.Where(char.IsDigit).ToArray())).ToDictionary(g => g.Key, g => g.First().DescriptionEn);

        var result = new Dictionary<string, string>();
        foreach (var (code, digits) in digitsOf)
        {
            var line = digits.Length == 11 ? lines.FirstOrDefault(x => x.NationalCode == digits)
                : digits.Length == 8 ? lines.FirstOrDefault(x => x.TariffItemNo == $"{digits[..4]}.{digits[4..]}") : null;
            var hsText = line is not null && hsById.TryGetValue(line.HsCodeId, out var parent) ? parent
                : digits.Length >= 6 ? hsByDigits.GetValueOrDefault(digits[..6]) : null;
            // Tariff book text first; the WCO nomenclature covers headings and codes the book has no text for.
            var text = line is null ? hsText : TariffDescriptions.Readable(line.DescriptionEn, hsText);
            if (string.IsNullOrWhiteSpace(text)) text = HsNomenclature.Describe(digits);
            if (!string.IsNullOrWhiteSpace(text)) result[code] = text.Trim();
        }
        return Ok(result);
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
