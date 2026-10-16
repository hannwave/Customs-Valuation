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
    bool DuplicateWithinCase = false, bool UsedByAnotherImporter = false,
    VerificationProfileFacts? Profile = null, IReadOnlyList<VerificationSibling>? Siblings = null, DateOnly? Today = null);

/// <summary>The registration details each verification document is checked against.</summary>
public sealed record VerificationProfileFacts(
    string TradeLicenseNumber = "", string BusinessRegistrationNumber = "", string VatNumber = "", string AgentLicenseNumber = "",
    string IdType = "", string IdNumber = "", string Nationality = "", string City = "", string Woreda = "", string AddressLine = "",
    DateOnly? RegisteredExpiry = null);

/// <summary>What another of the same importer's documents was read as, for cross-document checks.</summary>
public sealed record VerificationSibling(string Kind, string Holder, string Tin);

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

    /// <summary>The holder name and TIN read from a stored scan, for comparing the importer's documents with each other.</summary>
    public static VerificationSibling Sibling(string kind, string text)
    {
        var fields = ParseFields(text);
        return new(kind, Value(fields, "holder name", "name", "company name", "holder"), Value(fields, "tin", "tax identification number"));
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
        var profile = context.Profile ?? new VerificationProfileFacts();
        var today = context.Today ?? DateOnly.FromDateTime(DateTime.UtcNow);
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

        AddAuthenticity(findings, fields, context.Kind);

        if (holder.Length > 0 && context.Names.Count > 0)
        {
            var matched = context.Names.Any(name => SameName(holder, name));
            findings.Add(matched ? new("Name", Pass, $"Issued to {Shorten(holder)}.") : new("Name", Fail, $"Issued to {Shorten(holder)}, which does not match the registered {context.Names.First(n => n.Length > 0)}."));
        }
        else findings.Add(new("Name", Warn, "No holder name could be read."));

        if (Digits(tin).Length > 0)
        {
            if (Digits(context.Tin).Length > 0)
                findings.Add(Digits(tin) == Digits(context.Tin) ? new("TIN", Pass, $"TIN {tin}, as registered.") : new("TIN", Fail, $"The document shows TIN {tin}; the importer registered {context.Tin}."));
            if (!ImporterVerification.IsValidTin(Digits(tin)))
                findings.Add(new("TIN format", Warn, $"TIN {tin} is not the 10-digit format Ethiopian TINs use."));
        }
        else if (context.Kind == "TIN_CERTIFICATE") findings.Add(new("TIN", Warn, "No TIN could be read from the certificate."));

        AddNumberCheck(findings, context, profile, number, expected.Label);
        AddDateChecks(findings, fields, context.Kind, profile, expiry, declaredType, today);
        AddIssuerCheck(findings, Value(fields, "issuing authority", "issued by", "issuer", "authority"), context.Kind, expected.Label);
        if (context.Kind == "IDENTITY_DOCUMENT") AddIdentityChecks(findings, fields, profile, number, $"{declaredType} {title}", today);
        if (context.Kind is "PROOF_OF_RESIDENCE" or "TRADE_LICENSE" or "COMMERCIAL_REGISTRATION") AddAddressCheck(findings, Value(fields, "address", "business address", "holder address"), profile);
        AddConsistency(findings, context, holder, tin);

        AddReuse(findings, context.DuplicateWithinCase, context.UsedByAnotherImporter, "registration");
        return Verdict(findings, detected?.Label ?? "Official document (untitled)", typeMatches, expected.Label);
    }

    // Documents a government office issues are expected to carry its stamp or seal; passports and ID cards use printed security features instead.
    private static readonly HashSet<string> StampedKinds = ["TRADE_LICENSE", "TIN_CERTIFICATE", "COMMERCIAL_REGISTRATION", "VAT_CERTIFICATE", "AGENT_LICENSE", "AUTHORIZATION_LETTER"];

    /// <summary>Signs that the file is not a faithful copy of a real original: edits, sample copies, screenshots, a missing stamp or signature.</summary>
    private static void AddAuthenticity(List<ScanFinding> findings, Dictionary<string, string> fields, string kind)
    {
        var altered = Value(fields, "signs of alteration", "alteration", "tampering");
        if (altered.Length > 0 && !IsNo(altered)) findings.Add(new("Tampering", Fail, $"Possible editing: {Shorten(altered.TrimEnd('.'))}."));
        else if (fields.ContainsKey("signs of alteration")) findings.Add(new("Tampering", Pass, "No visible signs of editing."));

        if (IsYes(Value(fields, "sample or specimen", "specimen")))
            findings.Add(new("Sample copy", Fail, "Marked as a sample, specimen, void, copy or draft, or is a blank template."));
        if (IsYes(Value(fields, "screen capture", "screenshot")))
            findings.Add(new("Original copy", Warn, "A screenshot or photo of a screen, not a scan or photo of the original."));

        var stamp = Value(fields, "official stamp or seal", "stamp", "seal");
        if (StampedKinds.Contains(kind) && stamp.Length > 0)
            findings.Add(IsNo(stamp) ? new("Stamp or seal", Warn, "No official stamp or seal is visible.") : new("Stamp or seal", Pass, "An official stamp or seal is visible."));

        var signature = Value(fields, "signature", "signed");
        if (kind == "AUTHORIZATION_LETTER" && signature.Length > 0)
            findings.Add(IsNo(signature) ? new("Signature", Fail, "The authorisation letter is not signed.") : new("Signature", Pass, "The letter is signed."));
    }

    private static readonly Dictionary<string, Func<VerificationProfileFacts, string>> RegisteredNumber = new()
    {
        ["TRADE_LICENSE"] = p => p.TradeLicenseNumber, ["COMMERCIAL_REGISTRATION"] = p => p.BusinessRegistrationNumber, ["VAT_CERTIFICATE"] = p => p.VatNumber,
        ["AGENT_LICENSE"] = p => p.AgentLicenseNumber, ["IDENTITY_DOCUMENT"] = p => p.IdNumber,
    };

    /// <summary>Compares the number on the page with the number the importer entered for this document type, falling back to any number they entered.</summary>
    private static void AddNumberCheck(List<ScanFinding> findings, VerificationScanContext context, VerificationProfileFacts profile, string number, string label)
    {
        if (Alnum(number).Length < 4) return;
        var registered = RegisteredNumber.TryGetValue(context.Kind, out var pick) ? pick(profile) : "";
        if (Alnum(registered).Length >= 4)
        {
            var same = Alnum(number) == Alnum(registered) || (Digits(number).Length >= 4 && Digits(number) == Digits(registered));
            findings.Add(same ? new("Registration number", Pass, $"{number} matches the {label.ToLowerInvariant()} number the importer entered.")
                : new("Registration number", context.Kind == "IDENTITY_DOCUMENT" ? Fail : Warn, $"The document shows {number}; the importer entered {registered}."));
            return;
        }
        var numbers = context.Numbers.Select(Digits).Where(n => n.Length >= 4).ToArray();
        if (numbers.Length > 0 && Digits(number).Length >= 4)
            findings.Add(numbers.Contains(Digits(number)) ? new("Registration number", Pass, $"{number} matches the registration.") : new("Registration number", Warn, $"{number} does not match the number the importer entered."));
    }

    private static void AddDateChecks(List<ScanFinding> findings, Dictionary<string, string> fields, string kind, VerificationProfileFacts profile, string expiryText, string declaredType, DateOnly today)
    {
        var expiry = ParseDate(expiryText);
        var issued = ParseDate(Value(fields, "issue date", "date of issue", "issued on", "issued"));
        if (expiry is { } until)
        {
            var days = until.DayNumber - today.DayNumber;
            findings.Add(days < 0 ? new("Validity", Fail, $"Expired on {until:d MMM yyyy}.")
                : days <= 30 ? new("Validity", Warn, $"Expires on {until:d MMM yyyy}, in {days} day{(days == 1 ? "" : "s")}.")
                : new("Validity", Pass, $"Valid until {until:d MMM yyyy}."));
            if (profile.RegisteredExpiry is { } entered && Math.Abs(entered.DayNumber - until.DayNumber) > 1)
                findings.Add(new("Expiry date entered", Warn, $"The document expires {until:d MMM yyyy}; the importer entered {entered:d MMM yyyy}."));
        }
        if (issued is { } on)
        {
            if (on.DayNumber > today.DayNumber + 1) findings.Add(new("Issue date", Fail, $"Issued on {on:d MMM yyyy}, which is in the future."));
            else if (expiry is { } end && on > end) findings.Add(new("Issue date", Fail, $"Issued on {on:d MMM yyyy}, after its own expiry date."));
            else if (kind == "PROOF_OF_RESIDENCE" && Regex.IsMatch(declaredType, @"bill|utility|electric|water|telephone", RegexOptions.IgnoreCase) && today.DayNumber - on.DayNumber > 92)
                findings.Add(new("Issue date", Warn, $"Issued on {on:d MMM yyyy}; a utility bill used as proof of address is normally from the last 3 months."));
            else findings.Add(new("Issue date", Info, $"Issued on {on:d MMM yyyy}."));
        }
    }

    // Keywords of the offices that issue each document in Ethiopia; identity documents and foreign papers vary too much to check.
    private static readonly Dictionary<string, (string Expected, string[] Keywords)> Issuers = new()
    {
        ["TRADE_LICENSE"] = ("the Ministry of Trade or a regional trade bureau", ["trade", "commerce", "industry", "investment"]),
        ["COMMERCIAL_REGISTRATION"] = ("the Ministry of Trade or a regional trade bureau", ["trade", "commerce", "industry", "investment", "registrar"]),
        ["TIN_CERTIFICATE"] = ("the Ministry of Revenues or a revenue bureau", ["revenue", "erca", "tax"]),
        ["VAT_CERTIFICATE"] = ("the Ministry of Revenues or a revenue bureau", ["revenue", "erca", "tax"]),
        ["AGENT_LICENSE"] = ("the Ethiopian Customs Commission", ["customs", "erca", "revenue"]),
    };

    private static void AddIssuerCheck(List<ScanFinding> findings, string issuer, string kind, string label)
    {
        if (!Issuers.TryGetValue(kind, out var rule)) { if (issuer.Length > 0) findings.Add(new("Issuing authority", Info, $"Issued by {Shorten(issuer)}.")); return; }
        if (issuer.Length == 0) { findings.Add(new("Issuing authority", Info, $"No issuing office could be read; a {label.ToLowerInvariant()} is normally issued by {rule.Expected}.")); return; }
        var normal = Normal(issuer);
        findings.Add(rule.Keywords.Any(k => normal.Contains(k, StringComparison.Ordinal)) ? new("Issuing authority", Pass, $"Issued by {Shorten(issuer)}.")
            : new("Issuing authority", Warn, $"Issued by {Shorten(issuer)}; a {label.ToLowerInvariant()} is normally issued by {rule.Expected}."));
    }

    private static readonly (string Code, string Label, string Pattern)[] IdKinds =
    [
        ("PASSPORT", "passport", @"passport"),
        ("RESIDENCE_PERMIT", "residence permit", @"residence permit|resident permit|residence card|work permit"),
        ("KEBELE_ID", "kebele ID", @"kebele"),
        ("FAYDA", "Fayda national ID", @"fayda|national id|national identity|digital id"),
    ];

    private static void AddIdentityChecks(List<ScanFinding> findings, Dictionary<string, string> fields, VerificationProfileFacts profile, string number, string typeText, DateOnly today)
    {
        var read = IdKinds.FirstOrDefault(k => Regex.IsMatch(typeText, k.Pattern, RegexOptions.IgnoreCase));
        var registered = IdKinds.FirstOrDefault(k => k.Code == profile.IdType);
        if (read.Code is not null && registered.Code is not null)
            findings.Add(read.Code == registered.Code ? new("ID type", Pass, $"A {read.Label}, as registered.") : new("ID type", Warn, $"Reads as a {read.Label}; the importer registered a {registered.Label}."));

        var idType = read.Code ?? profile.IdType;
        var normalized = ImporterVerification.NormalizeIdentifier(number);
        if (idType.Length > 0 && normalized.Length >= 4 && !ImporterVerification.IsValidIdNumber(idType, normalized))
            findings.Add(new("ID number format", Warn, $"{number} is not in the usual {IdKinds.First(k => k.Code == idType).Label} number format."));

        var nationality = Value(fields, "nationality", "citizenship");
        if (nationality.Length > 0 && profile.Nationality.Length > 0)
            findings.Add(SameCountry(nationality, profile.Nationality) || Normal(nationality).Contains(Normal(profile.Nationality).Trim(), StringComparison.Ordinal) || Normal(profile.Nationality).Contains(Normal(nationality).Trim(), StringComparison.Ordinal)
                ? new("Nationality", Pass, $"{nationality}, as registered.") : new("Nationality", Warn, $"The document shows {nationality}; the importer registered {profile.Nationality}."));

        if (ParseDate(Value(fields, "date of birth", "birth date", "dob")) is { } born)
        {
            var age = today.Year - born.Year - (today < born.AddYears(today.Year - born.Year) ? 1 : 0);
            if (born > today || age > 110) findings.Add(new("Date of birth", Warn, $"The date of birth {born:d MMM yyyy} is not plausible."));
            else if (age < 18) findings.Add(new("Date of birth", Warn, $"The holder is {age}, under 18 (born {born:d MMM yyyy})."));
        }
    }

    private static void AddAddressCheck(List<ScanFinding> findings, string address, VerificationProfileFacts profile)
    {
        var registered = new[] { profile.City, profile.Woreda, profile.AddressLine }.Where(v => !string.IsNullOrWhiteSpace(v)).ToArray();
        if (address.Length == 0 || registered.Length == 0) return;
        var words = Words(address).ToHashSet();
        var compact = Normal(address).Replace(" ", "");
        var matched = registered.Any(part => { var partWords = Words(part).ToArray(); return (partWords.Length > 0 && partWords.All(words.Contains)) || (Normal(part).Replace(" ", "").Length >= 4 && compact.Contains(Normal(part).Replace(" ", ""), StringComparison.Ordinal)); });
        findings.Add(matched ? new("Address", Pass, $"{Shorten(address)}, matching the registered address.")
            : new("Address", Warn, $"The document shows {Shorten(address)}; the importer registered {string.Join(", ", registered.Where(v => v != profile.AddressLine).DefaultIfEmpty(registered[0]))}."));
    }

    // Identity documents and proof of address name a person; the others name the business, so only like is compared with like.
    private static readonly HashSet<string> PersonKinds = ["IDENTITY_DOCUMENT", "PROOF_OF_RESIDENCE", "AUTHORIZATION_LETTER"];

    /// <summary>The same importer's documents should agree with each other on the TIN and on the business name.</summary>
    private static void AddConsistency(List<ScanFinding> findings, VerificationScanContext context, string holder, string tin)
    {
        var siblings = context.Siblings ?? [];
        if (siblings.Count == 0) return;
        var problems = new List<ScanFinding>();
        var compared = 0;
        foreach (var other in siblings)
        {
            var label = IdentityTypes.FirstOrDefault(t => t.Code == other.Kind)?.Label.ToLowerInvariant() ?? other.Kind;
            if (Digits(tin).Length >= 8 && Digits(other.Tin).Length >= 8)
            {
                compared++;
                if (Digits(tin) != Digits(other.Tin)) problems.Add(new("Other documents", Fail, $"TIN {tin} differs from the {label} ({other.Tin})."));
            }
            if (holder.Length > 0 && other.Holder.Length > 0 && PersonKinds.Contains(context.Kind) == PersonKinds.Contains(other.Kind))
            {
                compared++;
                if (!SameName(holder, other.Holder)) problems.Add(new("Other documents", Warn, $"Issued to {Shorten(holder)}, but the {label} names {Shorten(other.Holder)}."));
            }
        }
        if (problems.Count > 0) findings.AddRange(problems);
        else if (compared > 0) findings.Add(new("Other documents", Pass, "Agrees with the importer's other documents on name and TIN."));
    }

    private static bool SameName(string a, string b)
    {
        var aWords = Words(a).ToHashSet();
        var bWords = Words(b).ToArray();
        return bWords.Length > 0 && aWords.Count > 0 && bWords.Count(aWords.Contains) >= Math.Min(2, Math.Min(bWords.Length, aWords.Count));
    }

    private static bool IsYes(string value) => Regex.IsMatch(value.Trim(), @"^(yes|y|true)\b", RegexOptions.IgnoreCase);
    private static bool IsNo(string value) => Missing(value) || Regex.IsMatch(value.Trim(), @"^(no|n|false|none( visible| found)?)\b", RegexOptions.IgnoreCase);
    private static string Alnum(string value) => new(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());

    private static readonly string[] DateFormats = ["yyyy-MM-dd", "yyyy/MM/dd", "dd/MM/yyyy", "d/M/yyyy", "dd-MM-yyyy", "dd.MM.yyyy", "d MMM yyyy", "d MMMM yyyy", "MMM d, yyyy", "MMMM d, yyyy", "dd MMM yyyy"];
    private static DateOnly? ParseDate(string value)
    {
        if (value.Length == 0) return null;
        if (DateTime.TryParseExact(value.Trim(), DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var exact)) return DateOnly.FromDateTime(exact);
        return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var parsed) ? DateOnly.FromDateTime(parsed) : null;
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
