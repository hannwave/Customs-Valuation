using System.Text.Json;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Security;

internal static class ValuationAuditSnapshotFactory
{
    public static ValuationAuditSnapshot Create(
        AuditLog audit,
        ValuationDecision decision,
        ValuationPhase2? assessment,
        string? hsCode,
        string? hsDescription,
        AuthAccountEntity? officer,
        CustomsLocation? office)
    {
        var lines = assessment?.TaxLines.OrderBy(line => line.Order).ToArray() ?? [];
        var duty = Find(lines, "Customs Duty")?.CalculatedAmount;
        var excise = Find(lines, "Excise Tax");
        var specificExcise = Find(lines, "Excise Tax (specific)");
        var exciseAdValorem = excise is { CalculationType: "Percentage" }
            ? Money(excise.BaseAmount * excise.Value / 100m)
            : excise?.CalculatedAmount;
        var specificIsComparison = string.Equals(specificExcise?.CalculationBasis, "UNIT_RATE_ETB_GREATER_OF", StringComparison.OrdinalIgnoreCase);
        var exciseTotal = excise?.CalculatedAmount ?? 0m;
        if (specificExcise is not null && !specificIsComparison) exciseTotal += specificExcise.CalculatedAmount;
        var vat = Find(lines, "VAT")?.CalculatedAmount;
        var surtax = Find(lines, "Surtax")?.CalculatedAmount;
        var knownTax = (duty ?? 0m) + exciseTotal + (vat ?? 0m) + (surtax ?? 0m);
        decimal? otherTax = assessment is null ? null : Money(Math.Max(0m, assessment.TotalTax - knownTax));
        var parsedOfficerId = Guid.TryParse(decision.OfficerSubjectId, out var officerId) ? officerId : (Guid?)null;

        return new ValuationAuditSnapshot
        {
            AuditLogId = audit.Id,
            ValuationDecisionId = decision.Id,
            ValuationPhase2Id = assessment?.Id,
            ProductId = decision.ProductId,
            ProductName = First(decision.ProductName, EvidenceString(decision.EvidenceNotes, "product")),
            HsCode = hsCode ?? "",
            HsDescription = hsDescription ?? "",
            PurchaseCountryCode = First(decision.PurchaseCountryCode, EvidenceString(decision.EvidenceNotes, "purchaseCountryCode")),
            PurchaseCountryName = First(decision.PurchaseCountryName, EvidenceString(decision.EvidenceNotes, "purchaseCountryName")),
            OriginCountry = assessment?.OriginCountry ?? "",
            SelectedPriceAmount = decision.SelectedReferenceValue,
            SelectedPriceCurrency = decision.Currency,
            SelectedPriceSource = First(decision.SelectedPriceSource, EvidenceString(decision.EvidenceNotes, "supportingSource")),
            ValuationMethod = First(decision.ValuationMethod, EvidenceString(decision.EvidenceNotes, "valuationMethod")),
            TotalTaxDue = assessment?.TotalTax,
            CustomsDutyAmount = duty,
            ExciseAdValoremAmount = exciseAdValorem,
            ExciseSpecificAmount = specificExcise?.CalculatedAmount,
            ExciseTotalAmount = assessment is null ? null : Money(exciseTotal),
            VatAmount = vat,
            SurtaxAmount = surtax,
            OtherTaxAmount = otherTax,
            TaxCurrency = assessment?.TargetCurrency ?? decision.Currency,
            TaxBreakdownJson = JsonSerializer.Serialize(lines.Select(line => new
            {
                line.Name,
                line.CalculationType,
                line.Value,
                line.Currency,
                line.CalculationBasis,
                line.BaseAmount,
                line.CalculatedAmount,
                line.Status,
                line.Notes,
                line.SourceReference,
                line.IsApplicable
            })),
            OfficerAccountId = officer?.Id ?? parsedOfficerId,
            OfficerName = First(officer?.FullName, officer?.Username, decision.OfficerSubjectId),
            OfficerLocationId = decision.LocationId,
            OfficerLocationName = First(office?.DisplayName, office?.Name),
            ProductPhotoUrl = First(decision.ProductPhotoUrl, EvidenceString(decision.EvidenceNotes, "productPhoto"), FirstInternationalPhoto(decision.EvidenceNotes)),
            ReceiptValuationDecisionId = string.IsNullOrWhiteSpace(decision.ReceiptFileName) ? null : decision.Id,
            ReceiptFileName = decision.ReceiptFileName,
            ReceiptContentType = decision.ReceiptContentType,
            DecisionDetailsJson = JsonSerializer.Serialize(new
            {
                decision.Decision,
                decision.Justification,
                decision.Status,
                decision.RecordedAt,
                decision.SubmittedAt,
                phase2Status = assessment?.Status,
                assessment?.AdjustmentReason,
                assessment?.Notes,
                assessment?.FinalAmount,
                assessment?.CalculationRuleVersion,
                fobCifCalculation = ReadFobCifCalculation(decision.FobCifCalculationJson)
            })
        };
    }

    private static ValuationPhase2TaxLine? Find(IEnumerable<ValuationPhase2TaxLine> lines, string name) =>
        lines.FirstOrDefault(line => string.Equals(line.Name, name, StringComparison.OrdinalIgnoreCase));

    private static decimal Money(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

    private static string First(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? "";

    private static string? EvidenceString(string? json, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static JsonElement? ReadFobCifCalculation(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        try
        {
            using var document = JsonDocument.Parse(value);
            return document.RootElement.ValueKind == JsonValueKind.Object && document.RootElement.EnumerateObject().Any()
                ? document.RootElement.Clone()
                : null;
        }
        catch (JsonException) { return null; }
    }

    private static string? FirstInternationalPhoto(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var document = JsonDocument.Parse(json);
            if (!document.RootElement.TryGetProperty("internationalEvidence", out var items) || items.ValueKind != JsonValueKind.Array) return null;
            foreach (var item in items.EnumerateArray())
                if (item.TryGetProperty("thumbnailUrl", out var thumbnail) && thumbnail.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(thumbnail.GetString()))
                    return thumbnail.GetString();
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
