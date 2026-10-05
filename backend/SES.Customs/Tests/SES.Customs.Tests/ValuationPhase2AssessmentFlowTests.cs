using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using SES.Customs.API.Controllers;
using SES.Customs.API.Integrations.PricesApi;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using Xunit;

namespace SES.Customs.Tests;

public sealed class ValuationPhase2AssessmentFlowTests
{
    [Fact]
    public async Task PhaseOneManufacturingSelectionMakesAllAssessmentTaxesNotApplicable()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var hsCodeId = Guid.NewGuid();
        var tariffLineId = Guid.NewGuid();
        var declarationId = Guid.NewGuid();
        var decisionId = Guid.NewGuid();
        var options = new DbContextOptionsBuilder<CustomsDbContext>()
            .UseInMemoryDatabase($"phase2-assessment-{Guid.NewGuid()}")
            .Options;
        await using var db = new CustomsDbContext(options);
        db.HsCodes.Add(new HsCode { Id = hsCodeId, RevisionId = Guid.NewGuid(), Code = "847989", DescriptionEn = "Other machinery" });
        db.NationalTariffLines.Add(new NationalTariffLine
        {
            Id = tariffLineId, HsCodeId = hsCodeId, Code = "84798900", TariffItemNo = "84798900",
            DescriptionEn = "Other machinery", Duty = "30%", SourceReference = "Test tariff",
            EffectiveDate = today.AddDays(-1)
        });
        db.ImporterDeclarations.Add(new ImporterDeclaration
        {
            Id = declarationId, ImporterId = Guid.NewGuid(), LocationId = Guid.NewGuid(), Reference = "IMP-TEST",
            Status = "VERIFIED", ImportPurpose = "COMMERCIAL_RESALE", IsMachineryOrEquipment = false,
            ConfirmedHsCodeId = hsCodeId, ConfirmedTariffLineId = tariffLineId
        });
        db.ValuationDecisions.Add(new ValuationDecision
        {
            Id = decisionId, ImporterDeclarationId = declarationId, ProductName = "Factory machinery",
            EvidenceNotes = JsonSerializer.Serialize(new { productType = "MANUFACTURING" }),
            SelectedReferenceValue = 1_000_000m, Currency = "ETB", InitialDutyCurrency = "ETB"
        });
        await db.SaveChangesAsync();

        var http = new DefaultHttpContext();
        var fx = new HistoricalFxClient(new HttpClient(), new MemoryCache(new MemoryCacheOptions()), new ConfigurationBuilder().Build());
        var controller = new ValuationPhase2Controller(db, fx)
        {
            ControllerContext = new ControllerContext { HttpContext = http }
        };
        var request = new Phase2Request(
            hsCodeId, "ETB", 1m, "Same currency", null, 0m, 0m, 0m, "Fixed",
            "Approved factory equipment authorization 2026", [],
            CustomsValueAmount: 1_000_000m, CustomsValueCurrency: "ETB", ProductCategory: "Capital goods",
            ExemptionCodes: [], IsCommercialImport: true, WithholdingApplicable: true);

        var response = Assert.IsType<OkObjectResult>(await controller.Save(decisionId, request, CancellationToken.None));
        Assert.NotNull(response.Value);
        using var responseJson = JsonDocument.Parse(JsonSerializer.Serialize(response.Value));
        Assert.Equal("MANUFACTURING", responseJson.RootElement.GetProperty("phase1").GetProperty("productType").GetString());
        var assessment = await db.ValuationPhase2s.Include(item => item.TaxLines).SingleAsync();
        var duty = Assert.Single(assessment.TaxLines, line => line.Name == "Customs Duty");
        var vat = Assert.Single(assessment.TaxLines, line => line.Name == "VAT");
        var withholding = Assert.Single(assessment.TaxLines, line => line.Name == "Withholding Tax");
        var cargoFee = Assert.Single(assessment.TaxLines, line => line.Name == "Cargo Scanning Fee");
        Assert.Equal("NotApplicable", duty.Status);
        Assert.Equal("NotApplicable", vat.Status);
        Assert.All(assessment.TaxLines, line =>
        {
            Assert.False(line.IsApplicable);
            Assert.Equal(0m, line.CalculatedAmount);
            Assert.Equal("NotApplicable", line.Status);
        });
        Assert.Contains("manufacturing", withholding.Notes, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("manufacturing", cargoFee.Notes, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0m, cargoFee.CalculatedAmount);
        Assert.Equal(0m, assessment.TotalTax);

        var auditSnapshot = await db.ValuationAuditSnapshots.SingleAsync();
        Assert.Contains("Cargo Scanning Fee", auditSnapshot.TaxBreakdownJson);
        Assert.Contains("no assessment taxes or fees", auditSnapshot.TaxBreakdownJson);
        Assert.Contains("manufacturing", auditSnapshot.TaxBreakdownJson, StringComparison.OrdinalIgnoreCase);
    }
}