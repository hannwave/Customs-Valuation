using System.Net;
using System.Text.RegularExpressions;

namespace SES.Customs.Core.Features.ManufacturerPrices.Service;

public static partial class ManufacturerPriceMatcher
{
    private static readonly HashSet<string> IgnoredWords = ["buy", "shop", "new", "official", "price", "manufacturer", "from", "the"];
    private static readonly HashSet<string> AccessoryWords = ["case", "cases", "cover", "covers", "charger", "chargers", "cable", "cables", "protector", "protectors", "replacement", "refurbished", "renewed", "used", "accessory", "accessories", "screen", "screens", "strap", "straps", "band", "bands"];
    private static readonly HashSet<string> ModelSuffixes = ["pro", "max", "mini", "plus", "ultra", "lite", "fe", "se"];

    public static string? InferDomain(string query)
    {
        var words = Words(query);
        if (words.Overlaps(["iphone", "ipad", "macbook", "imac", "airpods", "apple"])) return "apple.com";
        if (words.Contains("samsung") || (words.Contains("galaxy") && words.Contains("phone"))) return "samsung.com";
        if (words.Contains("pixel") || words.Contains("google")) return "store.google.com";
        if (words.Contains("sony") || words.Contains("playstation")) return "sony.com";
        if (words.Contains("dell")) return "dell.com";
        if (words.Contains("lenovo") || words.Contains("thinkpad")) return "lenovo.com";
        if (words.Contains("hp") || words.Contains("hewlett")) return "hp.com";
        if (words.Contains("microsoft") || words.Contains("surface")) return "microsoft.com";
        if (words.Contains("asus")) return "asus.com";
        if (words.Contains("acer")) return "acer.com";
        if (words.Contains("xiaomi") || words.Contains("redmi")) return "mi.com";
        if (words.Contains("huawei")) return "huawei.com";
        if (words.Contains("nike")) return "nike.com";
        if (words.Contains("adidas")) return "adidas.com";
        if (words.Contains("canon")) return "canon.com";
        if (words.Contains("nikon")) return "nikon.com";
        if (words.Contains("toyota")) return "toyota.com";
        if (words.Contains("honda")) return "honda.com";
        if (words.Contains("bmw")) return "bmw.com";
        return null;
    }

    public static bool TryResolveSite(string query, string? suppliedSite, out string? domain, out Uri? directUrl)
    {
        directUrl = null;
        domain = InferDomain(query);
        if (string.IsNullOrWhiteSpace(suppliedSite)) return domain is not null;

        var input = suppliedSite.Trim();
        if (!Uri.TryCreate(input.Contains("://", StringComparison.Ordinal) ? input : $"https://{input}", UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(uri.UserInfo) || !uri.IsDefaultPort ||
            IPAddress.TryParse(uri.Host, out _) || !DomainPattern().IsMatch(uri.DnsSafeHost))
        {
            domain = null;
            return false;
        }

        domain = uri.DnsSafeHost.StartsWith("www.", StringComparison.OrdinalIgnoreCase) ? uri.DnsSafeHost[4..] : uri.DnsSafeHost;
        if (uri.AbsolutePath != "/") directUrl = uri;
        return true;
    }

    public static bool IsOfficialUrl(string? url, string domain)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            return false;
        return uri.DnsSafeHost.Equals(domain, StringComparison.OrdinalIgnoreCase) ||
               uri.DnsSafeHost.EndsWith($".{domain}", StringComparison.OrdinalIgnoreCase);
    }

    public static bool MatchesProduct(string query, string title)
    {
        var requested = Words(query);
        var candidate = Words(title);
        requested.ExceptWith(IgnoredWords);
        if (requested.Count == 0 || !requested.IsSubsetOf(candidate)) return false;
        if (AccessoryWords.Any(word => candidate.Contains(word) && !requested.Contains(word))) return false;
        if (ModelSuffixes.Any(word => candidate.Contains(word) && !requested.Contains(word))) return false;

        var requestedModels = ProductModelIdentifiers(query);
        if (ProductModelIdentifiers(title).Except(requestedModels).Any()) return false;

        // A storage variant is a separate product. When the officer specified one,
        // do not accept an offer that also names a different capacity.
        var requestedCapacities = Capacities(query);
        var offeredCapacities = Capacities(title);
        return requestedCapacities.Count == 0 ||
               (requestedCapacities.SetEquals(offeredCapacities) && requestedCapacities.Count == 1);
    }

    public static bool IsLikelyProductPage(string query, string title, string url)
    {
        if (!MatchesProduct(query, title)) return false;
        var hasUri = Uri.TryCreate(url, UriKind.Absolute, out var uri);
        var path = hasUri ? uri!.AbsolutePath.ToLowerInvariant() : url.ToLowerInvariant();
        if (hasUri && (uri!.DnsSafeHost.StartsWith("support.", StringComparison.OrdinalIgnoreCase) ||
                       uri.DnsSafeHost.StartsWith("help.", StringComparison.OrdinalIgnoreCase))) return false;
        return !new[] { "/support/", "/newsroom/", "/blog/", "/community/", "/accessories/", "/cases-protection/", "/compare/", "/manuals/", "/docs/" }
            .Any(path.Contains);
    }

    private static HashSet<string> Words(string value)
    {
        var normalized = Regex.Replace(value.ToLowerInvariant(), @"\bi[\s-]*phone\b", "iphone");
        normalized = Regex.Replace(normalized, @"\b(\d+)\s+(gb|tb)\b", "$1$2");
        return WordPattern().Matches(normalized).Select(match => match.Value).ToHashSet(StringComparer.Ordinal);
    }

    private static HashSet<string> Capacities(string value) => CapacityPattern().Matches(value.ToLowerInvariant())
        .Select(match => Regex.Replace(match.Value, @"\s+", ""))
        .ToHashSet(StringComparer.Ordinal);

    private static HashSet<string> ProductModelIdentifiers(string value)
    {
        var normalized = Regex.Replace(value.ToLowerInvariant(), @"\bi[\s-]*phone\b", "iphone");
        var identifiers = new HashSet<string>(StringComparer.Ordinal);
        foreach (Match match in Regex.Matches(normalized, @"\biphone\s*(\d{1,2})\b")) identifiers.Add($"iphone{match.Groups[1].Value}");
        foreach (Match match in Regex.Matches(normalized, @"\bgalaxy\s+([aszm]\d{1,3})\b")) identifiers.Add($"galaxy{match.Groups[1].Value}");
        foreach (Match match in Regex.Matches(normalized, @"\bpixel\s*(\d{1,2})\b")) identifiers.Add($"pixel{match.Groups[1].Value}");
        foreach (Match match in Regex.Matches(normalized, @"\bxps\s*(\d{1,2})\b")) identifiers.Add($"xps{match.Groups[1].Value}");
        return identifiers;
    }

    [GeneratedRegex(@"^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$")]
    private static partial Regex DomainPattern();

    [GeneratedRegex(@"[a-z0-9]+")]
    private static partial Regex WordPattern();

    [GeneratedRegex(@"\b\d+\s*(?:gb|tb)\b")]
    private static partial Regex CapacityPattern();
}
