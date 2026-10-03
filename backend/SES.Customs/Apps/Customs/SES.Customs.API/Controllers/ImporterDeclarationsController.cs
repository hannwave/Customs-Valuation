using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SES.Customs.API.Security;
using SES.Customs.API.Services;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

public sealed class ImporterSubmissionForm
{
    public Guid? ExpectedVersion { get; set; }
    public Guid LocationId { get; set; }
    public Guid SuggestedTariffLineId { get; set; }
    public string OriginCountryCode { get; set; } = "";
    public string ImportPurpose { get; set; } = "";
    public string PurposeDetails { get; set; } = "";
    public bool IsCommercialProduct { get; set; }
    public bool IsMachineryOrEquipment { get; set; }
    public string[] RequestedTreatments { get; set; } = [];
    public string Brand { get; set; } = "";
    public string Model { get; set; } = "";
    public string ProductName { get; set; } = "";
    public string Description { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public string SerialOrPartNumber { get; set; } = "";
    public string Specifications { get; set; } = "";
    public decimal Quantity { get; set; }
    public string Unit { get; set; } = "";
    public IFormFile? CommercialInvoice { get; set; }
    public IFormFile? PackingList { get; set; }
    public IFormFile? CertificateOfOrigin { get; set; }
}

public sealed record ImporterReviewRequest(string Action, Guid? ConfirmedTariffLineId, string? Note, Guid ExpectedVersion);

[ApiController, Route("api/importer-declarations"), Authorize(Roles = "Importer,CustomsOfficer"), ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class ImporterDeclarationsController(CustomsDbContext db, WorkspaceAccess access, IMemoryCache cache) : ControllerBase
{
    private static readonly string[] DocumentKinds = ["COMMERCIAL_INVOICE", "PACKING_LIST", "CERTIFICATE_OF_ORIGIN"];
    private static readonly string[] SectionOrder = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];
    private static readonly SemaphoreSlim TariffCacheLock = new(1, 1);
    private static readonly HashSet<string> Purposes = ["MANUFACTURING", "COMMERCIAL_RESALE", "PERSONAL", "INSTITUTIONAL", "OTHER"];
    private static readonly HashSet<string> Treatments = ["WITHHOLDING_REVIEW", "VAT_EXEMPTION", "CUSTOMS_DUTY_EXEMPTION", "MACHINERY_EXEMPTION"];
    private sealed record TariffEntry(Guid TariffLineId, Guid HsCodeId, string HsCode, string HsDescription, string SectionNumber, string SectionName, string Chapter, string ChapterName, string Heading, string TariffItemNo, string Description);
    private static string[] SearchVariants(string word) => word.ToLowerInvariant() switch
    {
        "mobile" => ["mobile", "cellular", "wireless", "smartphone"],
        "phone" or "phones" => ["phone", "telephone", "smartphone"],
        "laptop" or "laptops" => ["laptop", "portable computer", "portable automatic data processing"],
        "car" or "cars" => ["car", "motor vehicle"],
        _ => [word]
    };
    private static bool Matches(TariffEntry entry, string word) =>
        entry.Description.Contains(word, StringComparison.OrdinalIgnoreCase) ||
        entry.HsDescription.Contains(word, StringComparison.OrdinalIgnoreCase) ||
        entry.SectionName.Contains(word, StringComparison.OrdinalIgnoreCase) ||
        entry.ChapterName.Contains(word, StringComparison.OrdinalIgnoreCase) ||
        entry.Heading.Contains(word, StringComparison.OrdinalIgnoreCase) ||
        entry.HsCode.Contains(word, StringComparison.OrdinalIgnoreCase) ||
        entry.TariffItemNo.Contains(word, StringComparison.OrdinalIgnoreCase);

    [HttpGet("locations")]
    public async Task<IActionResult> Locations(CancellationToken ct)
    {
        access.Require(AccessRules.Importer);
        var now = DateTimeOffset.UtcNow;
        return Ok(await db.CustomsLocations.AsNoTracking().Where(x => x.LocationType == "BRANCH" && x.Status == "ACTIVE" && x.SupportsImport && x.EffectiveFrom <= now && (x.EffectiveTo == null || x.EffectiveTo > now))
            .OrderBy(x => x.Name).Select(x => new { x.Id, x.DisplayName, x.OfficialCode, x.Region }).ToListAsync(ct));
    }

    [HttpGet("catalog")]
    public async Task<IActionResult> Catalog([FromQuery] string stage = "sections", [FromQuery] string? section = null, [FromQuery] string? chapter = null, [FromQuery] string? heading = null, [FromQuery] string? q = null, CancellationToken ct = default)
    {
        access.Require(AccessRules.Importer, AccessRules.Officer);
        var entries = await TariffCatalog(ct);
        var filtered = entries.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(section)) filtered = filtered.Where(x => x.SectionNumber == section);
        if (!string.IsNullOrWhiteSpace(chapter)) filtered = filtered.Where(x => x.Chapter == chapter);
        if (!string.IsNullOrWhiteSpace(heading)) filtered = filtered.Where(x => x.Heading == heading);
        var term = q?.Trim() ?? "";
        if (term.Length > 100) return BadRequest(new { message = "Search with 100 characters or fewer." });
        var terms = term.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(SearchVariants).ToArray();
        if (terms.Length > 0) filtered = filtered.Where(x => terms.Any(variants => variants.Any(word => Matches(x, word))));
        var matches = filtered.ToArray();
        var ordered = matches.OrderByDescending(x => terms.Count(variants => variants.Any(word => Matches(x, word))))
            .ThenBy(x => term.Length == 0 ? 0 :
                x.Description.StartsWith(term, StringComparison.OrdinalIgnoreCase) ? 0 :
                x.HsDescription.StartsWith(term, StringComparison.OrdinalIgnoreCase) ? 1 :
                x.Description.Contains(term, StringComparison.OrdinalIgnoreCase) ? 2 : 3)
            .ThenBy(x => x.HsCode).ThenBy(x => x.TariffItemNo);
        return stage switch
        {
            "sections" => Ok(matches.GroupBy(x => x.SectionNumber).OrderBy(x => { var position = Array.IndexOf(SectionOrder, x.Key); return position < 0 ? int.MaxValue : position; }).Select(g => new { code = g.Key, name = g.First().SectionName, count = g.Count() }).ToArray()),
            "chapters" => Ok(matches.GroupBy(x => x.Chapter).OrderBy(x => x.Key).Select(g => new { code = g.Key, name = g.First().ChapterName, count = g.Count() }).ToArray()),
            "headings" => Ok(matches.GroupBy(x => x.Heading).OrderBy(x => x.Key).Select(g => new { code = g.Key, name = g.First().Heading, count = g.Count() }).ToArray()),
            "tariffs" or "search" => Ok(new { total = matches.Length, items = ordered.Take(stage == "search" ? 80 : 100).Select(x => new { x.TariffLineId, x.HsCodeId, x.HsCode, x.HsDescription, x.TariffItemNo, x.Description, x.SectionNumber, x.SectionName, x.Chapter, x.ChapterName, x.Heading }).ToArray() }),
            _ => BadRequest(new { message = "Unknown catalogue stage." })
        };
    }

