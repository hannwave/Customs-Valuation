using System.Net.Sockets;
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

public sealed class ImporterDeclarationFlowTests
{
    [Fact]
    public async Task CatalogueChapterAndSubmissionCompleteInDisposableDatabase()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var importerId = Guid.NewGuid();
        var locationId = Guid.NewGuid();
        var revisionId = Guid.NewGuid();
        var hsCodeId = Guid.NewGuid();
        var tariffLineId = Guid.NewGuid();
        var options = new DbContextOptionsBuilder<CustomsDbContext>()
            .UseInMemoryDatabase($"importer-flow-{Guid.NewGuid()}")
            .Options;
        await using var db = new CustomsDbContext(options);
        db.AuthAccounts.Add(new AuthAccountEntity
        {
            Id = importerId, Username = "disposable-importer", Email = "importer@example.invalid",
            FullName = "Disposable Importer", Role = "Importer", Active = true, Status = "ACTIVE",
            PasswordHash = "unused", CreatedAt = DateTimeOffset.UtcNow
        });
        db.CustomsLocations.Add(new CustomsLocation
        {
            Id = locationId, OfficialCode = "TEST-BRANCH", Name = "Test branch", DisplayName = "Test branch",
            LocationType = "BRANCH", Region = "TEST", Status = "ACTIVE", SupportsImport = true,
            EffectiveFrom = DateTimeOffset.UtcNow.AddDays(-2)
        });
        db.HsRevisions.Add(new HsRevision { Id = revisionId, Name = "Disposable HS", Status = "Active", EffectiveDate = today.AddDays(-1) });
        db.HsCodes.Add(new HsCode
        {
            Id = hsCodeId, RevisionId = revisionId, Code = "110510", DescriptionEn = "Flour, meal and powder",
            ChapterNumber = 11, ChapterName = "Products of the milling industry", HeadingNumber = "11.05"
        });
        db.NationalTariffLines.Add(new NationalTariffLine
        {
            Id = tariffLineId, HsCodeId = hsCodeId, Code = "11051000", TariffItemNo = "11051000",
            DescriptionEn = "Flour, meal and powder", Unit = "kg", Duty = "5%", EffectiveDate = today.AddDays(-1)
        });
        await db.SaveChangesAsync();

        var http = new DefaultHttpContext();
        http.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, importerId.ToString()),
            new Claim(ClaimTypes.Role, "Importer")
        ], "disposable-test"));
        var accessor = new HttpContextAccessor { HttpContext = http };
        var controller = new ImporterDeclarationsController(db, new WorkspaceAccess(db, accessor), new MemoryCache(new MemoryCacheOptions()))
        {
            ControllerContext = new ControllerContext { HttpContext = http }
        };

        var chapterResponse = Assert.IsType<OkObjectResult>(await controller.Catalog("chapters", section: "II"));
        var chapterRows = System.Text.Json.JsonSerializer.SerializeToElement(chapterResponse.Value);
        Assert.Equal("11", chapterRows[0].GetProperty("code").GetString());

        var pdf = "%PDF-1.4 disposable workflow check"u8.ToArray();
        using var invoiceStream = new MemoryStream(pdf);
        using var packingStream = new MemoryStream(pdf);
        using var originStream = new MemoryStream(pdf);
        var form = new ImporterSubmissionForm
        {
            LocationId = locationId, SuggestedTariffLineId = tariffLineId, OriginCountryCode = "CN",
            ImportPurpose = "COMMERCIAL_RESALE", IsCommercialProduct = true,
            Brand = "Disposable", Model = "TEST-1", ProductName = "Disposable sample product",
            Description = "A disposable sample product for validating importer submission.", Quantity = 1, Unit = "piece",
            CommercialInvoice = new FormFile(invoiceStream, 0, pdf.Length, "CommercialInvoice", "invoice.pdf"),
            PackingList = new FormFile(packingStream, 0, pdf.Length, "PackingList", "packing.pdf"),
            CertificateOfOrigin = new FormFile(originStream, 0, pdf.Length, "CertificateOfOrigin", "origin.pdf")
        };

        var submission = Assert.IsType<CreatedResult>(await controller.Submit(form, CancellationToken.None));
        Assert.Equal(201, submission.StatusCode);
        Assert.Single(await db.ImporterDeclarations.ToListAsync());
        Assert.Equal(3, await db.ImporterDocuments.CountAsync());
        Assert.Single(await db.AuditLogs.ToListAsync());
    }

    [Fact]
    public async Task ReadRequestRetriesTransientDnsFailure()
    {
        var attempts = 0;
        var value = await DatabaseConnectionRetry.ExecuteReadAsync(() =>
        {
            attempts++;
            if (attempts == 1) throw new SocketException((int)SocketError.HostNotFound);
            return Task.FromResult("loaded");
        }, CancellationToken.None);

        Assert.Equal("loaded", value);
        Assert.Equal(2, attempts);
    }

    [Fact]
    public async Task WriteRetriesOnlyWhenDnsFailsBeforeConnection()
    {
        var attempts = 0;
        var result = await DatabaseConnectionRetry.ExecuteWriteAfterDnsFailureAsync(() =>
        {
            attempts++;
            if (attempts == 1) return Task.FromException<int>(new SocketException((int)SocketError.HostNotFound));
            return Task.FromResult(1);
        }, CancellationToken.None);

        Assert.Equal(1, result);
        Assert.Equal(2, attempts);
    }
}
