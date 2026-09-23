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
    private static string? NormalizeNullable(string? value) { var normalized = Normalize(value); return normalized.Length == 0 ? null : normalized; }
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
