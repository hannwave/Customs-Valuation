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
[Route("api/valuation-decisions")]
[Authorize(Policy = "CustomsOfficer")]
public sealed class ValuationDecisionsController(CustomsDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var subject = CurrentSubject();
        var username = User.Identity?.Name;
        var decisions = await db.ValuationDecisions.AsNoTracking()
            .Where(x => x.HsCodeId != Guid.Empty && (string.IsNullOrEmpty(x.OfficerSubjectId) || x.OfficerSubjectId == subject || x.OfficerSubjectId == username))
            .OrderByDescending(x => x.RecordedAt).Take(100).ToListAsync(ct);
        var hsCodes = await db.HsCodes.AsNoTracking().Where(x => decisions.Select(d => d.HsCodeId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        return Ok(decisions.Select(x => Map(x, hsCodes.GetValueOrDefault(x.HsCodeId)?.Code)));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var decision = await db.ValuationDecisions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (decision is null) return NotFound(new { message = "Valuation case was not found." });
        if (!CanAccess(decision)) return Forbid();
        var code = await db.HsCodes.AsNoTracking().Where(x => x.Id == decision.HsCodeId).Select(x => x.Code).FirstOrDefaultAsync(ct);
        return Ok(Map(decision, code));
    }

    [HttpPost]
    public async Task<IActionResult> Create(ValuationDecisionRequest request, CancellationToken ct)
    {
        if (request.HsCodeId == Guid.Empty) return BadRequest(new { message = "Select an HS code for Phase 1." });
        if (request.SelectedReferenceValue < 0 || request.InitialDuty < 0) return BadRequest(new { message = "Reference value and initial duty cannot be negative." });
        if (string.IsNullOrWhiteSpace(request.Currency) || request.Currency.Trim().Length != 3) return BadRequest(new { message = "Currency must be a three-letter ISO code." });
        if (!await db.HsCodes.AnyAsync(x => x.Id == request.HsCodeId, ct)) return BadRequest(new { message = "The selected HS code was not found." });
        var decision = new ValuationDecision
        {
            Id = Guid.NewGuid(), HsCodeId = request.HsCodeId, SelectedReferenceValue = request.SelectedReferenceValue,
            Currency = request.Currency.Trim().ToUpperInvariant(), InitialDuty = request.InitialDuty,
            InitialDutyCurrency = string.IsNullOrWhiteSpace(request.InitialDutyCurrency) ? request.Currency.Trim().ToUpperInvariant() : request.InitialDutyCurrency.Trim().ToUpperInvariant(),
            Decision = request.Decision?.Trim() ?? "", Justification = request.Justification?.Trim() ?? "",
            OfficerSubjectId = CurrentSubject(), RecordedAt = DateTimeOffset.UtcNow
        };
        db.ValuationDecisions.Add(decision);
        db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = CurrentSubject(), SubjectUserId = Guid.TryParse(CurrentSubject(), out var officerId) ? officerId : null, Username = User.Identity?.Name ?? "", OccurredAt = DateTimeOffset.UtcNow, Action = "PHASE_1_SAVED", Module = "Valuation", RecordId = decision.Id, NewValueJson = JsonSerializer.Serialize(new { decision.HsCodeId, decision.InitialDuty, decision.InitialDutyCurrency }), Justification = decision.Justification });
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = decision.Id }, Map(decision, null));
    }

    private bool CanAccess(ValuationDecision decision) => string.IsNullOrWhiteSpace(decision.OfficerSubjectId) || decision.OfficerSubjectId == CurrentSubject() || decision.OfficerSubjectId == User.Identity?.Name;
    private string CurrentSubject() => User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "unknown";
    private static object Map(ValuationDecision x, string? hsCode) => new { x.Id, x.HsCodeId, hsCode, x.SelectedReferenceValue, x.Currency, x.InitialDuty, x.InitialDutyCurrency, x.Decision, x.Justification, x.RecordedAt };
}

public sealed record ValuationDecisionRequest(
    Guid HsCodeId,
    decimal SelectedReferenceValue,
    string Currency,
    decimal InitialDuty,
    string? InitialDutyCurrency,
    string? Decision,
    string? Justification);
