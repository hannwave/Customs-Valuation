using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SES.Customs.API.Controllers;
using SES.Customs.API.Security;
using SES.Customs.API.Services;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using Xunit;

namespace SES.Customs.Tests;

public sealed class ImporterVerificationTests
{
    private static readonly byte[] Pdf = "%PDF-1.4 disposable verification document"u8.ToArray();

    private sealed record Fixture(CustomsDbContext Db, Guid ImporterId, Guid TigrayId, Guid TigrayOfficerId, Guid AmharaOfficerId);

    private static async Task<Fixture> CreateAsync()
    {
        var db = new CustomsDbContext(new DbContextOptionsBuilder<CustomsDbContext>().UseInMemoryDatabase($"importer-verification-{Guid.NewGuid()}").Options);
        var past = DateTimeOffset.UtcNow.AddDays(-5);
        Guid tigray = Guid.NewGuid(), tigrayBranch = Guid.NewGuid(), amhara = Guid.NewGuid(), amharaBranch = Guid.NewGuid();
        db.CustomsLocations.AddRange(
            new CustomsLocation { Id = tigray, OfficialCode = "ET-TI", Name = "Tigray", DisplayName = "Tigray", LocationType = "REGION", Region = "Tigray", Status = "ACTIVE", EffectiveFrom = past },
            new CustomsLocation { Id = tigrayBranch, OfficialCode = "ET-TI-BR-01", Name = "Mekelle", DisplayName = "Mekelle", LocationType = "BRANCH", ParentLocationId = tigray, Region = "Tigray", Status = "ACTIVE", EffectiveFrom = past },
            new CustomsLocation { Id = amhara, OfficialCode = "ET-AM", Name = "Amhara", DisplayName = "Amhara", LocationType = "REGION", Region = "Amhara", Status = "ACTIVE", EffectiveFrom = past },
            new CustomsLocation { Id = amharaBranch, OfficialCode = "ET-AM-BR-01", Name = "Bahir Dar", DisplayName = "Bahir Dar", LocationType = "BRANCH", ParentLocationId = amhara, Region = "Amhara", Status = "ACTIVE", EffectiveFrom = past });
        Guid importer = Guid.NewGuid(), tigrayOfficer = Guid.NewGuid(), amharaOfficer = Guid.NewGuid();
        db.AuthAccounts.AddRange(
            Account(importer, "importer@example.invalid", AccessRules.Importer, null),
            Account(tigrayOfficer, "tigray.officer@example.invalid", AccessRules.Officer, tigrayBranch),
            Account(amharaOfficer, "amhara.officer@example.invalid", AccessRules.Officer, amharaBranch));
        await db.SaveChangesAsync();
        return new Fixture(db, importer, tigray, tigrayOfficer, amharaOfficer);
    }

    private static AuthAccountEntity Account(Guid id, string email, string role, Guid? location) => new()
    {
        Id = id, Username = email, Email = email, FullName = "Abebe Kebede", Role = role, Active = true, Status = "ACTIVE",
        PrimaryLocationId = location, PasswordHash = "unused", CreatedAt = DateTimeOffset.UtcNow
    };

