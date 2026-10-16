using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace SES.Customs.API.Integrations.Ocr;

public sealed class GeminiOptions
{
    public const string SectionName = "Gemini";
    public string BaseUrl { get; set; } = "https://generativelanguage.googleapis.com";
    public string ApiKey { get; set; } = "";
    /// <summary>Tried first. The "-latest" aliases follow Google's current Flash release, so model retirements need no change here.</summary>
    public string Model { get; set; } = "gemini-flash-latest";
    /// <summary>Used when the main model is out of quota or unavailable; Flash-Lite has a much larger free daily allowance.</summary>
    public string FallbackModel { get; set; } = "gemini-flash-lite-latest";
    public int TimeoutSeconds { get; set; } = 120;
}

/// <summary>
/// Reads the named fields with Google Gemini: the whole document goes in one request and comes back as JSON in seconds.
/// The fields are returned as "name: value" lines so DocumentScanAnalyzer reads them exactly as it reads the local engine's output.
/// </summary>
public sealed class GeminiOcrClient(HttpClient http, IOptions<GeminiOptions> options, ILogger<GeminiOcrClient> logger) : IOcrClient
{
    private static readonly HashSet<string> Supported = new(StringComparer.OrdinalIgnoreCase)
        { "application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif" };

    public Task<bool> ReadyAsync(CancellationToken ct) => Task.FromResult(!string.IsNullOrWhiteSpace(options.Value.ApiKey));

    public async Task<OcrResult> ReadFieldsAsync(byte[] content, string contentType, string fileName, IReadOnlyList<OcrField> fields, string instructions, CancellationToken ct)
    {
        var mime = contentType.Split(';')[0].Trim();
        if (mime.Equals("image/jpg", StringComparison.OrdinalIgnoreCase)) mime = "image/jpeg";
        if (content.Length == 0) throw new OcrUnreadableFileException("The file is empty.");
        if (!Supported.Contains(mime)) throw new OcrUnreadableFileException($"Unsupported file type {contentType}.");

        var settings = options.Value;
        var models = new[] { settings.Model, settings.FallbackModel }.Where(m => !string.IsNullOrWhiteSpace(m)).Distinct().ToArray();
        var body = Request(content, mime, fields, instructions);
        OcrException? last = null;
        foreach (var model in models)
        {
            try { return await CallAsync(model, body, fields, ct); }
            catch (GeminiUnavailableException exception)
            {
                last = exception;
                logger.LogWarning("Gemini model {Model} unavailable ({Reason}); trying the next model.", model, exception.Message);
            }
        }
        throw last ?? new OcrException("No Gemini model is configured.");
    }

    private static string Request(byte[] content, string mime, IReadOnlyList<OcrField> fields, string instructions)
    {
        var prompt = new StringBuilder("Read this document (every page) and fill in each field from what is printed on it. ")
            .Append(instructions).Append("\nFields:\n");
        foreach (var field in fields) prompt.Append("- ").Append(Key(field)).Append(field.Description is null ? "" : $": {field.Description}").Append('\n');
        var schema = new
        {
            type = "OBJECT",
            properties = fields.ToDictionary(Key, _ => (object)new { type = "STRING" }),
            required = fields.Select(Key).ToArray(),
            propertyOrdering = fields.Select(Key).ToArray(),
        };
        return JsonSerializer.Serialize(new
        {
            contents = new[] { new { role = "user", parts = new object[] { new { inline_data = new { mime_type = mime, data = Convert.ToBase64String(content) } }, new { text = prompt.ToString() } } } },
            generationConfig = new { temperature = 0, responseMimeType = "application/json", responseSchema = schema },
        });
    }

    private async Task<OcrResult> CallAsync(string model, string body, IReadOnlyList<OcrField> fields, CancellationToken ct)
    {
        var settings = options.Value;
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{settings.BaseUrl.TrimEnd('/')}/v1beta/models/{Uri.EscapeDataString(model)}:generateContent")
            { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        request.Headers.Add("x-goog-api-key", settings.ApiKey);
        var started = DateTime.UtcNow;
        using var response = await http.SendAsync(request, ct);
        var text = await response.Content.ReadAsStringAsync(ct);
        var elapsed = (DateTime.UtcNow - started).TotalMilliseconds;

        if (!response.IsSuccessStatusCode)
        {
            var message = ErrorMessage(text) ?? $"Gemini answered {(int)response.StatusCode}.";
            if (response.StatusCode is HttpStatusCode.TooManyRequests or HttpStatusCode.NotFound or HttpStatusCode.ServiceUnavailable or HttpStatusCode.InternalServerError)
                throw new GeminiUnavailableException($"{(int)response.StatusCode}: {message}");
            if (response.StatusCode == HttpStatusCode.BadRequest && System.Text.RegularExpressions.Regex.IsMatch(message, @"image|document|pdf|page|mime|process input|decode", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                throw new OcrUnreadableFileException(message);
            throw new OcrException($"Gemini error: {message}");
        }

        using var json = JsonDocument.Parse(text);
        if (!json.RootElement.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
        {
            var blocked = json.RootElement.TryGetProperty("promptFeedback", out var feedback) && feedback.TryGetProperty("blockReason", out var reason) ? reason.GetString() : null;
            throw new OcrException(blocked is null ? "Gemini returned no answer." : $"Gemini declined the document ({blocked}).");
        }
        var candidate = candidates[0];
        var answer = candidate.TryGetProperty("content", out var contentElement) && contentElement.TryGetProperty("parts", out var parts)
            ? string.Concat(parts.EnumerateArray().Select(p => p.TryGetProperty("text", out var t) ? t.GetString() : ""))
            : "";
        if (answer.Length == 0)
            throw new OcrException($"Gemini returned an empty answer ({(candidate.TryGetProperty("finishReason", out var finish) ? finish.GetString() : "no reason")}).");

        Dictionary<string, JsonElement>? values;
        try { values = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(answer); }
        catch (JsonException) { throw new OcrException("Gemini returned fields that are not valid JSON."); }
        values ??= [];
        var lines = fields.Select(field =>
        {
            var value = values.TryGetValue(Key(field), out var v) ? (v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString()) : null;
            value = string.IsNullOrWhiteSpace(value) ? "none" : value.ReplaceLineEndings(" ").Trim();
            return $"{field.Name}: {value}";
        });
        var engine = json.RootElement.TryGetProperty("modelVersion", out var version) ? version.GetString() ?? model : model;
        return new OcrResult(string.Join("\n", lines), $"gemini:{engine}", 0, 0, elapsed, null);
    }

    /// <summary>JSON property names cannot hold spaces reliably, so "total amount" becomes "total_amount"; the analyzer treats "_" as a space.</summary>
    private static string Key(OcrField field) => field.Name.Replace(' ', '_');

    private static string? ErrorMessage(string body)
    {
        try
        {
            using var json = JsonDocument.Parse(body);
            return json.RootElement.TryGetProperty("error", out var error) && error.TryGetProperty("message", out var message) ? message.GetString() : null;
        }
        catch (JsonException) { return null; }
    }

    private sealed class GeminiUnavailableException(string message) : OcrException(message);
}
