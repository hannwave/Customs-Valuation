using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SES.Customs.Core.Features.HsCodes.Contract.Query;
using SES.Customs.Core.Dtos;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using SES.Customs.API.Security;
using System.Text.Json;
using System.Text.Json.Serialization;
namespace SES.Customs.API.Controllers;
[ApiController]
[Route("api")]
public sealed class HsCodesController(IMediator mediator, IConfiguration configuration, IWebHostEnvironment environment, IServiceScopeFactory scopeFactory, WorkspaceAccess access) : ControllerBase
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

    [AllowAnonymous, HttpGet("hs-codes/{id:guid}/official-letter")]
    public async Task<IActionResult> OfficialLetter(Guid id, CancellationToken ct)
    {
        if (!CanRead()) return Challenge();
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        var letter = await db.HsCodes.AsNoTracking().Where(x => x.Id == id)
            .Select(x => new { x.OfficialLetterContent, x.OfficialLetterContentType, x.OfficialLetterFileName })
            .SingleOrDefaultAsync(ct);
        if (letter is null || letter.OfficialLetterContent.Length == 0) return NotFound(new { message = "No official letter is attached to this HS code." });
        return File(letter.OfficialLetterContent, letter.OfficialLetterContentType, letter.OfficialLetterFileName);
    }

    [Authorize(Policy = "SystemAdministrator"), RequestSizeLimit(20_000_000), HttpPost("hs-codes")]
    public async Task<IActionResult> Create([FromBody] HsCodeWriteRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        var code = NormalizeWriteCode(request.Code);
        if (code.Length != 6 || !code.All(char.IsDigit)) return BadRequest(new { message = "HS code must contain exactly 6 digits." });
        var letter = ReadOfficialLetter(request);
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        if (!await db.HsRevisions.AnyAsync(x => x.Id == request.RevisionId, ct)) return BadRequest(new { message = "Select a valid HS revision." });
        if (await db.HsCodes.AnyAsync(x => x.RevisionId == request.RevisionId && x.Code == code, ct)) return Conflict(new { message = "That HS code already exists in this revision." });
        var entity = new HsCode { Id = Guid.NewGuid(), RevisionId = request.RevisionId, Code = code, DescriptionEn = request.DescriptionEn.Trim(), DescriptionAm = request.DescriptionAm?.Trim(), OfficialLetterFileName = letter.FileName, OfficialLetterContentType = letter.ContentType, OfficialLetterContent = letter.Content };
        db.HsCodes.Add(entity);
        AddTariffLine(db, entity.Id, request, code);
        await db.SaveChangesAsync(ct);
        access.Audit("HS_CODE_CREATED", "HS Codes", entity.Id, null, Snapshot(entity, request), $"Created HS code with official letter: {letter.FileName}");
        await access.SaveChangesAsync(ct);
        return Created($"/api/hs-codes/{entity.Id}/detail", new { id = entity.Id });
    }

    [Authorize(Policy = "SystemAdministrator"), RequestSizeLimit(20_000_000), HttpPut("hs-codes/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] HsCodeWriteRequest request, CancellationToken ct)
    {
        var code = NormalizeWriteCode(request.Code);
        if (code.Length != 6 || !code.All(char.IsDigit)) return BadRequest(new { message = "HS code must contain exactly 6 digits." });
        var letter = ReadOfficialLetter(request);
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        var entity = await db.HsCodes.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null) return NotFound();
        if (await db.HsCodes.AnyAsync(x => x.Id != id && x.RevisionId == request.RevisionId && x.Code == code, ct)) return Conflict(new { message = "That HS code already exists in this revision." });
        var line = await db.NationalTariffLines.Where(x => x.HsCodeId == id).OrderByDescending(x => x.EffectiveDate).FirstOrDefaultAsync(ct);
        var before = Snapshot(entity, line);
        entity.RevisionId = request.RevisionId; entity.Code = code; entity.DescriptionEn = request.DescriptionEn.Trim(); entity.DescriptionAm = request.DescriptionAm?.Trim(); entity.OfficialLetterFileName = letter.FileName; entity.OfficialLetterContentType = letter.ContentType; entity.OfficialLetterContent = letter.Content;
        if (line is null) AddTariffLine(db, id, request, code); else { line.Code = NormalizeWriteCode(request.TariffItemNo ?? line.Code); line.DescriptionEn = request.TariffDescription?.Trim() ?? line.DescriptionEn; line.Unit = request.Unit?.Trim() ?? line.Unit; line.Duty = request.Duty?.Trim() ?? line.Duty; line.SourceReference = request.SourceReference?.Trim() ?? line.SourceReference; line.EffectiveDate = request.EffectiveDate ?? line.EffectiveDate; }
        await db.SaveChangesAsync(ct);
        access.Audit("HS_CODE_UPDATED", "HS Codes", entity.Id, before, Snapshot(entity, request), $"Updated HS code with official letter: {letter.FileName}");
        await access.SaveChangesAsync(ct);
        return NoContent();
    }

    private sealed record HsAuditSnapshot(Guid RevisionId, string Code, string DescriptionEn, string? DescriptionAm, string TariffItemNo, string TariffDescription, string Unit, string Duty, string SourceReference, DateOnly EffectiveDate, string OfficialLetterFileName, string OfficialLetterContentType);
    private static HsAuditSnapshot Snapshot(HsCode entity, NationalTariffLine? line) => new(entity.RevisionId, entity.Code ?? "", entity.DescriptionEn, entity.DescriptionAm, line?.Code ?? "", line?.DescriptionEn ?? "", line?.Unit ?? "", line?.Duty ?? "", line?.SourceReference ?? "", line?.EffectiveDate ?? DateOnly.MinValue, entity.OfficialLetterFileName, entity.OfficialLetterContentType);
    private static HsAuditSnapshot Snapshot(HsCode entity, HsCodeWriteRequest request) => new(entity.RevisionId, entity.Code ?? "", entity.DescriptionEn, entity.DescriptionAm, NormalizeWriteCode(request.TariffItemNo ?? entity.Code ?? ""), request.TariffDescription?.Trim() ?? request.DescriptionEn.Trim(), request.Unit?.Trim() ?? "", request.Duty?.Trim() ?? "", request.SourceReference?.Trim() ?? "", request.EffectiveDate ?? DateOnly.FromDateTime(DateTime.UtcNow), entity.OfficialLetterFileName, entity.OfficialLetterContentType);
    private static void AddTariffLine(CustomsDbContext db, Guid hsCodeId, HsCodeWriteRequest request, string fallbackCode) => db.NationalTariffLines.Add(new NationalTariffLine { Id = Guid.NewGuid(), HsCodeId = hsCodeId, Code = NormalizeWriteCode(request.TariffItemNo ?? fallbackCode), DescriptionEn = request.TariffDescription?.Trim() ?? request.DescriptionEn.Trim(), DescriptionAm = request.DescriptionAm?.Trim(), Unit = request.Unit?.Trim() ?? "", Duty = request.Duty?.Trim() ?? "", SourceReference = request.SourceReference?.Trim() ?? "", EffectiveDate = request.EffectiveDate ?? DateOnly.FromDateTime(DateTime.UtcNow) });

    private static (string FileName, string ContentType, byte[] Content) ReadOfficialLetter(HsCodeWriteRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.OfficialLetterFileName) || string.IsNullOrWhiteSpace(request.OfficialLetterBase64))
            throw new WorkspaceException(400, "An official supporting letter is required.");
        var fileName = Path.GetFileName(request.OfficialLetterFileName.Trim());
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var contentType = request.OfficialLetterContentType?.Trim() ?? "";
        var allowed = extension is ".pdf" or ".doc" or ".docx" or ".jpg" or ".jpeg" or ".png" or ".gif" or ".bmp" or ".webp" or ".tif" or ".tiff" or ".svg" or ".heic" or ".heif" or ".avif" || contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);
        if (!allowed) throw new WorkspaceException(400, "The official letter must be a PDF, DOC, DOCX, or image file.");
        byte[] content;
        try { content = Convert.FromBase64String(request.OfficialLetterBase64); }
        catch (FormatException) { throw new WorkspaceException(400, "The official letter file is invalid."); }
        if (content.Length == 0) throw new WorkspaceException(400, "The official letter file is empty.");
        if (content.Length > 10_000_000) throw new WorkspaceException(400, "The official letter must be 10 MB or smaller.");
        return (fileName, contentType.Length <= 120 ? contentType : contentType[..120], content);
    }

    private static string NormalizeWriteCode(string value) => value.Replace(".", "", StringComparison.Ordinal).Trim();
    private static bool IsSixDigitHsCode(string value) => value.Length == 6 && value.All(char.IsDigit);
    private static bool IsTariffItemNumber(string value) => value.Length == 8 && value.All(char.IsDigit);
    private static string NormalizeTariffItemCode(string? value)
    {
        var digits = Normalize(value);
        return digits.Length >= 8 ? digits[..8] : "";
    }
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
        if (file is null || file.Length == 0) return BadRequest(new { message = "Attach the HS 2022 tariff JSON file." });
        await using var stream = file.OpenReadStream();
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var metadata = new TariffMetadata();
        List<TariffImportRow> rows;
        if (document.RootElement.ValueKind == JsonValueKind.Array)
        {
            // Keep the original flat importer contract working for existing tariff exports.
            // The HS 2022 envelope uses the richer property names below, while the legacy
            // export used snake_case fields such as hs_code and tariff_item_no.
            var legacyRows = document.RootElement.Deserialize<List<LegacyTariffImportRow>>(options) ?? [];
            rows = legacyRows.Select(row => new TariffImportRow
            {
                HsCode = row.HsCode,
                TariffItemNo = row.TariffItemNo,
                Description = row.Description ?? "",
                StandardUnitOfQuantity = row.Unit,
                DutyRate = row.Duty
            }).ToList();
        }
        else
        {
            metadata = document.RootElement.TryGetProperty("metadata", out var metadataElement) ? metadataElement.Deserialize<TariffMetadata>(options) ?? new() : new();
            rows = document.RootElement.TryGetProperty("tariffSchedule", out var schedule) ? schedule.Deserialize<List<TariffImportRow>>(options) ?? [] : [];
        }
        if (rows.Count == 0) return BadRequest(new { message = "The tariff file contains no records." });
        var invalid = rows.Count(r => string.IsNullOrWhiteSpace(r.Description) || (r.HsCode is not null && Normalize(r.HsCode).Length != 6));
        if (invalid > 0) return BadRequest(new { message = $"The tariff file contains {invalid} invalid descriptions or HS codes." });

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomsDbContext>();
        var revisionNumber = string.Equals(metadata.UpdatedHsVersion, "HS 2022", StringComparison.OrdinalIgnoreCase) ? 2022 : 5;
        var revision = await db.HsRevisions.FirstOrDefaultAsync(r => r.Number == revisionNumber, ct);
        if (revision is null) { revision = new HsRevision { Id = Guid.NewGuid(), Number = revisionNumber }; db.HsRevisions.Add(revision); }
        revision.Name = string.IsNullOrWhiteSpace(metadata.UpdatedHsVersion) ? "Ethiopian Customs Tariff" : $"Ethiopia Customs Tariff {metadata.UpdatedHsVersion}";
        revision.EffectiveDate = new DateOnly(2022, 1, 1); revision.Status = "Active"; revision.SourceReference = file.FileName;
        revision.OriginalHsVersion = metadata.OriginalHsVersion ?? ""; revision.UpdatedHsVersion = metadata.UpdatedHsVersion ?? ""; revision.TotalRecords = rows.Count; revision.MetadataJson = document.RootElement.TryGetProperty("metadata", out var metaJson) ? metaJson.GetRawText() : "{}";
        await db.HsRevisions.Where(r => r.Id != revision.Id && r.Status == "Active").ExecuteUpdateAsync(setters => setters.SetProperty(r => r.Status, "Archived"), ct);

        var existingCodes = await db.HsCodes.Where(c => c.RevisionId == revision.Id).ToListAsync(ct);
        var codeMap = existingCodes.Where(c => c.Code is not null).ToDictionary(c => c.Code!, StringComparer.OrdinalIgnoreCase);
        var nullCodeMap = existingCodes.Where(c => c.Code is null).ToDictionary(c => c.DescriptionEn + "|" + c.HeadingNumber, StringComparer.OrdinalIgnoreCase);
        var existingCodeIds = existingCodes.Select(c => c.Id).ToArray();
        var existingLines = existingCodeIds.Length == 0 ? [] : await db.NationalTariffLines.Where(line => existingCodeIds.Contains(line.HsCodeId)).ToListAsync(ct);
        var lineMap = existingLines.ToDictionary(line => $"{line.HsCodeId:N}|{line.Code}|{line.EffectiveDate:yyyy-MM-dd}", StringComparer.OrdinalIgnoreCase);
        var lineKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var mappings = new List<HsCodeUpdateMapping>();
        foreach (var (row, index) in rows.Select((value, index) => (value, index)))
        {
            var code = NormalizeNullable(row.HsCode);
            HsCode entity;
            if (code is not null && codeMap.TryGetValue(code, out var keyed)) entity = keyed;
            else if (code is null && nullCodeMap.TryGetValue(Clean(row.Description) + "|" + (row.HeadingNumber ?? ""), out var nullKeyed)) entity = nullKeyed;
            else
            {
                entity = new HsCode { Id = Guid.NewGuid(), RevisionId = revision.Id, Code = code, DescriptionEn = Clean(row.Description) };
                db.HsCodes.Add(entity);
                if (code is not null) codeMap[code] = entity; else nullCodeMap[Clean(row.Description) + "|" + (row.HeadingNumber ?? "")] = entity;
            }
            entity.DescriptionEn = Clean(row.Description); entity.SectionNumber = row.SectionNumber ?? ""; entity.SectionName = row.SectionName ?? ""; entity.ChapterNumber = row.ChapterNumber; entity.ChapterName = row.ChapterName ?? ""; entity.HeadingNumber = row.HeadingNumber ?? ""; entity.HsUpdateStatus = row.HsUpdateStatus; entity.HsUpdateNote = row.HsUpdateNote; entity.HsUpdateCandidatesJson = JsonSerializer.Serialize(row.HsUpdateCandidates ?? []);
            var lineCode = $"{NormalizeNullable(row.TariffItemNo) ?? "NO-TARIFF"}-{index:D5}";
            lineKeys.Add(lineCode);
            var lineKey = $"{entity.Id:N}|{lineCode}|{revision.EffectiveDate:yyyy-MM-dd}";
            lineMap.TryGetValue(lineKey, out var line);
            if (line is null) { line = new NationalTariffLine { Id = Guid.NewGuid(), HsCodeId = entity.Id, Code = lineCode, EffectiveDate = revision.EffectiveDate }; db.NationalTariffLines.Add(line); }
            lineMap[lineKey] = line;
            line.TariffItemNo = string.IsNullOrWhiteSpace(row.TariffItemNo) ? null : row.TariffItemNo.Trim(); line.DescriptionEn = Clean(row.Description); line.Unit = row.StandardUnitOfQuantity?.Trim() ?? ""; line.Duty = row.DutyRate?.Trim() ?? ""; line.SourceReference = file.FileName;
            if (!string.IsNullOrWhiteSpace(row.HsUpdateStatus))
            {
                var candidates = row.HsUpdateCandidates ?? [];
                if (candidates.Count == 0) mappings.Add(new HsCodeUpdateMapping { Id = Guid.NewGuid(), RevisionId = revision.Id, SourceHsCode = code ?? "", TargetHsCode = code, Status = row.HsUpdateStatus!, Note = row.HsUpdateNote ?? "", SourceReference = file.FileName });
                foreach (var candidate in candidates) mappings.Add(new HsCodeUpdateMapping { Id = Guid.NewGuid(), RevisionId = revision.Id, SourceHsCode = code ?? "", TargetHsCode = NormalizeNullable(candidate.HsCode), TargetDescription = candidate.Description, Status = row.HsUpdateStatus!, Note = row.HsUpdateNote ?? "", SourceReference = file.FileName });
            }
        }
        foreach (var row in rows)
        {
            foreach (var candidate in row.HsUpdateCandidates ?? [])
            {
                var candidateCode = NormalizeNullable(candidate.HsCode);
                if (candidateCode is null) continue;
                var candidateLineCode = $"CANDIDATE-{candidateCode}";
                lineKeys.Add(candidateLineCode);
                if (codeMap.ContainsKey(candidateCode)) continue;
                var candidateEntity = new HsCode { Id = Guid.NewGuid(), RevisionId = revision.Id, Code = candidateCode, DescriptionEn = Clean(candidate.Description), SectionNumber = row.SectionNumber ?? "", SectionName = row.SectionName ?? "", ChapterNumber = row.ChapterNumber, ChapterName = row.ChapterName ?? "", HeadingNumber = row.HeadingNumber ?? "", HsUpdateStatus = "MAPPING_CANDIDATE", HsUpdateNote = row.HsUpdateNote ?? "Candidate generated from an HS 2022 split mapping; verify the official tariff line before assessment." };
                db.HsCodes.Add(candidateEntity); codeMap[candidateCode] = candidateEntity;
                var candidateLine = new NationalTariffLine { Id = Guid.NewGuid(), HsCodeId = candidateEntity.Id, Code = candidateLineCode, TariffItemNo = null, DescriptionEn = Clean(candidate.Description), Unit = row.StandardUnitOfQuantity?.Trim() ?? "", Duty = "", SourceReference = file.FileName, EffectiveDate = revision.EffectiveDate };
                db.NationalTariffLines.Add(candidateLine); lineMap[$"{candidateEntity.Id:N}|{candidateLineCode}|{revision.EffectiveDate:yyyy-MM-dd}"] = candidateLine;
            }
        }
        var revisionCodeIds = await db.HsCodes.Where(c => c.RevisionId == revision.Id).Select(c => c.Id).ToArrayAsync(ct);
        var oldLines = await db.NationalTariffLines.Where(l => revisionCodeIds.Contains(l.HsCodeId) && !lineKeys.Contains(l.Code)).ToListAsync(ct); db.NationalTariffLines.RemoveRange(oldLines);
        var oldMappings = await db.HsCodeUpdateMappings.Where(m => m.RevisionId == revision.Id).ToListAsync(ct); db.HsCodeUpdateMappings.RemoveRange(oldMappings); db.HsCodeUpdateMappings.AddRange(mappings);
        await db.SaveChangesAsync(ct);
        return Ok(new { revisionId = revision.Id, hsCodes = await db.HsCodes.CountAsync(x => x.RevisionId == revision.Id, ct), tariffItems = rows.Count, mappings = mappings.Count, source = file.FileName });
    }

    private static string Normalize(string? value) => (value ?? "").Replace(".", "", StringComparison.Ordinal).Trim();
    private static string? NormalizeNullable(string? value)
    {
        var normalized = Normalize(value);
        return normalized.Length == 0 ? null : normalized;
    }
    private static string Clean(string value) => value.Trim().TrimStart('-', ' ');
    private sealed class TariffMetadata { public string? OriginalHsVersion { get; set; } public string? UpdatedHsVersion { get; set; } }
    private sealed class TariffCandidate { public string HsCode { get; set; } = ""; public string Description { get; set; } = ""; }
    private sealed class LegacyTariffImportRow
    {
        [JsonPropertyName("hs_code")] public string? HsCode { get; set; }
        [JsonPropertyName("tariff_item_no")] public string? TariffItemNo { get; set; }
        [JsonPropertyName("description")] public string? Description { get; set; }
        [JsonPropertyName("unit")] public string? Unit { get; set; }
        [JsonPropertyName("duty")] public string? Duty { get; set; }
    }
    private sealed class TariffImportRow
    {
        public string? TariffItemNo { get; set; } public string? SectionName { get; set; } public string? SectionNumber { get; set; } public string? ChapterName { get; set; } public int? ChapterNumber { get; set; } public string? HeadingNumber { get; set; } public string? HsCode { get; set; } public string Description { get; set; } = ""; public string? StandardUnitOfQuantity { get; set; } public string? DutyRate { get; set; } public string? HsUpdateStatus { get; set; } public string? HsUpdateNote { get; set; } public List<TariffCandidate>? HsUpdateCandidates { get; set; }
    }
}
