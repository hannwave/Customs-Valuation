using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SES.Customs.API.Integrations.Commodities;

namespace SES.Customs.API.Controllers;

/// <summary>Global base market prices: live exchange prices for raw materials, matched to the declared HS code.</summary>
[ApiController]
[Route("api/commodity-prices")]
[Authorize(Policy = "OfficerOnly")]
public sealed class CommodityPricesController(CommodityPriceClient client) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> All(CancellationToken ct)
    {
        var quotes = await Task.WhenAll(CommodityPriceClient.Catalogue.Select(item => client.QuoteAsync(item, ct)));
        return Ok(new
        {
            retrievedAt = DateTimeOffset.UtcNow,
            items = quotes.OfType<CommodityQuoteDto>().ToArray(),
            unavailable = CommodityPriceClient.Catalogue.Where((item, index) => quotes[index] is null).Select(item => item.Name).ToArray(),
        });
    }

    [HttpGet("match")]
    public async Task<IActionResult> Match([FromQuery] string? hsCode, CancellationToken ct)
    {
        var digits = new string((hsCode ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length < 4) return BadRequest(new { message = "Select an HS code before looking up a global base market price." });
        var commodity = CommodityPriceClient.ForHsCode(digits);
        if (commodity is null)
            return Ok(new CommodityMatchDto(false, digits, null, "This tariff item is not an exchange-traded raw material, so no global base market price applies."));
        var quote = await client.QuoteAsync(commodity, ct);
        return Ok(quote is null
            ? new CommodityMatchDto(false, digits, null, $"The live {commodity.Name.ToLowerInvariant()} price could not be loaded right now. Retry shortly.")
            : new CommodityMatchDto(true, digits, quote, CommodityPriceClient.Describe(quote)));
    }
}
