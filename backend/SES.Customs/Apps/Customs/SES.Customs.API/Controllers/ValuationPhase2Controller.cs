using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Integrations.PricesApi;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

[ApiController]
[Route("api/valuation-decisions/{decisionId:guid}/phase-2")]
[Authorize(Policy = "CustomsOfficer")]
public sealed class ValuationPhase2Controller(CustomsDbContext db, HistoricalFxClient fx) : ControllerBase
{
    private const string RuleVersion = "officer-sequential-duty-excise-surtax-vat-v1";
    private const decimal VatRate = 15m;
    private const decimal SurtaxRate = 10m;
    private const decimal SocialWelfareLevyRate = 3m;
    private const decimal WithholdingRate = 3m;
    private const decimal SurtaxDutyThreshold = 15m;
    private const string VatSource = "https://www.mofed.gov.et/media/filer_public/af/45/af45af2f-7959-4e8b-b736-9494dda9f017/vat_proclamation_no_1341-2016_with_annex.pdf";
    private const string ExciseSource = "https://www.mofed.gov.et/media/filer_public/aa/05/aa05db27-ad07-40dc-9aac-fe74c3a38fa0/specific_excise_tax_rates_adjustment-_directive_no_1007_1.pdf";
    private const string SurtaxSource = "https://www.mofed.gov.et/media/filer_public/86/fb/86fb37d6-8405-45ad-b439-560b3e818d45/tax_compliance_guide_for_foreign_investors_in_ethiopia.pdf";
    private const string SocialWelfareSource = "https://www.mofed.gov.et/media/filer_public/9f/70/9f702522-6150-4a70-98fa-d80b1c0eb3b4/macro_fiscal_performance_2024_mof.pdf";
    private const string WithholdingSource = "https://www.mofed.gov.et/mof-directive/tax-directive/";

    private static readonly string[] StandardTaxNames = ["Customs Duty", "Excise Tax", "VAT", "Surtax", "Withholding Tax", "Social Welfare Levy"];
    private static readonly HashSet<string> SurtaxExcludedCategories = new(StringComparer.OrdinalIgnoreCase) { "fertilizer", "petroleum", "lubricants", "freight vehicle", "passenger vehicle", "special purpose vehicle", "aircraft", "spacecraft", "capital goods" };
    private static readonly HashSet<string> ComesaFtaCountries = new(StringComparer.OrdinalIgnoreCase) { "burundi", "comoros", "djibouti", "egypt", "kenya", "madagascar", "malawi", "mauritius", "rwanda", "sudan", "zambia", "zimbabwe" };