    private static (WorkspaceAccess Access, DefaultHttpContext Http) As(CustomsDbContext db, Guid userId, string role)
    {
        var http = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, role)], "test")) };
        return (new WorkspaceAccess(db, new HttpContextAccessor { HttpContext = http }), http);
    }

    private static IFormFile File(string name) => new FormFile(new MemoryStream(Pdf), 0, Pdf.Length, name, $"{name}.pdf");

    private static ImporterProfileForm BusinessForm(Guid region) => new()
    {
        ImporterType = "BUSINESS", LegalName = "Abebe Trading PLC", Tin = "0012345678", TradeLicenseNumber = "AA/14/1/0001/2016",
        TradeLicenseExpiry = DateOnly.FromDateTime(DateTime.UtcNow).AddYears(1), BusinessRegistrationNumber = "MT/AA/1/0001234",
        RepresentativeRole = "General Manager", IdType = "FAYDA", IdNumber = "1234 5678 9012", Nationality = "ET",
        Phone = "+251 911 234 567", RegionLocationId = region, City = "Mekelle", DeclarationAccepted = true,
        TradeLicense = File("TradeLicense"), TinCertificate = File("TinCertificate"),
        CommercialRegistration = File("CommercialRegistration"), IdentityDocument = File("IdentityDocument")
    };

    [Fact]
    public async Task BusinessApplicationIsRoutedToOfficersInTheSelectedRegionOnly()
    {
        var f = await CreateAsync();
        var (importerAccess, importerHttp) = As(f.Db, f.ImporterId, AccessRules.Importer);
        var importer = new ImporterProfileController(f.Db, importerAccess, new ImporterProfileService(f.Db, importerAccess)) { ControllerContext = new() { HttpContext = importerHttp } };
        Assert.IsType<OkObjectResult>(await importer.Submit(BusinessForm(f.TigrayId), CancellationToken.None));

        var profile = await f.Db.ImporterProfiles.Include(x => x.Documents).SingleAsync();
        Assert.Equal(ImporterVerification.Pending, profile.VerificationStatus);
        Assert.Equal("TIGRAY", profile.RegionKey);
        Assert.Equal("123456789012", profile.IdNumber);
        Assert.Equal("+251911234567", profile.Phone);
        Assert.Equal(4, profile.Documents.Count);

        var (amharaAccess, amharaHttp) = As(f.Db, f.AmharaOfficerId, AccessRules.Officer);
        var amhara = new ImporterVerificationsController(f.Db, amharaAccess, new ImporterProfileService(f.Db, amharaAccess)) { ControllerContext = new() { HttpContext = amharaHttp } };
        var amharaList = System.Text.Json.JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await amhara.List(null, null, CancellationToken.None)).Value);
        Assert.Equal(0, amharaList.GetProperty("items").GetArrayLength());
        await Assert.ThrowsAsync<WorkspaceException>(() => amhara.Get(profile.Id, CancellationToken.None));

        var (tigrayAccess, tigrayHttp) = As(f.Db, f.TigrayOfficerId, AccessRules.Officer);
        var tigray = new ImporterVerificationsController(f.Db, tigrayAccess, new ImporterProfileService(f.Db, tigrayAccess)) { ControllerContext = new() { HttpContext = tigrayHttp } };
        var tigrayList = System.Text.Json.JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await tigray.List("PENDING", null, CancellationToken.None)).Value);
        Assert.Equal(1, tigrayList.GetProperty("items").GetArrayLength());
        Assert.IsType<OkObjectResult>(await tigray.Review(profile.Id, new ImporterVerificationReview("VERIFY", null, profile.Version), CancellationToken.None));
        Assert.Equal(ImporterVerification.Verified, (await f.Db.ImporterProfiles.SingleAsync()).VerificationStatus);

        var verified = await f.Db.ImporterProfiles.SingleAsync();
        Assert.IsType<BadRequestObjectResult>(await tigray.Review(profile.Id, new ImporterVerificationReview("SUSPEND", "short", verified.Version), CancellationToken.None));
        Assert.IsType<OkObjectResult>(await tigray.Review(profile.Id, new ImporterVerificationReview("SUSPEND", "Trade licence revoked by the trade bureau.", verified.Version), CancellationToken.None));
        var suspended = await f.Db.ImporterProfiles.SingleAsync();
        Assert.Equal(ImporterVerification.Suspended, suspended.VerificationStatus);
        Assert.IsType<ConflictObjectResult>(await tigray.Review(profile.Id, new ImporterVerificationReview("VERIFY", null, suspended.Version), CancellationToken.None));
        Assert.IsType<OkObjectResult>(await tigray.Review(profile.Id, new ImporterVerificationReview("REINSTATE", null, suspended.Version), CancellationToken.None));
        Assert.Equal(ImporterVerification.Verified, (await f.Db.ImporterProfiles.SingleAsync()).VerificationStatus);

        var listing = System.Text.Json.JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await tigray.List(null, "abebe trading", CancellationToken.None)).Value);
        Assert.Equal(1, listing.GetProperty("items").GetArrayLength());
        Assert.Equal(1, listing.GetProperty("counts").GetProperty("VERIFIED").GetInt32());
    }

    [Theory]
    [InlineData("PENDING", "VERIFY", "VERIFIED")]
    [InlineData("PENDING", "SUSPEND", null)]
    [InlineData("VERIFIED", "SUSPEND", "SUSPENDED")]
    [InlineData("VERIFIED", "REJECT", null)]
    [InlineData("SUSPENDED", "REINSTATE", "VERIFIED")]
    [InlineData("REJECTED", "VERIFY", null)]
    public void StatusTransitionsFollowTheReviewRules(string from, string action, string? expected) =>
        Assert.Equal(expected, ImporterVerification.NextStatus(from, action));

    [Fact]
    public async Task ApplicationWithoutRequiredDocumentsOrValidLicenceIsRefused()
    {
        var f = await CreateAsync();
        var (access, _) = As(f.Db, f.ImporterId, AccessRules.Importer);
        var service = new ImporterProfileService(f.Db, access);

        var missingLicence = BusinessForm(f.TigrayId);
        missingLicence.TradeLicense = null;
        var error = await Assert.ThrowsAsync<WorkspaceException>(() => service.ApplyAsync(null, f.ImporterId, "Abebe Kebede", missingLicence, CancellationToken.None));
        Assert.Contains("Trade License", error.Message);

        var expired = BusinessForm(f.TigrayId);
        expired.TradeLicenseExpiry = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-1);
        await Assert.ThrowsAsync<WorkspaceException>(() => service.ApplyAsync(null, f.ImporterId, "Abebe Kebede", expired, CancellationToken.None));

        var badTin = BusinessForm(f.TigrayId);
        badTin.Tin = "12345";
        await Assert.ThrowsAsync<WorkspaceException>(() => service.ApplyAsync(null, f.ImporterId, "Abebe Kebede", badTin, CancellationToken.None));
    }

    [Fact]
    public async Task UnverifiedImporterCannotSubmitDeclarations()
    {
        var f = await CreateAsync();
        var (access, http) = As(f.Db, f.ImporterId, AccessRules.Importer);
        var controller = new ImporterDeclarationsController(f.Db, access, new MemoryCache(new MemoryCacheOptions())) { ControllerContext = new() { HttpContext = http } };
        var result = Assert.IsType<ObjectResult>(await controller.Submit(new ImporterSubmissionForm(), CancellationToken.None));
        Assert.Equal(403, result.StatusCode);
    }

    [Theory]
    [InlineData("FAYDA", "123456789012", true)]
    [InlineData("FAYDA", "1234567890123456", true)]
    [InlineData("FAYDA", "12345", false)]
    [InlineData("PASSPORT", "EP1234567", true)]
    [InlineData("PASSPORT", "E1", false)]
    [InlineData("PASSPORT", "EP12345678901", false)]
    [InlineData("KEBELE_ID", "AA/12/3456", true)]
    public void IdentityNumbersFollowDocumentFormat(string type, string number, bool valid) =>
        Assert.Equal(valid, ImporterVerification.IsValidIdNumber(type, number));

    [Theory]
    [InlineData("0911 234 567", "+251911234567")]
    [InlineData("0712345678", "+251712345678")]
    [InlineData("+251 911 234 567", "+251911234567")]
    [InlineData("251911234567", "+251911234567")]
    [InlineData("+14155550123", "+14155550123")]
    [InlineData("0811234567", null)]
    [InlineData("+25191123456", null)]
    [InlineData("911234567", null)]
    [InlineData("+1 415", null)]
    public void PhoneNumbersAreNormalizedOrRejected(string input, string? expected) =>
        Assert.Equal(expected, ImporterVerification.NormalizePhone(input));
}
