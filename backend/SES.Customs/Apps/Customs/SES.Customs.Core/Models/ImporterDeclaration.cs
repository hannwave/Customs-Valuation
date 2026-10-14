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
    /// <summary>Price the importer paid for the whole shipment, as invoiced.</summary>
    public decimal? InvoiceAmount { get; set; }
    public string InvoiceCurrency { get; set; } = "";
    /// <summary>Freight and insurance in the invoice currency, when not already in the invoice price.</summary>
    public decimal? FreightAmount { get; set; }
    public decimal? InsuranceAmount { get; set; }
    public DateTimeOffset? AssessedAt { get; set; }
    public string AssessmentCurrency { get; set; } = "";
    public decimal? AssessedCustomsValue { get; set; }
    public decimal? AssessedTotalTax { get; set; }
    /// <summary>Duties and taxes payable after exemptions, waivers and adjustments.</summary>
    public decimal? AssessedPayable { get; set; }
    /// <summary>Tax lines of the confirmed assessment, as shown to the importer.</summary>
    public string AssessmentJson { get; set; } = "[]";
    public string ReviewNote { get; set; } = "";
    public Guid? ReviewedById { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public List<ImporterDocument> Documents { get; set; } = [];
}

/// <summary>A message to an importer about their account or a declaration, shown in the importer portal.</summary>
public sealed class ImporterNotification
{
    public Guid Id { get; set; }
    public Guid ImporterId { get; set; }
    public Guid? DeclarationId { get; set; }
    public string Kind { get; set; } = "";
    public string Title { get; set; } = "";
    public string Message { get; set; } = "";
    public string Link { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }

    public static ImporterNotification Create(Guid importerId, Guid? declarationId, string kind, string title, string message, string link) =>
        new() { Id = Guid.NewGuid(), ImporterId = importerId, DeclarationId = declarationId, Kind = kind, Title = title, Message = message, Link = link, CreatedAt = DateTimeOffset.UtcNow };
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