    [HttpGet]
    public async Task<IActionResult> Get(Guid decisionId, CancellationToken ct)
    {
        var decision = await db.ValuationDecisions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == decisionId, ct);
        if (decision is null) return NotFound(new { message = "Phase 1 valuation case was not found." });
        if (!CanAccess(decision)) return Forbid();
        var phase2 = await db.ValuationPhase2s.AsNoTracking().Include(x => x.TaxLines).FirstOrDefaultAsync(x => x.ValuationDecisionId == decisionId, ct);
        return Ok(MapResponse(decision, phase2));
    }

    [HttpPost("calculate")]
    public async Task<IActionResult> Calculate(Guid decisionId, Phase2Request request, CancellationToken ct)
    {
        var loaded = await LoadDecisionAsync(decisionId, ct);
        if (loaded.Error is not null) return loaded.Error;
        request = CarryForwardPhase1Value(loaded.Decision!, request);
        var validation = await ValidateRequestAsync(loaded.Decision!, request, false, ct);
        if (validation is not null) return validation;
        var tariff = await LoadTariffAsync(request.SelectedHsCodeId!.Value, ct);
        if (tariff is null) return BadRequest(new { message = "No effective tariff line is available for the selected HS code. Select a code with an official tariff source before calculating." });
        var specificRate = await GetEtbToTargetRateAsync(tariff, request.TargetCurrency, ct);
        return Ok(MapResponse(loaded.Decision!, BuildPhase2(loaded.Decision!, request, loaded.Existing, tariff, specificRate)));
    }

    [HttpPut]
    public Task<IActionResult> Save(Guid decisionId, Phase2Request request, CancellationToken ct) => SaveInternal(decisionId, request, "InProgress", ct);

    [HttpPost("complete")]
    public Task<IActionResult> Complete(Guid decisionId, Phase2Request request, CancellationToken ct) => SaveInternal(decisionId, request, "Completed", ct);

    private async Task<IActionResult> SaveInternal(Guid decisionId, Phase2Request request, string status, CancellationToken ct)
    {
        var loaded = await LoadDecisionAsync(decisionId, ct);
        if (loaded.Error is not null) return loaded.Error;
        var decision = loaded.Decision!;
        request = CarryForwardPhase1Value(decision, request);
        var validation = await ValidateRequestAsync(decision, request, status == "Completed", ct);
        if (validation is not null) return validation;
        if (loaded.Existing is not null && request.ExpectedVersion.HasValue && loaded.Existing.Version != request.ExpectedVersion.Value)
            return Conflict(new { message = "This assessment changed in another session. Reload it before saving.", version = loaded.Existing.Version });
        var tariff = await LoadTariffAsync(request.SelectedHsCodeId!.Value, ct);
        if (tariff is null) return BadRequest(new { message = "No effective tariff line is available for the selected HS code." });
        if (status == "Completed" && !ParseRate(tariff.Duty).HasValue)
        {
            var manualDuty = request.TaxLines?.FirstOrDefault(x => string.Equals(x.Name?.Trim(), "Customs Duty", StringComparison.OrdinalIgnoreCase));
            if (manualDuty is null || manualDuty.Value < 0)
                return BadRequest(new { message = "This HS 2022 tariff mapping has no single numeric duty rate. Enter the officer-approved Customs Duty rate before confirming the assessment." });
        }
        var oldTaxLines = loaded.Existing?.TaxLines.ToList() ?? [];
        var specificRate = await GetEtbToTargetRateAsync(tariff, request.TargetCurrency, ct);
        var phase2 = BuildPhase2(decision, request, loaded.Existing, tariff, specificRate);
        phase2.Status = status;
        phase2.OfficerConfirmed = status == "Completed";
        var previous = loaded.Existing is null ? null : JsonSerializer.Serialize(new { loaded.Existing.Status, loaded.Existing.FinalAmount, loaded.Existing.TotalTax, loaded.Existing.Version });
        var originalHs = decision.HsCodeId.HasValue
            ? await db.HsCodes.AsNoTracking().Where(x => x.Id == decision.HsCodeId.Value).Select(x => new { x.Code, x.DescriptionEn }).SingleOrDefaultAsync(ct)
            : null;
        var selectedHs = await db.HsCodes.AsNoTracking().Where(x => x.Id == phase2.SelectedHsCodeId).Select(x => new { x.Code, x.DescriptionEn }).SingleOrDefaultAsync(ct);
        var hsCodeChanged = decision.HsCodeId.HasValue && phase2.SelectedHsCodeId.HasValue && decision.HsCodeId.Value != phase2.SelectedHsCodeId.Value;
        // Relational providers need an explicit transaction so the assessment
        // and audit entry commit together. EF InMemory is used by the local demo
        // backend and rejects BeginTransactionAsync, which otherwise turns every
        // Phase 2 save into an HTTP 500.
        await using var transaction = db.Database.IsRelational()
            ? await db.Database.BeginTransactionAsync(ct)
            : null;
        if (loaded.Existing is null) db.ValuationPhase2s.Add(phase2);
        else { db.ValuationPhase2TaxLines.RemoveRange(oldTaxLines); db.Entry(phase2).State = EntityState.Modified; db.ValuationPhase2TaxLines.AddRange(phase2.TaxLines); }
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(), UserId = CurrentSubject(), SubjectUserId = Guid.TryParse(CurrentSubject(), out var officerId) ? officerId : null, Username = User.Identity?.Name ?? "", OccurredAt = DateTimeOffset.UtcNow,
            Action = status == "Completed" ? "ETHIOPIAN_IMPORT_TAX_ASSESSMENT_COMPLETED" : "ETHIOPIAN_IMPORT_TAX_ASSESSMENT_SAVED",
            Module = "EthiopianImportTaxAssessment", RecordId = phase2.Id, PreviousValueJson = previous,
            NewValueJson = JsonSerializer.Serialize(new
            {
                phase2.ValuationDecisionId,
                    itemName = ProductName(decision.EvidenceNotes),
                    itemDescription = string.IsNullOrWhiteSpace(tariff.DescriptionEn) ? selectedHs?.DescriptionEn : tariff.DescriptionEn,
                phase1 = new
                {
                    selectedCustomsValue = decision.SelectedReferenceValue,
                    currency = decision.Currency,
                    reason = decision.Justification,
                    declaredPriceAmount = decision.DeclaredPriceAmount,
                    declaredPriceCurrency = decision.DeclaredPriceCurrency,
                    declaredPriceConvertedAmount = decision.DeclaredPriceConvertedAmount,
                    declaredPriceConvertedCurrency = decision.DeclaredPriceConvertedCurrency,
                    receiptFileName = decision.ReceiptFileName,
                    hsCode = originalHs?.Code,
                    hsDescription = originalHs?.DescriptionEn
                },
                phase2 = new
                {
                    originalHsCode = originalHs?.Code,
                    originalHsDescription = originalHs?.DescriptionEn,
                    selectedHsCode = selectedHs?.Code,
                    selectedHsDescription = selectedHs?.DescriptionEn,
                    hsCodeChanged,
                    customsValue = phase2.CustomsValueAmount,
                    customsValueCurrency = phase2.CustomsValueCurrency,
                    quantity = phase2.Quantity,
                    unit = phase2.Unit,
                    applicableDutiesTaxes = phase2.TaxLines,
                    finalReason = string.IsNullOrWhiteSpace(phase2.AdjustmentReason) ? phase2.Notes : phase2.AdjustmentReason,
                    adjustmentReason = phase2.AdjustmentReason,
                    notes = phase2.Notes,
                    totalTax = phase2.TotalTax,
                    finalMoney = phase2.FinalAmount,
                    status = phase2.Status
                },
                phase1SelectedReferenceValue = decision.SelectedReferenceValue,
                phase1Reason = decision.Justification,
                phase2.Status,
                phase2.CustomsValueAmount,
                phase2.Quantity,
                phase2.Unit,
                phase2.TotalTax,
                phase2.FinalAmount,
                phase2.TaxLines,
                phase2.ExemptionCodes,
                phase2.OriginCountry,
                phase2.AdjustmentReason,
                phase2.Notes
            }),
            Justification = string.IsNullOrWhiteSpace(phase2.AdjustmentReason) ? phase2.Notes : phase2.AdjustmentReason
        });
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        var saved = await db.ValuationPhase2s.AsNoTracking().Include(x => x.TaxLines).FirstAsync(x => x.Id == phase2.Id, ct);
        return Ok(MapResponse(decision, saved));
    }

    private async Task<(ValuationDecision? Decision, ValuationPhase2? Existing, IActionResult? Error)> LoadDecisionAsync(Guid decisionId, CancellationToken ct)
    {
        var decision = await db.ValuationDecisions.FirstOrDefaultAsync(x => x.Id == decisionId, ct);
        if (decision is null) return (null, null, NotFound(new { message = "Phase 1 valuation case was not found." }));
        if (!CanAccess(decision)) return (null, null, Forbid());
        return (decision, await db.ValuationPhase2s.Include(x => x.TaxLines).FirstOrDefaultAsync(x => x.ValuationDecisionId == decisionId, ct), null);
    }

    private async Task<IActionResult?> ValidateRequestAsync(ValuationDecision decision, Phase2Request request, bool completing, CancellationToken ct)
    {
        if (!request.SelectedHsCodeId.HasValue || !await db.HsCodes.AnyAsync(x => x.Id == request.SelectedHsCodeId.Value, ct)) return BadRequest(new { message = "Select a valid HS code before calculating import taxes." });
        if (request.CustomsValueAmount <= 0) return BadRequest(new { message = "Enter a positive customs value/CIF amount." });
        if (string.IsNullOrWhiteSpace(request.CustomsValueCurrency) || request.CustomsValueCurrency.Trim().Length != 3) return BadRequest(new { message = "Customs value currency must be a three-letter ISO code." });
        if (!string.Equals(request.CustomsValueCurrency, request.TargetCurrency, StringComparison.OrdinalIgnoreCase)) return BadRequest(new { message = "Customs value/CIF currency must match the working currency. Convert the CIF amount first and record the source rate in the notes." });
        if (string.IsNullOrWhiteSpace(request.ProductCategory)) return BadRequest(new { message = "Select the product category so statutory exclusions can be evaluated." });
        if (request.Quantity <= 0 || request.Quantity > 1_000_000_000m) return BadRequest(new { message = "Enter a positive shipment quantity within the supported range." });
        if (string.IsNullOrWhiteSpace(request.Unit) || request.Unit.Trim().Length > 40) return BadRequest(new { message = "Select a valid shipment unit." });
        if (request.TargetCurrency is null || request.TargetCurrency.Trim().Length != 3) return BadRequest(new { message = "Target currency must be a three-letter ISO code." });
        var remarksIssue = OfficerNoteQuality.Check(request.Notes);
        if (remarksIssue is not null) return BadRequest(new { message = remarksIssue });
        var adjustmentNoteIssue = OfficerNoteQuality.Check(request.AdjustmentReason);
        if (adjustmentNoteIssue is not null) return BadRequest(new { message = adjustmentNoteIssue });
        if (request.ExchangeRate < 0) return BadRequest(new { message = "Exchange rate cannot be negative." });
        if (!string.Equals(GetInitialDutyCurrency(decision), request.TargetCurrency.Trim(), StringComparison.OrdinalIgnoreCase) && request.ExchangeRate <= 0) return BadRequest(new { message = "Provide a positive exchange rate when converting the Phase 1 reference currency." });
        if (!string.Equals(request.ManualAdjustmentType, "Fixed", StringComparison.OrdinalIgnoreCase) && !string.Equals(request.ManualAdjustmentType, "Percentage", StringComparison.OrdinalIgnoreCase)) return BadRequest(new { message = "Manual adjustment type must be Fixed or Percentage." });
        if (request.ExemptionAmount < 0 || request.WaiverAmount < 0 || request.ManualAdjustmentAmount < 0) return BadRequest(new { message = "Exemptions, waivers, and adjustments cannot be negative." });
        if ((request.TaxLines?.Length ?? 0) > 30) return BadRequest(new { message = "An assessment cannot contain more than 30 tax lines." });
        var submittedExcise = request.TaxLines?.FirstOrDefault(x => string.Equals(x.Name?.Trim(), "Excise Tax", StringComparison.OrdinalIgnoreCase));
        var submittedSpecificExcise = request.TaxLines?.FirstOrDefault(x => string.Equals(x.Name?.Trim(), "Excise Tax (specific)", StringComparison.OrdinalIgnoreCase));
        if ((request.ExciseTaxApplicable || submittedExcise?.IsApplicable == true) && (submittedExcise?.Value ?? 0) <= 0 && (submittedSpecificExcise?.Value ?? 0) <= 0)
            return BadRequest(new { message = "Excise tax is marked applicable, but no HS/category-specific rate or specific amount was entered. Enter the officer-approved rate or mark it not applicable." });
        foreach (var tax in request.TaxLines ?? [])
            if (tax.CalculationType is not ("Percentage" or "Fixed" or "PerUnit")) return BadRequest(new { message = $"Unsupported calculation type for {tax.Name}." });
        if (completing && !request.OfficerConfirmation) return BadRequest(new { message = "Officer confirmation is required before completing the assessment." });
        return null;
    }

    private async Task<NationalTariffLine?> LoadTariffAsync(Guid hsCodeId, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        return await db.NationalTariffLines.AsNoTracking().Where(x => x.HsCodeId == hsCodeId && x.EffectiveDate <= today && (x.EndDate == null || x.EndDate >= today)).OrderByDescending(x => x.EffectiveDate).ThenBy(x => x.Code).FirstOrDefaultAsync(ct);
    }

    private async Task<(decimal? Rate, string Source)> GetEtbToTargetRateAsync(NationalTariffLine tariff, string targetCurrency, CancellationToken ct)
    {
        if (ExciseRuleFor(tariff) is not { SpecificRate: > 0 }) return (1m, "No specific excise conversion required");
        if (string.Equals(targetCurrency, "ETB", StringComparison.OrdinalIgnoreCase)) return (1m, "ETB statutory amount");
        try
        {
            var detail = await fx.GetRateDetailAsync(targetCurrency, ct);
            if (detail is { RateToTarget: > 0 }) return (detail.RateToTarget, detail.Source);
            var rates = await fx.RatesAsync(DateOnly.FromDateTime(DateTime.UtcNow), ct);
            return rates.TryGetValue(targetCurrency.Trim().ToUpperInvariant(), out var rate) && rate > 0
                ? (1m / rate, "ETB cross-rate via configured FX provider")
                : (null, "ETB cross-rate unavailable; officer review required");
        }
        catch (HttpRequestException)
        {
            return (null, "ETB cross-rate unavailable; officer review required");
        }
    }

    private static ValuationPhase2 BuildPhase2(ValuationDecision decision, Phase2Request request, ValuationPhase2? existing, NationalTariffLine tariff, (decimal? Rate, string Source) specificRate)
    {
        var phase2 = existing ?? new ValuationPhase2 { Id = Guid.NewGuid(), ValuationDecisionId = decision.Id };
        phase2.OriginalHsCodeId = decision.HsCodeId; phase2.SelectedHsCodeId = request.SelectedHsCodeId;
        phase2.CustomsValueAmount = Money(request.CustomsValueAmount); phase2.CustomsValueCurrency = request.CustomsValueCurrency.Trim().ToUpperInvariant();
        phase2.Quantity = request.Quantity; phase2.Unit = request.Unit.Trim();
        phase2.OriginCountry = request.OriginCountry?.Trim() ?? ""; phase2.ProductCategory = request.ProductCategory!.Trim();
        phase2.ExemptionCodes = string.Join(",", (request.ExemptionCodes ?? []).Select(x => x.Trim().ToUpperInvariant()).Where(x => x.Length > 0).Distinct());
        phase2.OriginPreferenceClaimed = request.OriginPreferenceClaimed; phase2.ExciseTaxApplicable = ExciseRuleFor(tariff) is not null || request.ExciseTaxApplicable; phase2.IsCommercialImport = request.IsCommercialImport; phase2.WithholdingApplicable = request.WithholdingApplicable;
        phase2.AdjustmentReason = request.AdjustmentReason?.Trim() ?? ""; phase2.InitialDutyAmount = GetInitialDuty(decision); phase2.InitialDutyCurrency = GetInitialDutyCurrency(decision);
        phase2.TargetCurrency = request.TargetCurrency.Trim().ToUpperInvariant(); phase2.ExchangeRate = request.ExchangeRate <= 0 ? 1m : request.ExchangeRate; phase2.ExchangeRateSource = string.IsNullOrWhiteSpace(request.ExchangeRateSource) ? "Same currency" : request.ExchangeRateSource.Trim(); phase2.ExchangeRateDate = request.ExchangeRateDate;
        phase2.ExemptionAmount = request.ExemptionAmount; phase2.WaiverAmount = request.WaiverAmount; phase2.ManualAdjustmentAmount = request.ManualAdjustmentAmount; phase2.ManualAdjustmentType = request.ManualAdjustmentType.Trim(); phase2.Notes = request.Notes?.Trim() ?? "";
        phase2.CalculationRuleVersion = RuleVersion; phase2.Version = Guid.NewGuid(); phase2.TaxLines = CalculateTaxLines(request, tariff, specificRate);
        phase2.TotalTax = Money(phase2.TaxLines.Where(x => x.IsApplicable).Sum(x => x.CalculatedAmount)); phase2.TotalAdditionalTax = phase2.TotalTax;
        var adjustment = string.Equals(request.ManualAdjustmentType, "Percentage", StringComparison.OrdinalIgnoreCase) ? phase2.CustomsValueAmount * request.ManualAdjustmentAmount / 100m : request.ManualAdjustmentAmount;
        phase2.FinalAmount = Money(Math.Max(0m, phase2.CustomsValueAmount + phase2.TotalTax - request.ExemptionAmount - request.WaiverAmount + adjustment)); phase2.CalculatedAt = DateTimeOffset.UtcNow; phase2.OfficerConfirmed = request.OfficerConfirmation;
        return phase2;
    }

    private static List<ValuationPhase2TaxLine> CalculateTaxLines(Phase2Request request, NationalTariffLine tariff, (decimal? Rate, string Source) specificRate)
    {
        var submitted = request.TaxLines ?? [];
        var exciseRule = ExciseRuleFor(tariff);
        var codes = new HashSet<string>((request.ExemptionCodes ?? []).Select(x => x.Trim().ToUpperInvariant()), StringComparer.OrdinalIgnoreCase);
        var recommendedDutyRate = ParseRate(tariff.Duty);
        var suppliedDuty = submitted.FirstOrDefault(x => string.Equals(x.Name?.Trim(), "Customs Duty", StringComparison.OrdinalIgnoreCase));
        var dutyNeedsReview = !recommendedDutyRate.HasValue;
        var dutyRate = recommendedDutyRate ?? suppliedDuty?.Value ?? 0m;
        var originCountry = request.OriginCountry?.Trim() ?? "";
        if (request.OriginPreferenceClaimed && ComesaFtaCountries.Contains(originCountry)) dutyRate = 0m;
        var dutyRateKnown = recommendedDutyRate.HasValue || suppliedDuty is not null;
        var surtaxExcluded = codes.Contains("SURTAX_EXEMPT") || SurtaxExcludedCategories.Contains(request.ProductCategory!.Trim());
        var surtaxThresholdUnknown = !dutyRateKnown;
        var surtaxApplies = !surtaxExcluded && !surtaxThresholdUnknown && dutyRate > SurtaxDutyThreshold;
        var vatExempt = codes.Contains("VAT_EXEMPT") || codes.Contains("TAX_EXEMPT") || codes.Contains("DIPLOMATIC");
        var socialExempt = codes.Contains("SOCIAL_WELFARE_EXEMPT") || codes.Contains("TAX_EXEMPT") || codes.Contains("DIPLOMATIC");
        var withholdingApplicable = request.IsCommercialImport && request.WithholdingApplicable && !codes.Contains("WITHHOLDING_NOT_APPLICABLE");
        var socialApplicable = !socialExempt && !surtaxApplies && !surtaxThresholdUnknown;
        var exciseRate = exciseRule?.AdValoremRate ?? 0m;
        var exciseCategoryReview = exciseRule is null && ExciseMayApply(tariff, request.ProductCategory!);
        var exciseApplies = exciseRule is not null || request.ExciseTaxApplicable || exciseCategoryReview;
        var exciseNeedsReview = exciseRule is null && (request.ExciseTaxApplicable || exciseCategoryReview);
        var exciseUnitMatches = exciseRule is not null && UnitMatches(request.Unit, exciseRule.Unit);
        var hasSpecificRate = exciseRule is { SpecificRate: > 0 };
        var specificNeedsReview = hasSpecificRate && (!exciseUnitMatches || !specificRate.Rate.HasValue);
        var exciseNote = exciseRule?.Notes ?? (exciseNeedsReview
            ? "This tariff/category may be excisable, but no current verified rate is configured. Enter the officer-approved rate and source, or disable excise if it does not apply. No amount is assumed."
            : "No verified excise rate was found for this tariff item; review the current excise schedule before applying.");
        if (exciseRule is not null && specificNeedsReview)
            exciseNote += !exciseUnitMatches ? $" Shipment unit must be {exciseRule.Unit} for its specific-rate component." : $" {specificRate.Source}.";
        var surtaxNote = surtaxThresholdUnknown
            ? "Confirm the officer-approved Customs Duty rate before deciding whether the 10% import surtax applies."
            : surtaxApplies
                ? "10% import surtax is recommended under the configured duty threshold and applicable product-category checks."
                : surtaxExcluded
                    ? "Product category or recorded exemption excludes import surtax."
                    : "Customs duty is 15% or less; import surtax is generally not recommended under the configured threshold.";
        var lines = new List<ValuationPhase2TaxLine>
        {
            Line("Customs Duty", dutyRate, 1, "CIF", tariff.SourceReference, true, dutyNeedsReview ? "ReviewRequired" : "Recommended", dutyNeedsReview ? "The HS 2022 tariff record has no single numeric duty rate. Enter the officer-approved rate before completing this assessment." : $"{dutyRate:0.##}% from the selected national tariff item.", request.TargetCurrency),
            Line("Excise Tax", exciseRate, 2, "CIFPlusDuty", ExciseSource, exciseApplies, exciseNeedsReview || specificNeedsReview ? "ReviewRequired" : exciseApplies ? "Recommended" : "NotApplicable", exciseNote, request.TargetCurrency),
            Line("Surtax", SurtaxRate, 4, "CIFPlusDutyPlusExcise", SurtaxSource, surtaxApplies, surtaxThresholdUnknown ? "ReviewRequired" : surtaxApplies ? "Recommended" : "NotApplicable", surtaxNote, request.TargetCurrency),
            Line("VAT", VatRate, 5, "CIFPlusDutyPlusExcisePlusSurtax", VatSource, !vatExempt, vatExempt ? "NotApplicable" : "Recommended", vatExempt ? "Exemption selected; verify supporting authority." : "15% VAT is calculated after Customs Duty, Excise Tax, and Surtax in the configured assessment order.", request.TargetCurrency),
            Line("Withholding Tax", WithholdingRate, 6, "CIF", WithholdingSource, withholdingApplicable, withholdingApplicable ? "Recommended" : "NotApplicable", withholdingApplicable ? "3% of CIF for commercial imports; an advance income-tax payment." : "Not selected for this import or excluded by the commercial-import setting.", request.TargetCurrency),
            Line("Social Welfare Levy", SocialWelfareLevyRate, 7, "CIF", SocialWelfareSource, socialApplicable, socialExempt || surtaxApplies ? "NotApplicable" : surtaxThresholdUnknown ? "ReviewRequired" : "Recommended", socialExempt ? "Exemption selected; verify supporting authority." : surtaxApplies ? "Not applied because the import is already subject to surtax." : surtaxThresholdUnknown ? "Confirm surtax eligibility after the Customs Duty rate is resolved." : "3% of CIF when the import is not subject to surtax, subject to exemptions.", request.TargetCurrency)
        };
        if (hasSpecificRate && exciseRule!.Mode == ExciseSpecificMode.Additive)
        {
            lines.Add(Line("Excise Tax (specific)", exciseRule.SpecificRate, 3, "UNIT_RATE_ETB", ExciseSource,
                exciseUnitMatches && specificRate.Rate.HasValue,
                specificNeedsReview ? "ReviewRequired" : "Recommended",
                $"{exciseRule.SpecificRate:0.##} ETB per {exciseRule.Unit}. {exciseRule.Notes} {specificRate.Source}.", "ETB", "PerUnit"));
        }
        var supplied = submitted.Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .GroupBy(x => x.Name!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines)
        {
            if (!supplied.TryGetValue(line.Name, out var overrideLine)) continue;
            var recommendedApplicable = line.IsApplicable;
            line.Value = overrideLine.Value; line.CalculationType = overrideLine.CalculationType; line.Notes = string.IsNullOrWhiteSpace(overrideLine.Notes) ? line.Notes : overrideLine.Notes.Trim();
            if (overrideLine.IsApplicable.HasValue) line.IsApplicable = overrideLine.IsApplicable.Value;
            var applicabilityChanged = overrideLine.IsApplicable.HasValue && overrideLine.IsApplicable.Value != recommendedApplicable;
            if (Math.Abs(line.Value - line.RecommendedValue) > 0.0001m || !string.Equals(line.CalculationType, line.Name == "Excise Tax (specific)" ? "PerUnit" : "Percentage", StringComparison.OrdinalIgnoreCase) || applicabilityChanged || string.Equals(overrideLine.Status, "OfficerAdjusted", StringComparison.OrdinalIgnoreCase)) line.Status = "OfficerAdjusted";
            if (line.Name == "Excise Tax" && request.ExciseTaxApplicable) { line.IsApplicable = true; line.Status = "OfficerAdjusted"; }
        }
        foreach (var custom in submitted.Where(x => !string.IsNullOrWhiteSpace(x.Name) && !lines.Any(line => string.Equals(line.Name, x.Name.Trim(), StringComparison.OrdinalIgnoreCase))))
            lines.Add(Line(custom.Name!.Trim(), custom.Value, 90 + (custom.Order ?? 0), custom.CalculationBasis ?? "CIF", "Officer-entered charge. An optional note may record the legal source.", true, "OfficerAdjusted", custom.Notes ?? "", request.TargetCurrency, custom.CalculationType));

        var cif = request.CustomsValueAmount;
        var dutyLine = lines.First(x => x.Name == "Customs Duty");
        var exciseLine = lines.First(x => x.Name == "Excise Tax");
        var surtaxLine = lines.First(x => x.Name == "Surtax");
        var vatLine = lines.First(x => x.Name == "VAT");
        var specificLine = lines.FirstOrDefault(x => x.Name == "Excise Tax (specific)");
        var specificAmount = specificLine?.IsApplicable == true && specificLine.CalculationType == "PerUnit" && specificRate.Rate.HasValue
            ? Money(specificLine.Value * request.Quantity * specificRate.Rate.Value) : 0m;
        var dutyAmount = dutyLine.IsApplicable ? Money(cif * dutyLine.Value / 100m) : 0m;
        var excisePercentageAmount = exciseLine.IsApplicable && exciseLine.CalculationType == "Percentage"
            ? Money((cif + dutyAmount) * exciseLine.Value / 100m) : 0m;
        var exciseAdditionalAmount = exciseRule?.Mode == ExciseSpecificMode.GreaterOf && exciseUnitMatches && specificRate.Rate.HasValue
            ? Math.Max(0m, Money(Math.Max(excisePercentageAmount, Money(exciseRule.SpecificRate * request.Quantity * (specificRate.Rate ?? 0m))) - excisePercentageAmount))
            : specificAmount;
        if (exciseRule?.Mode == ExciseSpecificMode.GreaterOf && exciseUnitMatches && specificRate.Rate.HasValue && exciseLine.IsApplicable)
            exciseLine.Notes += $" Applied excise is the greater of {exciseLine.Value:0.##}% or {exciseRule.SpecificRate:0.##} ETB × {request.Quantity:0.####} {request.Unit}, converted to {request.TargetCurrency}.";
        var calculated = SequentialImportTaxCalculator.Calculate(
            cif, dutyLine.Value, exciseLine.Value, surtaxLine.Value, vatLine.Value, exciseAdditionalAmount,
            dutyLine.IsApplicable, exciseLine.IsApplicable, surtaxLine.IsApplicable, vatLine.IsApplicable);
        foreach (var line in lines.OrderBy(x => x.Order).ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase))
        {
            if (line.Name == "Customs Duty") { line.BaseAmount = calculated.DutyBase; line.CalculatedAmount = calculated.Duty; continue; }
            if (line.Name == "Excise Tax") { line.BaseAmount = calculated.ExciseBase; line.CalculatedAmount = exciseRule?.Mode == ExciseSpecificMode.Additive ? excisePercentageAmount : calculated.Excise; continue; }
            if (line.Name == "Excise Tax (specific)") { line.BaseAmount = request.Quantity; line.CalculatedAmount = line.IsApplicable ? specificAmount : 0m; continue; }
            if (line.Name == "Surtax") { line.BaseAmount = calculated.SurtaxBase; line.CalculatedAmount = calculated.Surtax; continue; }
            if (line.Name == "VAT") { line.BaseAmount = calculated.VatBase; line.CalculatedAmount = calculated.Vat; continue; }
            if (line.CalculationType == "PerUnit")
            {
                line.BaseAmount = request.Quantity;
                line.CalculatedAmount = line.IsApplicable ? Money(line.Value * request.Quantity * (specificRate.Rate ?? 0m)) : 0m;
                continue;
            }
            line.BaseAmount = Money(BaseFor(line.CalculationBasis, cif, calculated.Duty, calculated.Excise, calculated.Surtax, calculated.Vat));
            line.CalculatedAmount = line.IsApplicable ? Money(line.CalculationType == "Fixed" ? line.Value : line.BaseAmount * line.Value / 100m) : 0m;
        }
        var surtax = lines.FirstOrDefault(x => x.Name == "Surtax"); var social = lines.FirstOrDefault(x => x.Name == "Social Welfare Levy");
        if (social is not null && surtax is not null && surtax.IsApplicable) { social.IsApplicable = false; social.Status = "NotApplicable"; social.CalculatedAmount = 0m; social.Notes = "Not applied because the import is subject to surtax under the configured Social Welfare Levy rule."; }
        return lines.OrderBy(x => x.Order).ToList();
    }

    private enum ExciseSpecificMode { Additive, GreaterOf }
    private sealed record ExciseRule(decimal AdValoremRate, decimal SpecificRate, string Unit, ExciseSpecificMode Mode, string Notes);

    private static ExciseRule? ExciseRuleFor(NationalTariffLine? tariff)
    {
        if (tariff is null) return null;
        var code = new string((tariff.Code ?? "").Where(char.IsDigit).ToArray());
        var itemNo = new string((tariff.TariffItemNo ?? "").Where(char.IsDigit).ToArray());
        var identifier = itemNo.Length > 0 ? itemNo : code;
        if (identifier.StartsWith("240210", StringComparison.Ordinal)) return new(30m, 644m, "KG", ExciseSpecificMode.Additive, "Directive 1007/2024: 30% plus ETB 644 per kilogram for cigars, cheroots, and cigarillos.");
        if (identifier.StartsWith("240220", StringComparison.Ordinal)) return new(30m, 20m, "PACK20", ExciseSpecificMode.Additive, "Directive 1007/2024: 30% plus ETB 20 per pack of 20 cigarettes.");
        if (identifier.StartsWith("220300", StringComparison.Ordinal)) return new(40m, 28m, "L", ExciseSpecificMode.GreaterOf, "Directive 1007/2024: imported malt beer is taxed at 40% or ETB 28 per litre, whichever is higher.");
        if (identifier.StartsWith("220600", StringComparison.Ordinal) || identifier.StartsWith("22089010", StringComparison.Ordinal)) return new(40m, 28m, "L", ExciseSpecificMode.GreaterOf, "Directive 1007/2024: covered fermented/ready-to-drink beverages are taxed at 40% or ETB 28 per litre, whichever is higher.");
        if (identifier.StartsWith("39232110", StringComparison.Ordinal) || identifier.StartsWith("39232910", StringComparison.Ordinal)) return new(0m, 103m, "KG", ExciseSpecificMode.Additive, "Directive 1007/2024: ETB 103 per kilogram for shopping plastic bags.");
        return null;
    }

    private static bool ExciseMayApply(NationalTariffLine? tariff, string productCategory)
    {
        var item = new string((tariff?.TariffItemNo ?? tariff?.Code ?? "").Where(char.IsDigit).ToArray());
        var heading = item.Length >= 4 ? item[..4] : item;
        var headingNumber = int.TryParse(heading, NumberStyles.None, CultureInfo.InvariantCulture, out var parsedHeading) ? parsedHeading : 0;
        if (heading is "1701" or "1704" or "2201" or "2202" or "2203" or "2204" or "2205" or "2206" or "2207" or "2208" or "2209"
            or "2401" or "2403" or "2710" or "2711" or "3303" or "3304" or "3305" or "3306" or "3307"
            or "7106" or "7108" or "7110" or "7112" or "8525" or "8528" or "8701" or "8702" or "8703" or "8704" or "8705" or "8706" or "8711")
            return true;
        if (headingNumber is >= 6101 and <= 6117 or >= 6201 and <= 6217) return true;

        var category = productCategory.Trim();
        return category.Contains("alcohol", StringComparison.OrdinalIgnoreCase)
            || category.Contains("beverage", StringComparison.OrdinalIgnoreCase)
            || category.Contains("tobacco", StringComparison.OrdinalIgnoreCase)
            || category.Contains("sugar", StringComparison.OrdinalIgnoreCase)
            || category.Contains("cosmetic", StringComparison.OrdinalIgnoreCase)
            || category.Contains("textile", StringComparison.OrdinalIgnoreCase)
            || category.Contains("vehicle", StringComparison.OrdinalIgnoreCase)
            || category.Contains("petroleum", StringComparison.OrdinalIgnoreCase)
            || category.Contains("plastic bag", StringComparison.OrdinalIgnoreCase)
            || category.Contains("precious metal", StringComparison.OrdinalIgnoreCase);
    }

    private static ValuationPhase2TaxLine Line(string name, decimal value, int order, string basis, string source, bool applicable, string status, string notes, string currency = "ETB", string calculationType = "Percentage") => new() { Id = Guid.NewGuid(), Name = name, CalculationType = calculationType, Value = value, RecommendedValue = value, Currency = currency, Order = order, CalculationBasis = basis, SourceReference = source, IsApplicable = applicable, Status = status, Notes = notes };
    private static decimal BaseFor(string basis, decimal cif, decimal duty, decimal excise, decimal surtax, decimal vat) => basis.Trim().ToUpperInvariant() switch { "CIF" => cif, "CIFPLUSDUTY" => cif + duty, "CIFPLUSDUTYPLUSEXCISE" => cif + duty + excise, "CIFPLUSDUTYPLUSEXCISEPLUSSURTAX" => cif + duty + excise + surtax, "CIFPLUSDUTYPLUSVATPLUSEXCISE" => cif + duty + vat + excise, "INITIALDUTY" => cif + duty, _ => cif };
    private static bool UnitMatches(string unit, string required)
    {
        var normalized = new string((unit ?? "").Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        return required switch
        {
            "KG" => normalized is "KG" or "KGS" or "KILOGRAM" or "KILOGRAMS" || normalized.Contains("KG") || normalized.Contains("KILOGRAM"),
            "L" => normalized is "L" or "LT" or "LITRE" or "LITRES" or "LITER" or "LITERS" || normalized.Contains("LITRE") || normalized.Contains("LITER"),
            "PACK20" => normalized.Contains("PACK") && normalized.Contains("20"),
            _ => false,
        };
    }
    private static decimal? ParseRate(string? duty)
    {
        if (string.IsNullOrWhiteSpace(duty)) return null;
        if (duty.Contains("free", StringComparison.OrdinalIgnoreCase) || duty.Contains("exempt", StringComparison.OrdinalIgnoreCase)) return 0m;
        var match = Regex.Match(duty, @"(?<![0-9])([0-9]+(?:[.,][0-9]+)?)\s*%?");
        return match.Success && decimal.TryParse(match.Groups[1].Value.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var rate) ? rate : null;
    }

    private static decimal ExpectedRate(string name) => name.ToUpperInvariant() switch { "VAT" => VatRate, "SURTAX" => SurtaxRate, "SOCIAL WELFARE LEVY" => SocialWelfareLevyRate, "WITHHOLDING TAX" => WithholdingRate, _ => 0m };

    private static Phase2Request CarryForwardPhase1Value(ValuationDecision decision, Phase2Request request)
    {
        // Phase 1 is the source of the approved/reference customs value. If an
        // older client sends the Phase 2 default of zero, carry that value into
        // the assessment rather than allowing a zero-CIF record to be created.
        if (request.CustomsValueAmount != 0) return request;

        var amount = GetInitialDuty(decision);
        if (amount <= 0) return request;

        var currency = GetInitialDutyCurrency(decision).Trim().ToUpperInvariant();
        return request with
        {
            CustomsValueAmount = amount,
            CustomsValueCurrency = currency,
            TargetCurrency = currency,
            ExchangeRate = 1m,
            ExchangeRateSource = "Phase 1 selected customs value",
            ExchangeRateDate = null,
        };
    }

    private static object MapResponse(ValuationDecision decision, ValuationPhase2? phase2) => new
    {
        decisionId = decision.Id,
        phase1 = new { hsCodeId = decision.HsCodeId, initialDuty = GetInitialDuty(decision), initialDutyCurrency = GetInitialDutyCurrency(decision), source = decision.InitialDuty.HasValue ? "Phase 1 initial duty" : "Phase 1 reference value fallback", decision.DeclaredPriceAmount, decision.DeclaredPriceCurrency, decision.DeclaredPriceConvertedAmount, decision.DeclaredPriceConvertedCurrency, decision.DeclaredPriceExchangeRate, decision.DeclaredPriceExchangeRateSource, decision.DeclaredPriceExchangeRateDate, decision.ReceiptFileName, decision.ReceiptContentType, decision.ReceiptFileSize, decision.ReceiptSha256, decision.ReceiptUploadedAt },
        phase2 = phase2 is null ? null : new
        {
            phase2.Id, phase2.Status, phase2.OriginalHsCodeId, phase2.SelectedHsCodeId, phase2.CustomsValueAmount, phase2.CustomsValueCurrency, phase2.Quantity, phase2.Unit, phase2.OriginCountry, phase2.ProductCategory,
            exemptionCodes = phase2.ExemptionCodes.Split(',', StringSplitOptions.RemoveEmptyEntries), phase2.OriginPreferenceClaimed, phase2.ExciseTaxApplicable, phase2.IsCommercialImport, phase2.WithholdingApplicable, phase2.AdjustmentReason, phase2.OfficerConfirmed,
            phase2.InitialDutyAmount, phase2.InitialDutyCurrency, phase2.TargetCurrency, phase2.ExchangeRate, phase2.ExchangeRateSource, phase2.ExchangeRateDate, phase2.ExemptionAmount, phase2.WaiverAmount, phase2.ManualAdjustmentAmount, phase2.ManualAdjustmentType, phase2.Notes, phase2.TotalAdditionalTax, phase2.TotalTax, finalPayableAmount = phase2.FinalAmount, phase2.FinalAmount, phase2.CalculationRuleVersion, phase2.CalculatedAt, phase2.Version,
            taxLines = phase2.TaxLines.OrderBy(x => x.Order).Select(tax => new { tax.Id, tax.Name, tax.CalculationType, tax.Value, tax.RecommendedValue, tax.Currency, tax.Order, tax.CalculationBasis, tax.BaseAmount, tax.CalculatedAmount, tax.Notes, tax.Status, tax.SourceReference, tax.IsApplicable })
        }
    };

    private bool CanAccess(ValuationDecision decision) { if (string.IsNullOrWhiteSpace(decision.OfficerSubjectId)) return true; var subject = CurrentSubject(); return string.Equals(decision.OfficerSubjectId, subject, StringComparison.OrdinalIgnoreCase) || string.Equals(decision.OfficerSubjectId, User.Identity?.Name, StringComparison.OrdinalIgnoreCase); }
    private string CurrentSubject() => User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "unknown";
    private static decimal GetInitialDuty(ValuationDecision decision) => decision.InitialDuty ?? decision.SelectedReferenceValue;
    private static string GetInitialDutyCurrency(ValuationDecision decision) => string.IsNullOrWhiteSpace(decision.InitialDutyCurrency) ? (string.IsNullOrWhiteSpace(decision.Currency) ? "ETB" : decision.Currency) : decision.InitialDutyCurrency;
    private static string? ProductName(string? evidenceNotes)
    {
        if (string.IsNullOrWhiteSpace(evidenceNotes)) return null;
        try
        {
            using var document = JsonDocument.Parse(evidenceNotes);
            return document.RootElement.TryGetProperty("product", out var product) ? product.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static decimal Money(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}

public sealed record Phase2Request(Guid? SelectedHsCodeId, string TargetCurrency, decimal ExchangeRate, string? ExchangeRateSource, DateOnly? ExchangeRateDate, decimal ExemptionAmount, decimal WaiverAmount, decimal ManualAdjustmentAmount, string ManualAdjustmentType, string? Notes, Phase2TaxLineRequest[]? TaxLines, decimal CustomsValueAmount = 0, string CustomsValueCurrency = "ETB", string? OriginCountry = null, string? ProductCategory = null, string[]? ExemptionCodes = null, bool OriginPreferenceClaimed = false, bool ExciseTaxApplicable = false, bool IsCommercialImport = true, bool WithholdingApplicable = true, string? AdjustmentReason = null, bool OfficerConfirmation = false, Guid? ExpectedVersion = null, decimal Quantity = 1m, string Unit = "PCS");
public sealed record Phase2TaxLineRequest(string? Name, string CalculationType, decimal Value, string? Currency, int? Order, string? CalculationBasis, string? Notes, bool? IsApplicable = null, string? Status = null);
