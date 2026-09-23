namespace SES.Customs.Core.Models;

public sealed class HsRevision
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public int Number { get; set; }
    public DateOnly EffectiveDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public string Status { get; set; } = "Draft";
    public string SourceReference { get; set; } = "";
    public string OriginalHsVersion { get; set; } = "";
    public string UpdatedHsVersion { get; set; } = "";
    public int TotalRecords { get; set; }
    public string MetadataJson { get; set; } = "";
}
public sealed class HsCode
{
    public Guid Id { get; set; }
    public Guid RevisionId { get; set; }
    // String preserves leading zeroes; WCO and national codes remain distinct.
    public string? Code { get; set; }
    public string DescriptionEn { get; set; } = "";
    public string? DescriptionAm { get; set; }
    public string SectionNumber { get; set; } = "";
    public string SectionName { get; set; } = "";
    public int? ChapterNumber { get; set; }
    public string ChapterName { get; set; } = "";
    public string HeadingNumber { get; set; } = "";
    public string? HsUpdateStatus { get; set; }
    public string? HsUpdateNote { get; set; }
    public string HsUpdateCandidatesJson { get; set; } = "[]";
}
public enum CorrelationKind { Retained, Revised, Split, Merged, Deleted, Replaced }
public sealed class HsCodeCorrelation
{
    public Guid Id { get; set; }
    public Guid MappingGroupId { get; set; }
    public Guid FromCodeId { get; set; }
    public Guid? ToCodeId { get; set; }
    public CorrelationKind Kind { get; set; }
    public string SourceReference { get; set; } = "";
}
public sealed class HsCodeUpdateMapping
{
    public Guid Id { get; set; }
    public Guid RevisionId { get; set; }
    public string SourceHsCode { get; set; } = "";
    public string? TargetHsCode { get; set; }
    public string? TargetDescription { get; set; }
    public string Status { get; set; } = "";
    public string Note { get; set; } = "";
    public string SourceReference { get; set; } = "";
}
public sealed class NationalTariffLine
{
    public Guid Id { get; set; }
    public Guid HsCodeId { get; set; }
    public string Code { get; set; } = "";
    public string? TariffItemNo { get; set; }
    public string DescriptionEn { get; set; } = "";
    public string? DescriptionAm { get; set; }
    public string Unit { get; set; } = "";
    public string Duty { get; set; } = "";
    public string SourceReference { get; set; } = "";
    public DateOnly EffectiveDate { get; set; }
    public DateOnly? EndDate { get; set; }
}
