using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using SES.Customs.API.Services;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using Xunit;

namespace SES.Customs.Tests;

public sealed class TariffTaxRateTests
{
    private static List<ValuationPhase2TaxLine> Assess(NationalTariffLine tariff) => ImportTaxAssessmentCalculator.Calculate(new(
        tariff, 1_000_000m, 1m, "Pieces (PCS)", "General goods", "", false, true, true, false, false, false, [], [], 1m, "ETB", "ETB"));

    private static NationalTariffLine Line(string duty, params (string Code, decimal Rate)[] rates) => new()
    {
        Duty = duty, SourceReference = "Test tariff",
        TaxRates = rates.Select(rate => new TariffTaxRate { TaxCode = rate.Code, Rate = rate.Rate }).ToList()
    };

    [Fact]
    public void StoredTariffRatesDriveTheAssessment()
    {
        var lines = Assess(Line("", (TariffTaxCodes.Duty, 30m), (TariffTaxCodes.Excise, 10m), (TariffTaxCodes.Vat, 15m), (TariffTaxCodes.Withholding, 3m)));
        var duty = lines.Single(line => line.Name == "Customs Duty");
        Assert.Equal(30m, duty.Value);
        Assert.Equal("Recommended", duty.Status);
        Assert.Equal(300_000m, duty.CalculatedAmount);
        var excise = lines.Single(line => line.Name == "Excise Tax");
        Assert.True(excise.IsApplicable);
        Assert.Equal(130_000m, excise.CalculatedAmount);
        Assert.Equal(30_000m, lines.Single(line => line.Name == "Withholding Tax").CalculatedAmount);
    }

    [Fact]
    public void ZeroExciseInTheTariffMeansNoExciseReview()
    {
        var lines = Assess(Line("", (TariffTaxCodes.Duty, 5m), (TariffTaxCodes.Excise, 0m), (TariffTaxCodes.Vat, 15m)));
        var excise = lines.Single(line => line.Name == "Excise Tax");
        Assert.False(excise.IsApplicable);
        Assert.Equal("NotApplicable", excise.Status);
    }

    [Theory]
    [InlineData(25, 10, true)]
    [InlineData(25, 0, false)]
    [InlineData(35, 10, true)]
    public void SecondScheduleRateDecidesSurtaxWhenSurtaxColumnIsBlank(int duty, int secondSchedule, bool applies)
    {
        var lines = Assess(Line("", (TariffTaxCodes.Duty, duty), (TariffTaxCodes.Vat, 15m), (TariffTaxCodes.SecondScheduleDuty, secondSchedule)));
        var surtax = lines.Single(line => line.Name == "Surtax");
        Assert.Equal(applies, surtax.IsApplicable);
        Assert.Equal(applies, lines.Single(line => line.Name == "Social Welfare Levy").IsApplicable == false);
    }

    [Fact]
    public void LinesWithoutStoredRatesKeepTheStatutoryDefaults()
    {
        var lines = Assess(Line("20%"));
        Assert.Equal(20m, lines.Single(line => line.Name == "Customs Duty").Value);
        Assert.Equal(15m, lines.Single(line => line.Name == "VAT").Value);
        Assert.Equal(3m, lines.Single(line => line.Name == "Withholding Tax").Value);
    }

    [Fact]
    public async Task ErcaImportUpdatesMatchesCreatesNewLinesAndRetiresTheRest()
    {
        var options = new DbContextOptionsBuilder<CustomsDbContext>().UseInMemoryDatabase($"erca-{Guid.NewGuid()}")
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning)).Options;
        await using var db = new CustomsDbContext(options);
        var revision = new HsRevision { Id = Guid.NewGuid(), Name = "HS 2022", Number = 2022, Status = "Active", EffectiveDate = new DateOnly(2022, 1, 1) };
        var phone = new HsCode { Id = Guid.NewGuid(), RevisionId = revision.Id, Code = "851711", DescriptionEn = "Line telephone sets" };
        db.HsRevisions.Add(revision); db.HsCodes.Add(phone);
        db.TariffTaxTypes.AddRange(TariffTaxCodes.All);
        var existing = new NationalTariffLine { Id = Guid.NewGuid(), HsCodeId = phone.Id, Code = "85171100-05081", TariffItemNo = "8517.1100", DescriptionEn = "Old text", Duty = "10%", EffectiveDate = new DateOnly(2022, 1, 1) };
        var stale = new NationalTariffLine { Id = Guid.NewGuid(), HsCodeId = phone.Id, Code = "85171999", TariffItemNo = "8517.1999", DescriptionEn = "Discontinued", EffectiveDate = new DateOnly(2022, 1, 1) };
        db.NationalTariffLines.AddRange(existing, stale);
        await db.SaveChangesAsync();

        var rows = new List<ErcaTariffRow>
        {
            new("85171100000", "-- Line telephone sets with cordless handsets", "UNT", new() { ["DR"] = "15", ["ER"] = "0", ["VAT"] = "15", ["WHR"] = "3", ["SR"] = "", ["D2R"] = "0" }),
            new("84713010000", "--- Presented SKD for the assembly industry", "UNT", new() { ["DR"] = "5", ["VAT"] = "15" }),
        };
        var summary = await new ErcaTariffImporter(db).ApplyAsync(rows, new DateOnly(2026, 10, 14), false, "test", CancellationToken.None);

        Assert.Equal(1, summary.Updated);
        Assert.Equal(1, summary.Created);
        Assert.Equal(1, summary.HsCodesCreated);
        Assert.Equal(1, summary.Retired);
        var updated = await db.NationalTariffLines.Include(x => x.TaxRates).SingleAsync(x => x.Id == existing.Id);
        Assert.Equal("85171100000", updated.NationalCode);
        Assert.Equal("Line telephone sets with cordless handsets", updated.DescriptionEn);
        Assert.Equal("15%", updated.Duty);
        Assert.Equal(15m, TariffTaxCodes.RateFor(updated, "DR"));
        Assert.Equal(0m, TariffTaxCodes.RateFor(updated, "ER"));
        Assert.Null(TariffTaxCodes.RateFor(updated, "SR"));
        Assert.Equal(5, updated.TaxRates.Count);
        Assert.NotNull((await db.NationalTariffLines.SingleAsync(x => x.Id == stale.Id)).EndDate);
        var created = await db.NationalTariffLines.SingleAsync(x => x.NationalCode == "84713010000");
        Assert.Equal("8471.3010", created.TariffItemNo);
        Assert.Equal("847130", (await db.HsCodes.SingleAsync(x => x.Id == created.HsCodeId)).Code);
    }
}
