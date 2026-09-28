using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SES.Customs.API.Integrations.Apify;
using SES.Customs.Core.Features.ManufacturerPrices.Service;

namespace SES.Customs.API.Controllers;

[ApiController]
[Route("api/manufacturer-prices")]
[Authorize(Policy = "OfficerOnly")]
public sealed class ManufacturerPricesController(ApifyManufacturerPriceClient apify) : ControllerBase
{
    [HttpGet("search")]
    [ProducesResponseType<ManufacturerPriceSearchDto>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Search([FromQuery] string? q, [FromQuery] string? market,
        [FromQuery] string? site, CancellationToken ct)
    {
        var query = q?.Trim() ?? "";
        var selectedMarket = (market ?? "us").Trim().ToLowerInvariant();
        if (query.Length is < 2 or > 160)
            return BadRequest(new { message = "Enter a product and exact model in 2 to 160 characters." });
        if (selectedMarket is not ("us" or "gb" or "de" or "ae" or "za"))
            return BadRequest(new { message = "Choose a supported market: US, GB, DE, AE or ZA." });
        if (site is { Length: > 300 } ||
            (!string.IsNullOrWhiteSpace(site) && !ManufacturerPriceMatcher.TryResolveSite(query, site, out _, out _)))
            return BadRequest(new { message = "Enter a valid HTTPS manufacturer website or product URL." });
        if (!apify.IsConfigured)
            return Problem(statusCode: 503, title: "Manufacturer price search is not configured",
                detail: "Configure APIFY_API_TOKEN on the API server.");

        try
        {
            return Ok(await apify.SearchAsync(query, selectedMarket, site, ct));
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return Problem(statusCode: 504, title: "Manufacturer price search timed out",
                detail: "The official-site search did not finish in time. Try the direct product URL.");
        }
        catch (HttpRequestException ex)
        {
            return Problem(statusCode: 502, title: "Manufacturer price provider failed",
                detail: ex.Message);
        }
    }
}
