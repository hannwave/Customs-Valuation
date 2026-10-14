using System.Text.RegularExpressions;

namespace SES.Customs.Core.Models;

/// <summary>
/// Know-your-importer record captured at registration. Declarations stay blocked
/// until a Customs Officer in the importer's region verifies it.
/// </summary>
public sealed class ImporterProfile
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public string ImporterType { get; set; } = "";
    public string VerificationStatus { get; set; } = ImporterVerification.Pending;
    public string LegalName { get; set; } = "";
    public string TradeName { get; set; } = "";
    public string Tin { get; set; } = "";
    public string TradeLicenseNumber { get; set; } = "";
    public DateOnly? TradeLicenseExpiry { get; set; }
    public string BusinessRegistrationNumber { get; set; } = "";
    public string VatNumber { get; set; } = "";
    public string AgentLicenseNumber { get; set; } = "";
    public DateOnly? AgentLicenseExpiry { get; set; }
    public string IdType { get; set; } = "";
    public string IdNumber { get; set; } = "";
    public string Nationality { get; set; } = "";
    public string ResidencyStatus { get; set; } = "";
    public string RepresentativeRole { get; set; } = "";
    public string Phone { get; set; } = "";
    public Guid RegionLocationId { get; set; }
    public string RegionKey { get; set; } = "";
    public string City { get; set; } = "";
    public string Woreda { get; set; } = "";
    public string AddressLine { get; set; } = "";
    public string ReviewNote { get; set; } = "";
    public Guid? ReviewedById { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public List<ImporterProfileDocument> Documents { get; set; } = [];
}

public sealed class ImporterProfileDocument
{
    public Guid Id { get; set; }
    public Guid ProfileId { get; set; }
    public string Kind { get; set; } = "";
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public long Size { get; set; }
    public string Sha256 { get; set; } = "";
    public byte[] Content { get; set; } = [];
    public DateTimeOffset UploadedAt { get; set; }
}

public static class ImporterVerification
{
    public const string Pending = "PENDING";
    public const string InformationRequested = "INFORMATION_REQUESTED";
    public const string Verified = "VERIFIED";
    public const string Rejected = "REJECTED";
    public const string Suspended = "SUSPENDED";
    public static readonly string[] Statuses = [Pending, InformationRequested, Verified, Suspended, Rejected];

    public const string Business = "BUSINESS";
    public const string Individual = "INDIVIDUAL";
    public const string CustomsAgent = "CUSTOMS_AGENT";
    public static readonly string[] Types = [Business, Individual, CustomsAgent];

    public static readonly string[] IdTypes = ["FAYDA", "PASSPORT", "RESIDENCE_PERMIT", "KEBELE_ID"];
    public static readonly string[] ResidencyStatuses = ["RESIDENT_CITIZEN", "RETURNING_RESIDENT", "DIASPORA", "FOREIGN_RESIDENT", "NON_RESIDENT"];
    public static readonly string[] DocumentKinds = ["TRADE_LICENSE", "TIN_CERTIFICATE", "COMMERCIAL_REGISTRATION", "VAT_CERTIFICATE", "AGENT_LICENSE", "IDENTITY_DOCUMENT", "PROOF_OF_RESIDENCE", "AUTHORIZATION_LETTER"];

    /// <summary>Evidence an officer needs before an importer type can be verified.</summary>
    public static string[] RequiredDocuments(string importerType) => importerType switch
    {
        Business => ["TRADE_LICENSE", "TIN_CERTIFICATE", "COMMERCIAL_REGISTRATION", "IDENTITY_DOCUMENT"],
        CustomsAgent => ["AGENT_LICENSE", "TIN_CERTIFICATE", "IDENTITY_DOCUMENT"],
        Individual => ["IDENTITY_DOCUMENT"],
        _ => []
    };

    public static string[] AllowedDocuments(string importerType) => importerType switch
    {
        Business => [.. RequiredDocuments(Business), "VAT_CERTIFICATE", "AUTHORIZATION_LETTER"],
        CustomsAgent => [.. RequiredDocuments(CustomsAgent), "AUTHORIZATION_LETTER"],
        Individual => [.. RequiredDocuments(Individual), "TIN_CERTIFICATE", "PROOF_OF_RESIDENCE"],
        _ => []
    };

    /// <summary>Officer decisions available from each status. Actions marked with a note need a written reason.</summary>
    public static string[] AllowedActions(string status) => status switch
    {
        Pending => ["VERIFY", "REQUEST_INFORMATION", "REJECT"],
        InformationRequested => ["REJECT"],
        Verified => ["SUSPEND"],
        Suspended => ["REINSTATE", "REJECT"],
        _ => []
    };

    public static bool ActionNeedsReason(string action) => action is "REQUEST_INFORMATION" or "REJECT" or "SUSPEND";

    public static string? NextStatus(string status, string action) => !AllowedActions(status).Contains(action) ? null : action switch
    {
        "VERIFY" or "REINSTATE" => Verified,
        "REQUEST_INFORMATION" => InformationRequested,
        "REJECT" => Rejected,
        "SUSPEND" => Suspended,
        _ => null
    };

    /// <summary>Ethiopian TINs are ten digits.</summary>
    public static bool IsValidTin(string value) => Regex.IsMatch(value, "^[0-9]{10}$");

    /// <summary>Fayda issues a 12-digit FIN and a 16-digit FAN; other documents are alphanumeric.</summary>
    public static bool IsValidIdNumber(string idType, string value) => idType switch
    {
        "FAYDA" => Regex.IsMatch(value, "^([0-9]{12}|[0-9]{16})$"),
        "PASSPORT" => Regex.IsMatch(value, "^[A-Z0-9]{6,9}$"),
        "RESIDENCE_PERMIT" or "KEBELE_ID" => Regex.IsMatch(value, "^[A-Z0-9/-]{4,20}$"),
        _ => false
    };

    /// <summary>
    /// Ethiopian mobiles (09/07 locally or +251 9/7) become +251XXXXXXXXX; other numbers need a
    /// + country code and 8 to 15 digits. Returns null when the number fits neither format.
    /// </summary>
    public static string? NormalizePhone(string? value)
    {
        var raw = Regex.Replace(value ?? "", "[\\s()-]", "");
        var digits = Regex.Replace(raw, "\\D", "");
        if (raw.StartsWith("+251", StringComparison.Ordinal) || (!raw.StartsWith('+') && digits.StartsWith("251", StringComparison.Ordinal)))
            return Regex.IsMatch(raw.TrimStart('+'), "^251[79][0-9]{8}$") ? $"+{digits}" : null;
        if (raw.StartsWith('0')) return Regex.IsMatch(raw, "^0[79][0-9]{8}$") ? $"+251{digits[1..]}" : null;
        if (raw.StartsWith('+')) return Regex.IsMatch(raw, "^\\+[0-9]{8,15}$") ? raw : null;
        return null;
    }

    /// <summary>Removes spacing users commonly type into identifiers.</summary>
    public static string NormalizeIdentifier(string? value) => Regex.Replace(value ?? "", "[\\s.]", "").ToUpperInvariant();
}
