namespace SES.Customs.Core.Models;

/// <summary>
/// How audit events are grouped. Every event gets one category (which view shows it) and one source (where it happened),
/// derived from its module and action so all writers stay consistent.
/// </summary>
public static class AuditTaxonomy
{
    public const string Case = "CASE";                 // valuation search and importer-portal declarations
    public const string Verification = "VERIFICATION"; // importer verification (onboarding) and its decisions
    public const string Account = "ACCOUNT";           // a person's own account: profile, picture, name-change requests
    public const string Staff = "STAFF";               // personnel: registration approvals, access changes, archiving
    public const string Reference = "REFERENCE";       // HS codes, tariff imports, branches and regions
    public const string Security = "SECURITY";         // sign-ins, failed sign-ins, password changes, document access

    public const string ImporterPortal = "IMPORTER_PORTAL";
    public const string ValuationSearch = "VALUATION_SEARCH";
    public const string Administration = "ADMINISTRATION";
    public const string System = "SYSTEM";

    public static readonly string[] Categories = [Case, Verification, Account, Staff, Reference, Security];

    public static bool IsCaseModule(string module) => module is "ImporterDeclarations" or "Valuation" or "Valuations" or "EthiopianImportTaxAssessment";

    public static string CategoryFor(string module, string action, string? actorRole)
    {
        if (action is "USER_SIGNED_IN" or "SIGN_IN_FAILED" or "PASSWORD_CHANGED" || action.StartsWith("DOCUMENT_", StringComparison.Ordinal) || action.StartsWith("INVOICE_", StringComparison.Ordinal)) return Security;
        if (IsCaseModule(module)) return Case;
        if (module == "ImporterVerification") return Verification;
        if (module is "ImporterChangeRequests" || action.StartsWith("NAME_CHANGE_", StringComparison.Ordinal) || action.StartsWith("IDENTITY_CHANGE_", StringComparison.Ordinal)) return Account;
        if (module is "HsCodes" or "HS Codes" or "Locations" or "Tariff") return Reference;
        if (module == "Users")
        {
            if (action is "IMPORTER_ACCOUNT_UPDATED" or "PROFILE_UPDATED" or "PROFILE_PHOTO_UPDATED" or "PROFILE_PHOTO_REMOVED") return Account;
            return Staff;
        }
        return actorRole == AccessRules.Importer ? Account : Staff;
    }

    public static string SourceFor(string module, string action, string? actorRole, bool linkedToDeclaration)
    {
        if (module == "ImporterDeclarations" || linkedToDeclaration) return ImporterPortal;
        if (IsCaseModule(module)) return ValuationSearch;
        if (module is "ImporterVerification" or "ImporterChangeRequests" || actorRole == AccessRules.Importer) return ImporterPortal;
        if (string.IsNullOrWhiteSpace(actorRole)) return System;
        return Administration;
    }
}
