using MediatR;
using SES.Customs.Common;
using SES.Customs.Core.Dtos;
using SES.Customs.Core.Features.HsCodes.Contract.Query;
using SES.Customs.Core.Features.HsCodes.Contract.Repository;
namespace SES.Customs.Core.Features.HsCodes.Handler.Query;
public sealed class SearchHsCodesQueryHandler(IHsCodeRepository repository) : IRequestHandler<SearchHsCodesQuery, PagedResult<HsCodeDto>>
{
    public Task<PagedResult<HsCodeDto>> Handle(SearchHsCodesQuery request, CancellationToken ct)
    {
        if (request.Page is < 1 or > 100000 || request.PageSize is < 1 or > 100)
            throw new ArgumentException("Page must be 1–100000 and page size 1–100.");
        var search = request.Search?.Trim();
        if (search?.Length > 100) throw new ArgumentException("Search must be at most 100 characters.");
        return repository.SearchAsync(search, request.RevisionId, request.Page, request.PageSize, ct);
    }
}
public sealed class GetHsCodeQueryHandler(IHsCodeRepository repository) : IRequestHandler<GetHsCodeQuery, HsCodeDto?>
{
    public Task<HsCodeDto?> Handle(GetHsCodeQuery request, CancellationToken ct) => repository.GetByIdAsync(request.Id, ct);
}
public sealed class GetHsRevisionsQueryHandler(IHsCodeRepository repository) : IRequestHandler<GetHsRevisionsQuery, IReadOnlyList<HsRevisionDto>>
{
    public Task<IReadOnlyList<HsRevisionDto>> Handle(GetHsRevisionsQuery request, CancellationToken ct) => repository.GetRevisionsAsync(ct);
}
