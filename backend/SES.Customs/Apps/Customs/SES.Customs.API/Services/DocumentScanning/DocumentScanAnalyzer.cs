using System.Globalization;
using System.Text.RegularExpressions;
using SES.Customs.Core.Models;

namespace SES.Customs.API.Services.DocumentScanning;

public sealed record ScanFinding(string Check, string Result, string Detail);

public sealed record ScanVerdict(string Flag, int Score, string DetectedType, string Summary, IReadOnlyList<ScanFinding> Findings);

/// <summary>What the declaration says, to compare a scanned declaration document against.</summary>
public sealed record DeclarationScanContext(
    string Kind, string ProductName, string Brand, string Model, string HsCode, string OriginCode, string OriginName,
    decimal Quantity, string Unit, decimal? InvoiceAmount, string Currency, IReadOnlyList<string> ImporterNames,
    bool DuplicateWithinCase = false, bool UsedByAnotherImporter = false);

/// <summary>What the importer registered, to compare a scanned verification document against.</summary>
public sealed record VerificationScanContext(
    string Kind, IReadOnlyList<string> Names, string Tin, IReadOnlyList<string> Numbers,
    bool DuplicateWithinCase = false, bool UsedByAnotherImporter = false);

/// <summary>
/// Turns the OCR reading of one document into a flag for the officer. It is a triage aid, not a decision:
/// HEALTHY means the page looks like the expected document and agrees with the declaration,
/// SUSPICIOUS means it is the right sort of document but something disagrees or could not be read,
/// UNRELATED means the file is not a trade or identity document at all.
/// </summary>
public static class DocumentScanAnalyzer
{
    public const string Pass = "pass", Warn = "warn", Fail = "fail", Info = "info";

    private sealed record DocType(string Code, string Label, string[] Keywords);

    // Order matters: the first type whose keywords appear wins, so specific phrases come before generic ones.
    private static readonly DocType[] TradeTypes =
    [
        new("CERTIFICATE_OF_ORIGIN", "Certificate of origin", ["certificate of origin", "origin certificate", "origin criterion", "goods consigned from"]),
        new("PACKING_LIST", "Packing list", ["packing list", "packing slip", "package list", "gross weight", "gross kg", "net weight"]),
        new("PROFORMA_INVOICE", "Proforma invoice", ["proforma", "pro forma", "pro-forma", "quotation"]),
        new("COMMERCIAL_INVOICE", "Commercial invoice", ["commercial invoice", "invoice", "grand total", "amount due"]),
        new("TRANSPORT_DOCUMENT", "Bill of lading / air waybill", ["bill of lading", "air waybill", "airway bill", "waybill", "b/l"]),
    ];

    private static readonly DocType[] IdentityTypes =
    [
        new("AGENT_LICENSE", "Customs agent licence", ["agent licen", "customs agent", "clearing agent", "customs broker"]),
        new("VAT_CERTIFICATE", "VAT registration certificate", ["vat registration", "value added tax", "vat certificate", "vat no"]),
        new("TIN_CERTIFICATE", "TIN certificate", ["taxpayer identification", "tin certificate", "tin registration", "taxpayer registration", "tin no"]),
        new("COMMERCIAL_REGISTRATION", "Commercial registration certificate", ["commercial registration", "business registration", "certificate of registration", "registration certificate", "commercial register", "memorandum of association"]),
        new("TRADE_LICENSE", "Trade licence", ["trade licen", "business licen", "trading licen", "licen"]),
        new("IDENTITY_DOCUMENT", "Identity document", ["passport", "fayda", "national id", "identity card", "id card", "residence permit", "kebele", "resident id", "date of birth"]),
        new("PROOF_OF_RESIDENCE", "Proof of address", ["utility bill", "electricity", "water bill", "lease agreement", "rental agreement", "proof of address", "residence certificate"]),
        new("AUTHORIZATION_LETTER", "Authorisation letter", ["authorization", "authorisation", "power of attorney", "hereby authori", "letter of authority"]),
    ];

