namespace SES.Customs.Core.Models;

public sealed class ImporterDeclaration
{
    public Guid Id { get; set; }
    public Guid ImporterId { get; set; }
    public Guid LocationId { get; set; }
    public string Reference { get; set; } = "";
    public string Status { get; set; } = "SUBMITTED";
    public Guid? SuggestedHsCodeId { get; set; }
    public Guid? SuggestedTariffLineId { get; set; }
    public string SuggestedTariffDescription { get; set; } = "";
    public Guid? ConfirmedHsCodeId { get; set; }
    public Guid? ConfirmedTariffLineId { get; set; }
    public string OriginCountryCode { get; set; } = "";
    public string OriginCountryName { get; set; } = "";
    public string ImportPurpose { get; set; } = "";
    public string PurposeDetails { get; set; } = "";
    public bool IsCommercialProduct { get; set; }
    public bool IsMachineryOrEquipment { get; set; }
    public string RequestedTreatmentsJson { get; set; } = "[]";
    public string Brand { get; set; } = "";
    public string Model { get; set; } = "";
    public string ProductName { get; set; } = "";
    public string Description { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public string SerialOrPartNumber { get; set; } = "";
    public string Specifications { get; set; } = "";
    public decimal Quantity { get; set; }
    public string Unit { get; set; } = "";
    public string ReviewNote { get; set; } = "";
    public Guid? ReviewedById { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public List<ImporterDocument> Documents { get; set; } = [];
}

public sealed class ImporterDocument
{
    public Guid Id { get; set; }
    public Guid DeclarationId { get; set; }
    public string Kind { get; set; } = "";
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long Size { get; set; }
    public string Sha256 { get; set; } = "";
    public byte[] Content { get; set; } = [];
    public DateTimeOffset UploadedAt { get; set; }
}
