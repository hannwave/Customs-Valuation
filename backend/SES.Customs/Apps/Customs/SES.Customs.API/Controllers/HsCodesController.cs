using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SES.Customs.Core.Features.HsCodes.Contract.Query;
using SES.Customs.Core.Dtos;
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

    [AllowAnonymous, HttpGet("hs-catalogue/tree")]
    public async Task<IActionResult> Tree([FromQuery] Guid? revisionId, [FromQuery] string? search, [FromQuery] bool summary = false, CancellationToken ct = default)
    {
        if (!CanRead()) return Challenge();
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        var codesQuery = db.HsCodes.AsNoTracking();
        if (revisionId.HasValue) codesQuery = codesQuery.Where(x => x.RevisionId == revisionId.Value);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLowerInvariant();
            var normalized = term.Replace(".", "");
            codesQuery = codesQuery.Where(x => (x.Code ?? "").Contains(normalized) || (x.DescriptionEn ?? "").ToLower().Contains(term));
        }
        var codes = await codesQuery.OrderBy(x => x.Code).Select(x => new { x.Id, x.RevisionId, Code = x.Code ?? "", DescriptionEn = x.DescriptionEn ?? "", x.DescriptionAm }).ToListAsync(ct);
        var ids = codes.Select(x => x.Id).ToArray();
        if (summary)
        {
            var summaryTree = codes.Where(x => IsSixDigitHsCode(x.Code)).Select(x => new { Section = SectionForChapter(x.Code[..2]), Chapter = x.Code[..2], x.DescriptionEn })
                .GroupBy(x => x.Section.Code).OrderBy(x => x.Key)
                .Select(section => new HsSectionNodeDto(section.Key, section.First().Section.Name,
                    section.GroupBy(x => x.Chapter).OrderBy(x => x.Key).Select(chapter => new HsChapterNodeDto(chapter.Key, chapter.First().DescriptionEn, 0, Array.Empty<HsTariffItemNodeDto>())).ToArray())).ToArray();
            return Ok(new HsCatalogueTreeDto(summaryTree));
        }
        var lines = await db.NationalTariffLines.AsNoTracking().Where(x => ids.Contains(x.HsCodeId)).OrderBy(x => x.Code).ToListAsync(ct);
        var lineByHs = lines.GroupBy(x => x.HsCodeId).ToDictionary(x => x.Key, x => x.ToList());
        var tree = codes.SelectMany(code =>
        {
            var chapter = code.Code.Length >= 2 ? code.Code[..2] : "00";
            var section = SectionForChapter(chapter);
            var matchingLines = lineByHs.TryGetValue(code.Id, out var tariffLines) && tariffLines.Count > 0
                ? tariffLines
                : [new NationalTariffLine { Code = code.Code, DescriptionEn = code.DescriptionEn, Duty = "", Unit = "", SourceReference = "" }];
            return matchingLines.Select(line => new { Section = section, Chapter = chapter, ChapterName = code.DescriptionEn, Line = line, Code = code });
        })
        .GroupBy(x => x.Section.Code).OrderBy(x => x.Key)
        .Select(section => new HsSectionNodeDto(
            section.Key,
            section.First().Section.Name,
            section.GroupBy(x => x.Chapter).OrderBy(x => x.Key).Select(chapter => new HsChapterNodeDto(
                chapter.Key,
                chapter.First().ChapterName,
                chapter.Select(x => x.Line.Code).Distinct().Count(),
                chapter.GroupBy(x => x.Line.Code).OrderBy(x => x.Key).Select(item => new HsTariffItemNodeDto(
                    item.Key,
                    item.First().Line.DescriptionEn,
                    item.Select(x => x.Code.Id).Distinct().Count(),
                    item.GroupBy(x => x.Code.Id).Select(hs => new HsCodeNodeDto(
                        hs.First().Code.Id,
                        hs.First().Code.Code,
                        hs.First().Code.DescriptionEn,
                        hs.First().Line.Duty,
                        hs.First().Line.Unit,
                        hs.First().Line.SourceReference)).ToArray())).ToArray())).ToArray())).ToArray();
        return Ok(new HsCatalogueTreeDto(tree));
    }

    [AllowAnonymous, HttpGet("hs-catalogue/chapters/{chapter}")]
    public async Task<IActionResult> Chapter(string chapter, [FromQuery] Guid? revisionId, [FromQuery] string? search, CancellationToken ct)
    {
        if (!CanRead()) return Challenge();
        var normalizedChapter = Normalize(chapter);
        if (normalizedChapter.Length != 2 || !normalizedChapter.All(char.IsDigit)) return BadRequest(new { message = "Chapter must contain two digits." });
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        // Some tariff books store HS codes with separators (for example 01.01.01),
        // so do not rely only on the raw database prefix when loading a chapter.
        var codesQuery = db.HsCodes.AsNoTracking();
        if (revisionId.HasValue) codesQuery = codesQuery.Where(x => x.RevisionId == revisionId.Value);
        if (!string.IsNullOrWhiteSpace(search)) { var term = search.Trim().ToLowerInvariant(); codesQuery = codesQuery.Where(x => (x.Code ?? "").Contains(term) || (x.DescriptionEn ?? "").ToLower().Contains(term)); }
        var codes = (await codesQuery.Select(x => new { x.Id, Code = x.Code ?? "", DescriptionEn = x.DescriptionEn ?? "" }).ToListAsync(ct))
            .Select(x => new { x.Id, Code = Normalize(x.Code), x.DescriptionEn })
            .Where(x => x.Code.StartsWith(normalizedChapter, StringComparison.Ordinal) && IsSixDigitHsCode(x.Code))
            .ToList();
        var ids = codes.Select(x => x.Id).ToArray();
        var lines = (await db.NationalTariffLines.AsNoTracking().Where(x => ids.Contains(x.HsCodeId)).OrderBy(x => x.Code).ToListAsync(ct))
            .Select(x => new NationalTariffLine { Id = x.Id, HsCodeId = x.HsCodeId, Code = NormalizeTariffItemCode(x.Code), DescriptionEn = x.DescriptionEn, DescriptionAm = x.DescriptionAm, Unit = x.Unit, Duty = x.Duty, SourceReference = x.SourceReference, EffectiveDate = x.EffectiveDate, EndDate = x.EndDate })
            .Where(x => IsTariffItemNumber(x.Code)).ToList();
        var codeById = codes.ToDictionary(x => x.Id);
        var items = lines.GroupBy(x => x.Code).OrderBy(x => x.Key).Select(item => new HsTariffItemNodeDto(item.Key, item.First().DescriptionEn, item.Select(x => x.HsCodeId).Distinct().Count(), item.GroupBy(x => x.HsCodeId).Select(code => new HsCodeNodeDto(code.Key, codeById[code.Key].Code, codeById[code.Key].DescriptionEn, code.First().Duty, code.First().Unit, code.First().SourceReference)).ToArray())).ToList();
        return Ok(items.OrderBy(x => x.Code));
    }

    [AllowAnonymous, HttpGet("hs-codes/{id:guid}/detail")]
    public async Task<IActionResult> Detail(Guid id, CancellationToken ct)
    {
        if (!CanRead()) return Challenge();
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        var code = await db.HsCodes.AsNoTracking().Where(x => x.Id == id).Select(x => new { x.Id, x.RevisionId, Code = x.Code ?? "", DescriptionEn = x.DescriptionEn ?? "", x.DescriptionAm }).SingleOrDefaultAsync(ct);
        if (code is null) return NotFound();
        var lines = await db.NationalTariffLines.AsNoTracking().Where(x => x.HsCodeId == id).OrderByDescending(x => x.EffectiveDate).ThenBy(x => x.Code).Select(x => new HsTariffLineDto(x.Id, x.Code, x.DescriptionEn, x.DescriptionAm, x.Unit, x.Duty, x.SourceReference, x.EffectiveDate, x.EndDate)).ToListAsync(ct);
        return Ok(new HsCodeDetailDto(code.Id, code.RevisionId, code.Code, code.DescriptionEn, code.DescriptionAm, lines));
    }

    [Authorize(Policy = "SystemAdministrator"), HttpPost("hs-codes")]
    public async Task<IActionResult> Create([FromBody] HsCodeWriteRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var code = NormalizeWriteCode(request.Code);
        if (code.Length != 6 || !code.All(char.IsDigit)) return BadRequest(new { message = "HS code must contain exactly 6 digits." });
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        if (!await db.HsRevisions.AnyAsync(x => x.Id == request.RevisionId, ct)) return BadRequest(new { message = "Select a valid HS revision." });
        if (await db.HsCodes.AnyAsync(x => x.RevisionId == request.RevisionId && x.Code == code, ct)) return Conflict(new { message = "That HS code already exists in this revision." });
        var entity = new HsCode { Id = Guid.NewGuid(), RevisionId = request.RevisionId, Code = code, DescriptionEn = request.DescriptionEn.Trim(), DescriptionAm = request.DescriptionAm?.Trim() };
        db.HsCodes.Add(entity);
        AddTariffLine(db, entity.Id, request, code);
        await db.SaveChangesAsync(ct);
        return Created($"/api/hs-codes/{entity.Id}/detail", new { id = entity.Id });
    }

    [Authorize(Policy = "SystemAdministrator"), HttpPut("hs-codes/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] HsCodeWriteRequest request, CancellationToken ct)
    {
        var code = NormalizeWriteCode(request.Code);
        if (code.Length != 6 || !code.All(char.IsDigit)) return BadRequest(new { message = "HS code must contain exactly 6 digits." });
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        var entity = await db.HsCodes.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null) return NotFound();
        if (await db.HsCodes.AnyAsync(x => x.Id != id && x.RevisionId == request.RevisionId && x.Code == code, ct)) return Conflict(new { message = "That HS code already exists in this revision." });
        entity.RevisionId = request.RevisionId; entity.Code = code; entity.DescriptionEn = request.DescriptionEn.Trim(); entity.DescriptionAm = request.DescriptionAm?.Trim();
        var line = await db.NationalTariffLines.Where(x => x.HsCodeId == id).OrderByDescending(x => x.EffectiveDate).FirstOrDefaultAsync(ct);
        if (line is null) AddTariffLine(db, id, request, code); else { line.Code = NormalizeWriteCode(request.TariffItemNo ?? line.Code); line.DescriptionEn = request.TariffDescription?.Trim() ?? line.DescriptionEn; line.Unit = request.Unit?.Trim() ?? line.Unit; line.Duty = request.Duty?.Trim() ?? line.Duty; line.SourceReference = request.SourceReference?.Trim() ?? line.SourceReference; line.EffectiveDate = request.EffectiveDate ?? line.EffectiveDate; }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static void AddTariffLine(CustomsDbContext db, Guid hsCodeId, HsCodeWriteRequest request, string fallbackCode) => db.NationalTariffLines.Add(new NationalTariffLine { Id = Guid.NewGuid(), HsCodeId = hsCodeId, Code = NormalizeWriteCode(request.TariffItemNo ?? fallbackCode), DescriptionEn = request.TariffDescription?.Trim() ?? request.DescriptionEn.Trim(), DescriptionAm = request.DescriptionAm?.Trim(), Unit = request.Unit?.Trim() ?? "", Duty = request.Duty?.Trim() ?? "", SourceReference = request.SourceReference?.Trim() ?? "", EffectiveDate = request.EffectiveDate ?? DateOnly.FromDateTime(DateTime.UtcNow) });

    private static string NormalizeWriteCode(string value) => value.Replace(".", "", StringComparison.Ordinal).Trim();
    private static (string Code, string Name) SectionForChapter(string chapter) => int.TryParse(chapter, out var number) switch
    {
        true when number <= 5 => ("I", "Live animals; animal products"),
        true when number <= 14 => ("II", "Vegetable products"),
        true when number <= 15 => ("III", "Animal or vegetable fats and oils"),
        true when number <= 24 => ("IV", "Prepared foodstuffs; beverages and tobacco"),
        true when number <= 27 => ("V", "Mineral products"),
        true when number <= 38 => ("VI", "Products of the chemical or allied industries"),
        true when number <= 40 => ("VII", "Plastics and rubber"),
        true when number <= 43 => ("VIII", "Raw hides, skins, leather and travel goods"),
        true when number <= 46 => ("IX", "Wood and articles of wood"),
        true when number <= 49 => ("X", "Pulp, paper and paperboard"),
        true when number <= 63 => ("XI", "Textiles and textile articles"),
        true when number <= 67 => ("XII", "Footwear, headgear and other articles"),
        true when number <= 70 => ("XIII", "Stone, plaster, cement, ceramics and glass"),
        true when number <= 71 => ("XIV", "Natural or cultured pearls; precious stones"),
        true when number <= 83 => ("XV", "Base metals and articles of base metal"),
        true when number <= 85 => ("XVI", "Machinery and electrical equipment"),
        true when number <= 89 => ("XVII", "Vehicles, aircraft and vessels"),
        true when number <= 92 => ("XVIII", "Optical, photographic, musical and medical instruments"),
        true when number <= 94 => ("XIX", "Arms and ammunition"),
        true when number <= 96 => ("XX", "Miscellaneous manufactured articles"),
        _ => ("XXI", "Works of art, collectors' pieces and antiques")
    };

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

    private static string Normalize(string? value) => new((value ?? "").Where(char.IsDigit).ToArray());
    private static bool IsSixDigitHsCode(string value) => value.Length == 6 && value.All(char.IsDigit);
    private static bool IsTariffItemNumber(string value) => value.Length == 8 && value.All(char.IsDigit);
    private static string NormalizeTariffItemCode(string? value)
    {
        var digits = Normalize(value);
        return digits.Length >= 8 ? digits[..8] : "";
    }
    private static string Clean(string value) => value.Trim().TrimStart('-', ' ');
    private sealed record TariffImportRow([property: JsonPropertyName("hs_code")] string? HsCode, [property: JsonPropertyName("tariff_item_no")] string? TariffItemNo, [property: JsonPropertyName("description")] string Description, [property: JsonPropertyName("unit")] string? Unit, [property: JsonPropertyName("duty")] string? Duty);
}
