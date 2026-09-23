using Microsoft.EntityFrameworkCore;
using SES.Customs.Common;
using SES.Customs.Core.Dtos;
using SES.Customs.Core.Features.HsCodes.Contract.Repository;
using SES.Customs.Infrastructure.Context;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace SES.Customs.Infrastructure.Repository;
public sealed class HsCodeRepository(CustomsDbContext db) : IHsCodeRepository
{
    public async Task<PagedResult<HsCodeDto>> SearchAsync(string? search, Guid? revisionId, int page, int pageSize, CancellationToken ct)
    {
        var query = db.HsCodes.AsNoTracking();
        if (revisionId.HasValue) query = query.Where(x => x.RevisionId == revisionId.Value);
        else
        {
            var activeRevisionId = await db.HsRevisions.AsNoTracking().Where(x => x.Status == "Active").OrderByDescending(x => x.EffectiveDate).ThenByDescending(x => x.Number).Select(x => (Guid?)x.Id).FirstOrDefaultAsync(ct);
            if (activeRevisionId.HasValue) query = query.Where(x => x.RevisionId == activeRevisionId.Value);
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            var recommendedCode = RecommendedProductCode(search);
            var term = recommendedCode ?? search.Trim().ToLowerInvariant();
            var code = term.Replace(".", "");
            query = query.Where(x => (x.Code != null && x.Code.Contains(code)) || x.DescriptionEn.ToLower().Contains(term)
                || (x.DescriptionAm != null && x.DescriptionAm.Contains(term))
                || x.SectionName.ToLower().Contains(term) || x.ChapterName.ToLower().Contains(term)
                || x.HeadingNumber.Contains(code)
                || db.NationalTariffLines.Any(line => line.HsCodeId == x.Id && line.TariffItemNo != null && line.TariffItemNo.Contains(code)));

            var filteredCount = await query.CountAsync(ct);
            var ordered = recommendedCode is null
                ? query.OrderBy(x => x.Code).ThenBy(x => x.Id)
                : query.OrderByDescending(x => x.Code == recommendedCode).ThenBy(x => x.Code).ThenBy(x => x.Id);
            var filteredEntities = await ordered.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
            return await MapPageAsync(filteredEntities, filteredCount, page, pageSize, ct);
        }
        var count = await query.CountAsync(ct);
        var entities = await query.OrderBy(x => x.Code).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return await MapPageAsync(entities, count, page, pageSize, ct);
    }

    private async Task<PagedResult<HsCodeDto>> MapPageAsync(List<SES.Customs.Core.Models.HsCode> entities, int count, int page, int pageSize, CancellationToken ct)
    {
        var ids = entities.Select(x => x.Id).ToArray();
        var lines = await db.NationalTariffLines.AsNoTracking().Where(line => ids.Contains(line.HsCodeId)).OrderByDescending(line => line.EffectiveDate).ThenBy(line => line.Code).ToListAsync(ct);
        var items = entities.Select(x => Map(x, lines.FirstOrDefault(line => line.HsCodeId == x.Id))).ToList();
        return new(items, count, page, pageSize);
    }

    private static string? RecommendedProductCode(string value)
    {
        var normalized = Regex.Replace(value.ToLowerInvariant(), "[^a-z0-9]+", " ").Trim();
        if (string.IsNullOrWhiteSpace(normalized)) return null;

        var phoneAccessory = Regex.IsMatch(normalized, @"\b(case|cover|charger|charging|cable|adapter|screen protector|display|battery|earbuds?|headphones?|holder|mount|parts?)\b");
        var smartphone = Regex.IsMatch(normalized, @"\b(iphones?|i phones?|smartphones?|smart phones?|mobile phones?|cellular phones?)\b");
        if (smartphone && !phoneAccessory) return "851713";

        var cigarAccessory = Regex.IsMatch(normalized, @"\b(holder|case|cutter|humidor|lighter|machine|paper|filter|parts?)\b");
        if (Regex.IsMatch(normalized, @"\b(cigar|cigars|cheroot|cheroots|cigarillo|cigarillos)\b") && !cigarAccessory) return "240210";

        var nonTobaccoProduct = Regex.IsMatch(normalized, @"\b(electronic|e cigarette|ecigarette|vape|vaping|holder|paper|filter|case|machine|parts?)\b");
        var tobaccoCigarette = Regex.IsMatch(normalized, @"\b(cigarette|cigarettes|cigaret|cigarets|cigarate|cigarates|cigerette|cigerettes)\b");
        if (tobaccoCigarette && !nonTobaccoProduct) return "240220";

        return null;
    }
    public async Task<HsCodeDto?> GetByIdAsync(Guid id, CancellationToken ct)
    {
        var entity = await db.HsCodes.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (entity is null) return null;
        var line = await db.NationalTariffLines.AsNoTracking().Where(x => x.HsCodeId == id).OrderByDescending(x => x.EffectiveDate).ThenBy(x => x.Code).FirstOrDefaultAsync(ct);
        return Map(entity, line);
    }
    public async Task<IReadOnlyList<HsRevisionDto>> GetRevisionsAsync(CancellationToken ct) => await db.HsRevisions.AsNoTracking()
        .OrderByDescending(x => x.EffectiveDate).ThenByDescending(x => x.Number).Select(x => new HsRevisionDto(x.Id, x.Name, x.Number, x.EffectiveDate, x.EndDate, x.Status, x.OriginalHsVersion, x.UpdatedHsVersion, x.TotalRecords)).ToListAsync(ct);

    private static HsCodeDto Map(SES.Customs.Core.Models.HsCode code, SES.Customs.Core.Models.NationalTariffLine? line)
    {
        IReadOnlyList<HsCodeCandidateDto>? candidates = null;
        if (!string.IsNullOrWhiteSpace(code.HsUpdateCandidatesJson))
        {
            try { candidates = JsonSerializer.Deserialize<List<HsCodeCandidateDto>>(code.HsUpdateCandidatesJson); } catch (JsonException) { candidates = null; }
        }
        return new(code.Id, code.RevisionId, code.Code, code.DescriptionEn, code.DescriptionAm, line?.Duty, line?.TariffItemNo, line?.Unit ?? "", code.SectionNumber, code.SectionName, code.ChapterNumber, code.ChapterName, code.HeadingNumber, code.HsUpdateStatus, code.HsUpdateNote, candidates);
    }
}
