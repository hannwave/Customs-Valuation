using SES.Customs.Core.Models;
using Xunit;

namespace SES.Customs.Tests;

public sealed class AuditTaxonomyTests
{
    [Theory]
    [InlineData("ImporterDeclarations", "IMPORTER_DECLARATION_SUBMITTED", AccessRules.Importer, AuditTaxonomy.Case)]
    [InlineData("Valuations", "VALUATION_SUBMITTED", AccessRules.Officer, AuditTaxonomy.Case)]
    [InlineData("EthiopianImportTaxAssessment", "ETHIOPIAN_IMPORT_TAX_ASSESSMENT_COMPLETED", AccessRules.Officer, AuditTaxonomy.Case)]
    [InlineData("ImporterVerification", "IMPORTER_VERIFICATION_VERIFY", AccessRules.Officer, AuditTaxonomy.Verification)]
    [InlineData("ImporterChangeRequests", "IDENTITY_CHANGE_APPROVED", AccessRules.Officer, AuditTaxonomy.Account)]
    [InlineData("Users", "IMPORTER_ACCOUNT_UPDATED", AccessRules.Importer, AuditTaxonomy.Account)]
    [InlineData("Users", "PROFILE_UPDATED", AccessRules.Officer, AuditTaxonomy.Account)]
    [InlineData("Users", "REGISTRATION_APPROVED", AccessRules.CustomsAdmin, AuditTaxonomy.Staff)]
    [InlineData("Users", "OFFICER_ACCESS_CHANGED", AccessRules.CustomsAdmin, AuditTaxonomy.Staff)]
    [InlineData("Users", "USER_SIGNED_IN", AccessRules.Officer, AuditTaxonomy.Security)]
    [InlineData("Users", "SIGN_IN_FAILED", AccessRules.Importer, AuditTaxonomy.Security)]
    [InlineData("ImporterDeclarations", "DOCUMENT_OPENED", AccessRules.Officer, AuditTaxonomy.Security)]
    [InlineData("Valuations", "INVOICE_OPENED", AccessRules.Officer, AuditTaxonomy.Security)]
    [InlineData("HS Codes", "HS_CODE_UPDATED", AccessRules.SystemAdmin, AuditTaxonomy.Reference)]
    [InlineData("Locations", "LOCATION_CREATED", AccessRules.SystemAdmin, AuditTaxonomy.Reference)]
    public void EveryEventLandsInOneView(string module, string action, string role, string expected) =>
        Assert.Equal(expected, AuditTaxonomy.CategoryFor(module, action, role));

    [Fact]
    public void ValuationOfAPortalDeclarationCountsAsImporterPortal()
    {
        Assert.Equal(AuditTaxonomy.ImporterPortal, AuditTaxonomy.SourceFor("Valuations", "VALUATION_SUBMITTED", AccessRules.Officer, linkedToDeclaration: true));
        Assert.Equal(AuditTaxonomy.ValuationSearch, AuditTaxonomy.SourceFor("Valuations", "VALUATION_SUBMITTED", AccessRules.Officer, linkedToDeclaration: false));
        Assert.Equal(AuditTaxonomy.Administration, AuditTaxonomy.SourceFor("Users", "USER_CREATED", AccessRules.CustomsAdmin, false));
        Assert.Equal(AuditTaxonomy.System, AuditTaxonomy.SourceFor("HsCodes", "ERCA_TARIFF_IMPORTED", "", false));
    }
}
