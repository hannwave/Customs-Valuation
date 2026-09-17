using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

[ApiController]
[Route("api/valuation-decisions/{decisionId:guid}/phase-2")]
[Authorize(Policy = "CustomsOfficer")]
public sealed class ValuationPhase2Controller(CustomsDbContext db) : ControllerBase
{
    private const string RuleVersion = "phase2-placeholder-v1";

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
        var validation = await ValidateRequestAsync(loaded.Decision!, request, ct);
        if (validation is not null) return validation;
        var phase2 = BuildPhase2(loaded.Decision!, request, loaded.Existing);
        ApplyCalculation(phase2, request, GetInitialDuty(loaded.Decision!), GetInitialDutyCurrency(loaded.Decision!));
        return Ok(MapResponse(loaded.Decision!, phase2));
    }

    [HttpPut]
    public async Task<IActionResult> Save(Guid decisionId, Phase2Request request, CancellationToken ct)
        => await SaveInternal(decisionId, request, "InProgress", ct);

    [HttpPost("complete")]
    public async Task<IActionResult> Complete(Guid decisionId, Phase2Request request, CancellationToken ct)
        => await SaveInternal(decisionId, request, "Completed", ct);

    private async Task<IActionResult> SaveInternal(Guid decisionId, Phase2Request request, string status, CancellationToken ct)
    {
        var loaded = await LoadDecisionAsync(decisionId, ct);
        if (loaded.Error is not null) return loaded.Error;
        var decision = loaded.Decision!;
        var validation = await ValidateRequestAsync(decision, request, ct);
        if (validation is not null) return validation;
        if (loaded.Existing is not null && request.ExpectedVersion.HasValue && loaded.Existing.Version != request.ExpectedVersion.Value)
            return Conflict(new { message = "This Phase 2 draft changed in another session. Reload it before saving.", version = loaded.Existing.Version });

        var oldTaxLines = loaded.Existing?.TaxLines.ToList() ?? [];
        var phase2 = BuildPhase2(decision, request, loaded.Existing);
        ApplyCalculation(phase2, request, GetInitialDuty(decision), GetInitialDutyCurrency(decision));
        phase2.Status = status;
        var previous = loaded.Existing is null ? null : JsonSerializer.Serialize(new { loaded.Existing.Status, loaded.Existing.FinalAmount, loaded.Existing.Version });

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (loaded.Existing is null) db.ValuationPhase2s.Add(phase2);
        else
        {
            db.ValuationPhase2TaxLines.RemoveRange(oldTaxLines);
            db.Entry(phase2).State = EntityState.Modified;
            db.ValuationPhase2TaxLines.AddRange(phase2.TaxLines);
        }
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(), UserId = CurrentSubject(), Username = User.Identity?.Name ?? "",
            OccurredAt = DateTimeOffset.UtcNow, Action = status == "Completed" ? "PHASE_2_COMPLETED" : "PHASE_2_SAVED",
            Module = "ValuationPhase2", RecordId = phase2.Id, PreviousValueJson = previous,
            NewValueJson = JsonSerializer.Serialize(new { phase2.Status, phase2.FinalAmount, phase2.Version }),
            Justification = phase2.Notes
        });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        var saved = await db.ValuationPhase2s.AsNoTracking().Include(x => x.TaxLines).FirstAsync(x => x.Id == phase2.Id, ct);
        return Ok(MapResponse(decision, saved));
    }

    private async Task<(ValuationDecision? Decision, ValuationPhase2? Existing, IActionResult? Error)> LoadDecisionAsync(Guid decisionId, CancellationToken ct)
    {
        var decision = await db.ValuationDecisions.FirstOrDefaultAsync(x => x.Id == decisionId, ct);
        if (decision is null) return (null, null, NotFound(new { message = "Phase 1 valuation case was not found." }));
        if (!CanAccess(decision)) return (null, null, Forbid());
        var phase2 = await db.ValuationPhase2s.Include(x => x.TaxLines).FirstOrDefaultAsync(x => x.ValuationDecisionId == decisionId, ct);
        return (decision, phase2, null);
    }

    private async Task<IActionResult?> ValidateRequestAsync(ValuationDecision decision, Phase2Request request, CancellationToken ct)
    {
        if (request.TargetCurrency is null || request.TargetCurrency.Trim().Length != 3)
            return BadRequest(new { message = "Target currency must be a three-letter ISO code." });
        if (request.ExchangeRate < 0) return BadRequest(new { message = "Exchange rate cannot be negative." });
        var initialCurrency = GetInitialDutyCurrency(decision);
        if (!string.Equals(initialCurrency, request.TargetCurrency.Trim(), StringComparison.OrdinalIgnoreCase) && request.ExchangeRate <= 0)
            return BadRequest(new { message = "Provide a positive exchange rate when converting currencies." });
        var taxLines = request.TaxLines ?? [];
        if (taxLines.Length > 20) return BadRequest(new { message = "A Phase 2 draft cannot contain more than 20 tax lines." });
        foreach (var tax in taxLines)
        {
            if (string.IsNullOrWhiteSpace(tax.Name)) return BadRequest(new { message = "Each tax line needs a name." });
            if (!string.Equals(tax.CalculationType, "Percentage", StringComparison.OrdinalIgnoreCase) && !string.Equals(tax.CalculationType, "Fixed", StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Tax calculation type must be Percentage or Fixed." });
            if (tax.Value < 0) return BadRequest(new { message = "Tax values cannot be negative." });
            if (tax.Currency is null || tax.Currency.Trim().Length != 3) return BadRequest(new { message = "Each tax currency must be a three-letter ISO code." });
            if (!string.Equals(tax.Currency, request.TargetCurrency, StringComparison.OrdinalIgnoreCase) && !string.Equals(tax.Currency, initialCurrency, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "Tax currency must match the target or initial-duty currency until currency tables are configured." });
        }
        if (!string.Equals(request.ManualAdjustmentType, "Fixed", StringComparison.OrdinalIgnoreCase) && !string.Equals(request.ManualAdjustmentType, "Percentage", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Manual adjustment type must be Fixed or Percentage." });
        if (request.ExemptionAmount < 0 || request.WaiverAmount < 0 || request.ManualAdjustmentAmount < 0)
            return BadRequest(new { message = "Exemptions, waivers, and adjustments cannot be negative." });
        if (request.SelectedHsCodeId.HasValue && !await db.HsCodes.AnyAsync(x => x.Id == request.SelectedHsCodeId.Value, ct))
            return BadRequest(new { message = "The selected HS code was not found." });
        return null;
    }

    private static ValuationPhase2 BuildPhase2(ValuationDecision decision, Phase2Request request, ValuationPhase2? existing)
    {
        var phase2 = existing ?? new ValuationPhase2 { Id = Guid.NewGuid(), ValuationDecisionId = decision.Id };
        phase2.OriginalHsCodeId = decision.HsCodeId;
        phase2.SelectedHsCodeId = request.SelectedHsCodeId;
        phase2.InitialDutyAmount = GetInitialDuty(decision);
        phase2.InitialDutyCurrency = GetInitialDutyCurrency(decision);
        phase2.TargetCurrency = request.TargetCurrency.Trim().ToUpperInvariant();
        phase2.ExchangeRate = request.ExchangeRate <= 0 ? 1m : request.ExchangeRate;
        phase2.ExchangeRateSource = string.IsNullOrWhiteSpace(request.ExchangeRateSource) ? "Officer-entered provisional rate" : request.ExchangeRateSource.Trim();
        phase2.ExchangeRateDate = request.ExchangeRateDate;
        phase2.ExemptionAmount = request.ExemptionAmount;
        phase2.WaiverAmount = request.WaiverAmount;
        phase2.ManualAdjustmentAmount = request.ManualAdjustmentAmount;
        phase2.ManualAdjustmentType = request.ManualAdjustmentType.Trim();
        phase2.Notes = request.Notes?.Trim() ?? "";
        phase2.CalculationRuleVersion = RuleVersion;
        phase2.Version = Guid.NewGuid();
        phase2.TaxLines = (request.TaxLines ?? []).Select((tax, index) => new ValuationPhase2TaxLine
        {
            Id = Guid.NewGuid(), ValuationPhase2Id = phase2.Id, Name = tax.Name!.Trim(),
            CalculationType = tax.CalculationType.Trim(), Value = tax.Value,
            Currency = tax.Currency!.Trim().ToUpperInvariant(), Order = tax.Order ?? index + 1,
            CalculationBasis = string.IsNullOrWhiteSpace(tax.CalculationBasis) ? "InitialDuty" : tax.CalculationBasis.Trim(),
            Notes = tax.Notes?.Trim() ?? ""
        }).OrderBy(x => x.Order).ThenBy(x => x.Id).ToList();
        return phase2;
    }

    private static void ApplyCalculation(ValuationPhase2 phase2, Phase2Request request, decimal initialDuty, string initialCurrency)
    {
        var target = phase2.TargetCurrency;
        var rate = string.Equals(initialCurrency, target, StringComparison.OrdinalIgnoreCase) ? 1m : phase2.ExchangeRate;
        var initialDutyTarget = Money(initialDuty * rate);
        var totalTax = 0m;
        foreach (var tax in phase2.TaxLines.OrderBy(x => x.Order).ThenBy(x => x.Id))
        {
            tax.BaseAmount = initialDutyTarget;
            var amount = string.Equals(tax.CalculationType, "Percentage", StringComparison.OrdinalIgnoreCase)
                ? initialDutyTarget * tax.Value / 100m
                : ConvertFixedAmount(tax.Value, tax.Currency, target, initialCurrency, rate);
            tax.CalculatedAmount = Money(amount);
            totalTax += tax.CalculatedAmount;
        }
        phase2.TotalAdditionalTax = Money(totalTax);
        var adjustment = string.Equals(request.ManualAdjustmentType, "Percentage", StringComparison.OrdinalIgnoreCase)
            ? initialDutyTarget * request.ManualAdjustmentAmount / 100m
            : request.ManualAdjustmentAmount;
        phase2.FinalAmount = Money(Math.Max(0m, initialDutyTarget + phase2.TotalAdditionalTax - request.ExemptionAmount - request.WaiverAmount + adjustment));
        phase2.CalculatedAt = DateTimeOffset.UtcNow;
    }

    private static decimal ConvertFixedAmount(decimal amount, string taxCurrency, string targetCurrency, string initialCurrency, decimal rate)
    {
        if (string.Equals(taxCurrency, targetCurrency, StringComparison.OrdinalIgnoreCase)) return amount;
        if (string.Equals(taxCurrency, initialCurrency, StringComparison.OrdinalIgnoreCase)) return amount * rate;
        return amount;
    }

    private static object MapResponse(ValuationDecision decision, ValuationPhase2? phase2) => new
    {
        decisionId = decision.Id, phase1 = new
        {
            hsCodeId = decision.HsCodeId, initialDuty = GetInitialDuty(decision), initialDutyCurrency = GetInitialDutyCurrency(decision),
            source = decision.InitialDuty.HasValue ? "Phase 1 initial duty" : "Phase 1 reference value fallback"
        },
        phase2 = phase2 is null ? null : new
        {
            phase2.Id, phase2.Status, phase2.OriginalHsCodeId, phase2.SelectedHsCodeId, phase2.InitialDutyAmount,
            phase2.InitialDutyCurrency, phase2.TargetCurrency, phase2.ExchangeRate, phase2.ExchangeRateSource,
            phase2.ExchangeRateDate, phase2.ExemptionAmount, phase2.WaiverAmount, phase2.ManualAdjustmentAmount,
            phase2.ManualAdjustmentType, phase2.Notes, phase2.TotalAdditionalTax, phase2.FinalAmount,
            phase2.CalculationRuleVersion, phase2.CalculatedAt, phase2.Version,
            taxLines = phase2.TaxLines.OrderBy(x => x.Order).Select(tax => new { tax.Id, tax.Name, tax.CalculationType, tax.Value, tax.Currency, tax.Order, tax.CalculationBasis, tax.BaseAmount, tax.CalculatedAmount, tax.Notes })
        }
    };

    private bool CanAccess(ValuationDecision decision)
    {
        if (string.IsNullOrWhiteSpace(decision.OfficerSubjectId)) return true;
        var subject = CurrentSubject();
        return string.Equals(decision.OfficerSubjectId, subject, StringComparison.OrdinalIgnoreCase)
            || string.Equals(decision.OfficerSubjectId, User.Identity?.Name, StringComparison.OrdinalIgnoreCase);
    }

    private string CurrentSubject() => User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "unknown";
    private static decimal GetInitialDuty(ValuationDecision decision) => decision.InitialDuty ?? decision.SelectedReferenceValue;
    private static string GetInitialDutyCurrency(ValuationDecision decision) => string.IsNullOrWhiteSpace(decision.InitialDutyCurrency) ? (string.IsNullOrWhiteSpace(decision.Currency) ? "ETB" : decision.Currency) : decision.InitialDutyCurrency;
    private static decimal Money(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}

public sealed record Phase2Request(
    Guid? SelectedHsCodeId,
    string TargetCurrency,
    decimal ExchangeRate,
    string? ExchangeRateSource,
    DateOnly? ExchangeRateDate,
    decimal ExemptionAmount,
    decimal WaiverAmount,
    decimal ManualAdjustmentAmount,
    string ManualAdjustmentType,
    string? Notes,
    Phase2TaxLineRequest[]? TaxLines,
    Guid? ExpectedVersion = null);

public sealed record Phase2TaxLineRequest(
    string? Name,
    string CalculationType,
    decimal Value,
    string? Currency,
    int? Order,
    string? CalculationBasis,
    string? Notes);
