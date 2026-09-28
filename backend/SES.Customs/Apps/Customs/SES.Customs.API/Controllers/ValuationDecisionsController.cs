using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.Core.Models;
using SES.Customs.API.Integrations.PricesApi;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

[ApiController]
[Route("api/valuation-decisions")]
[Authorize(Policy = "CustomsOfficer")]
public sealed class ValuationDecisionsController(CustomsDbContext db, HistoricalFxClient fx) : ControllerBase
{
    private const long MaximumReceiptBytes = 8 * 1024 * 1024;
    private static readonly HashSet<string> ReceiptTypes = new(StringComparer.OrdinalIgnoreCase) { "application/pdf", "image/jpeg", "image/png" };
    [HttpGet, Authorize(Policy = "CustomsAdministrator")]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        var subject = CurrentSubject();
        var username = User.Identity?.Name;
        var decisions = await db.ValuationDecisions.AsNoTracking()
            .Where(x => x.HsCodeId != Guid.Empty && (string.IsNullOrEmpty(x.OfficerSubjectId) || x.OfficerSubjectId == subject || x.OfficerSubjectId == username))
            .OrderByDescending(x => x.RecordedAt).Take(100).ToListAsync(ct);
        var hsIds = decisions.Where(d => d.HsCodeId.HasValue).Select(d => d.HsCodeId!.Value).ToList();
        var hsCodes = await db.HsCodes.AsNoTracking().Where(x => hsIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        return Ok(decisions.Select(x => Map(x, x.HsCodeId.HasValue ? hsCodes.GetValueOrDefault(x.HsCodeId.Value)?.Code : null)));
    }

    [HttpGet("{id:guid}"), Authorize(Policy = "CustomsAdministrator")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var decision = await db.ValuationDecisions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (decision is null) return NotFound(new { message = "Valuation case was not found." });
        if (!CanAccess(decision)) return Forbid();
        var code = decision.HsCodeId.HasValue ? await db.HsCodes.AsNoTracking().Where(x => x.Id == decision.HsCodeId.Value).Select(x => x.Code).FirstOrDefaultAsync(ct) : null;
        return Ok(Map(decision, code));
    }

