using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using SES.Customs.API.Controllers;
using SES.Customs.API.Integrations.PricesApi;
using SES.Customs.API.Security;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using Xunit;

namespace SES.Customs.Tests;

/// <summary>Officer review, reclassification and final assessment of an importer declaration, with importer notifications.</summary>
public sealed class ImporterCaseWorkflowTests
{
    private sealed record Fixture(CustomsDbContext Db, Guid ImporterId, Guid OfficerId, Guid BranchId, Guid HsCodeId, Guid PhoneLineId, Guid OtherLineId);

    private static async Task<Fixture> CreateAsync()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var db = new CustomsDbContext(new DbContextOptionsBuilder<CustomsDbContext>().UseInMemoryDatabase($"importer-case-{Guid.NewGuid()}").Options);
        Guid importerId = Guid.NewGuid(), officerId = Guid.NewGuid(), branchId = Guid.NewGuid(), revisionId = Guid.NewGuid(), hsCodeId = Guid.NewGuid(), phoneLine = Guid.NewGuid(), otherLine = Guid.NewGuid();
        db.CustomsLocations.Add(new CustomsLocation { Id = branchId, OfficialCode = "MK-01", Name = "Mekelle branch", DisplayName = "Mekelle branch", LocationType = "BRANCH", Region = "TIGRAY", Status = "ACTIVE", SupportsImport = true, SupportsValuation = true, EffectiveFrom = DateTimeOffset.UtcNow.AddDays(-5) });
        db.AuthAccounts.AddRange(
            new AuthAccountEntity { Id = importerId, Username = "importer", Email = "importer@example.invalid", FullName = "Selam Trading", Role = "Importer", Active = true, Status = "ACTIVE", PasswordHash = "unused", CreatedAt = DateTimeOffset.UtcNow },
            new AuthAccountEntity { Id = officerId, Username = "officer", Email = "officer@example.invalid", FullName = "Tigray Officer", Role = "CustomsOfficer", Active = true, Status = "ACTIVE", PasswordHash = "unused", CreatedAt = DateTimeOffset.UtcNow, PrimaryLocationId = branchId });
        db.ImporterProfiles.Add(new ImporterProfile { Id = Guid.NewGuid(), AccountId = importerId, ImporterType = ImporterVerification.Business, VerificationStatus = ImporterVerification.Verified, LegalName = "Selam Trading PLC", Tin = "0012345678", RegionLocationId = branchId, RegionKey = "TIGRAY" });
        db.HsRevisions.Add(new HsRevision { Id = revisionId, Name = "HS 2022", Status = "Active", EffectiveDate = today.AddYears(-1) });
        db.HsCodes.Add(new HsCode { Id = hsCodeId, RevisionId = revisionId, Code = "851713", DescriptionEn = "Smartphones", ChapterNumber = 85, HeadingNumber = "85.17" });
        db.NationalTariffLines.AddRange(
            new NationalTariffLine { Id = phoneLine, HsCodeId = hsCodeId, Code = "85171300000", NationalCode = "85171300000", TariffItemNo = "8517.1300", DescriptionEn = "Smartphones", Unit = "UNT", Duty = "30%", SourceReference = "Test tariff", EffectiveDate = today.AddDays(-1),
                TaxRates = [new TariffTaxRate { Id = Guid.NewGuid(), TaxCode = TariffTaxCodes.Duty, Rate = 30m }, new TariffTaxRate { Id = Guid.NewGuid(), TaxCode = TariffTaxCodes.Vat, Rate = 15m }] },
            new NationalTariffLine { Id = otherLine, HsCodeId = hsCodeId, Code = "85171390000", NationalCode = "85171390000", TariffItemNo = "8517.1390", DescriptionEn = "Other smartphones", Unit = "UNT", Duty = "10%", SourceReference = "Test tariff", EffectiveDate = today.AddDays(-1) });
        await db.SaveChangesAsync();
        return new Fixture(db, importerId, officerId, branchId, hsCodeId, phoneLine, otherLine);
    }

    private static ImporterDeclarationsController Controller(CustomsDbContext db, Guid userId, string role)
    {
        var http = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, role)], "test")) };
        return new ImporterDeclarationsController(db, new WorkspaceAccess(db, new HttpContextAccessor { HttpContext = http }), new MemoryCache(new MemoryCacheOptions())) { ControllerContext = new() { HttpContext = http } };
    }

    private static async Task<Guid> SubmitAsync(Fixture f, decimal? invoice = 600m)
    {
        var pdf = "%PDF-1.4 importer case"u8.ToArray();
        IFormFile File(string name) => new FormFile(new MemoryStream(pdf), 0, pdf.Length, name, $"{name}.pdf");
        var result = await Controller(f.Db, f.ImporterId, AccessRules.Importer).Submit(new ImporterSubmissionForm
        {
            LocationId = f.BranchId, SuggestedTariffLineId = f.PhoneLineId, OriginCountryCode = "CN", ImportPurpose = "COMMERCIAL_RESALE", IsCommercialProduct = true,
            Brand = "Tecno", Model = "Spark 20", ProductName = "Tecno Spark 20 smartphone", Description = "Android smartphone, 128 GB storage, dual SIM, boxed with charger.",
            Quantity = 2, Unit = "pieces", InvoiceAmount = invoice, InvoiceCurrency = "USD", FreightAmount = 30m, InsuranceAmount = 5m,
            CommercialInvoice = File("CommercialInvoice"), PackingList = File("PackingList"), CertificateOfOrigin = File("CertificateOfOrigin")
        }, CancellationToken.None);
        return result is CreatedResult ? (await f.Db.ImporterDeclarations.SingleAsync()).Id : Guid.Empty;
    }

    [Fact]
    public async Task SubmissionRequiresThePricePaid()
    {
        var f = await CreateAsync();
        Assert.Equal(Guid.Empty, await SubmitAsync(f, invoice: null));
        var id = await SubmitAsync(f);
        var declaration = await f.Db.ImporterDeclarations.SingleAsync(x => x.Id == id);
        Assert.Equal(600m, declaration.InvoiceAmount);
        Assert.Equal("USD", declaration.InvoiceCurrency);
        Assert.Equal(30m, declaration.FreightAmount);
    }

    [Fact]
    public async Task OfficerApprovesReclassifiesAndTheImporterIsNotified()
    {
        var f = await CreateAsync();
        var id = await SubmitAsync(f);
        var officer = Controller(f.Db, f.OfficerId, AccessRules.Officer);

        var queue = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await officer.Queue(null, "selam", CancellationToken.None)).Value);
        Assert.Equal(1, queue.GetProperty("counts").GetProperty("SUBMITTED").GetInt32());
        var row = queue.GetProperty("items")[0];
        Assert.Equal("Selam Trading PLC", row.GetProperty("importerName").GetString());
        Assert.Equal("8517.1300", row.GetProperty("hsCode").GetString());

        var caseView = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await officer.Case(id, CancellationToken.None)).Value);
        Assert.Equal("85171300000", caseView.GetProperty("suggestedLine").GetProperty("nationalCode").GetString());
        Assert.True(caseView.GetProperty("canValue").GetBoolean());
        Assert.Contains("APPROVE_FOR_VALUATION", caseView.GetProperty("allowedActions").EnumerateArray().Select(x => x.GetString()));

        var declaration = await f.Db.ImporterDeclarations.SingleAsync(x => x.Id == id);
        Assert.IsType<OkObjectResult>(await officer.Review(id, new ImporterReviewRequest("APPROVE_FOR_VALUATION", f.PhoneLineId, null, declaration.Version), CancellationToken.None));
        Assert.Equal("ASSESSMENT_READY", declaration.Status);
        Assert.Equal(f.PhoneLineId, declaration.ConfirmedTariffLineId);

        Assert.IsType<OkObjectResult>(await officer.Review(id, new ImporterReviewRequest("RECLASSIFY", f.OtherLineId, "Model is a feature phone variant.", declaration.Version), CancellationToken.None));
        Assert.Equal(f.OtherLineId, declaration.ConfirmedTariffLineId);
        Assert.Equal("ASSESSMENT_READY", declaration.Status);
        Assert.Contains(await f.Db.AuditLogs.ToListAsync(), entry => entry.Action == "IMPORTER_DECLARATION_RECLASSIFIED" && entry.Justification!.Contains("8517.1300") && entry.Justification.Contains("8517.1390"));
        Assert.IsType<BadRequestObjectResult>(await officer.Review(id, new ImporterReviewRequest("RECLASSIFY", f.OtherLineId, null, declaration.Version), CancellationToken.None));

        var kinds = await f.Db.ImporterNotifications.Where(x => x.ImporterId == f.ImporterId).Select(x => x.Kind).ToListAsync();
        Assert.Equal(["DECLARATION_VERIFIED", "DECLARATION_RECLASSIFIED"], kinds.Order().Reverse().ToArray());
    }

    [Fact]
    public async Task ActionsOutsideTheCurrentStageAreRefused()
    {
        var f = await CreateAsync();
        var id = await SubmitAsync(f);
        var officer = Controller(f.Db, f.OfficerId, AccessRules.Officer);
        var declaration = await f.Db.ImporterDeclarations.SingleAsync(x => x.Id == id);
        Assert.IsType<ConflictObjectResult>(await officer.Review(id, new ImporterReviewRequest("CONTINUE_ASSESSMENT", null, null, declaration.Version), CancellationToken.None));
        Assert.IsType<BadRequestObjectResult>(await officer.Review(id, new ImporterReviewRequest("REQUEST_INFORMATION", null, "short", declaration.Version), CancellationToken.None));
        Assert.IsType<OkObjectResult>(await officer.Review(id, new ImporterReviewRequest("REQUEST_INFORMATION", null, "Upload a readable commercial invoice.", declaration.Version), CancellationToken.None));
        Assert.IsType<ConflictObjectResult>(await officer.Review(id, new ImporterReviewRequest("APPROVE_FOR_VALUATION", f.PhoneLineId, null, declaration.Version), CancellationToken.None));
        Assert.Equal("Upload a readable commercial invoice.", (await f.Db.ImporterNotifications.SingleAsync()).Message);
    }

    [Fact]
    public async Task ConfirmedAssessmentFinalisesTheDeclarationAndNotifiesTheImporter()
    {
        var f = await CreateAsync();
        var id = await SubmitAsync(f);
        var declaration = await f.Db.ImporterDeclarations.SingleAsync(x => x.Id == id);
        declaration.Status = "IN_ASSESSMENT"; declaration.ConfirmedHsCodeId = f.HsCodeId; declaration.ConfirmedTariffLineId = f.PhoneLineId;
        var decisionId = Guid.NewGuid();
        f.Db.ValuationDecisions.Add(new ValuationDecision { Id = decisionId, ImporterDeclarationId = id, HsCodeId = f.HsCodeId, ProductName = "Tecno Spark 20 smartphone", OfficerSubjectId = f.OfficerId.ToString(),
            SelectedReferenceValue = 100_000m, Currency = "ETB", InitialDutyCurrency = "ETB", LocationId = f.BranchId, Status = "Submitted" });
        await f.Db.SaveChangesAsync();

        var http = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, f.OfficerId.ToString()), new Claim(ClaimTypes.Role, "CustomsOfficer")], "test")) };
        var fx = new HistoricalFxClient(new HttpClient(), new MemoryCache(new MemoryCacheOptions()), new ConfigurationBuilder().Build());
        var phase2 = new ValuationPhase2Controller(f.Db, fx) { ControllerContext = new ControllerContext { HttpContext = http } };
        var request = new Phase2Request(f.HsCodeId, "ETB", 1m, "Same currency", null, 0m, 0m, 0m, "Fixed", null, [],
            CustomsValueAmount: 100_000m, CustomsValueCurrency: "ETB", ProductCategory: "General goods", Quantity: 2m, Unit: "pieces", OfficerConfirmation: true);
        Assert.IsType<OkObjectResult>(await phase2.Complete(decisionId, request, CancellationToken.None));

        var finalised = await f.Db.ImporterDeclarations.AsNoTracking().SingleAsync(x => x.Id == id);
        Assert.Equal("ASSESSED", finalised.Status);
        Assert.Equal(100_000m, finalised.AssessedCustomsValue);
        Assert.Equal("ETB", finalised.AssessmentCurrency);
        Assert.True(finalised.AssessedPayable > 30_000m);
        using var lines = JsonDocument.Parse(finalised.AssessmentJson);
        Assert.Contains(lines.RootElement.EnumerateArray(), line => line.GetProperty("name").GetString() == "Customs Duty" && line.GetProperty("amount").GetDecimal() == 30_000m);
        var notice = await f.Db.ImporterNotifications.SingleAsync(x => x.Kind == "DECLARATION_ASSESSED");
        Assert.Equal($"/importer/declarations/{id}", notice.Link);
        Assert.Contains(await f.Db.AuditLogs.ToListAsync(), entry => entry.Action == "IMPORTER_DECLARATION_ASSESSED" && entry.RecordId == id);
    }
}
