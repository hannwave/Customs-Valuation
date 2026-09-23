namespace SES.Customs.Core.Dtos;
public sealed record HsCodeCandidateDto(string HsCode, string Description);
public sealed record HsCodeDto(
    Guid Id,
    Guid RevisionId,
    string? Code,
    string DescriptionEn,
    string? DescriptionAm,
    string? Duty,
    string? TariffItemNo = null,
    string Unit = "",
    string SectionNumber = "",
    string SectionName = "",
    int? ChapterNumber = null,
    string ChapterName = "",
    string HeadingNumber = "",
    string? HsUpdateStatus = null,
    string? HsUpdateNote = null,
    IReadOnlyList<HsCodeCandidateDto>? HsUpdateCandidates = null);
public sealed record HsRevisionDto(Guid Id, string Name, int Number, DateOnly EffectiveDate, DateOnly? EndDate, string Status, string OriginalHsVersion = "", string UpdatedHsVersion = "", int TotalRecords = 0);
