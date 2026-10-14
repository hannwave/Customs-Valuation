using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Security;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Services;

public class ImporterProfileForm
{
    public Guid? ExpectedVersion { get; set; }
    public string ImporterType { get; set; } = "";
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
    public string City { get; set; } = "";
    public string Woreda { get; set; } = "";
    public string AddressLine { get; set; } = "";
    public bool DeclarationAccepted { get; set; }
    public IFormFile? TradeLicense { get; set; }
    public IFormFile? TinCertificate { get; set; }
    public IFormFile? CommercialRegistration { get; set; }
    public IFormFile? VatCertificate { get; set; }
    public IFormFile? AgentLicense { get; set; }
    public IFormFile? IdentityDocument { get; set; }
    public IFormFile? ProofOfResidence { get; set; }
    public IFormFile? AuthorizationLetter { get; set; }

    public IEnumerable<(string Kind, IFormFile? File)> Uploads() =>
    [
        ("TRADE_LICENSE", TradeLicense), ("TIN_CERTIFICATE", TinCertificate), ("COMMERCIAL_REGISTRATION", CommercialRegistration),
        ("VAT_CERTIFICATE", VatCertificate), ("AGENT_LICENSE", AgentLicense), ("IDENTITY_DOCUMENT", IdentityDocument),
        ("PROOF_OF_RESIDENCE", ProofOfResidence), ("AUTHORIZATION_LETTER", AuthorizationLetter)
    ];
}

public sealed class ImporterProfileService(CustomsDbContext db, WorkspaceAccess access)
{
    public const long MaxCombinedUpload = 40_000_000;

