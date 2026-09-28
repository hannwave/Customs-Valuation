using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SES.Customs.API.Integrations.Comtrade;

namespace SES.Customs.API.Controllers;

[ApiController, Route("api/customs-trade-benchmark"), Authorize(Policy = "OfficerOnly")]
public sealed class CustomsTradeBenchmarkController(ComtradeBenchmarkClient client) : ControllerBase
{
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string? hsCode, CancellationToken ct)
    {
        var code = Regex.Replace(hsCode ?? "", "[^0-9]", "");
        if (code.Length < 6) return BadRequest(new { message = "Select an HS code before looking up a trade benchmark." });
        code = code[..6];
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(60));
        try
        {
            return Ok(await client.SearchAsync(code, timeout.Token));
        }
        catch (ComtradeUnavailableException exception)
        {
            return Problem(statusCode: exception.StatusCode, title: "UN Comtrade is unavailable", detail: exception.Message);
        }
        catch (HttpRequestException)
        {
            return Problem(statusCode: 502, title: "UN Comtrade could not be reached", detail: "The trade-data provider could not be reached. Please retry shortly.");
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return Problem(statusCode: 504, title: "UN Comtrade timed out", detail: "The trade-data lookup timed out. Please retry shortly.");
        }
        catch (JsonException)
        {
            return Problem(statusCode: 502, title: "UN Comtrade returned an unreadable response", detail: "The provider did not return valid trade records. Please retry shortly.");
        }
    }
}
