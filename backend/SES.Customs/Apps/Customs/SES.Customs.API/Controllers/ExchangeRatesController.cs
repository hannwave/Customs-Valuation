using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SES.Customs.API.Integrations.PricesApi;

namespace SES.Customs.API.Controllers;

[ApiController, Route("api/exchange-rates"), Authorize(Policy = "OfficerOnly")]
public sealed class ExchangeRatesController(HistoricalFxClient fx) : ControllerBase
{
    [HttpGet("convert")]
    public async Task<IActionResult> Convert([FromQuery] decimal amount, [FromQuery] string? from, [FromQuery] string? to, CancellationToken ct)
    {
        var sourceCurrency = (from ?? "").Trim().ToUpperInvariant();
        var targetCurrency = (to ?? "").Trim().ToUpperInvariant();
        if (amount <= 0) return BadRequest(new { message = "Enter a positive price paid." });
        if (!IsCurrency(sourceCurrency) || !IsCurrency(targetCurrency))
            return BadRequest(new { message = "Use three-letter ISO currency codes." });

        var date = DateOnly.FromDateTime(DateTime.UtcNow);
        if (sourceCurrency == targetCurrency)
            return Ok(new { originalAmount = amount, from = sourceCurrency, convertedAmount = amount, to = targetCurrency, rate = 1m, source = "Same currency", date });

        var rates = await fx.RatesAsync(date, ct);
        if (!rates.TryGetValue(sourceCurrency, out var sourceEtb) || sourceEtb <= 0 ||
            !rates.TryGetValue(targetCurrency, out var targetEtb) || targetEtb <= 0)
            return NotFound(new { message = $"An approved {sourceCurrency} to {targetCurrency} exchange rate is unavailable." });

        var rate = sourceEtb / targetEtb;
        return Ok(new
        {
            originalAmount = amount,
            from = sourceCurrency,
            convertedAmount = Math.Round(amount * rate, 2, MidpointRounding.AwayFromZero),
            to = targetCurrency,
            rate = Math.Round(rate, 12),
            source = "Approved ETB cross-rate (exchange.et / configured fallback)",
            date
        });
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] string? to, CancellationToken ct)
    {
        var target = (to ?? "ETB").Trim().ToUpperInvariant();
        if (target.Length != 3 || !target.All(char.IsLetter))
            return BadRequest(new { message = "Use a three-letter ISO currency code." });

        if (target == "ETB")
        {
            return Ok(new
            {
                from = "ETB",
                to = "ETB",
                rate = 1m,
                etbPerUnit = 1m,
                source = "National Bank of Ethiopia",
                date = DateTime.UtcNow.ToString("yyyy-MM-dd")
            });
        }

        var detail = await fx.GetRateDetailAsync(target, ct);
        if (detail is not null)
        {
            return Ok(new
            {
                from = "ETB",
                to = target,
                rate = detail.RateToTarget,
                etbPerUnit = detail.EtbPerUnit,
                source = detail.Source,
                date = detail.Date,
                buy = detail.BuyRate,
                sell = detail.SellRate
            });
        }

        var rates = await fx.RatesAsync(DateOnly.FromDateTime(DateTime.UtcNow), ct);
        if (rates.TryGetValue(target, out var etbPerUnit) && etbPerUnit > 0)
        {
            return Ok(new
            {
                from = "ETB",
                to = target,
                rate = Math.Round(1m / etbPerUnit, 8),
                etbPerUnit = Math.Round(etbPerUnit, 4),
                source = "Market Average",
                date = DateTime.UtcNow.ToString("yyyy-MM-dd")
            });
        }

        return NotFound(new { message = $"No exchange rate is available for {target}." });
    }

    private static bool IsCurrency(string value) => value.Length == 3 && value.All(char.IsLetter);
}