    public static readonly IReadOnlyDictionary<string, string> KindLabels = TradeTypes.Concat(IdentityTypes).ToDictionary(x => x.Code, x => x.Label);

    private static readonly HashSet<string> StopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "the", "and", "for", "with", "from", "new", "set", "other", "parts", "unit", "units", "pcs", "piece", "pieces", "plc", "ltd", "llc", "inc", "co", "company",
        "limited", "trading", "import", "export", "general", "goods", "product", "products", "item", "items", "sealed", "retail", "generic", "grade", "type", "model",
    };

    private static readonly HashSet<string> Units = new(StringComparer.OrdinalIgnoreCase) { "gb", "tb", "mb", "kg", "g", "mm", "cm", "m", "w", "kw", "v", "mah", "hz", "ghz", "inch", "in", "l", "ml", "pcs", "pieces", "units", "gsm", "percent" };

    /// <summary>Reads "name: value" lines from the engine into a dictionary keyed by lower-case field name.</summary>
    public static Dictionary<string, string> ParseFields(string text)
    {
        var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim().TrimStart('-', '*', '•', ' ').Replace("**", "");
            var colon = line.IndexOf(':');
            if (colon < 1) continue;
            var key = Regex.Replace(line[..colon].Trim().ToLowerInvariant().Replace('_', ' '), @"\s+", " ");
            var value = line[(colon + 1)..].Trim().Trim('"');
            if (key.Length <= 40 && !fields.ContainsKey(key)) fields[key] = value;
        }
        return fields;
    }

    private static bool Missing(string? value) => string.IsNullOrWhiteSpace(value) || Regex.IsMatch(value.Trim(), @"^(none|n/?a|not (found|present|available|visible|shown|applicable|stated)|unknown|null|-+|—)\.?$", RegexOptions.IgnoreCase);
    private static string Value(Dictionary<string, string> fields, params string[] keys)
    {
        foreach (var key in keys) if (fields.TryGetValue(key, out var value) && !Missing(value)) return value;
        return "";
    }

    private static string Normal(string value) => Regex.Replace(value.ToLowerInvariant(), @"[^\p{L}\p{N}/ ]+", " ");
    private static IEnumerable<string> Words(string value) => Normal(value).Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(w => w.Length >= 3 && !StopWords.Contains(w));
    private static string Digits(string value) => new(value.Where(char.IsDigit).ToArray());

    private static DocType? Detect(DocType[] types, string text)
    {
        var normal = Normal(text);
        return types.FirstOrDefault(type => type.Keywords.Any(k => normal.Contains(Normal(k).Trim(), StringComparison.Ordinal)));
    }

    /// <summary>The engine was asked to say "not a trade document" (or "not an official document") for anything else.</summary>
    private static bool SaysUnrelated(string type) => Regex.IsMatch(type, @"\bnot an? (trade|official|customs|business|identity)|\bunrelated\b|\bphoto(graph)?\b|\bpersonal\b|\brecipe\b|\bresume\b|\bcurriculum\b|\b(cv|letterless|blank)\b|\bnone\b", RegexOptions.IgnoreCase);

    private static decimal? Number(string value)
    {
        var match = Regex.Match(value.Replace(" ", ""), @"\d[\d,]*(\.\d+)?");
        if (!match.Success) return null;
        var text = match.Value;
        // "1.234,50" style: a comma decimal separator after a dot group.
        if (Regex.IsMatch(text, @"^\d{1,3}(\.\d{3})+,\d{1,2}$")) text = text.Replace(".", "").Replace(',', '.');
        else text = text.Replace(",", "");
        return decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var number) ? number : null;
    }

    private static int Score(IEnumerable<ScanFinding> findings) => Math.Clamp(100 - findings.Sum(f => f.Result switch { Fail => 30, Warn => 12, _ => 0 }), 0, 100);

    public static ScanVerdict AnalyzeDeclarationDocument(string text, DeclarationScanContext context)
    {
        var fields = ParseFields(text);
        var findings = new List<ScanFinding>();
        var expected = TradeTypes.First(t => t.Code == context.Kind);
        var declaredType = Value(fields, "document type", "type");
        var title = Value(fields, "title", "document title", "heading");
        var goods = Value(fields, "goods description", "description of goods", "goods", "description");
        var hs = Value(fields, "hs code", "hs", "tariff code", "commodity code");
        var origin = Value(fields, "country of origin", "origin");
        var quantity = Value(fields, "quantity", "qty");
        var amount = Value(fields, "total amount", "grand total", "total", "amount");
        var seller = Value(fields, "seller", "exporter", "shipper");
        var buyer = Value(fields, "buyer", "consignee", "importer");
        var tradeEvidence = new[] { goods, hs, origin, quantity, amount, seller, buyer }.Count(v => v.Length > 0);

        if (Normal(text).Replace(" ", "").Length < 12)
            return new(DocumentScanFlags.Suspicious, 20, "Unreadable", "The scanner could not read any text. The file may be blank, too blurry, or a photo of something else.",
                [new("Readable text", Fail, "No text could be read from the page.")]);

        var detected = Detect(TradeTypes, $"{declaredType} {title}") ?? (tradeEvidence >= 3 ? Detect(TradeTypes, text) : null);
        if (detected is null && (SaysUnrelated(declaredType) || tradeEvidence < 2))
        {
            var what = Regex.Replace(declaredType, @"^not an? \w+ document\s*[-–—:,]?\s*", "", RegexOptions.IgnoreCase).Trim();
            return new(DocumentScanFlags.Unrelated, 5, what.Length > 0 && !Missing(what) ? Capitalize(what) : "Not a trade document",
                $"This does not look like a {expected.Label.ToLowerInvariant()} or any other trade document{(what.Length > 0 && !Missing(what) ? $" — it reads as: {what}" : "")}.",
                [new("Document type", Fail, $"Expected a {expected.Label.ToLowerInvariant()}; the page has no trade-document title or fields."), new("Trade details found", Fail, $"{tradeEvidence} of 7 (goods, HS code, origin, quantity, amount, seller, buyer).")]);
        }

        var typeMatches = detected?.Code == expected.Code;
        if (typeMatches) findings.Add(new("Document type", Pass, $"Reads as a {expected.Label.ToLowerInvariant()}{(title.Length > 0 ? $" (\"{Shorten(title)}\")" : "")}."));
        else if (detected?.Code == "PROFORMA_INVOICE" && expected.Code == "COMMERCIAL_INVOICE") findings.Add(new("Document type", Warn, "This is a proforma invoice or quotation, not the final commercial invoice."));
        else if (detected is not null) findings.Add(new("Document type", Fail, $"Uploaded as a {expected.Label.ToLowerInvariant()}, but it reads as a {detected.Label.ToLowerInvariant()}."));
        else findings.Add(new("Document type", Warn, $"No clear title; it has trade details but could not be confirmed as a {expected.Label.ToLowerInvariant()}."));

        // Goods: a brand, model or product word from the declaration should appear in the goods description.
        var declaredWords = Words($"{context.Brand} {context.Model} {context.ProductName}").Distinct().ToArray();
        if (goods.Length == 0) findings.Add(new("Goods", Warn, "No goods description could be read."));
        else
        {
            var goodsTokens = Normal(goods).Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var found = declaredWords.Where(w => Normal(goods).Contains(w, StringComparison.Ordinal)).ToArray();
            // Model numbers ("15", "A2846") carry the value; a different number on the document is a classic under-declaration sign.
            var modelNumbers = Normal(context.Model).Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(t => t.Any(char.IsDigit)).ToArray();
            var missingNumbers = modelNumbers.Where(n => !goodsTokens.Contains(n)).ToArray();
            var otherNumbers = goodsTokens.Select((t, i) => (t, next: i + 1 < goodsTokens.Length ? goodsTokens[i + 1] : ""))
                .Where(x => x.t.Any(char.IsDigit) && !Regex.IsMatch(x.t, @"^\d+(gb|tb|mb|kg|g|mm|cm|m|w|kw|v|mah|hz|ghz|in|l|ml|pcs)$") && !Units.Contains(x.next) && !modelNumbers.Contains(x.t))
                .Select(x => x.t).ToArray();
            if (found.Length == 0)
                findings.Add(new("Goods", Fail, $"The document describes \"{Shorten(goods)}\", which does not match the declared {Shorten($"{context.Brand} {context.Model} {context.ProductName}".Trim())}."));
            else if (missingNumbers.Length > 0 && otherNumbers.Length > 0)
                findings.Add(new("Goods", Fail, $"The document describes \"{Shorten(goods)}\", but the declared model is {context.Model}."));
            else findings.Add(new("Goods", missingNumbers.Length > 0 ? Warn : Pass, missingNumbers.Length > 0
                ? $"\"{Shorten(goods)}\" matches the declared {string.Join(", ", found.Take(3))}, but the model {context.Model} is not shown."
                : $"\"{Shorten(goods)}\" matches the declared {string.Join(", ", found.Take(3))}."));
        }

        // HS code: the same heading (4 digits) is expected; the same chapter is close enough to only warn.
        var declaredHs = Digits(context.HsCode);
        var documentHs = Digits(hs);
        if (documentHs.Length >= 4 && declaredHs.Length >= 4)
        {
            var result = documentHs[..4] == declaredHs[..4] ? Pass : documentHs[..2] == declaredHs[..2] ? Warn : Fail;
            findings.Add(new("HS code", result, result switch
            {
                Pass => $"{hs} is in the declared heading {declaredHs[..4]}.",
                Warn => $"{hs} is in the same chapter but a different heading from the declared {context.HsCode}.",
                _ => $"{hs} is in a different chapter from the declared {context.HsCode}.",
            }));
        }
        else if (expected.Code != "COMMERCIAL_INVOICE" || documentHs.Length > 0) findings.Add(new("HS code", Info, "No HS code is printed on the document."));

        if (origin.Length > 0 && context.OriginName.Length > 0)
        {
            var same = Normal(origin).Contains(Normal(context.OriginName).Trim(), StringComparison.Ordinal) || Normal(context.OriginName).Contains(Normal(origin).Trim(), StringComparison.Ordinal)
                || Regex.IsMatch(origin, $@"\b{Regex.Escape(context.OriginCode)}\b", RegexOptions.IgnoreCase) || SameCountry(origin, context.OriginName);
            findings.Add(same ? new("Country of origin", Pass, $"{origin}, as declared.")
                : new("Country of origin", expected.Code == "CERTIFICATE_OF_ORIGIN" ? Fail : Warn, $"The document says {origin}; the declaration says {context.OriginName}."));
        }
        else if (expected.Code == "CERTIFICATE_OF_ORIGIN") findings.Add(new("Country of origin", Warn, "No country of origin could be read from the certificate."));

        if (buyer.Length > 0 && context.ImporterNames.Count > 0)
        {
            var buyerWords = Words(buyer).ToHashSet();
            var matched = context.ImporterNames.Any(name => Words(name).Any(buyerWords.Contains));
            findings.Add(matched ? new("Importer", Pass, $"Consigned to {Shorten(buyer)}.")
                : new("Importer", Warn, $"Consigned to {Shorten(buyer)}, not the declaring importer ({context.ImporterNames[0]}). It may be an agent — confirm."));
        }

        if (expected.Code == "COMMERCIAL_INVOICE" && context.InvoiceAmount is > 0)
        {
            var value = Number(amount);
            if (value is null) findings.Add(new("Invoice amount", Warn, "No total amount could be read."));
            else
            {
                var difference = Math.Abs(value.Value - context.InvoiceAmount.Value) / context.InvoiceAmount.Value;
                var currencyShown = Regex.Match(amount, @"\b[A-Z]{3}\b").Value;
                var symbolCurrency = amount.Contains('$') ? "USD" : amount.Contains('€') ? "EUR" : amount.Contains('£') ? "GBP" : "";
                var documentCurrency = currencyShown.Length > 0 ? currencyShown : symbolCurrency;
                var currencyNote = documentCurrency.Length > 0 && context.Currency.Length > 0 && documentCurrency != context.Currency && !(symbolCurrency == "USD" && currencyShown.Length == 0) ? $" Currency on the invoice is {documentCurrency}, declared {context.Currency}." : "";
                var result = difference <= 0.02m && currencyNote.Length == 0 ? Pass : difference <= 0.15m ? Warn : Fail;
                findings.Add(new("Invoice amount", result, result == Pass
                    ? $"{amount} matches the declared {context.InvoiceAmount.Value.ToString("N2", CultureInfo.InvariantCulture)} {context.Currency}."
                    : $"The invoice shows {amount}; the declaration says {context.InvoiceAmount.Value.ToString("N2", CultureInfo.InvariantCulture)} {context.Currency} ({difference:P0} apart).{currencyNote}"));
            }
        }

        if (quantity.Length > 0 && context.Quantity > 0 && Number(quantity) is { } count && expected.Code != "CERTIFICATE_OF_ORIGIN")
            findings.Add(count == context.Quantity ? new("Quantity", Pass, $"{quantity}, as declared.")
                : new("Quantity", Warn, $"The document shows {quantity}; the declaration says {context.Quantity.ToString("0.##", CultureInfo.InvariantCulture)} {context.Unit}."));

        AddReuse(findings, context.DuplicateWithinCase, context.UsedByAnotherImporter, "declaration");
        return Verdict(findings, detected?.Label ?? "Trade document (untitled)", typeMatches, expected.Label);
    }

    public static ScanVerdict AnalyzeVerificationDocument(string text, VerificationScanContext context)
    {
        var fields = ParseFields(text);
        var findings = new List<ScanFinding>();
        var expected = IdentityTypes.First(t => t.Code == context.Kind);
        var declaredType = Value(fields, "document type", "type");
        var title = Value(fields, "title", "document title", "heading");
        var holder = Value(fields, "holder name", "name", "company name", "holder");
        var tin = Value(fields, "tin", "tax identification number");
        var number = Value(fields, "registration number", "licence number", "license number", "document number", "id number", "number");
        var expiry = Value(fields, "expiry date", "valid until", "expiry");

        if (Normal(text).Replace(" ", "").Length < 12)
            return new(DocumentScanFlags.Suspicious, 20, "Unreadable", "The scanner could not read any text. The file may be blank, too blurry, or a photo of something else.",
                [new("Readable text", Fail, "No text could be read from the page.")]);

        var detected = Detect(IdentityTypes, $"{declaredType} {title}");
        var evidence = new[] { holder, tin, number }.Count(v => v.Length > 0);
        if (detected is null && (SaysUnrelated(declaredType) || evidence == 0))
        {
            var what = Regex.Replace(declaredType, @"^not an? \w+ document\s*[-–—:,]?\s*", "", RegexOptions.IgnoreCase).Trim();
            return new(DocumentScanFlags.Unrelated, 5, what.Length > 0 && !Missing(what) ? Capitalize(what) : "Not an official document",
                $"This does not look like a {expected.Label.ToLowerInvariant()} or any other registration or identity document.",
                [new("Document type", Fail, $"Expected a {expected.Label.ToLowerInvariant()}; no official title, name or registration number was found.")]);
        }

        var typeMatches = detected?.Code == expected.Code;
        findings.Add(typeMatches ? new("Document type", Pass, $"Reads as a {expected.Label.ToLowerInvariant()}.")
            : detected is not null ? new("Document type", Fail, $"Uploaded as a {expected.Label.ToLowerInvariant()}, but it reads as a {detected.Label.ToLowerInvariant()}.")
            : new("Document type", Warn, $"Could not confirm this is a {expected.Label.ToLowerInvariant()}."));

        if (holder.Length > 0 && context.Names.Count > 0)
        {
            var holderWords = Words(holder).ToHashSet();
            var matched = context.Names.Where(n => n.Length > 0).Any(name => { var words = Words(name).ToArray(); return words.Length > 0 && words.Count(holderWords.Contains) >= Math.Min(2, words.Length); });
            findings.Add(matched ? new("Name", Pass, $"Issued to {Shorten(holder)}.") : new("Name", Fail, $"Issued to {Shorten(holder)}, which does not match the registered {context.Names.First(n => n.Length > 0)}."));
        }
        else findings.Add(new("Name", Warn, "No holder name could be read."));

        if (Digits(context.Tin).Length > 0 && Digits(tin).Length > 0)
            findings.Add(Digits(tin) == Digits(context.Tin) ? new("TIN", Pass, $"TIN {tin}, as registered.") : new("TIN", Fail, $"The document shows TIN {tin}; the importer registered {context.Tin}."));
        else if (context.Kind == "TIN_CERTIFICATE") findings.Add(new("TIN", Warn, "No TIN could be read from the certificate."));

        var numbers = context.Numbers.Select(Digits).Where(n => n.Length >= 4).ToArray();
        if (numbers.Length > 0 && Digits(number).Length >= 4)
            findings.Add(numbers.Contains(Digits(number)) ? new("Registration number", Pass, $"{number} matches the registration.") : new("Registration number", Warn, $"{number} does not match the number the importer entered."));

        if (expiry.Length > 0 && DateTime.TryParse(expiry, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var until))
            findings.Add(until.Date < DateTime.UtcNow.Date ? new("Validity", Fail, $"Expired on {until:d MMM yyyy}.") : new("Validity", Pass, $"Valid until {until:d MMM yyyy}."));

        AddReuse(findings, context.DuplicateWithinCase, context.UsedByAnotherImporter, "registration");
        return Verdict(findings, detected?.Label ?? "Official document (untitled)", typeMatches, expected.Label);
    }

    private static void AddReuse(List<ScanFinding> findings, bool withinCase, bool otherImporter, string scope)
    {
        if (withinCase) findings.Add(new("Same file reused", Fail, $"The identical file was uploaded for another document type in this {scope}."));
        if (otherImporter) findings.Add(new("Same file reused", Fail, "The identical file was already submitted by a different importer."));
    }

    private static ScanVerdict Verdict(List<ScanFinding> findings, string detected, bool typeMatches, string expectedLabel)
    {
        var score = Score(findings);
        if (!typeMatches) score = Math.Min(score, 55);
        var failures = findings.Where(f => f.Result == Fail).ToArray();
        var warnings = findings.Where(f => f.Result == Warn).ToArray();
        var flag = failures.Length > 0 || score < 60 ? DocumentScanFlags.Suspicious : DocumentScanFlags.Healthy;
        var summary = flag == DocumentScanFlags.Healthy
            ? warnings.Length == 0 ? $"Looks like a genuine {expectedLabel.ToLowerInvariant()} that agrees with the submission." : $"Looks like the expected {expectedLabel.ToLowerInvariant()}; {warnings.Length} minor point{(warnings.Length == 1 ? "" : "s")} to glance at."
            : $"Check by hand: {string.Join("; ", failures.Concat(warnings).Take(2).Select(f => f.Detail.TrimEnd('.')))}.";
        return new(flag, score, detected, summary, findings);
    }

    private static bool SameCountry(string a, string b)
    {
        static string Key(string value) => Normal(value).Trim() switch
        {
            "usa" or "us" or "u s a" or "united states of america" or "america" => "united states",
            "prc" or "people s republic of china" or "peoples republic of china" => "china",
            "uk" or "great britain" or "england" => "united kingdom",
            "uae" => "united arab emirates",
            var other => other,
        };
        return Key(a) == Key(b);
    }

    private static string Shorten(string value) => value.Length <= 70 ? value : value[..67] + "…";
    private static string Capitalize(string value) => value.Length == 0 ? value : char.ToUpperInvariant(value[0]) + value[1..];
}