    private async Task<TariffEntry[]> TariffCatalog(CancellationToken ct)
    {
        if (cache.TryGetValue("importer-tariff-catalog", out TariffEntry[]? cached) && cached is not null) return cached;
        await TariffCacheLock.WaitAsync(ct);
        try
        {
            if (cache.TryGetValue("importer-tariff-catalog", out cached) && cached is not null) return cached;
            var entries = await DatabaseConnectionRetry.ExecuteReadAsync(() => LoadTariffEntries(ct), ct);
            cache.Set("importer-tariff-catalog", entries, TimeSpan.FromMinutes(10));
            return entries;
        }
        finally { TariffCacheLock.Release(); }
    }

    private async Task<TariffEntry[]> LoadTariffEntries(CancellationToken ct)
    {
        var revision = await db.HsRevisions.AsNoTracking().Where(x => x.Status == "Active").OrderByDescending(x => x.EffectiveDate).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
        revision ??= await db.HsRevisions.AsNoTracking().OrderByDescending(x => x.EffectiveDate).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
        if (revision is null) return [];
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var rows = await (from line in db.NationalTariffLines.AsNoTracking()
                          join hs in db.HsCodes.AsNoTracking() on line.HsCodeId equals hs.Id
                          where hs.RevisionId == revision && line.EffectiveDate <= today && (line.EndDate == null || line.EndDate >= today)
                          select new { HsCodeId = hs.Id, TariffLineId = line.Id, hs.Code, HsDescription = hs.DescriptionEn, hs.SectionNumber, hs.SectionName, hs.ChapterNumber, hs.ChapterName, hs.HeadingNumber, line.TariffItemNo, line.DescriptionEn }).ToListAsync(ct);
        return rows.Select(x => {
            var code = x.Code ?? "";
            var digits = new string(code.Where(char.IsDigit).ToArray());
            var chapter = digits.Length >= 2 ? digits[..2] : x.ChapterNumber?.ToString("00", CultureInfo.InvariantCulture) ?? "00";
            var heading = digits.Length >= 4 ? $"{digits[..2]}.{digits.Substring(2, 2)}" : x.HeadingNumber ?? chapter;
            var section = HsCodesController.SectionForChapter(chapter);
            return new TariffEntry(x.TariffLineId, x.HsCodeId, code, x.HsDescription ?? "", section.Code, section.Name,
                chapter, string.IsNullOrWhiteSpace(x.ChapterName) ? $"Chapter {chapter}" : x.ChapterName,
                heading, x.TariffItemNo ?? "", x.DescriptionEn ?? "");
        }).ToArray();
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var query = db.ImporterDeclarations.AsNoTracking().AsQueryable();
        if (access.Role == AccessRules.Importer) query = query.Where(x => x.ImporterId == access.UserId);
        else { access.Require(AccessRules.Officer); var scope = await access.Locations(ct); query = query.Where(x => scope.Contains(x.LocationId)); }
        return Ok((await query.OrderByDescending(x => x.SubmittedAt).Take(100).ToListAsync(ct)).Select(Summary));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) => Ok(Detail(await Accessible(id, ct)));

