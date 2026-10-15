using System.Text.Json;

namespace SES.Customs.API.Integrations.Hs;

/// <summary>
/// WCO HS 2022 heading (4-digit) and subheading (6-digit) descriptions, embedded from the public-domain
/// datasets/harmonized-system dataset (https://github.com/datasets/harmonized-system). Used where the national
/// tariff book has no text of its own, for example tariff headings, so no code is ever shown without a description.
/// </summary>
public static class HsNomenclature
{
    private static readonly Lazy<IReadOnlyDictionary<string, string>> Entries = new(Load);

    public static string? Describe(string? code)
    {
        var digits = new string((code ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length >= 6 && Entries.Value.TryGetValue(digits[..6], out var subheading)) return subheading;
        return digits.Length >= 4 && Entries.Value.TryGetValue(digits[..4], out var heading) ? heading : null;
    }

    public static string? Heading(string? code)
    {
        var digits = new string((code ?? "").Where(char.IsDigit).ToArray());
        return digits.Length >= 4 && Entries.Value.TryGetValue(digits[..4], out var heading) ? heading : null;
    }

    private static IReadOnlyDictionary<string, string> Load()
    {
        using var stream = typeof(HsNomenclature).Assembly.GetManifestResourceStream("SES.Customs.API.Integrations.Hs.hs-nomenclature.json");
        return stream is null ? new Dictionary<string, string>() : JsonSerializer.Deserialize<Dictionary<string, string>>(stream) ?? [];
    }
}
