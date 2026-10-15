using System.Net.Http.Headers;
using System.Text.Json;

namespace SES.Customs.API.Integrations.Ocr;

public sealed class OcrOptions
{
    public const string SectionName = "Ocr";
    public bool Enabled { get; set; } = true;
    public string BaseUrl { get; set; } = "http://62.84.187.195:4000";
    /// <summary>The engine reads on CPU, so one page can take several minutes.</summary>
    public int TimeoutMinutes { get; set; } = 30;
    public int MaxAttempts { get; set; } = 3;
}

public sealed record OcrField(string Name, string? Description = null);

public sealed record OcrResult(string Text, string Engine, int PageCount, int DocumentPageCount, double ProcessingMs, double? Confidence);

public class OcrException(string message) : Exception(message);

/// <summary>The engine could not open the file itself (corrupt, empty or not really a PDF/image); retrying will not help.</summary>
public sealed class OcrUnreadableFileException(string message) : OcrException(message);

/// <summary>Client for the OCR service: sends one document and asks only for the named fields, which is far faster than a full transcription.</summary>
public sealed class OcrClient(HttpClient http)
{
    public async Task<bool> ReadyAsync(CancellationToken ct)
    {
        try { using var response = await http.GetAsync("ready", ct); return response.IsSuccessStatusCode; }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested) { return false; }
    }

    public async Task<OcrResult> ReadFieldsAsync(byte[] content, string contentType, string fileName, IReadOnlyList<OcrField> fields, string instructions, CancellationToken ct)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(file, "image", string.IsNullOrWhiteSpace(fileName) ? "document" : fileName);
        form.Add(new StringContent(JsonSerializer.Serialize(new { fields = fields.Select(f => new { name = f.Name, description = f.Description }), instructions })), "metadata");
        // keepalive streams filler bytes while the page is read, so long CPU runs are not dropped by proxies;
        // the trade-off is that engine failures arrive as {"error": ...} inside a 200.
        using var response = await http.PostAsync("api/v1/ocr?keepalive=true", form, ct);
        var body = (await response.Content.ReadAsStringAsync(ct)).Trim();
        JsonElement json;
        try { json = JsonSerializer.Deserialize<JsonElement>(body.Length == 0 ? "{}" : body); }
        catch (JsonException) { throw new OcrException($"The OCR service returned an unreadable response ({(int)response.StatusCode})."); }
        if (json.ValueKind == JsonValueKind.Object && json.TryGetProperty("error", out var error))
        {
            var message = error.ToString();
            if ((int)response.StatusCode is 400 or 413 || System.Text.RegularExpressions.Regex.IsMatch(message, @"decod|corrupt|cannot be (read|opened)|unsupported|invalid (pdf|image)|no pages", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                throw new OcrUnreadableFileException(message);
            throw new OcrException($"OCR engine error: {message}");
        }
        if (!response.IsSuccessStatusCode) throw new OcrException($"The OCR service answered {(int)response.StatusCode}.");
        if (json.ValueKind != JsonValueKind.Object || !json.TryGetProperty("pages", out var pages) || pages.ValueKind != JsonValueKind.Array) throw new OcrException("The OCR service returned no pages.");

        var texts = new List<string>();
        var scores = new List<double>();
        foreach (var page in pages.EnumerateArray())
        {
            if (page.TryGetProperty("text", out var text)) texts.Add(text.GetString() ?? "");
            if (page.TryGetProperty("token_logprobs", out var tokens) && tokens.ValueKind == JsonValueKind.Array)
                foreach (var token in tokens.EnumerateArray())
                    if (token.TryGetProperty("score", out var score) && score.TryGetDouble(out var value)) scores.Add(value <= 0 ? Math.Exp(value) : Math.Min(1, value));
        }
        return new OcrResult(string.Join("\n", texts).Trim(), Text(json, "engine"), Int(json, "page_count"), Int(json, "document_page_count"),
            json.TryGetProperty("processing_time_ms", out var ms) && ms.TryGetDouble(out var time) ? time : 0, scores.Count == 0 ? null : Math.Round(scores.Average(), 3));
    }

    private static string Text(JsonElement json, string name) => json.TryGetProperty(name, out var value) ? value.ToString() : "";
    private static int Int(JsonElement json, string name) => json.TryGetProperty(name, out var value) && value.TryGetInt32(out var number) ? number : 0;
}
