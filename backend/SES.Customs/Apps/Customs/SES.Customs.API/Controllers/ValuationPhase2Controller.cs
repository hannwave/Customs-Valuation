using SES.Customs.API.Services;
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Integrations.PricesApi;
using SES.Customs.API.Security;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

[ApiController]
[Route("api/valuation-decisions/{decisionId:guid}/phase-2")]
[Authorize(Policy = "CustomsOfficer")]
public sealed class ValuationPhase2Controller(CustomsDbContext db, HistoricalFxClient fx) : ControllerBase
{
    private const string RuleVersion = "officer-sequential-duty-excise-surtax-product-type-v4";

    [HttpGet]
    public async Task<IActionResult> Get(Guid decisionId, CancellationToken ct)
    {
        var decision = await db.ValuationDecisions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == decisionId, ct);
        if (decision is null) return NotFound(new { message = "Phase 1 valuation case was not found." });
        if (!CanAccess(decision)) return Forbid();
        var phase2 = await db.ValuationPhase2s.AsNoTracking().Include(x => x.TaxLines).FirstOrDefaultAsync(x => x.ValuationDecisionId == decisionId, ct);
        return Ok(await MapResponse(decision, phase2, ct));
    }

    [HttpPost("calculate")]
    public async Task<IActionResult> Calculate(Guid decisionId, Phase2Request request, CancellationToken ct)
    {
        var loaded = await LoadDecisionAsync(decisionId, ct);
        if (loaded.Error is not null) return loaded.Error;
        request = CarryForwardPhase1Value(loaded.Decision!, request);
        var validation = await ValidateRequestAsync(loaded.Decision!, request, false, ct);
        if (validation is not null) return validation;
        var (tariff, needsLineChoice) = await LoadTariffAsync(loaded.Decision!, request.SelectedHsCodeId!.Value, request.SelectedTariffLineId, ct);
        if (tariff is null) return BadRequest(new { message = "No effective tariff line is available for the selected HS code. Select a code with an official tariff source before calculating." });
        var specificRate = await GetEtbToTargetRateAsync(tariff, request.TargetCurrency, ct);
        var importerContext = await LoadImporterAssessmentContextAsync(loaded.Decision!, request, ct);
        return Ok(await MapResponse(loaded.Decision!, BuildPhase2(loaded.Decision!, request, loaded.Existing, tariff, specificRate, importerContext, needsLineChoice), ct));
    }

    /// <summary>
    /// Duties and taxes for a shipment that is not saved yet: the valuation search's review step shows the assessment
    /// before the officer confirms it. Uses the same calculator, reliefs and tariff rates as the saved assessment.
    /// </summary>
    [HttpPost("/api/valuation-search/tax-preview")]
    public async Task<IActionResult> TaxPreview(TaxPreviewRequest input, CancellationToken ct)
    {
        if (input.CustomsValueAmount <= 0) return BadRequest(new { message = "Enter a positive customs value." });
        if (input.Quantity <= 0 || input.Quantity > 1_000_000_000m) return BadRequest(new { message = "Enter a positive shipment quantity." });
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var tariff = await db.NationalTariffLines.AsNoTracking().Include(x => x.TaxRates)
            .FirstOrDefaultAsync(x => x.Id == input.TariffLineId && x.EffectiveDate <= today && (x.EndDate == null || x.EndDate >= today), ct);
        if (tariff is null) return NotFound(new { message = "The tariff line is not in the current tariff book." });
        var manufacturing = string.Equals(input.ImportPurpose?.Trim(), "MANUFACTURING", StringComparison.OrdinalIgnoreCase);
        var machinery = manufacturing && input.IsMachineryOrEquipment;
        var category = machinery ? "Capital goods" : manufacturing ? "Manufacturing input" : "General goods";
        var commercial = !manufacturing && input.IsCommercialImport;
        var unit = string.IsNullOrWhiteSpace(input.Unit) ? "PCS" : input.Unit.Trim()[..Math.Min(40, input.Unit.Trim().Length)];
        var specificRate = await GetEtbToTargetRateAsync(tariff, "ETB", ct);
        var lines = ImportTaxAssessmentCalculator.Calculate(new(
            tariff, Money(input.CustomsValueAmount), input.Quantity, unit, category, input.OriginCountry?.Trim() ?? "",
            false, commercial, true, manufacturing, machinery, false, [], [], specificRate.Rate, specificRate.Source, "ETB"));
        var total = Money(lines.Where(x => x.IsApplicable && !IsExciseComparisonLine(x)).Sum(x => x.CalculatedAmount));
        var hsDescription = await db.HsCodes.AsNoTracking().Where(x => x.Id == tariff.HsCodeId).Select(x => x.DescriptionEn).FirstOrDefaultAsync(ct);
        return Ok(new
        {
            tariffLineId = tariff.Id, tariffItemNo = tariff.TariffItemNo ?? tariff.Code, nationalCode = tariff.NationalCode,
            description = TariffDescriptions.ForCode(tariff.DescriptionEn, hsDescription, tariff.TariffItemNo ?? tariff.Code),
            productCategory = category, isManufacturing = manufacturing, isMachineryOrEquipment = machinery,
            customsValueAmount = Money(input.CustomsValueAmount), currency = "ETB",
            taxLines = lines.OrderBy(x => x.Order).Select(x => new { x.Name, x.CalculationType, x.Value, x.CalculationBasis, x.BaseAmount, x.CalculatedAmount, x.Notes, x.Status, x.SourceReference, x.IsApplicable, comparisonOnly = IsExciseComparisonLine(x) }),
            totalTax = total, totalWithCustomsValue = Money(input.CustomsValueAmount + total),
            reviewRequired = lines.Any(x => x.IsApplicable && x.Status == "ReviewRequired"),
        });
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
        var (tariff, needsLineChoice) = await LoadTariffAsync(decision, request.SelectedHsCodeId!.Value, request.SelectedTariffLineId, ct);
        if (tariff is null) return BadRequest(new { message = "No effective tariff line is available for the selected HS code." });
        if (status == "Completed" && needsLineChoice)
            return BadRequest(new { message = "This HS code has several national tariff lines with different duty rates. Choose the national tariff line before confirming the assessment." });
        var dutyExemptionSelected = (request.ExemptionCodes ?? []).Any(code =>
            string.Equals(code?.Trim(), "CUSTOMS_DUTY_EXEMPT", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(code?.Trim(), "MACHINERY_EQUIPMENT_EXEMPT", StringComparison.OrdinalIgnoreCase));
        if (status == "Completed" && !dutyExemptionSelected && !ParseRate(tariff.Duty).HasValue)
        {
            var manualDuty = request.TaxLines?.FirstOrDefault(x => string.Equals(x.Name?.Trim(), "Customs Duty", StringComparison.OrdinalIgnoreCase));
            if (manualDuty is null || manualDuty.Value < 0)
                return BadRequest(new { message = "This HS 2022 tariff mapping has no single numeric duty rate. Enter the officer-approved Customs Duty rate before confirming the assessment." });
        }
        var oldTaxLines = loaded.Existing?.TaxLines.ToList() ?? [];
        var specificRate = await GetEtbToTargetRateAsync(tariff, request.TargetCurrency, ct);
        var importerContext = await LoadImporterAssessmentContextAsync(decision, request, ct);
        var phase2 = BuildPhase2(decision, request, loaded.Existing, tariff, specificRate, importerContext, needsLineChoice);
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
        var audit = new AuditLog
        {
            Id = Guid.NewGuid(), UserId = CurrentSubject(), SubjectUserId = Guid.TryParse(CurrentSubject(), out var officerId) ? officerId : null, Username = User.Identity?.Name ?? "", OccurredAt = DateTimeOffset.UtcNow,
            Action = status == "Completed" ? "ETHIOPIAN_IMPORT_TAX_ASSESSMENT_COMPLETED" : "ETHIOPIAN_IMPORT_TAX_ASSESSMENT_SAVED",
            Module = "EthiopianImportTaxAssessment", RecordId = phase2.Id, PreviousValueJson = previous,
            NewValueJson = JsonSerializer.Serialize(new
            {
                phase2.ValuationDecisionId,
                    itemName = string.IsNullOrWhiteSpace(decision.ProductName) ? ProductName(decision.EvidenceNotes) : decision.ProductName,
                    purchaseCountryCode = decision.PurchaseCountryCode,
                    purchaseCountryName = decision.PurchaseCountryName,
                    selectedPriceSource = decision.SelectedPriceSource,
                    valuationMethod = decision.ValuationMethod,
                    productPhoto = decision.ProductPhotoUrl,
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
        };
        db.AuditLogs.Add(audit);
        var officer = Guid.TryParse(decision.OfficerSubjectId, out var valuationOfficerId)
            ? await db.AuthAccounts.AsNoTracking().SingleOrDefaultAsync(user => user.Id == valuationOfficerId, ct)
            : null;
        var office = decision.LocationId.HasValue
            ? await db.CustomsLocations.AsNoTracking().SingleOrDefaultAsync(location => location.Id == decision.LocationId.Value, ct)
            : null;
        db.ValuationAuditSnapshots.Add(ValuationAuditSnapshotFactory.Create(
            audit, decision, phase2, selectedHs?.Code, string.IsNullOrWhiteSpace(tariff.DescriptionEn) ? selectedHs?.DescriptionEn : tariff.DescriptionEn, officer, office));
        if (status == "Completed" && decision.ImporterDeclarationId.HasValue) await FinaliseImporterDeclarationAsync(decision, phase2, audit.Justification, ct);
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        var saved = await db.ValuationPhase2s.AsNoTracking().Include(x => x.TaxLines).FirstAsync(x => x.Id == phase2.Id, ct);
        return Ok(await MapResponse(decision, saved, ct));
    }

    /// <summary>Records the confirmed assessment on the importer's declaration and tells the importer what is payable.</summary>
    private async Task FinaliseImporterDeclarationAsync(ValuationDecision decision, ValuationPhase2 phase2, string? note, CancellationToken ct)
    {
        var declaration = await db.ImporterDeclarations.FirstOrDefaultAsync(x => x.Id == decision.ImporterDeclarationId!.Value, ct);
        if (declaration is null) return;
        var revised = declaration.Status == "ASSESSED";
        var previousStatus = declaration.Status;
        var now = DateTimeOffset.UtcNow;
        declaration.Status = "ASSESSED"; declaration.AssessedAt = now; declaration.UpdatedAt = now; declaration.Version = Guid.NewGuid();
        declaration.AssessmentCurrency = phase2.TargetCurrency; declaration.AssessedCustomsValue = phase2.CustomsValueAmount;
        declaration.AssessedTotalTax = phase2.TotalTax; declaration.AssessedPayable = Money(Math.Max(0m, phase2.FinalAmount - phase2.CustomsValueAmount));
        declaration.AssessmentJson = JsonSerializer.Serialize(phase2.TaxLines.Where(x => !IsExciseComparisonLine(x)).OrderBy(x => x.Order).Select(x => new
        {
            name = x.Name, calculationType = x.CalculationType, rate = x.Value, currency = x.Currency, calculationBasis = x.CalculationBasis,
            baseAmount = x.BaseAmount, amount = x.CalculatedAmount, isApplicable = x.IsApplicable, status = x.Status
        }));
        var currency = phase2.TargetCurrency;
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(), UserId = CurrentSubject(), SubjectUserId = declaration.ImporterId, Username = User.Identity?.Name ?? "", OccurredAt = now,
            Action = "IMPORTER_DECLARATION_ASSESSED", Module = "ImporterDeclarations", RecordId = declaration.Id, LocationId = declaration.LocationId, Decision = "ASSESSED",
            Justification = note, PreviousValueJson = JsonSerializer.Serialize(new { Status = previousStatus }),
            NewValueJson = JsonSerializer.Serialize(new { declaration.Reference, Status = "ASSESSED", valuationDecisionId = decision.Id, assessmentId = phase2.Id, currency,
                customsValue = declaration.AssessedCustomsValue, totalTax = declaration.AssessedTotalTax, payable = declaration.AssessedPayable, revised })
        });
        db.ImporterNotifications.Add(ImporterNotification.Create(declaration.ImporterId, declaration.Id, "DECLARATION_ASSESSED",
            revised ? $"Revised assessment for {declaration.Reference}" : $"{declaration.Reference} has been assessed",
            $"Customs value {currency} {declaration.AssessedCustomsValue:N2}. Duties and taxes payable: {currency} {declaration.AssessedPayable:N2}.",
            $"/importer/declarations/{declaration.Id}"));
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
        if (decision.ImporterDeclarationId.HasValue)
        {
            var confirmedHsCodeId = await db.ImporterDeclarations.AsNoTracking()
                .Where(x => x.Id == decision.ImporterDeclarationId.Value)
                .Select(x => x.ConfirmedHsCodeId).SingleOrDefaultAsync(ct);
            if (!confirmedHsCodeId.HasValue || request.SelectedHsCodeId != confirmedHsCodeId)
                return BadRequest(new { message = "Use the HS code confirmed during importer submission review. Return to officer review to correct the mapping." });
        }
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
        var dutyExemption = (request.ExemptionCodes ?? []).Any(code =>
            string.Equals(code?.Trim(), "CUSTOMS_DUTY_EXEMPT", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(code?.Trim(), "MACHINERY_EQUIPMENT_EXEMPT", StringComparison.OrdinalIgnoreCase));
        var machineryExemption = (request.ExemptionCodes ?? []).Any(code => string.Equals(code?.Trim(), "MACHINERY_EQUIPMENT_EXEMPT", StringComparison.OrdinalIgnoreCase));
        var importerContext = await LoadImporterAssessmentContextAsync(decision, request, ct);
        if (machineryExemption && !importerContext.IsManufacturing)
            return BadRequest(new { message = "The machinery exemption applies only to goods imported for manufacturing." });
        // Capital goods for manufacturing are exempted automatically and each exempt line records its legal basis, so no
        // note is demanded for them. A duty exemption the officer selects by hand still needs its authority recorded.
        var manualDutyExemption = (request.ExemptionCodes ?? []).Any(code => string.Equals(code?.Trim(), "CUSTOMS_DUTY_EXEMPT", StringComparison.OrdinalIgnoreCase));
        if (completing && manualDutyExemption && (request.Notes?.Trim().Length ?? 0) < 10)
            return BadRequest(new { message = "Record the authority for the customs duty exemption you selected in the assessment remarks." });
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

    /// <summary>
    /// The national tariff line taxed for this assessment. One six-digit HS code usually has several national lines with
    /// different duty rates (for example 8517.1310 free, 8517.1390 15%), so the officer's chosen line is used. Without a
    /// choice the line is used only when it is the sole candidate or all candidates share a duty rate; otherwise
    /// <c>NeedsChoice</c> is set so the assessment asks for one instead of guessing.
    /// </summary>
    private async Task<(NationalTariffLine? Tariff, bool NeedsChoice)> LoadTariffAsync(ValuationDecision decision, Guid hsCodeId, Guid? selectedLineId, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        if (decision.ImporterDeclarationId.HasValue)
        {
            var confirmedLineId = await db.ImporterDeclarations.AsNoTracking()
                .Where(x => x.Id == decision.ImporterDeclarationId.Value)
                .Select(x => x.ConfirmedTariffLineId).SingleOrDefaultAsync(ct);
            var confirmed = confirmedLineId.HasValue
                ? await db.NationalTariffLines.AsNoTracking().Include(x => x.TaxRates).FirstOrDefaultAsync(x => x.Id == confirmedLineId.Value && x.HsCodeId == hsCodeId && x.EffectiveDate <= today && (x.EndDate == null || x.EndDate >= today), ct)
                : null;
            // A confirmed line with rates is authoritative. A placeholder line without any rate falls through to the
            // HS code's real national lines below, so the officer can pick the one that applies instead of seeing 0% duty.
            if (confirmed is not null && (confirmed.TaxRates.Count > 0 || ParseRate(confirmed.Duty).HasValue)) return (confirmed, false);
        }
        var candidates = await CandidateLinesAsync(hsCodeId, ct);
        if (selectedLineId.HasValue && candidates.FirstOrDefault(x => x.Id == selectedLineId.Value) is { } chosen) return (chosen, false);
        if (candidates.Count == 0) return (null, false);
        var duties = candidates.Select(x => TariffTaxCodes.RateFor(x, TariffTaxCodes.Duty) ?? ParseRate(x.Duty)).Distinct().Count();
        return (candidates[0], duties > 1);
    }

    /// <summary>Active national lines for an HS code; placeholder lines without tariff rates are dropped when rated lines exist.</summary>
    private async Task<List<NationalTariffLine>> CandidateLinesAsync(Guid hsCodeId, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var lines = await db.NationalTariffLines.AsNoTracking().Include(x => x.TaxRates)
            .Where(x => x.HsCodeId == hsCodeId && x.EffectiveDate <= today && (x.EndDate == null || x.EndDate >= today))
            .ToListAsync(ct);
        var rated = lines.Where(x => x.TaxRates.Count > 0 || ParseRate(x.Duty).HasValue).ToList();
        return (rated.Count > 0 ? rated : lines).OrderBy(x => x.TariffItemNo ?? x.Code).ThenBy(x => x.Code).ToList();
    }

    private async Task<(decimal? Rate, string Source)> GetEtbToTargetRateAsync(NationalTariffLine tariff, string targetCurrency, CancellationToken ct)
    {
        if (!ImportTaxAssessmentCalculator.RequiresEtbConversion(tariff)) return (1m, "No specific excise conversion required");
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

    private static ValuationPhase2 BuildPhase2(ValuationDecision decision, Phase2Request request, ValuationPhase2? existing, NationalTariffLine tariff, (decimal? Rate, string Source) specificRate, (bool IsManufacturing, bool IsMachineryOrEquipment) importerContext, bool needsLineChoice = false)
    {
        var phase2 = existing ?? new ValuationPhase2 { Id = Guid.NewGuid(), ValuationDecisionId = decision.Id };
        phase2.OriginalHsCodeId = decision.HsCodeId; phase2.SelectedHsCodeId = request.SelectedHsCodeId;
        phase2.SelectedTariffLineId = needsLineChoice ? null : tariff.Id;
        phase2.ImportPurpose = importerContext.IsManufacturing ? "MANUFACTURING" : string.IsNullOrWhiteSpace(request.ImportPurpose) ? phase2.ImportPurpose : request.ImportPurpose.Trim().ToUpperInvariant();
        phase2.IsMachineryOrEquipment = importerContext.IsMachineryOrEquipment;
        phase2.CustomsValueAmount = Money(request.CustomsValueAmount); phase2.CustomsValueCurrency = request.CustomsValueCurrency.Trim().ToUpperInvariant();
        phase2.Quantity = request.Quantity; phase2.Unit = request.Unit.Trim();
        phase2.OriginCountry = request.OriginCountry?.Trim() ?? ""; phase2.ProductCategory = request.ProductCategory!.Trim();
        phase2.ExemptionCodes = string.Join(",", (request.ExemptionCodes ?? []).Select(x => x.Trim().ToUpperInvariant()).Where(x => x.Length > 0).Distinct());
        phase2.OriginPreferenceClaimed = request.OriginPreferenceClaimed; phase2.ExciseTaxApplicable = ImportTaxAssessmentCalculator.HasConfiguredExciseRule(tariff) || request.ExciseTaxApplicable; phase2.IsCommercialImport = request.IsCommercialImport; phase2.WithholdingApplicable = request.WithholdingApplicable;
        phase2.AdjustmentReason = request.AdjustmentReason?.Trim() ?? ""; phase2.InitialDutyAmount = GetInitialDuty(decision); phase2.InitialDutyCurrency = GetInitialDutyCurrency(decision);
        phase2.TargetCurrency = request.TargetCurrency.Trim().ToUpperInvariant(); phase2.ExchangeRate = request.ExchangeRate <= 0 ? 1m : request.ExchangeRate; phase2.ExchangeRateSource = string.IsNullOrWhiteSpace(request.ExchangeRateSource) ? "Same currency" : request.ExchangeRateSource.Trim(); phase2.ExchangeRateDate = request.ExchangeRateDate;
        phase2.ExemptionAmount = request.ExemptionAmount; phase2.WaiverAmount = request.WaiverAmount; phase2.ManualAdjustmentAmount = request.ManualAdjustmentAmount; phase2.ManualAdjustmentType = request.ManualAdjustmentType.Trim(); phase2.Notes = request.Notes?.Trim() ?? "";
        phase2.CalculationRuleVersion = RuleVersion; phase2.Version = Guid.NewGuid();
        phase2.TaxLines = ImportTaxAssessmentCalculator.Calculate(new(
            tariff, request.CustomsValueAmount, request.Quantity, request.Unit, request.ProductCategory!, request.OriginCountry ?? "",
            request.OriginPreferenceClaimed, request.IsCommercialImport, request.WithholdingApplicable,
            importerContext.IsManufacturing, importerContext.IsMachineryOrEquipment, request.ExciseTaxApplicable,
            (request.ExemptionCodes ?? []).Where(code => !string.IsNullOrWhiteSpace(code)).Select(code => code.Trim()).ToArray(),
            (request.TaxLines ?? []).Where(line => !string.IsNullOrWhiteSpace(line.Name)).Select(line => new ImportTaxLineOverride(
                line.Name!.Trim(), line.CalculationType, line.Value, line.Currency, line.Order, line.CalculationBasis,
                line.Notes, line.IsApplicable, line.Status)).ToArray(),
            specificRate.Rate, specificRate.Source, request.TargetCurrency));
        if (needsLineChoice && phase2.TaxLines.FirstOrDefault(x => x.Name == "Customs Duty") is { } duty)
        {
            duty.Status = "ReviewRequired";
            duty.Notes = $"This HS code has several national tariff lines with different duty rates; {tariff.TariffItemNo ?? tariff.Code} is shown until you choose the line that matches the goods.";
        }
        phase2.TotalTax = Money(phase2.TaxLines.Where(x => x.IsApplicable && !IsExciseComparisonLine(x)).Sum(x => x.CalculatedAmount)); phase2.TotalAdditionalTax = phase2.TotalTax;
        var adjustment = string.Equals(request.ManualAdjustmentType, "Percentage", StringComparison.OrdinalIgnoreCase) ? phase2.CustomsValueAmount * request.ManualAdjustmentAmount / 100m : request.ManualAdjustmentAmount;
        phase2.FinalAmount = Money(Math.Max(0m, phase2.CustomsValueAmount + phase2.TotalTax - request.ExemptionAmount - request.WaiverAmount + adjustment)); phase2.CalculatedAt = DateTimeOffset.UtcNow; phase2.OfficerConfirmed = request.OfficerConfirmation;
        return phase2;
    }

    private static bool IsExciseComparisonLine(ValuationPhase2TaxLine line) =>
        line.Name == "Excise Tax (specific)" && line.CalculationBasis == "UNIT_RATE_ETB_GREATER_OF";

    /// <summary>
    /// Whether the goods are imported for manufacturing (and are machinery), which drives the tax reliefs. An importer
    /// declaration decides it; otherwise the purpose the officer sets in the assessment, falling back to the price review.
    /// </summary>
    private async Task<(bool IsManufacturing, bool IsMachineryOrEquipment)> LoadImporterAssessmentContextAsync(ValuationDecision decision, Phase2Request? request, CancellationToken ct)
    {
        var phaseOneManufacturing = string.Equals(ReadProductType(decision.EvidenceNotes), "MANUFACTURING", StringComparison.OrdinalIgnoreCase);
        if (!decision.ImporterDeclarationId.HasValue)
        {
            if (!string.IsNullOrWhiteSpace(request?.ImportPurpose))
            {
                var manufacturing = string.Equals(request.ImportPurpose.Trim(), "MANUFACTURING", StringComparison.OrdinalIgnoreCase);
                return (manufacturing, manufacturing && request.IsMachineryOrEquipment == true);
            }
            return (phaseOneManufacturing, phaseOneManufacturing && ReadEvidenceFlag(decision.EvidenceNotes, "isMachineryOrEquipment"));
        }
        var declaration = await db.ImporterDeclarations.AsNoTracking()
            .Where(item => item.Id == decision.ImporterDeclarationId.Value)
            .Select(item => new { item.ImportPurpose, item.IsMachineryOrEquipment })
            .SingleOrDefaultAsync(ct);
        return (phaseOneManufacturing || string.Equals(declaration?.ImportPurpose, "MANUFACTURING", StringComparison.OrdinalIgnoreCase), declaration?.IsMachineryOrEquipment == true);
    }

    private static string? ReadEvidenceString(string? evidenceNotes, string name)
    {
        if (string.IsNullOrWhiteSpace(evidenceNotes)) return null;
        try
        {
            using var document = JsonDocument.Parse(evidenceNotes);
            return document.RootElement.ValueKind == JsonValueKind.Object && document.RootElement.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
        }
        catch (JsonException) { return null; }
    }

    private static bool ReadEvidenceFlag(string? evidenceNotes, string name)
    {
        if (string.IsNullOrWhiteSpace(evidenceNotes)) return false;
        try
        {
            using var document = JsonDocument.Parse(evidenceNotes);
            return document.RootElement.ValueKind == JsonValueKind.Object && document.RootElement.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;
        }
        catch (JsonException) { return false; }
    }

    private static string? ReadProductType(string? evidenceNotes)
    {
        if (string.IsNullOrWhiteSpace(evidenceNotes)) return null;
        try
        {
            using var document = JsonDocument.Parse(evidenceNotes);
            if (!document.RootElement.TryGetProperty("productType", out var value) || value.ValueKind != JsonValueKind.String) return null;
            var productType = value.GetString()?.Trim().ToUpperInvariant();
            return productType is "COMMODITY" or "MANUFACTURING" ? productType : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static decimal? ParseRate(string? duty)
    {
        if (string.IsNullOrWhiteSpace(duty)) return null;
        if (duty.Contains("free", StringComparison.OrdinalIgnoreCase) || duty.Contains("exempt", StringComparison.OrdinalIgnoreCase)) return 0m;
        var match = Regex.Match(duty, @"(?<![0-9])([0-9]+(?:[.,][0-9]+)?)\s*%?");
        return match.Success && decimal.TryParse(match.Groups[1].Value.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var rate) ? rate : null;
    }

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

    private async Task<object> MapResponse(ValuationDecision decision, ValuationPhase2? phase2, CancellationToken ct)
    {
        var importer = decision.ImporterDeclarationId.HasValue
            ? await db.ImporterDeclarations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == decision.ImporterDeclarationId.Value, ct)
            : null;
        var optionsHsCodeId = phase2?.SelectedHsCodeId ?? decision.HsCodeId;
        // Importer cases are taxed on the officer-confirmed line; offer the national lines only when that line carries no rates.
        var importerLineRated = importer?.ConfirmedTariffLineId is { } confirmedId && await db.NationalTariffLines.AsNoTracking()
            .AnyAsync(x => x.Id == confirmedId && (x.TaxRates.Any() || (x.Duty != null && x.Duty != "")), ct);
        var optionsHsDescription = optionsHsCodeId.HasValue ? await db.HsCodes.AsNoTracking().Where(x => x.Id == optionsHsCodeId.Value).Select(x => x.DescriptionEn).FirstOrDefaultAsync(ct) : null;
        var tariffLineOptions = optionsHsCodeId.HasValue && !importerLineRated
            ? (await CandidateLinesAsync(optionsHsCodeId.Value, ct)).Select(line => new
            {
                line.Id, tariffItemNo = line.TariffItemNo ?? line.Code, description = TariffDescriptions.ForCode(line.DescriptionEn, optionsHsDescription, line.TariffItemNo ?? line.Code),
                dutyRate = TariffTaxCodes.RateFor(line, TariffTaxCodes.Duty) ?? ParseRate(line.Duty)
            }).ToArray()
            : [];
        return new
    {
        decisionId = decision.Id,
        tariffLineOptions,
        importerDeclaration = importer is null ? null : new {
            importer.Id, importer.Reference, importer.ImportPurpose, importer.PurposeDetails, importer.OriginCountryCode,
            importer.IsCommercialProduct, importer.IsMachineryOrEquipment, importer.Quantity, importer.Unit,
            requestedTreatments = JsonSerializer.Deserialize<string[]>(importer.RequestedTreatmentsJson) ?? []
        },
        phase1 = new { hsCodeId = decision.HsCodeId, decision.ProductId, decision.ProductName, productType = ReadProductType(decision.EvidenceNotes), importPurpose = ReadEvidenceString(decision.EvidenceNotes, "importPurpose"), isMachineryOrEquipment = ReadEvidenceFlag(decision.EvidenceNotes, "isMachineryOrEquipment"), selectedTariffLineId = ReadEvidenceString(decision.EvidenceNotes, "tariffLineId"), decision.PurchaseCountryCode, decision.PurchaseCountryName, decision.SelectedPriceSource, decision.ValuationMethod, decision.ProductPhotoUrl, initialDuty = GetInitialDuty(decision), initialDutyCurrency = GetInitialDutyCurrency(decision), source = decision.InitialDuty.HasValue ? "Phase 1 initial duty" : "Phase 1 reference value fallback", fobCifCalculation = ReadFobCifCalculation(decision.FobCifCalculationJson), decision.DeclaredPriceAmount, decision.DeclaredPriceCurrency, decision.DeclaredPriceConvertedAmount, decision.DeclaredPriceConvertedCurrency, decision.DeclaredPriceExchangeRate, decision.DeclaredPriceExchangeRateSource, decision.DeclaredPriceExchangeRateDate, decision.ReceiptFileName, decision.ReceiptContentType, decision.ReceiptFileSize, decision.ReceiptSha256, decision.ReceiptUploadedAt },
        phase2 = phase2 is null ? null : new
        {
            phase2.Id, phase2.Status, phase2.OriginalHsCodeId, phase2.SelectedHsCodeId, phase2.SelectedTariffLineId, phase2.ImportPurpose, phase2.IsMachineryOrEquipment, phase2.CustomsValueAmount, phase2.CustomsValueCurrency, phase2.Quantity, phase2.Unit, phase2.OriginCountry, phase2.ProductCategory,
            exemptionCodes = phase2.ExemptionCodes.Split(',', StringSplitOptions.RemoveEmptyEntries), phase2.OriginPreferenceClaimed, phase2.ExciseTaxApplicable, phase2.IsCommercialImport, phase2.WithholdingApplicable, phase2.AdjustmentReason, phase2.OfficerConfirmed,
            phase2.InitialDutyAmount, phase2.InitialDutyCurrency, phase2.TargetCurrency, phase2.ExchangeRate, phase2.ExchangeRateSource, phase2.ExchangeRateDate, phase2.ExemptionAmount, phase2.WaiverAmount, phase2.ManualAdjustmentAmount, phase2.ManualAdjustmentType, phase2.Notes, phase2.TotalAdditionalTax, phase2.TotalTax, finalPayableAmount = phase2.FinalAmount, phase2.FinalAmount, phase2.CalculationRuleVersion, phase2.CalculatedAt, phase2.Version,
            taxLines = phase2.TaxLines.OrderBy(x => x.Order).Select(tax => new { tax.Id, tax.Name, tax.CalculationType, tax.Value, tax.RecommendedValue, tax.Currency, tax.Order, tax.CalculationBasis, tax.BaseAmount, tax.CalculatedAmount, tax.Notes, tax.Status, tax.SourceReference, tax.IsApplicable })
        }
    };
    }

    private bool CanAccess(ValuationDecision decision) { if (string.IsNullOrWhiteSpace(decision.OfficerSubjectId)) return true; var subject = CurrentSubject(); return string.Equals(decision.OfficerSubjectId, subject, StringComparison.OrdinalIgnoreCase) || string.Equals(decision.OfficerSubjectId, User.Identity?.Name, StringComparison.OrdinalIgnoreCase); }
    private string CurrentSubject() => User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "unknown";
    private static decimal GetInitialDuty(ValuationDecision decision) => decision.InitialDuty ?? decision.SelectedReferenceValue;
    private static string GetInitialDutyCurrency(ValuationDecision decision) => string.IsNullOrWhiteSpace(decision.InitialDutyCurrency) ? (string.IsNullOrWhiteSpace(decision.Currency) ? "ETB" : decision.Currency) : decision.InitialDutyCurrency;
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

public sealed record TaxPreviewRequest(Guid TariffLineId, decimal CustomsValueAmount, decimal Quantity, string? Unit, string? OriginCountry, string? ImportPurpose, bool IsMachineryOrEquipment, bool IsCommercialImport = true);

public sealed record Phase2Request(Guid? SelectedHsCodeId, string TargetCurrency, decimal ExchangeRate, string? ExchangeRateSource, DateOnly? ExchangeRateDate, decimal ExemptionAmount, decimal WaiverAmount, decimal ManualAdjustmentAmount, string ManualAdjustmentType, string? Notes, Phase2TaxLineRequest[]? TaxLines, decimal CustomsValueAmount = 0, string CustomsValueCurrency = "ETB", string? OriginCountry = null, string? ProductCategory = null, string[]? ExemptionCodes = null, bool OriginPreferenceClaimed = false, bool ExciseTaxApplicable = false, bool IsCommercialImport = true, bool WithholdingApplicable = true, string? AdjustmentReason = null, bool OfficerConfirmation = false, Guid? ExpectedVersion = null, decimal Quantity = 1m, string Unit = "PCS", Guid? SelectedTariffLineId = null, string? ImportPurpose = null, bool? IsMachineryOrEquipment = null);
public sealed record Phase2TaxLineRequest(string? Name, string CalculationType, decimal Value, string? Currency, int? Order, string? CalculationBasis, string? Notes, bool? IsApplicable = null, string? Status = null);
