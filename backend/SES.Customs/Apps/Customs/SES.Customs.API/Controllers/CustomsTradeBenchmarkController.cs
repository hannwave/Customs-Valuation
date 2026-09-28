using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;

namespace SES.Customs.API.Controllers;

[ApiController, Route("api/customs-trade-benchmark"), Authorize(Policy = "OfficerOnly")]
public sealed class CustomsTradeBenchmarkController(IHttpClientFactory factory, IMemoryCache cache) : ControllerBase
{
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string? hsCode, CancellationToken ct)
    {
        var code = Regex.Replace(hsCode ?? "", "[^0-9]", "");
        if (code.Length < 6) return BadRequest(new { message = "Select an HS code before looking up a trade benchmark." });
        code = code[..6];
        var cacheKey = $"comtrade:ethiopia:imports:{code}";
        if (cache.TryGetValue<object>(cacheKey, out var cached)) return Ok(cached);

        try
        {
            var http = factory.CreateClient("UNComtrade");
            for (var year = DateTime.UtcNow.Year - 1; year >= DateTime.UtcNow.Year - 3; year--)
            {
                var path = $"public/v1/preview/C/A/HS?reporterCode=231&period={year}&partnerCode=0&cmdCode={code}&flowCode=M&maxRecords=500";
                using var response = await http.GetAsync(path, ct);
                if (!response.IsSuccessStatusCode)
                    return Problem(statusCode: 502, title: "UN Comtrade is unavailable", detail: $"The preview service returned HTTP {(int)response.StatusCode}.");
                using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
                if (!document.RootElement.TryGetProperty("data", out var rows) || rows.ValueKind != JsonValueKind.Array) continue;
                foreach (var row in rows.EnumerateArray())
                {
                    if (!StringEquals(row, "cmdCode", code) || !StringEquals(row, "flowCode", "M") || !StringEquals(row, "partnerCode", "0")) continue;
                    var value = Number(row, "primaryValue");
                    var quantity = Number(row, "qty");
                    var unit = String(row, "qtyUnitAbbr");
                    if (value is not > 0 || quantity is not > 0 || string.IsNullOrWhiteSpace(unit) || unit == "N/A") continue;
                    var result = new
                    {
                        hsCode = code, period = year, reporter = "Ethiopia", currency = "USD",
                        unit, tradeValue = value, quantity,
                        unitValue = Math.Round(value.Value / quantity.Value, 2),
                        sourceUrl = "https://" + http.BaseAddress!.Host + "/" + path,
                        message = "HS-category import unit value (reported trade value divided by reported quantity). It is not an accepted customs value for an exact brand or model."
                    };
                    cache.Set(cacheKey, result, TimeSpan.FromHours(12));
                    return Ok(result);
                }
            }
            var unavailable = new { hsCode = code, period = (int?)null, reporter = "Ethiopia", currency = "USD", unit = (string?)null,
                tradeValue = (decimal?)null, quantity = (decimal?)null, unitValue = (decimal?)null, sourceUrl = (string?)null,
                message = "No Ethiopia import record with a usable quantity was available for this HS category in the last three reported years." };
            cache.Set(cacheKey, unavailable, TimeSpan.FromHours(2));
            return Ok(unavailable);
        }
        catch (HttpRequestException)
        {
            return Problem(statusCode: 502, title: "UN Comtrade could not be reached");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return Problem(statusCode: 504, title: "UN Comtrade timed out");
        }
        catch (JsonException)
        {
            return Problem(statusCode: 502, title: "UN Comtrade returned an unreadable response");
        }
    }

    private static string? String(JsonElement row, string name) => row.TryGetProperty(name, out var field)
        ? field.ValueKind == JsonValueKind.String ? field.GetString() : field.ToString() : null;
    private static bool StringEquals(JsonElement row, string name, string value) => string.Equals(String(row, name), value, StringComparison.OrdinalIgnoreCase);
    private static decimal? Number(JsonElement row, string name) => row.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.Number && field.TryGetDecimal(out var value) ? value : null;
}