    public Task<List<CustomsLocation>> RegionsAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        return db.CustomsLocations.AsNoTracking()
            .Where(l => l.LocationType == "REGION" && l.Status == "ACTIVE" && l.EffectiveFrom <= now && (l.EffectiveTo == null || l.EffectiveTo > now))
            .OrderBy(l => l.Name).ToListAsync(ct);
    }

    /// <summary>Validates the form and copies it onto the profile, returning it in PENDING state.</summary>
    public async Task<ImporterProfile> ApplyAsync(ImporterProfile? existing, Guid accountId, string accountName, ImporterProfileForm form, CancellationToken ct)
    {
        var type = form.ImporterType.Trim().ToUpperInvariant();
        Require(ImporterVerification.Types.Contains(type), "Choose whether you are registering as a business, an individual or a customs agent.");
        Require(form.DeclarationAccepted, "Confirm that the information and documents you provided are true and complete.");

        var legalName = type == ImporterVerification.Individual ? accountName : form.LegalName.Trim();
        Require(legalName.Length is >= 2 and <= 200, type == ImporterVerification.Business ? "Enter the registered business name." : "Enter the registered agency or agent name.");
        var tin = Regex.Replace(form.Tin ?? "", "\\D", "");
        if (type != ImporterVerification.Individual || tin.Length > 0)
            Require(ImporterVerification.IsValidTin(tin), "Enter the 10-digit Taxpayer Identification Number (TIN).");

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var tradeLicense = ImporterVerification.NormalizeIdentifier(form.TradeLicenseNumber);
        var registration = ImporterVerification.NormalizeIdentifier(form.BusinessRegistrationNumber);
        var vat = ImporterVerification.NormalizeIdentifier(form.VatNumber);
        var agentLicense = ImporterVerification.NormalizeIdentifier(form.AgentLicenseNumber);
        if (type == ImporterVerification.Business)
        {
            Require(tradeLicense.Length is >= 3 and <= 60, "Enter the trade licence number shown on your import trade licence.");
            Require(form.TradeLicenseExpiry is { } expiry && expiry >= today, "The trade licence must be renewed and not yet expired.");
            Require(registration.Length is >= 3 and <= 60, "Enter the commercial registration number.");
            Require(vat.Length <= 30, "The VAT registration number is too long.");
            Require(form.RepresentativeRole.Trim().Length is >= 2 and <= 120, "Enter your role in the business, for example General Manager.");
        }
        if (type == ImporterVerification.CustomsAgent)
        {
            Require(agentLicense.Length is >= 3 and <= 60, "Enter your customs agent licence number.");
            Require(form.AgentLicenseExpiry is { } expiry && expiry >= today, "The customs agent licence must be valid and not yet expired.");
        }

        var idType = form.IdType.Trim().ToUpperInvariant();
        var idNumber = ImporterVerification.NormalizeIdentifier(form.IdNumber);
        if (idType == "FAYDA") idNumber = idNumber.Replace("-", "", StringComparison.Ordinal);
        Require(ImporterVerification.IdTypes.Contains(idType), "Choose the identity document type.");
        Require(ImporterVerification.IsValidIdNumber(idType, idNumber), idType == "FAYDA" ? "Enter the 12-digit Fayda FIN or the 16-digit FAN." : "Enter the identity document number exactly as printed.");
        var nationality = form.Nationality.Trim().ToUpperInvariant();
        Require(nationality.Length == 2 && IsCountry(nationality), "Choose your nationality.");
        var residency = form.ResidencyStatus.Trim().ToUpperInvariant();
        if (type == ImporterVerification.Individual) Require(ImporterVerification.ResidencyStatuses.Contains(residency), "Choose your residency status.");
        else residency = "";

        var phone = ImporterVerification.NormalizePhone(form.Phone) ?? "";
        Require(phone.Length > 0, "Enter an Ethiopian mobile number (09…, 07… or +251…) or an international number starting with + and the country code.");
        var region = (await RegionsAsync(ct)).FirstOrDefault(r => r.Id == form.RegionLocationId);
        Require(region is not null, "Choose the region where your business or residence is registered.");
        Require(form.City.Trim().Length is >= 2 and <= 120, "Enter the city or town.");
        Require(form.Woreda.Trim().Length <= 120 && form.AddressLine.Trim().Length <= 300 && form.TradeName.Trim().Length <= 200, "One or more address fields are too long.");

        var allowed = ImporterVerification.AllowedDocuments(type);
        var uploads = form.Uploads().Where(x => x.File is not null).ToArray();
        Require(uploads.All(x => allowed.Contains(x.Kind)), "One of the uploaded documents does not apply to this importer type.");
        Require(uploads.Sum(x => x.File!.Length) <= MaxCombinedUpload, "The combined document upload must be 40 MB or smaller.");

        var profile = existing ?? new ImporterProfile { Id = Guid.NewGuid(), AccountId = accountId };
        if (existing is not null && existing.ImporterType != type) profile.Documents.RemoveAll(d => !allowed.Contains(d.Kind));
        foreach (var (kind, file) in uploads)
        {
            var upload = await UploadedDocumentReader.ReadAsync(file!, ct);
            var document = profile.Documents.FirstOrDefault(d => d.Kind == kind);
            if (document is null) { document = new ImporterProfileDocument { Id = Guid.NewGuid(), ProfileId = profile.Id, Kind = kind }; profile.Documents.Add(document); }
            document.FileName = upload.FileName; document.ContentType = upload.ContentType; document.Size = upload.Content.Length;
            document.Sha256 = upload.Sha256; document.Content = upload.Content; document.UploadedAt = DateTimeOffset.UtcNow;
        }
        var missing = ImporterVerification.RequiredDocuments(type).Where(kind => profile.Documents.All(d => d.Kind != kind)).ToArray();
        Require(missing.Length == 0, $"Upload the required documents: {string.Join(", ", missing.Select(DocumentLabel))}.");

        profile.ImporterType = type; profile.LegalName = legalName; profile.TradeName = form.TradeName.Trim(); profile.Tin = tin;
        profile.TradeLicenseNumber = type == ImporterVerification.Business ? tradeLicense : "";
        profile.TradeLicenseExpiry = type == ImporterVerification.Business ? form.TradeLicenseExpiry : null;
        profile.BusinessRegistrationNumber = type == ImporterVerification.Business ? registration : "";
        profile.VatNumber = type == ImporterVerification.Business ? vat : "";
        profile.AgentLicenseNumber = type == ImporterVerification.CustomsAgent ? agentLicense : "";
        profile.AgentLicenseExpiry = type == ImporterVerification.CustomsAgent ? form.AgentLicenseExpiry : null;
        profile.IdType = idType; profile.IdNumber = idNumber; profile.Nationality = nationality; profile.ResidencyStatus = residency;
        profile.RepresentativeRole = type == ImporterVerification.Individual ? "" : form.RepresentativeRole.Trim();
        profile.Phone = phone; profile.RegionLocationId = region!.Id; profile.RegionKey = await access.RegionKey(region.Id, ct);
        profile.City = form.City.Trim(); profile.Woreda = form.Woreda.Trim(); profile.AddressLine = form.AddressLine.Trim();
        profile.VerificationStatus = ImporterVerification.Pending; profile.ReviewNote = ""; profile.ReviewedAt = null; profile.ReviewedById = null;
        profile.SubmittedAt = DateTimeOffset.UtcNow; profile.UpdatedAt = profile.SubmittedAt; profile.Version = Guid.NewGuid();
        return profile;
    }

    /// <summary>Other accounts that registered the same TIN or identity number, so officers can spot reuse.</summary>
    public async Task<object> DuplicatesAsync(ImporterProfile profile, CancellationToken ct)
    {
        var tinMatches = profile.Tin.Length == 0 ? 0 : await db.ImporterProfiles.CountAsync(x => x.Id != profile.Id && x.Tin == profile.Tin, ct);
        var idMatches = await db.ImporterProfiles.CountAsync(x => x.Id != profile.Id && x.IdType == profile.IdType && x.IdNumber == profile.IdNumber, ct);
        return new { tinMatches, idMatches };
    }

    public void Audit(ImporterProfile profile, Guid actorId, string username, string action, string? note) =>
        db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = actorId.ToString(), SubjectUserId = profile.AccountId, Username = username,
            OccurredAt = DateTimeOffset.UtcNow, Action = action, Module = "ImporterVerification", RecordId = profile.Id, LocationId = profile.RegionLocationId,
            Decision = profile.VerificationStatus, Justification = note,
            NewValueJson = JsonSerializer.Serialize(new { profile.ImporterType, profile.VerificationStatus, profile.RegionKey, documents = profile.Documents.Select(d => new { d.Kind, d.Sha256 }) }) });

    public static object View(ImporterProfile x, string? regionName = null) => new
    {
        x.Id, x.AccountId, x.ImporterType, x.VerificationStatus, x.LegalName, x.TradeName, x.Tin, x.TradeLicenseNumber, x.TradeLicenseExpiry,
        x.BusinessRegistrationNumber, x.VatNumber, x.AgentLicenseNumber, x.AgentLicenseExpiry, x.IdType, x.IdNumber, x.Nationality, x.ResidencyStatus,
        x.RepresentativeRole, x.Phone, x.RegionLocationId, regionName, x.City, x.Woreda, x.AddressLine, x.ReviewNote, x.ReviewedAt, x.SubmittedAt, x.UpdatedAt, x.Version,
        requiredDocuments = ImporterVerification.RequiredDocuments(x.ImporterType),
        documents = x.Documents.Select(d => new { d.Kind, d.FileName, d.ContentType, d.Size, d.Sha256, d.UploadedAt }).ToArray()
    };

    public static string DocumentLabel(string kind) => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(kind.Replace('_', ' ').ToLowerInvariant());

    private static bool IsCountry(string code)
    {
        try { _ = new RegionInfo(code); return true; }
        catch (ArgumentException) { return code == "XK"; }
    }

    private static void Require(bool condition, string message) { if (!condition) throw new WorkspaceException(400, message); }
}
