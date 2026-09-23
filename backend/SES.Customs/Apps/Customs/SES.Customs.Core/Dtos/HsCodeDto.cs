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

public sealed record HsTariffLineDto(
    Guid Id,
    string Code,
    string DescriptionEn,
    string? DescriptionAm,
    string Unit,
    string Duty,
    string SourceReference,
    DateOnly EffectiveDate,
    DateOnly? EndDate);

public sealed record HsCodeDetailDto(
    Guid Id,
    Guid RevisionId,
    string Code,
    string DescriptionEn,
    string? DescriptionAm,
    IReadOnlyList<HsTariffLineDto> TariffLines);

public sealed record HsCatalogueTreeDto(IReadOnlyList<HsSectionNodeDto> Sections);
public sealed record HsSectionNodeDto(string Code, string Name, IReadOnlyList<HsChapterNodeDto> Chapters);
public sealed record HsChapterNodeDto(string Code, string Name, int TariffItemCount, IReadOnlyList<HsTariffItemNodeDto> TariffItems);
public sealed record HsTariffItemNodeDto(string Code, string Name, int HsCodeCount, IReadOnlyList<HsCodeNodeDto> HsCodes);
public sealed record HsCodeNodeDto(Guid Id, string Code, string Name, string? Duty, string Unit, string SourceReference);

public sealed record HsCodeWriteRequest(
    Guid RevisionId,
    string Code,
    string DescriptionEn,
    string? DescriptionAm,
    string? TariffItemNo,
    string? TariffDescription,
    string? Unit,
    string? Duty,
    string? SourceReference,
    DateOnly? EffectiveDate,
    string? OfficialLetterFileName,
    string? OfficialLetterContentType,
    string? OfficialLetterBase64);
