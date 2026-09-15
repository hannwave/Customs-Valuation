using SES.Customs.Common;
using SES.Customs.Core.Dtos;
using SES.Customs.Core.Features.HsCodes.Contract.Repository;
namespace SES.Customs.Infrastructure.Repository;

// Synthetic, read-only fixtures. Never connect to a real database in demo mode.
public sealed class DemoHsCodeRepository : IHsCodeRepository
{
    public static readonly Guid RevisionId = Guid.Parse("11111111-1111-4111-8111-111111111111");
    private static readonly HsCodeDto[] Codes = [
        new(Guid.Parse("22222222-2222-4222-8222-222222222222"), RevisionId, "850440", "Demo electrical converter", "የሙከራ ኤሌክትሪክ መቀየሪያ", "15%"),
        new(Guid.Parse("33333333-3333-4333-8333-333333333333"), RevisionId, "090111", "Demo coffee product", "የሙከራ ቡና", "Free")
    ];
    public Task<PagedResult<HsCodeDto>> SearchAsync(string? search, Guid? revisionId, int page, int pageSize, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var term = search?.Trim() ?? "";
        var rows = Codes.Where(x => (!revisionId.HasValue || x.RevisionId == revisionId)
            && (x.Code.Contains(term.Replace(".", "")) || x.DescriptionEn.Contains(term, StringComparison.OrdinalIgnoreCase)
                || (x.DescriptionAm?.Contains(term) ?? false))).OrderBy(x => x.Code).ToArray();
        return Task.FromResult(new PagedResult<HsCodeDto>(rows.Skip((page - 1) * pageSize).Take(pageSize).ToArray(), rows.Length, page, pageSize));
    }
    public Task<HsCodeDto?> GetByIdAsync(Guid id, CancellationToken ct)
    { ct.ThrowIfCancellationRequested(); return Task.FromResult(Codes.SingleOrDefault(x => x.Id == id)); }
    public Task<IReadOnlyList<HsRevisionDto>> GetRevisionsAsync(CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult<IReadOnlyList<HsRevisionDto>>([new(RevisionId, "HS 2022 · DEMO", 2022, new(2022, 1, 1), null, "Demo")]);
    }
}
