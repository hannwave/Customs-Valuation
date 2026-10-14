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
    public decimal? InvoiceAmount { get; set; }
    public string InvoiceCurrency { get; set; } = "";
    public decimal? FreightAmount { get; set; }
    public decimal? InsuranceAmount { get; set; }
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
    private static readonly string[] QueueStatuses = ["SUBMITTED", "INFORMATION_REQUESTED", "VERIFIED", "ASSESSMENT_READY", "IN_ASSESSMENT", "ASSESSED", "REJECTED"];
    private const decimal MaxMoney = 1_000_000_000_000m;
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

    /// <summary>Officer work queue: every declaration lodged at the officer's branches, with importer, HS and value at a glance.</summary>
    [HttpGet("queue")]
    public async Task<IActionResult> Queue([FromQuery] string? status, [FromQuery] string? q, CancellationToken ct)
    {
        access.Require(AccessRules.Officer);
        var scope = await access.Locations(ct);
        var rows = await db.ImporterDeclarations.AsNoTracking().Where(x => scope.Contains(x.LocationId))
            .OrderByDescending(x => x.UpdatedAt).Take(500)
            .Select(x => new { x.Id, x.Reference, x.Status, x.ProductName, x.Brand, x.Model, x.Quantity, x.Unit, x.OriginCountryCode, x.OriginCountryName, x.ImporterId, x.LocationId,
                x.SuggestedTariffLineId, x.ConfirmedTariffLineId, x.InvoiceAmount, x.InvoiceCurrency, x.AssessedPayable, x.AssessmentCurrency, x.SubmittedAt, x.UpdatedAt })
            .ToListAsync(ct);
        var importerIds = rows.Select(x => x.ImporterId).Distinct().ToList();
        var profiles = await db.ImporterProfiles.AsNoTracking().Where(p => importerIds.Contains(p.AccountId)).Select(p => new { p.AccountId, p.LegalName, p.Tin, p.ImporterType }).ToListAsync(ct);
        var accounts = await db.AuthAccounts.AsNoTracking().Where(a => importerIds.Contains(a.Id)).Select(a => new { a.Id, a.FullName }).ToListAsync(ct);
        var lineIds = rows.Select(x => x.ConfirmedTariffLineId ?? x.SuggestedTariffLineId).Where(x => x.HasValue).Select(x => x!.Value).Distinct().ToList();
        var lines = await db.NationalTariffLines.AsNoTracking().Where(l => lineIds.Contains(l.Id)).Select(l => new { l.Id, l.NationalCode, l.TariffItemNo, l.Code }).ToListAsync(ct);
        var locationIds = rows.Select(x => x.LocationId).Distinct().ToList();
        var branches = await db.CustomsLocations.AsNoTracking().Where(l => locationIds.Contains(l.Id)).Select(l => new { l.Id, l.DisplayName, l.Name, l.OfficialCode }).ToListAsync(ct);
        var items = rows.Select(x =>
        {
            var profile = profiles.FirstOrDefault(p => p.AccountId == x.ImporterId);
            var line = lines.FirstOrDefault(l => l.Id == (x.ConfirmedTariffLineId ?? x.SuggestedTariffLineId));
            var branch = branches.FirstOrDefault(b => b.Id == x.LocationId);
            return new
            {
                x.Id, x.Reference, x.Status, x.ProductName, x.Brand, x.Model, x.Quantity, x.Unit, x.OriginCountryCode, x.OriginCountryName,
                importerName = profile?.LegalName ?? accounts.FirstOrDefault(a => a.Id == x.ImporterId)?.FullName ?? "",
                importerTin = profile?.Tin ?? "", importerType = profile?.ImporterType ?? "",
                hsCode = line?.TariffItemNo ?? line?.Code ?? "", nationalCode = line?.NationalCode ?? "", hsConfirmed = x.ConfirmedTariffLineId.HasValue,
                branch = branch is null ? "" : string.IsNullOrWhiteSpace(branch.DisplayName) ? branch.Name : branch.DisplayName,
                x.InvoiceAmount, x.InvoiceCurrency, x.AssessedPayable, x.AssessmentCurrency, x.SubmittedAt, x.UpdatedAt
            };
        }).ToList();
        var counts = QueueStatuses.ToDictionary(code => code, code => items.Count(item => item.Status == code));
        var wanted = (status ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(x => x.ToUpperInvariant()).ToHashSet();
        var term = q?.Trim() ?? "";
        if (term.Length > 100) return BadRequest(new { message = "Search with 100 characters or fewer." });
        var filtered = items.Where(item => (wanted.Count == 0 || wanted.Contains(item.Status)) && (term.Length == 0 ||
            new[] { item.Reference, item.ProductName, item.Brand, item.Model, item.importerName, item.importerTin, item.hsCode, item.nationalCode, item.OriginCountryName }
                .Any(value => value.Contains(term, StringComparison.OrdinalIgnoreCase))));
        return Ok(new { counts, total = items.Count, items = filtered.Take(200).ToList() });
    }

    /// <summary>Everything an officer needs to review, value, tax and finalise one declaration.</summary>
    [HttpGet("{id:guid}/case")]
    public async Task<IActionResult> Case(Guid id, CancellationToken ct)
    {
        access.Require(AccessRules.Officer);
        var declaration = await Accessible(id, ct);
        var profile = await db.ImporterProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.AccountId == declaration.ImporterId, ct);
        var account = await db.AuthAccounts.AsNoTracking().Where(a => a.Id == declaration.ImporterId).Select(a => new { a.FullName, a.Email }).FirstOrDefaultAsync(ct);
        var branch = await db.CustomsLocations.AsNoTracking().Where(l => l.Id == declaration.LocationId).Select(l => new { l.Id, l.DisplayName, l.Name, l.OfficialCode, l.Region }).FirstOrDefaultAsync(ct);
        var officerLocation = await db.AuthAccounts.AsNoTracking().Where(a => a.Id == access.UserId).Select(a => a.PrimaryLocationId).FirstOrDefaultAsync(ct);
        var decision = await db.ValuationDecisions.AsNoTracking().Where(d => d.ImporterDeclarationId == declaration.Id)
            .Select(d => new { d.Id, d.Status, d.SelectedReferenceValue, d.Currency, d.ValuationMethod, d.SelectedPriceSource, d.OfficerSubjectId, d.RecordedAt, d.SubmittedAt, d.Justification }).FirstOrDefaultAsync(ct);
        var assessment = decision is null ? null : await db.ValuationPhase2s.AsNoTracking().Where(p => p.ValuationDecisionId == decision.Id)
            .Select(p => new { p.Id, p.Status, p.CustomsValueAmount, p.TotalTax, p.FinalAmount, p.TargetCurrency, p.OfficerConfirmed, p.CalculatedAt }).FirstOrDefaultAsync(ct);
        var recordIds = new List<Guid> { declaration.Id };
        if (decision is not null) recordIds.Add(decision.Id);
        if (assessment is not null) recordIds.Add(assessment.Id);
        var history = await db.AuditLogs.AsNoTracking().Where(a => recordIds.Contains(a.RecordId)).OrderByDescending(a => a.OccurredAt).Take(60)
            .Select(a => new { a.OccurredAt, a.Action, a.Username, a.Decision, note = a.Justification }).ToListAsync(ct);
        return Ok(new
        {
            declaration = Detail(declaration),
            importer = new { name = account?.FullName ?? "", email = account?.Email ?? "", legalName = profile?.LegalName ?? account?.FullName ?? "", tradeName = profile?.TradeName ?? "",
                tin = profile?.Tin ?? "", importerType = profile?.ImporterType ?? "", verificationStatus = profile?.VerificationStatus ?? "", phone = profile?.Phone ?? "" },
            branch,
            suggestedLine = await LineView(declaration.SuggestedTariffLineId, ct),
            confirmedLine = await LineView(declaration.ConfirmedTariffLineId, ct),
            valuation = decision is null ? null : new { decision.Id, decision.Status, decision.SelectedReferenceValue, decision.Currency, decision.ValuationMethod, decision.SelectedPriceSource,
                decision.RecordedAt, decision.SubmittedAt, decision.Justification, ownedByMe = decision.OfficerSubjectId == access.UserId.ToString() },
            assessment,
            history,
            allowedActions = AllowedActions(declaration.Status),
            canValue = officerLocation == declaration.LocationId
        });
    }

    private async Task<object?> LineView(Guid? lineId, CancellationToken ct)
    {
        if (!lineId.HasValue) return null;
        var line = await db.NationalTariffLines.AsNoTracking().Include(l => l.TaxRates).FirstOrDefaultAsync(l => l.Id == lineId.Value, ct);
        if (line is null) return null;
        var hs = await db.HsCodes.AsNoTracking().FirstOrDefaultAsync(h => h.Id == line.HsCodeId, ct);
        var chapter = hs?.Code is { Length: >= 2 } code ? code[..2] : "";
        var section = chapter.Length == 2 ? HsCodesController.SectionForChapter(chapter) : default;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        return new
        {
            tariffLineId = line.Id, hsCodeId = line.HsCodeId, hsCode = hs?.Code ?? "", hsDescription = hs?.DescriptionEn ?? "", tariffItemNo = line.TariffItemNo ?? "",
            nationalCode = line.NationalCode ?? "", description = line.DescriptionEn, line.Unit, line.Duty, retired = line.EndDate.HasValue && line.EndDate < today,
            chapter, chapterName = hs?.ChapterName ?? "", heading = hs?.HeadingNumber ?? "", sectionNumber = section.Code ?? "", sectionName = section.Name ?? "",
            rates = line.TaxRates.OrderBy(r => r.TaxCode).Select(r => new { r.TaxCode, r.Rate }).ToList()
        };
    }

    /// <summary>Officer actions available for a declaration in the given status.</summary>
    internal static string[] AllowedActions(string status) => status switch
    {
        "SUBMITTED" => ["APPROVE_FOR_VALUATION", "REQUEST_INFORMATION", "REJECT", "RECLASSIFY"],
        "VERIFIED" => ["CONTINUE_ASSESSMENT", "REQUEST_INFORMATION", "REJECT", "RECLASSIFY"],
        "ASSESSMENT_READY" => ["REQUEST_INFORMATION", "REJECT", "RECLASSIFY"],
        "IN_ASSESSMENT" => ["RECLASSIFY"],
        _ => []
    };

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
        var verification = await db.ImporterProfiles.AsNoTracking().Where(x => x.AccountId == access.UserId).Select(x => x.VerificationStatus).FirstOrDefaultAsync(ct);
        if (verification != ImporterVerification.Verified)
            return StatusCode(StatusCodes.Status403Forbidden, new { code = "IMPORTER_NOT_VERIFIED", message = "A Customs Officer must verify your importer account before you can submit declarations." });
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
        var invoiceCurrency = form.InvoiceCurrency.Trim().ToUpperInvariant();
        if (form.InvoiceAmount is not (> 0m and <= MaxMoney) || invoiceCurrency.Length != 3 || !invoiceCurrency.All(char.IsAsciiLetterUpper))
            return BadRequest(new { message = "Enter the price you paid for the shipment and its currency." });
        if (form.FreightAmount is < 0m or > MaxMoney || form.InsuranceAmount is < 0m or > MaxMoney)
            return BadRequest(new { message = "Freight and insurance must be zero or a positive amount." });
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
        declaration.InvoiceAmount = form.InvoiceAmount; declaration.InvoiceCurrency = invoiceCurrency;
        declaration.FreightAmount = form.FreightAmount; declaration.InsuranceAmount = form.InsuranceAmount;
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
        // APPROVE_INFORMATION is the earlier two-step approval (verify, then continue to assessment).
        var allowed = AllowedActions(declaration.Status).Contains(action) || (action == "APPROVE_INFORMATION" && declaration.Status == "SUBMITTED");
        if (!allowed)
            return Conflict(new { message = action is "REQUEST_INFORMATION" or "REJECT" or "APPROVE_INFORMATION" or "APPROVE_FOR_VALUATION" or "CONTINUE_ASSESSMENT" or "RECLASSIFY"
                ? $"This action is not available while the declaration is {declaration.Status.Replace('_', ' ').ToLowerInvariant()}. Refresh to see its current status."
                : "Unknown review action." });
        var link = $"/importer/declarations/{declaration.Id}";
        string auditAction;
        var auditNote = note;
        switch (action)
        {
            case "REQUEST_INFORMATION":
                if (note.Length < 10) return BadRequest(new { message = "Explain what additional information is required." });
                declaration.Status = "INFORMATION_REQUESTED";
                Notify(declaration, "DECLARATION_INFORMATION_REQUESTED", $"Action needed on {declaration.Reference}", note, link);
                break;
            case "REJECT":
                if (note.Length < 10) return BadRequest(new { message = "Explain why the declaration was rejected." });
                declaration.Status = "REJECTED";
                Notify(declaration, "DECLARATION_REJECTED", $"{declaration.Reference} was rejected", note, link);
                break;
            case "CONTINUE_ASSESSMENT":
                if (!declaration.ConfirmedHsCodeId.HasValue) return Conflict(new { message = "Verify the HS mapping before starting assessment." });
                declaration.Status = "ASSESSMENT_READY";
                break;
            case "APPROVE_INFORMATION" or "APPROVE_FOR_VALUATION":
            {
                var confirmed = (await TariffCatalog(ct)).FirstOrDefault(x => x.TariffLineId == input.ConfirmedTariffLineId);
                if (confirmed is null) return BadRequest(new { message = "Select a current tariff item to verify the HS mapping." });
                declaration.ConfirmedHsCodeId = confirmed.HsCodeId; declaration.ConfirmedTariffLineId = confirmed.TariffLineId;
                declaration.Status = action == "APPROVE_INFORMATION" ? "VERIFIED" : "ASSESSMENT_READY";
                Notify(declaration, "DECLARATION_VERIFIED", $"{declaration.Reference} passed officer review",
                    $"Your documents were accepted and the goods were classified under HS {Display(confirmed)}. Valuation and tax assessment are now in progress.", link);
                break;
            }
            case "RECLASSIFY":
            {
                var confirmed = (await TariffCatalog(ct)).FirstOrDefault(x => x.TariffLineId == input.ConfirmedTariffLineId);
                if (confirmed is null) return BadRequest(new { message = "Select a current tariff item for the new classification." });
                if (confirmed.TariffLineId == declaration.ConfirmedTariffLineId) return BadRequest(new { message = "The declaration is already classified under this tariff item." });
                var previous = (await TariffCatalog(ct)).FirstOrDefault(x => x.TariffLineId == (declaration.ConfirmedTariffLineId ?? declaration.SuggestedTariffLineId));
                declaration.ConfirmedHsCodeId = confirmed.HsCodeId; declaration.ConfirmedTariffLineId = confirmed.TariffLineId;
                auditNote = $"Reclassified from {(previous is null ? "the earlier tariff item" : Display(previous))} to {Display(confirmed)}.{(note.Length > 0 ? " " + note : "")}";
                if (declaration.Status != "SUBMITTED")
                    Notify(declaration, "DECLARATION_RECLASSIFIED", $"HS classification updated for {declaration.Reference}",
                        $"The officer classified your goods under HS {Display(confirmed)}: {confirmed.Description}.{(note.Length > 0 ? " " + note : "")}", link);
                break;
            }
        }
        auditAction = action == "RECLASSIFY" ? "IMPORTER_DECLARATION_RECLASSIFIED" : $"IMPORTER_DECLARATION_{declaration.Status}";
        if (action != "RECLASSIFY") declaration.ReviewNote = note;
        declaration.ReviewedById = access.UserId; declaration.ReviewedAt = DateTimeOffset.UtcNow;
        declaration.UpdatedAt = declaration.ReviewedAt.Value; declaration.Version = Guid.NewGuid();
        Audit(declaration, auditAction, auditNote);
        await db.SaveChangesAsync(ct);
        return Ok(Detail(declaration));
    }

    private static string Display(TariffEntry entry) => string.IsNullOrWhiteSpace(entry.TariffItemNo) ? entry.HsCode : entry.TariffItemNo;

    private void Notify(ImporterDeclaration declaration, string kind, string title, string message, string link) =>
        db.ImporterNotifications.Add(ImporterNotification.Create(declaration.ImporterId, declaration.Id, kind, title, message, link));

    private async Task<ImporterDeclaration> Accessible(Guid id, CancellationToken ct)
    {
        var declaration = await db.ImporterDeclarations.Include(x => x.Documents).FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new WorkspaceException(404, "Declaration not found.");
        if (access.Role == AccessRules.Importer && declaration.ImporterId == access.UserId) return declaration;
        if (access.Role == AccessRules.Officer && (await access.Locations(ct)).Contains(declaration.LocationId)) return declaration;
        throw new WorkspaceException(403, "This declaration is outside your access.");
    }

    private static async Task<ImporterDocument> ReadDocument(IFormFile file, string kind, Guid declarationId, CancellationToken ct)
    {
        var upload = await UploadedDocumentReader.ReadAsync(file, ct);
        return new ImporterDocument { Id = Guid.NewGuid(), DeclarationId = declarationId, Kind = kind,
            FileName = upload.FileName, ContentType = upload.ContentType, Size = upload.Content.Length,
            Sha256 = upload.Sha256, Content = upload.Content, UploadedAt = DateTimeOffset.UtcNow };
    }

    private void Audit(ImporterDeclaration declaration, string action, string? note)
    {
        db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = access.UserId.ToString(), SubjectUserId = declaration.ImporterId,
            Username = User.Identity?.Name ?? "", OccurredAt = DateTimeOffset.UtcNow, Action = action, Module = "ImporterDeclarations",
            RecordId = declaration.Id, LocationId = declaration.LocationId, Decision = declaration.Status, Justification = note,
            NewValueJson = JsonSerializer.Serialize(new { declaration.Reference, declaration.Status, declaration.SuggestedHsCodeId, declaration.SuggestedTariffLineId, declaration.ConfirmedHsCodeId, declaration.ConfirmedTariffLineId, declaration.ImportPurpose }) });
    }

    private static object Summary(ImporterDeclaration x) => new { x.Id, x.Reference, x.Status, x.ProductName, x.ImportPurpose, x.OriginCountryName,
        x.SuggestedHsCodeId, x.SuggestedTariffLineId, x.ConfirmedHsCodeId, x.ConfirmedTariffLineId, x.LocationId, x.SubmittedAt, x.UpdatedAt, x.Version,
        x.InvoiceAmount, x.InvoiceCurrency, x.AssessedPayable, x.AssessmentCurrency };

    private static JsonElement AssessmentLines(ImporterDeclaration x)
    {
        try { return JsonSerializer.Deserialize<JsonElement>(string.IsNullOrWhiteSpace(x.AssessmentJson) ? "[]" : x.AssessmentJson); }
        catch (JsonException) { return JsonSerializer.Deserialize<JsonElement>("[]"); }
    }

    private static object Detail(ImporterDeclaration x) => new { x.Id, x.Reference, x.Status, x.ImporterId, x.LocationId,
        x.SuggestedHsCodeId, x.SuggestedTariffLineId, x.SuggestedTariffDescription, x.ConfirmedHsCodeId, x.ConfirmedTariffLineId, x.OriginCountryCode, x.OriginCountryName,
        x.ImportPurpose, x.PurposeDetails, x.IsCommercialProduct, x.IsMachineryOrEquipment,
        requestedTreatments = JsonSerializer.Deserialize<string[]>(x.RequestedTreatmentsJson) ?? [], x.Brand, x.Model, x.ProductName,
        x.Description, x.Manufacturer, x.SerialOrPartNumber, x.Specifications, x.Quantity, x.Unit,
        x.InvoiceAmount, x.InvoiceCurrency, x.FreightAmount, x.InsuranceAmount,
        x.AssessedAt, x.AssessmentCurrency, x.AssessedCustomsValue, x.AssessedTotalTax, x.AssessedPayable, assessmentLines = AssessmentLines(x),
        x.ReviewNote, x.ReviewedById, x.ReviewedAt, x.SubmittedAt, x.UpdatedAt, x.Version,
        documents = x.Documents.Select(d => new { d.Kind, d.FileName, d.ContentType, d.Size, d.Sha256, d.UploadedAt }).ToArray() };
}
