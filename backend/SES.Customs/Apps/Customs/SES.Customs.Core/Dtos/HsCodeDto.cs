namespace SES.Customs.Core.Dtos;
public sealed record HsCodeDto(Guid Id, Guid RevisionId, string Code, string DescriptionEn, string? DescriptionAm);
public sealed record HsRevisionDto(Guid Id, string Name, int Number, DateOnly EffectiveDate, DateOnly? EndDate, string Status);