    [HttpPost]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Create([FromForm] ValuationDecisionRequest request, CancellationToken ct)
    {
        if (request.SelectedReferenceValue < 0 || request.InitialDuty < 0) return BadRequest(new { message = "Reference value and initial duty cannot be negative." });
        var officerNoteIssue = OfficerNoteQuality.Check(request.Justification);
        if (officerNoteIssue is not null) return BadRequest(new { message = officerNoteIssue });
        if (string.IsNullOrWhiteSpace(request.Currency) || request.Currency.Trim().Length != 3) return BadRequest(new { message = "Currency must be a three-letter ISO code." });
        if (request.DeclaredPriceAmount <= 0 || string.IsNullOrWhiteSpace(request.DeclaredPriceCurrency) || request.DeclaredPriceCurrency.Trim().Length != 3) return BadRequest(new { message = "Enter the customer's original price and three-letter currency." });
        if (request.Receipt is not { Length: > 0 } || request.Receipt.Length > MaximumReceiptBytes || !ReceiptTypes.Contains(request.Receipt.ContentType)) return BadRequest(new { message = "Attach a PDF, JPG, or PNG receipt no larger than 8 MB." });
        if (request.HsCodeId.HasValue && !await db.HsCodes.AnyAsync(x => x.Id == request.HsCodeId.Value, ct)) return BadRequest(new { message = "The selected HS code was not found." });
        var paidCurrency = request.DeclaredPriceCurrency.Trim().ToUpperInvariant();
        var systemCurrency = request.InitialDutyCurrency?.Trim().ToUpperInvariant();
        if (string.IsNullOrWhiteSpace(systemCurrency)) systemCurrency = request.Currency.Trim().ToUpperInvariant();
        var rateDate = DateOnly.FromDateTime(DateTime.UtcNow);
        var rate = 1m;
        var rateSource = "Same currency";
        if (paidCurrency != systemCurrency)
        {
            var rates = await fx.RatesAsync(rateDate, ct);
            if (!rates.TryGetValue(paidCurrency, out var paidEtb) || paidEtb <= 0 || !rates.TryGetValue(systemCurrency, out var systemEtb) || systemEtb <= 0)
                return BadRequest(new { message = $"An approved {paidCurrency} to {systemCurrency} exchange rate is unavailable." });
            rate = paidEtb / systemEtb;
            rateSource = "Approved ETB cross-rate (exchange.et / configured fallback)";
        }
        await using var receiptStream = new MemoryStream();
        await request.Receipt.CopyToAsync(receiptStream, ct);
        var receiptData = receiptStream.ToArray();
        var isPdf = request.Receipt.ContentType.Equals("application/pdf", StringComparison.OrdinalIgnoreCase) && receiptData.AsSpan().StartsWith("%PDF-"u8);
        var isJpeg = request.Receipt.ContentType.Equals("image/jpeg", StringComparison.OrdinalIgnoreCase) && receiptData.Length >= 3 && receiptData[0] == 0xff && receiptData[1] == 0xd8 && receiptData[2] == 0xff;
        var isPng = request.Receipt.ContentType.Equals("image/png", StringComparison.OrdinalIgnoreCase) && receiptData.Length >= 8 && receiptData.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a });
        if (!isPdf && !isJpeg && !isPng) return BadRequest(new { message = "The receipt content does not match its declared PDF or image format." });
        var decision = new ValuationDecision
        {
            Id = Guid.NewGuid(), HsCodeId = request.HsCodeId, SelectedReferenceValue = request.SelectedReferenceValue,
            Currency = request.Currency.Trim().ToUpperInvariant(), InitialDuty = request.InitialDuty,
            InitialDutyCurrency = string.IsNullOrWhiteSpace(request.InitialDutyCurrency) ? request.Currency.Trim().ToUpperInvariant() : request.InitialDutyCurrency.Trim().ToUpperInvariant(),
            Decision = request.Decision?.Trim() ?? "", Justification = request.Justification?.Trim() ?? "",
            DeclaredPriceAmount = request.DeclaredPriceAmount, DeclaredPriceCurrency = paidCurrency,
            DeclaredPriceConvertedAmount = Math.Round(request.DeclaredPriceAmount * rate, 2, MidpointRounding.AwayFromZero),
            DeclaredPriceConvertedCurrency = systemCurrency, DeclaredPriceExchangeRate = Math.Round(rate, 12),
            DeclaredPriceExchangeRateSource = rateSource, DeclaredPriceExchangeRateDate = rateDate,
            ReceiptFileName = Path.GetFileName(request.Receipt.FileName), ReceiptContentType = request.Receipt.ContentType,
            ReceiptFileSize = receiptData.LongLength, ReceiptSha256 = Convert.ToHexString(SHA256.HashData(receiptData)).ToLowerInvariant(),
            ReceiptUploadedAt = DateTimeOffset.UtcNow, ReceiptUploadedBy = CurrentSubject(), ReceiptData = receiptData,
            OfficerSubjectId = CurrentSubject(), RecordedAt = DateTimeOffset.UtcNow
        };
        db.ValuationDecisions.Add(decision);
        db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = CurrentSubject(), SubjectUserId = Guid.TryParse(CurrentSubject(), out var officerId) ? officerId : null, Username = User.Identity?.Name ?? "", OccurredAt = DateTimeOffset.UtcNow, Action = "PHASE_1_SAVED", Module = "Valuation", RecordId = decision.Id, NewValueJson = JsonSerializer.Serialize(decision), Justification = decision.Justification });
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = decision.Id }, Map(decision, null));
    }

    [HttpGet("{id:guid}/receipt"), Authorize(Policy = "CustomsAdministrator")]
    public async Task<IActionResult> Receipt(Guid id, CancellationToken ct)
    {
        var decision = await db.ValuationDecisions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (decision is null) return NotFound(new { message = "Valuation case was not found." });
        if (!CanAccess(decision)) return Forbid();
        if (decision.ReceiptData is not { Length: > 0 }) return NotFound(new { message = "No receipt was captured for this legacy valuation record." });
        return File(decision.ReceiptData, decision.ReceiptContentType, decision.ReceiptFileName);
    }

    private bool CanAccess(ValuationDecision decision) => string.IsNullOrWhiteSpace(decision.OfficerSubjectId) || decision.OfficerSubjectId == CurrentSubject() || decision.OfficerSubjectId == User.Identity?.Name;
    private string CurrentSubject() => User.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name ?? "unknown";
    private static object Map(ValuationDecision x, string? hsCode) => new { x.Id, x.HsCodeId, hsCode, x.SelectedReferenceValue, x.Currency, x.InitialDuty, x.InitialDutyCurrency, x.Decision, x.Justification, x.RecordedAt, x.DeclaredPriceAmount, x.DeclaredPriceCurrency, x.DeclaredPriceConvertedAmount, x.DeclaredPriceConvertedCurrency, x.DeclaredPriceExchangeRate, x.DeclaredPriceExchangeRateSource, x.DeclaredPriceExchangeRateDate, x.ReceiptFileName, x.ReceiptContentType, x.ReceiptFileSize, x.ReceiptSha256, x.ReceiptUploadedAt };
}

public sealed record ValuationDecisionRequest(
    Guid? HsCodeId,
    decimal SelectedReferenceValue,
    string Currency,
    decimal InitialDuty,
    string? InitialDutyCurrency,
    string? Decision,
    string? Justification,
    decimal DeclaredPriceAmount,
    string DeclaredPriceCurrency,
    IFormFile? Receipt);
