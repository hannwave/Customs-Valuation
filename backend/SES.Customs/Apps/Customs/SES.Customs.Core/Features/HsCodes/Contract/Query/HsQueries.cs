using MediatR;
using SES.Customs.Common;
using SES.Customs.Core.Dtos;
namespace SES.Customs.Core.Features.HsCodes.Contract.Query;
public sealed record SearchHsCodesQuery(string? Search, Guid? RevisionId, int Page = 1, int PageSize = 20) : IRequest<PagedResult<HsCodeDto>>;
public sealed record GetHsCodeQuery(Guid Id) : IRequest<HsCodeDto?>;
public sealed record GetHsRevisionsQuery : IRequest<IReadOnlyList<HsRevisionDto>>;
