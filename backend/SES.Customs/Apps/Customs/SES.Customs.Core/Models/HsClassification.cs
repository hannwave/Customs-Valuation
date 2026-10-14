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
    public string OfficialLetterFileName { get; set; } = "";
    public string OfficialLetterContentType { get; set; } = "";
    public byte[] OfficialLetterContent { get; set; } = [];
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
    /// <summary>11-digit national code as published by the Ethiopian Customs Commission (ERCA).</summary>
    public string? NationalCode { get; set; }
    public List<TariffTaxRate> TaxRates { get; set; } = [];
}

/// <summary>A tax or duty column of the national tariff, for example DR (duty rate) or VAT.</summary>
public sealed class TariffTaxType
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    /// <summary>IMPORT, EXPORT or SECOND_SCHEDULE.</summary>
    public string Scope { get; set; } = "IMPORT";
    public int DisplayOrder { get; set; }
}

/// <summary>The rate (percent) a tariff line carries for one tax type. Absent rows mean the tariff lists no rate.</summary>
public sealed class TariffTaxRate
{
    public Guid Id { get; set; }
    public Guid TariffLineId { get; set; }
    public string TaxCode { get; set; } = "";
    public decimal Rate { get; set; }
    public string SourceReference { get; set; } = "";
    public DateTimeOffset RetrievedAt { get; set; }
}

public static class TariffTaxCodes
{
    public const string Duty = "DR";
    public const string Excise = "ER";
    public const string Vat = "VAT";
    public const string Withholding = "WHR";
    public const string Surtax = "SR";
    public const string ExportDuty = "EXR";
    public const string SecondScheduleDuty = "D2R";
    public const string SecondScheduleSpecial = "DSR";
    public const string SecondScheduleAdditional = "DAR";

    /// <summary>The tax columns of the ERCA national tariff, in the portal's order.</summary>
    public static readonly TariffTaxType[] All =
    [
        new() { Code = Duty, Name = "Duty Rate", Description = "Customs import duty, percent of CIF value.", Scope = "IMPORT", DisplayOrder = 1 },
        new() { Code = Excise, Name = "Excise Rate", Description = "Excise tax, percent of CIF plus customs duty.", Scope = "IMPORT", DisplayOrder = 2 },
        new() { Code = Vat, Name = "Value Added Tax", Description = "VAT on imports, percent of CIF plus duty, excise and surtax.", Scope = "IMPORT", DisplayOrder = 3 },
        new() { Code = Withholding, Name = "With Hold Rate", Description = "Withholding (advance income) tax, percent of CIF value.", Scope = "IMPORT", DisplayOrder = 4 },
        new() { Code = Surtax, Name = "Surtax Rate", Description = "Import surtax, percent of CIF plus duty and excise.", Scope = "IMPORT", DisplayOrder = 5 },
        new() { Code = ExportDuty, Name = "Export Duty Rate", Description = "Duty charged on exports of the item.", Scope = "EXPORT", DisplayOrder = 6 },
        new() { Code = SecondScheduleDuty, Name = "Duty 2nd Schedule Rate", Description = "Duty under the tariff's second schedule.", Scope = "SECOND_SCHEDULE", DisplayOrder = 7 },
        new() { Code = SecondScheduleSpecial, Name = "Duty 2nd Schedule Special Rate", Description = "Special rate under the tariff's second schedule.", Scope = "SECOND_SCHEDULE", DisplayOrder = 8 },
        new() { Code = SecondScheduleAdditional, Name = "Duty 2nd Schedule Additional Rate", Description = "Additional rate under the tariff's second schedule.", Scope = "SECOND_SCHEDULE", DisplayOrder = 9 },
    ];

    /// <summary>The line's rate for a tax code, or null when the tariff lists none.</summary>
    public static decimal? RateFor(NationalTariffLine? line, string code) =>
        line?.TaxRates.FirstOrDefault(rate => string.Equals(rate.TaxCode, code, StringComparison.OrdinalIgnoreCase))?.Rate;
}
