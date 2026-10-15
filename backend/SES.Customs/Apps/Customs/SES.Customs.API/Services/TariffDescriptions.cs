namespace SES.Customs.API.Services;

/// <summary>Turns tariff book descriptions ("-- Other", "--- Roasted:") into text that reads on its own beside a code.</summary>
public static class TariffDescriptions
{
    public static string Readable(string? lineDescription, string? hsDescription)
    {
        var line = Clean(lineDescription);
        var hs = Clean(hsDescription);
        if (line.Length == 0) return hs;
        // "Other" lines only make sense with their parent heading.
        if (!IsOther(line)) return line;
        // "Other" under a parent that is itself only "Other" says nothing; return empty so callers fall back to the nomenclature.
        return hs.Length == 0 || IsOther(hs) ? "" : $"{hs} — other";
    }

    /// <summary>Readable text for a tariff line, falling back to the WCO nomenclature for its code when the book's text is generic.</summary>
    public static string ForCode(string? lineDescription, string? hsDescription, string? code)
    {
        var text = Readable(lineDescription, hsDescription);
        return text.Length > 0 ? text : Integrations.Hs.HsNomenclature.Describe(code) ?? "Other";
    }

    private static bool IsOther(string text) => text.Equals("other", StringComparison.OrdinalIgnoreCase) || text.Equals("others", StringComparison.OrdinalIgnoreCase);

    public static string Clean(string? text) => (text ?? "").Trim().TrimStart('-', '–', '—', ' ', '\t').TrimEnd(':', ';', ' ').Trim();
}
