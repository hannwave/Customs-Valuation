using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Security;
using SES.Customs.API.Services;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

/// <summary>
/// The final assessment invoice (customs value, duties and taxes payable) exactly as it was recorded, for printing and download.
/// Importers get the invoices of their own assessed declarations; staff get those in their locations.
/// </summary>
[ApiController, Route("api/invoices"), Authorize, ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class InvoicesController(CustomsDbContext db, WorkspaceAccess access) : ControllerBase
{
    private static readonly string[] Staff = [AccessRules.Officer, AccessRules.CustomsAdmin, AccessRules.SystemAdmin];

    /// <summary>Invoice for a declaration the importer filed on the portal, once an officer has assessed it.</summary>
    [HttpGet("declaration/{id:guid}")]
    public async Task<IActionResult> Declaration(Guid id, CancellationToken ct)
    {
        var declaration = await db.ImporterDeclarations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct) ?? throw new WorkspaceException(404, "Declaration not found.");
        if (access.Role == AccessRules.Importer) { if (declaration.ImporterId != access.UserId) throw new WorkspaceException(404, "Declaration not found."); }
        else { access.Require(Staff); if (!(await access.Locations(ct)).Contains(declaration.LocationId)) throw new WorkspaceException(403, "This declaration is outside your access."); }
        if (declaration.Status != "ASSESSED" || declaration.AssessedAt is null) throw new WorkspaceException(404, "This declaration has not been assessed yet, so there is no final invoice.");

        var decision = await db.ValuationDecisions.AsNoTracking().Where(d => d.ImporterDeclarationId == declaration.Id).OrderByDescending(d => d.RecordedAt).FirstOrDefaultAsync(ct);
        var phase2 = decision is null ? null : await db.ValuationPhase2s.AsNoTracking().FirstOrDefaultAsync(p => p.ValuationDecisionId == decision.Id, ct);
        var profile = await db.ImporterProfiles.AsNoTracking().Where(p => p.AccountId == declaration.ImporterId).Select(p => new { p.LegalName, p.Tin }).FirstOrDefaultAsync(ct);
        var importerName = profile?.LegalName ?? await db.AuthAccounts.AsNoTracking().Where(a => a.Id == declaration.ImporterId).Select(a => a.FullName).FirstOrDefaultAsync(ct) ?? "";
        var tariff = await Tariff(declaration.ConfirmedTariffLineId ?? declaration.SuggestedTariffLineId, ct);
        var currency = string.IsNullOrWhiteSpace(declaration.AssessmentCurrency) ? "ETB" : declaration.AssessmentCurrency;
        var lines = ReadLines(declaration.AssessmentJson);
        access.AuditAccess("INVOICE_OPENED", "ImporterDeclarations", declaration.Id, declaration.LocationId, declaration.ImporterId, $"Final invoice {declaration.Reference}");
        await db.SaveChangesAsync(ct);
        return Ok(new
        {
            kind = "declaration", reference = declaration.Reference, issuedAt = declaration.AssessedAt, status = "FINAL",
            office = await Office(declaration.LocationId, ct), officer = await OfficerName(decision?.OfficerSubjectId, ct),
            importer = new { name = importerName, tin = profile?.Tin ?? "" },
            goods = new
            {
                name = declaration.ProductName, detail = string.Join(" · ", new[] { declaration.Brand, declaration.Model }.Where(x => !string.IsNullOrWhiteSpace(x) && x != "Generic")),
                tariff.hsCode, tariff.nationalCode, tariff.description, origin = declaration.OriginCountryName, quantity = declaration.Quantity, unit = declaration.Unit,
                pricePaid = declaration.InvoiceAmount, priceCurrency = declaration.InvoiceCurrency,
                condition = Pick(declaration.Description, @"Condition: ([^.]+)\."), terms = Pick(declaration.Description, @"Invoice terms: ([A-Z]+)"),
            },
            valuation = new { method = decision?.ValuationMethod ?? "", customsValue = declaration.AssessedCustomsValue ?? 0m, currency, exchangeRate = phase2?.ExchangeRate, exchangeRateSource = phase2?.ExchangeRateSource ?? "" },
            lines, totalTax = declaration.AssessedTotalTax ?? 0m, payable = declaration.AssessedPayable ?? 0m, currency,
        });
    }

    /// <summary>Invoice for a valuation an officer finalised through the valuation search.</summary>
    [HttpGet("valuation/{decisionId:guid}")]
    public async Task<IActionResult> Valuation(Guid decisionId, CancellationToken ct)
    {
        access.Require(Staff);
        var decision = await db.ValuationDecisions.AsNoTracking().FirstOrDefaultAsync(d => d.Id == decisionId, ct) ?? throw new WorkspaceException(404, "Valuation not found.");
        var ownDecision = string.Equals(decision.OfficerSubjectId, access.UserId.ToString(), StringComparison.OrdinalIgnoreCase);
        if (!ownDecision && !(decision.LocationId is { } location && (await access.Locations(ct)).Contains(location))) throw new WorkspaceException(403, "This valuation is outside your access.");
        if (decision.ImporterDeclarationId is { } declarationId) return await Declaration(declarationId, ct);
        var phase2 = await db.ValuationPhase2s.AsNoTracking().Include(p => p.TaxLines).FirstOrDefaultAsync(p => p.ValuationDecisionId == decision.Id, ct);
        if (phase2 is null || !phase2.OfficerConfirmed) throw new WorkspaceException(404, "This valuation has not been finalised yet, so there is no final invoice.");

        var tariff = await Tariff(phase2.SelectedTariffLineId, ct);
        var currency = string.IsNullOrWhiteSpace(phase2.TargetCurrency) ? "ETB" : phase2.TargetCurrency;
        var lines = phase2.TaxLines.Where(x => !(x.Name == "Excise Tax (specific)" && x.CalculationBasis == "UNIT_RATE_ETB_GREATER_OF")).OrderBy(x => x.Order)
            .Select(x => new InvoiceLine(x.Name, x.CalculationType, x.Value, x.CalculationBasis, x.BaseAmount, x.CalculatedAmount, x.IsApplicable, x.Status)).ToList();
        access.AuditAccess("INVOICE_OPENED", "Valuations", decision.Id, decision.LocationId, null, $"Final invoice VAL-{decision.Id.ToString("N")[..8].ToUpperInvariant()}");
        await db.SaveChangesAsync(ct);
        return Ok(new
        {
            kind = "valuation", reference = $"VAL-{decision.Id.ToString("N")[..8].ToUpperInvariant()}", issuedAt = phase2.CalculatedAt ?? decision.RecordedAt, status = "FINAL",
            office = await Office(decision.LocationId, ct), officer = await OfficerName(decision.OfficerSubjectId, ct), importer = (object?)null,
            goods = new
            {
                name = decision.ProductName, detail = "", tariff.hsCode, tariff.nationalCode, tariff.description,
                origin = string.IsNullOrWhiteSpace(decision.PurchaseCountryName) ? phase2.OriginCountry : decision.PurchaseCountryName,
                quantity = phase2.Quantity, unit = phase2.Unit, pricePaid = decision.DeclaredPriceAmount, priceCurrency = decision.DeclaredPriceCurrency, condition = "", terms = "",
            },
            valuation = new { method = decision.ValuationMethod, customsValue = phase2.CustomsValueAmount, currency, exchangeRate = (decimal?)phase2.ExchangeRate, exchangeRateSource = phase2.ExchangeRateSource },
            lines, totalTax = phase2.TotalTax, payable = Math.Round(Math.Max(0m, phase2.FinalAmount - phase2.CustomsValueAmount), 2), currency,
        });
    }

    private static string Pick(string text, string pattern) => System.Text.RegularExpressions.Regex.Match(text ?? "", pattern) is { Success: true } match ? match.Groups[1].Value.Trim() : "";

    private sealed record InvoiceLine(string Name, string CalculationType, decimal Rate, string CalculationBasis, decimal BaseAmount, decimal Amount, bool IsApplicable, string Status);

    private static List<InvoiceLine> ReadLines(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "[]" : json);
            string Text(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
            decimal Number(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDecimal() : 0m;
            return document.RootElement.EnumerateArray().Select(e => new InvoiceLine(Text(e, "name"), Text(e, "calculationType"), Number(e, "rate"), Text(e, "calculationBasis"),
                Number(e, "baseAmount"), Number(e, "amount"), !e.TryGetProperty("isApplicable", out var applicable) || applicable.ValueKind != JsonValueKind.False, Text(e, "status"))).ToList();
        }
        catch (JsonException) { return []; }
    }

    private async Task<(string hsCode, string nationalCode, string description)> Tariff(Guid? lineId, CancellationToken ct)
    {
        if (!lineId.HasValue) return ("", "", "");
        var line = await db.NationalTariffLines.AsNoTracking().FirstOrDefaultAsync(l => l.Id == lineId.Value, ct);
        if (line is null) return ("", "", "");
        var hs = await db.HsCodes.AsNoTracking().Where(h => h.Id == line.HsCodeId).Select(h => new { h.Code, h.DescriptionEn }).FirstOrDefaultAsync(ct);
        var code = string.IsNullOrWhiteSpace(line.TariffItemNo) ? hs?.Code ?? line.Code : line.TariffItemNo;
        return (code, line.NationalCode ?? "", TariffDescriptions.ForCode(line.DescriptionEn, hs?.DescriptionEn ?? "", code));
    }

    private async Task<object> Office(Guid? locationId, CancellationToken ct)
    {
        var location = locationId is null ? null : await db.CustomsLocations.AsNoTracking().Where(l => l.Id == locationId).Select(l => new { l.DisplayName, l.Name, l.OfficialCode }).FirstOrDefaultAsync(ct);
        return new { name = location is null ? "Ethiopian Customs Commission" : string.IsNullOrWhiteSpace(location.DisplayName) ? location.Name : location.DisplayName, code = location?.OfficialCode ?? "" };
    }

    private async Task<string> OfficerName(string? subject, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(subject)) return "";
        if (Guid.TryParse(subject, out var id)) return await db.AuthAccounts.AsNoTracking().Where(a => a.Id == id).Select(a => a.FullName).FirstOrDefaultAsync(ct) ?? "";
        return await db.AuthAccounts.AsNoTracking().Where(a => a.Username == subject).Select(a => a.FullName).FirstOrDefaultAsync(ct) ?? subject;
    }
}
