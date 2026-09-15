using Microsoft.EntityFrameworkCore;
using SES.Customs.Common;
using SES.Customs.Core.Dtos;
using SES.Customs.Core.Features.HsCodes.Contract.Repository;
using SES.Customs.Infrastructure.Context;
namespace SES.Customs.Infrastructure.Repository;
public sealed class HsCodeRepository(CustomsDbContext db) : IHsCodeRepository
{
    public async Task<PagedResult<HsCodeDto>> SearchAsync(string? search, Guid? revisionId, int page, int pageSize, CancellationToken ct)
    {
        var query = db.HsCodes.AsNoTracking();
        if (revisionId.HasValue) query = query.Where(x => x.RevisionId == revisionId.Value);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLowerInvariant();
            var code = term.Replace(".", "");
            query = query.Where(x => x.Code.Contains(code) || x.DescriptionEn.ToLower().Contains(term)
                || (x.DescriptionAm != null && x.DescriptionAm.Contains(term)));
        }
        var count = await query.CountAsync(ct);
        var items = await query.OrderBy(x => x.Code).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new HsCodeDto(
                x.Id,
                x.RevisionId,
                x.Code,
                x.DescriptionEn,
                x.DescriptionAm,
                db.NationalTariffLines
                    .Where(line => line.HsCodeId == x.Id)
                    .OrderByDescending(line => line.EffectiveDate)
                    .ThenBy(line => line.Code)
                    .Select(line => line.Duty)
                    .FirstOrDefault()))
            .ToListAsync(ct);
        return new(items, count, page, pageSize);
    }
    public Task<HsCodeDto?> GetByIdAsync(Guid id, CancellationToken ct) => db.HsCodes.AsNoTracking()
        .Where(x => x.Id == id)
        .Select(x => new HsCodeDto(
            x.Id,
            x.RevisionId,
            x.Code,
            x.DescriptionEn,
            x.DescriptionAm,
            db.NationalTariffLines
                .Where(line => line.HsCodeId == x.Id)
                .OrderByDescending(line => line.EffectiveDate)
                .ThenBy(line => line.Code)
                .Select(line => line.Duty)
                .FirstOrDefault()))
        .SingleOrDefaultAsync(ct);
    public async Task<IReadOnlyList<HsRevisionDto>> GetRevisionsAsync(CancellationToken ct) => await db.HsRevisions.AsNoTracking()
        .OrderByDescending(x => x.Number).Select(x => new HsRevisionDto(x.Id, x.Name, x.Number, x.EffectiveDate, x.EndDate, x.Status)).ToListAsync(ct);
}
