using System.Text.Json;
using System.Text.RegularExpressions;
using System.Data.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Integrations.Comtrade;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Controllers;

[ApiController, Route("api/customs-trade-benchmark"), Authorize(Policy = "OfficerOnly")]
public sealed class CustomsTradeBenchmarkController(ComtradeBenchmarkClient client) : ControllerBase
{
    // One category per request lets the dashboard show progress and cancel a
    // sample run. Use the same paced, cached lookup as the valuation card.
    [HttpGet("check")]
    public async Task<IActionResult> Check([FromQuery] string? hsCode, [FromServices] CustomsDbContext db,
        CancellationToken ct, [FromQuery] string? unit = null)
    {
        var code = Regex.Replace(hsCode ?? "", "[^0-9]", "");
        if (code.Length < 6) return BadRequest(new { message = "Select an HS code before checking a trade benchmark." });
        code = code[..6];
        var preferredUnit = string.IsNullOrWhiteSpace(unit) ? null : unit.Trim().ToLowerInvariant();
        if (preferredUnit is not (null or "u" or "kg"))
            return BadRequest(new { message = "The preferred benchmark unit must be u (items) or kg (kilograms)." });

        BenchmarkCatalogueCheck catalogue;
        try
        {
            var revision = await db.HsRevisions.AsNoTracking().Where(revision => revision.Status == "Active")
                .OrderByDescending(revision => revision.EffectiveDate).ThenByDescending(revision => revision.Number)
                .Select(revision => new { revision.Id, revision.Name }).FirstOrDefaultAsync(ct);
            var found = revision is not null && await db.HsCodes.AsNoTracking().AnyAsync(hs => hs.RevisionId == revision.Id
                && (hs.Code == code || (hs.Code == null && db.NationalTariffLines.Any(line => line.HsCodeId == hs.Id
                    && line.TariffItemNo != null && line.TariffItemNo.Replace(".", "").StartsWith(code)))), ct);
            catalogue = revision is null
                ? new("missing", null, "No active tariff revision is configured.")
                : new(found ? "present" : "missing", revision.Name, found
                    ? "Category exists in the active tariff catalogue."
                    : "Category is missing from the active tariff catalogue; the dashboard cannot select it even if trade data exists.");
        }
        catch (DbException)
        {
            catalogue = new("error", null, "The tariff catalogue could not be reached. Trade-data checks are independent.");
        }

        var result = await Search(code, ct, preferredUnit);
        var checkedAt = DateTimeOffset.UtcNow;
        if (result is OkObjectResult { Value: CustomsTradeBenchmark benchmark })
            return Ok(new BenchmarkFetchCheck(code, preferredUnit, checkedAt, catalogue,
                BenchmarkFetchVerification.Verify(benchmark, code, preferredUnit, checkedAt.Year), benchmark));
        var problem = (result as ObjectResult)?.Value as ProblemDetails;
        return Ok(new BenchmarkFetchCheck(code, preferredUnit, checkedAt, catalogue,
            new("api_error", problem?.Detail ?? "The benchmark API could not complete this lookup.", [],
                (result as ObjectResult)?.StatusCode ?? 500), null));
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string? hsCode, CancellationToken ct, [FromQuery] string? unit = null)
    {
        var code = Regex.Replace(hsCode ?? "", "[^0-9]", "");
        if (code.Length < 6) return BadRequest(new { message = "Select an HS code before looking up a trade benchmark." });
        code = code[..6];
        var preferredUnit = string.IsNullOrWhiteSpace(unit) ? null : unit.Trim().ToLowerInvariant();
        if (preferredUnit is not (null or "u" or "kg"))
            return BadRequest(new { message = "The preferred benchmark unit must be u (items) or kg (kilograms)." });
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(60));
        try
        {
            return Ok(await client.SearchAsync(code, timeout.Token, preferredUnit));
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