    [HttpGet("{id:guid}/documents/{kind}")]
    public async Task<IActionResult> Document(Guid id, string kind, CancellationToken ct)
    {
        var declaration = await Accessible(id, ct);
        var document = declaration.Documents.FirstOrDefault(x => x.Kind == kind.ToUpperInvariant());
        return document is null ? NotFound(new { message = "Document not found." }) : File(document.Content, document.ContentType);
    }

    [HttpPost, RequestSizeLimit(32_000_000)]
    public Task<IActionResult> Submit([FromForm] ImporterSubmissionForm form, CancellationToken ct) => Save(null, form, ct);

    [HttpPut("{id:guid}"), RequestSizeLimit(32_000_000)]
    public Task<IActionResult> Resubmit(Guid id, [FromForm] ImporterSubmissionForm form, CancellationToken ct) => Save(id, form, ct);

    private async Task<IActionResult> Save(Guid? id, ImporterSubmissionForm form, CancellationToken ct)
    {
        access.Require(AccessRules.Importer);
        var location = await DatabaseConnectionRetry.ExecuteReadAsync(() => db.CustomsLocations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == form.LocationId && x.LocationType == "BRANCH" && x.Status == "ACTIVE" && x.SupportsImport, ct), ct);
        if (location is null) return BadRequest(new { message = "Choose an active importing customs branch." });
        var catalogue = await TariffCatalog(ct);
        var suggestion = catalogue.FirstOrDefault(x => x.TariffLineId == form.SuggestedTariffLineId);
        if (suggestion is null) return BadRequest(new { message = "Select an item from the current tariff book." });
        var origin = form.OriginCountryCode.Trim().ToUpperInvariant();
        string originName;
        try { originName = origin == "XK" ? "Kosovo" : new RegionInfo(origin).EnglishName; }
        catch (ArgumentException) { return BadRequest(new { message = "Select a valid country of origin." }); }
        var purpose = form.ImportPurpose.Trim().ToUpperInvariant();
        if (!Purposes.Contains(purpose)) return BadRequest(new { message = "Select a valid import purpose." });
        if (form.ProductName.Trim().Length is < 2 or > 300 || form.Description.Trim().Length is < 20 or > 4000 || form.Quantity <= 0 || form.Unit.Trim().Length is < 1 or > 40)
            return BadRequest(new { message = "Provide the product name, detailed description, positive quantity and unit." });
        var commercialProduct = form.IsCommercialProduct || purpose == "COMMERCIAL_RESALE";
        if (commercialProduct && (form.Brand.Trim().Length is < 1 or > 120 || form.Model.Trim().Length is < 1 or > 120))
            return BadRequest(new { message = "Brand and model are required for a commercial product." });
        if (form.PurposeDetails.Length > 1000 || form.Manufacturer.Length > 200 || form.SerialOrPartNumber.Length > 200 || form.Specifications.Length > 2000)
            return BadRequest(new { message = "One or more detail fields exceed the allowed length." });
        var requested = (form.RequestedTreatments ?? []).Distinct(StringComparer.Ordinal).ToArray();
        if (requested.Any(x => !Treatments.Contains(x)) || (purpose != "MANUFACTURING" && requested.Length > 0))
            return BadRequest(new { message = "Special tax treatment may be requested only for manufacturing imports." });
        ImporterDeclaration declaration;
        if (id.HasValue)
        {
            declaration = await db.ImporterDeclarations.Include(x => x.Documents).FirstOrDefaultAsync(x => x.Id == id && x.ImporterId == access.UserId, ct) ?? throw new WorkspaceException(404, "Declaration not found.");
            if (declaration.Status != "INFORMATION_REQUESTED" || declaration.Version != form.ExpectedVersion)
                return Conflict(new { message = "This declaration cannot be edited now. Refresh to see its current review status." });
        }
        else
        {
            declaration = new ImporterDeclaration { Id = Guid.NewGuid(), ImporterId = access.UserId, Reference = $"IMP-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}" };
            db.ImporterDeclarations.Add(declaration);
        }
        var uploads = new (string Kind, IFormFile? File)[] { (DocumentKinds[0], form.CommercialInvoice), (DocumentKinds[1], form.PackingList), (DocumentKinds[2], form.CertificateOfOrigin) };
        var total = uploads.Sum(x => x.File?.Length ?? 0);
        if (total > 30_000_000) return BadRequest(new { message = "The combined document upload must be 30 MB or smaller." });
        foreach (var (kind, file) in uploads)
        {
            if (file is null && declaration.Documents.All(x => x.Kind != kind)) return BadRequest(new { message = $"{kind.Replace('_', ' ')} is required." });
            if (file is null) continue;
            var replacement = await ReadDocument(file, kind, declaration.Id, ct);
            if (declaration.Documents.FirstOrDefault(x => x.Kind == kind) is { } existing)
            {
                existing.FileName = replacement.FileName; existing.ContentType = replacement.ContentType; existing.Size = replacement.Size;
                existing.Sha256 = replacement.Sha256; existing.Content = replacement.Content; existing.UploadedAt = replacement.UploadedAt;
            }
            else declaration.Documents.Add(replacement);
        }
        declaration.LocationId = location.Id; declaration.SuggestedHsCodeId = suggestion.HsCodeId; declaration.SuggestedTariffLineId = suggestion.TariffLineId;
        declaration.SuggestedTariffDescription = suggestion.Description; declaration.OriginCountryCode = origin; declaration.OriginCountryName = originName;
        declaration.ImportPurpose = purpose; declaration.PurposeDetails = form.PurposeDetails.Trim();
        declaration.IsCommercialProduct = commercialProduct; declaration.IsMachineryOrEquipment = purpose == "MANUFACTURING" && form.IsMachineryOrEquipment;
        declaration.RequestedTreatmentsJson = JsonSerializer.Serialize(requested);
        declaration.Brand = form.Brand.Trim(); declaration.Model = form.Model.Trim(); declaration.ProductName = form.ProductName.Trim();
        declaration.Description = form.Description.Trim(); declaration.Manufacturer = form.Manufacturer.Trim();
        declaration.SerialOrPartNumber = form.SerialOrPartNumber.Trim(); declaration.Specifications = form.Specifications.Trim();
        declaration.Quantity = form.Quantity; declaration.Unit = form.Unit.Trim();
        declaration.Status = "SUBMITTED"; declaration.SubmittedAt = DateTimeOffset.UtcNow; declaration.UpdatedAt = declaration.SubmittedAt;
        declaration.Version = Guid.NewGuid(); declaration.ReviewNote = ""; declaration.ReviewedAt = null; declaration.ReviewedById = null;
        Audit(declaration, id.HasValue ? "IMPORTER_DECLARATION_RESUBMITTED" : "IMPORTER_DECLARATION_SUBMITTED", null);
        await DatabaseConnectionRetry.ExecuteWriteAfterDnsFailureAsync(() => db.SaveChangesAsync(ct), ct);
        return id.HasValue ? Ok(Detail(declaration)) : Created($"/api/importer-declarations/{declaration.Id}", Detail(declaration));
    }

    [HttpPost("{id:guid}/review")]
    public async Task<IActionResult> Review(Guid id, ImporterReviewRequest input, CancellationToken ct)
    {
        access.Require(AccessRules.Officer);
        var declaration = await Accessible(id, ct);
        if (declaration.Version != input.ExpectedVersion) return Conflict(new { message = "The declaration changed. Refresh before reviewing it." });
        var action = input.Action.Trim().ToUpperInvariant();
        var note = input.Note?.Trim() ?? "";
        if (note.Length > 2000) return BadRequest(new { message = "Review notes must be 2,000 characters or fewer." });
        if (action == "CONTINUE_ASSESSMENT")
        {
            if (declaration.Status != "VERIFIED" || !declaration.ConfirmedHsCodeId.HasValue) return Conflict(new { message = "Verify the HS mapping before starting assessment." });
            declaration.Status = "ASSESSMENT_READY";
        }
        else
        {
            if (declaration.Status != "SUBMITTED") return Conflict(new { message = "Only submitted declarations can be reviewed." });
            if (action == "REQUEST_INFORMATION")
            {
                if (note.Length < 10) return BadRequest(new { message = "Explain what additional information is required." });
                declaration.Status = "INFORMATION_REQUESTED";
            }
            else if (action == "REJECT")
            {
                if (note.Length < 10) return BadRequest(new { message = "Explain why the declaration was rejected." });
                declaration.Status = "REJECTED";
            }
            else if (action == "APPROVE_INFORMATION")
            {
                var confirmed = (await TariffCatalog(ct)).FirstOrDefault(x => x.TariffLineId == input.ConfirmedTariffLineId);
                if (confirmed is null)
                    return BadRequest(new { message = "Select a current tariff item to verify the HS mapping." });
                declaration.ConfirmedHsCodeId = confirmed.HsCodeId; declaration.ConfirmedTariffLineId = confirmed.TariffLineId;
                declaration.Status = "VERIFIED";
            }
            else return BadRequest(new { message = "Unknown review action." });
        }
        declaration.ReviewNote = note; declaration.ReviewedById = access.UserId; declaration.ReviewedAt = DateTimeOffset.UtcNow;
        declaration.UpdatedAt = declaration.ReviewedAt.Value; declaration.Version = Guid.NewGuid();
        Audit(declaration, $"IMPORTER_DECLARATION_{declaration.Status}", note);
        await db.SaveChangesAsync(ct);
        return Ok(Detail(declaration));
    }

    private async Task<ImporterDeclaration> Accessible(Guid id, CancellationToken ct)
    {
        var declaration = await db.ImporterDeclarations.Include(x => x.Documents).FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new WorkspaceException(404, "Declaration not found.");
        if (access.Role == AccessRules.Importer && declaration.ImporterId == access.UserId) return declaration;
        if (access.Role == AccessRules.Officer && (await access.Locations(ct)).Contains(declaration.LocationId)) return declaration;
        throw new WorkspaceException(403, "This declaration is outside your access.");
    }

    private static async Task<ImporterDocument> ReadDocument(IFormFile file, string kind, Guid declarationId, CancellationToken ct)
    {
        if (file.Length is < 1 or > 10_000_000) throw new WorkspaceException(400, "Each document must be between 1 byte and 10 MB.");
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var contentType = extension switch { ".pdf" => "application/pdf", ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png", _ => "" };
        if (contentType.Length == 0) throw new WorkspaceException(400, "Documents must be PDF, JPG, JPEG or PNG files.");
        await using var stream = file.OpenReadStream();
        using var output = new MemoryStream();
        await stream.CopyToAsync(output, ct);
        var bytes = output.ToArray();
        var valid = contentType switch
        {
            "application/pdf" => bytes.Length >= 5 && bytes.AsSpan(0, 5).SequenceEqual("%PDF-"u8),
            "image/jpeg" => bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff,
            "image/png" => bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a }),
            _ => false
        };
        if (!valid) throw new WorkspaceException(400, "Document content does not match its file type.");
        return new ImporterDocument { Id = Guid.NewGuid(), DeclarationId = declarationId, Kind = kind,
            FileName = Path.GetFileName(file.FileName), ContentType = contentType, Size = bytes.Length,
            Sha256 = Convert.ToHexString(SHA256.HashData(bytes)), Content = bytes, UploadedAt = DateTimeOffset.UtcNow };
    }

    private void Audit(ImporterDeclaration declaration, string action, string? note)
    {
        db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = access.UserId.ToString(), SubjectUserId = declaration.ImporterId,
            Username = User.Identity?.Name ?? "", OccurredAt = DateTimeOffset.UtcNow, Action = action, Module = "ImporterDeclarations",
            RecordId = declaration.Id, LocationId = declaration.LocationId, Decision = declaration.Status, Justification = note,
            NewValueJson = JsonSerializer.Serialize(new { declaration.Reference, declaration.Status, declaration.SuggestedHsCodeId, declaration.SuggestedTariffLineId, declaration.ConfirmedHsCodeId, declaration.ConfirmedTariffLineId, declaration.ImportPurpose }) });
    }

    private static object Summary(ImporterDeclaration x) => new { x.Id, x.Reference, x.Status, x.ProductName, x.ImportPurpose, x.OriginCountryName,
        x.SuggestedHsCodeId, x.SuggestedTariffLineId, x.ConfirmedHsCodeId, x.ConfirmedTariffLineId, x.LocationId, x.SubmittedAt, x.UpdatedAt, x.Version };

    private static object Detail(ImporterDeclaration x) => new { x.Id, x.Reference, x.Status, x.ImporterId, x.LocationId,
        x.SuggestedHsCodeId, x.SuggestedTariffLineId, x.SuggestedTariffDescription, x.ConfirmedHsCodeId, x.ConfirmedTariffLineId, x.OriginCountryCode, x.OriginCountryName,
        x.ImportPurpose, x.PurposeDetails, x.IsCommercialProduct, x.IsMachineryOrEquipment,
        requestedTreatments = JsonSerializer.Deserialize<string[]>(x.RequestedTreatmentsJson) ?? [], x.Brand, x.Model, x.ProductName,
        x.Description, x.Manufacturer, x.SerialOrPartNumber, x.Specifications, x.Quantity, x.Unit,
        x.ReviewNote, x.ReviewedById, x.ReviewedAt, x.SubmittedAt, x.UpdatedAt, x.Version,
        documents = x.Documents.Select(d => new { d.Kind, d.FileName, d.ContentType, d.Size, d.Sha256, d.UploadedAt }).ToArray() };
}
