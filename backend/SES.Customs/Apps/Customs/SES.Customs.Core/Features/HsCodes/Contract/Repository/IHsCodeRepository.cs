using SES.Customs.Common;
using SES.Customs.Core.Dtos;
namespace SES.Customs.Core.Features.HsCodes.Contract.Repository;
public interface IHsCodeRepository
{
    Task<PagedResult<HsCodeDto>> SearchAsync(string? search, Guid? revisionId, int page, int pageSize, CancellationToken ct);
    Task<HsCodeDto?> GetByIdAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<HsRevisionDto>> GetRevisionsAsync(CancellationToken ct);
}
