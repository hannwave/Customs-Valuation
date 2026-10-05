using System.Globalization;
using System.Text.RegularExpressions;

namespace SES.Customs.Core.Models;

public sealed record ImportTaxAssessmentInput(
    NationalTariffLine Tariff,
    decimal CustomsValue,
    decimal Quantity,
    string Unit,
    string ProductCategory,
    string OriginCountry,
    bool OriginPreferenceClaimed,
    bool IsCommercialImport,
    bool WithholdingApplicable,
    bool IsManufacturing,
    bool IsMachineryOrEquipment,
    bool ExciseTaxApplicable,
    IReadOnlyCollection<string> ExemptionCodes,
    IReadOnlyCollection<ImportTaxLineOverride> Overrides,
    decimal? EtbToTargetRate,
    string EtbRateSource,
    string Currency);

public sealed record ImportTaxLineOverride(
    string Name,
    string CalculationType,
    decimal Value,
    string? Currency,
    int? Order,
    string? CalculationBasis,
    string? Notes,
    bool? IsApplicable,
    string? Status);

public static class ImportTaxAssessmentCalculator
{
    public const decimal CargoScanningFeeRate = 0.07m;
    private const decimal VatRate = 15m;
    private const decimal SurtaxRate = 10m;
    private const decimal SocialWelfareLevyRate = 3m;
    private const decimal WithholdingRate = 3m;
    private const decimal SurtaxDutyThreshold = 15m;
    private const string VatSource = "https://www.mofed.gov.et/media/filer_public/af/45/af45af2f-7959-4e8b-b736-9494dda9f017/vat_proclamation_no_1341-2016_with_annex.pdf";
    private const string ExciseSource = "https://www.mofed.gov.et/media/filer_public/aa/05/aa05db27-ad07-40dc-9aac-fe74c3a38fa0/specific_excise_tax_rates_adjustment-_directive_no_1007_1.pdf";
    private const string SurtaxSource = "https://www.mofed.gov.et/media/filer_public/86/fb/86fb37d6-8405-45ad-b439-560b3e818d45/tax_compliance_guide_for_foreign_investors_in_ethiopia.pdf";
    private const string SocialWelfareSource = "https://www.mofed.gov.et/media/filer_public/9f/70/9f702522-6150-4a70-98fa-d80b1c0eb3b4/macro_fiscal_performance_2024_mof.pdf";
    private const string WithholdingSource = "https://www.mofed.gov.et/mof-directive/tax-directive/";
    private const string ExciseProclamationSource = "https://www.ecc.gov.et/proclamations";

    private static readonly HashSet<string> SurtaxExcludedCategories = new(StringComparer.OrdinalIgnoreCase)
    {
        "fertilizer", "petroleum", "lubricants", "freight vehicle", "passenger vehicle",
        "special purpose vehicle", "aircraft", "spacecraft", "capital goods"
    };
    private static readonly HashSet<string> ComesaFtaCountries = new(StringComparer.OrdinalIgnoreCase)
    {
        "burundi", "comoros", "djibouti", "egypt", "kenya", "madagascar", "malawi",
        "mauritius", "rwanda", "sudan", "zambia", "zimbabwe"
    };

    public static bool HasConfiguredExciseRule(NationalTariffLine? tariff) => ExciseRuleFor(tariff) is not null;
    public static bool RequiresEtbConversion(NationalTariffLine? tariff) => ExciseRuleFor(tariff) is { SpecificRate: > 0 };

    public static List<ValuationPhase2TaxLine> Calculate(ImportTaxAssessmentInput input)
    {
        var tariff = input.Tariff;
        var submitted = input.Overrides;
        var exciseRule = ExciseRuleFor(tariff);
        var codes = new HashSet<string>(input.ExemptionCodes.Select(code => code.Trim()), StringComparer.OrdinalIgnoreCase);
        var machineryExemption = QualifiesForMachineryExemption(input, codes);
        var dutyExempt = codes.Contains("CUSTOMS_DUTY_EXEMPT") || machineryExemption;
        var recommendedDutyRate = ParseRate(tariff.Duty);
        var suppliedDuty = submitted.FirstOrDefault(line => string.Equals(line.Name.Trim(), "Customs Duty", StringComparison.OrdinalIgnoreCase));
        var dutyNeedsReview = !recommendedDutyRate.HasValue;
        var dutyRate = recommendedDutyRate ?? suppliedDuty?.Value ?? 0m;
        if (input.OriginPreferenceClaimed && ComesaFtaCountries.Contains(input.OriginCountry.Trim())) dutyRate = 0m;
        var dutyRateKnown = dutyExempt || recommendedDutyRate.HasValue || suppliedDuty is not null;
        var surtaxExcluded = codes.Contains("SURTAX_EXEMPT") || SurtaxExcludedCategories.Contains(input.ProductCategory.Trim());
        var surtaxThresholdUnknown = !dutyRateKnown;
        var surtaxApplies = !surtaxExcluded && !surtaxThresholdUnknown && !dutyExempt && dutyRate > SurtaxDutyThreshold;
        var vatExempt = codes.Contains("VAT_EXEMPT") || codes.Contains("TAX_EXEMPT") || codes.Contains("DIPLOMATIC") || machineryExemption;
        var socialExempt = codes.Contains("SOCIAL_WELFARE_EXEMPT") || codes.Contains("TAX_EXEMPT") || codes.Contains("DIPLOMATIC");
        var withholdingApplicable = input.IsCommercialImport && input.WithholdingApplicable && !input.IsManufacturing && !codes.Contains("WITHHOLDING_NOT_APPLICABLE");
        var socialApplicable = !socialExempt && !surtaxApplies && !surtaxThresholdUnknown;
        var exciseRate = exciseRule?.AdValoremRate ?? 0m;
        var exciseCategoryReview = exciseRule is null && ExciseMayApply(tariff, input.ProductCategory);
        var exciseApplies = exciseRule is not null || input.ExciseTaxApplicable || exciseCategoryReview;
        var exciseNeedsReview = exciseRule is null && (input.ExciseTaxApplicable || exciseCategoryReview);
        var exciseUnitMatches = exciseRule is not null && UnitMatches(input.Unit, exciseRule.Unit);
        var hasSpecificRate = exciseRule is { SpecificRate: > 0 };
        var specificNeedsReview = hasSpecificRate && (!exciseUnitMatches || !input.EtbToTargetRate.HasValue);
        var exciseNote = exciseRule?.Notes ?? (exciseNeedsReview
            ? "This tariff/category may be excisable, but no current verified rate is configured. Enter the officer-approved rate and source, or disable excise if it does not apply. No amount is assumed."
            : "No verified excise rate was found for this tariff item; review the current excise schedule before applying.");
        if (exciseRule is not null && specificNeedsReview)
            exciseNote += !exciseUnitMatches ? $" Shipment unit must be {exciseRule.Unit} for its specific-rate component." : $" {input.EtbRateSource}.";
        var surtaxNote = surtaxThresholdUnknown
            ? "Confirm the officer-approved Customs Duty rate before deciding whether the 10% import surtax applies."
            : surtaxApplies
                ? "10% import surtax is recommended under the configured duty threshold and applicable product-category checks."
                : surtaxExcluded
                    ? "Product category or recorded exemption excludes import surtax."
                    : "Customs duty is 15% or less; import surtax is generally not recommended under the configured threshold.";
        var machineryReason = "Qualifying machinery exemption approved by the officer; verify the governing authority and evidence recorded in assessment notes.";
        var lines = new List<ValuationPhase2TaxLine>
        {
            Line("Customs Duty", dutyRate, 1, "CIF", tariff.SourceReference, !dutyExempt, dutyExempt ? "Exempt" : dutyNeedsReview ? "ReviewRequired" : "Recommended", machineryExemption ? machineryReason : dutyExempt ? "Officer-selected exemption. Verify the governing authority and evidence before confirming." : dutyNeedsReview ? "The HS 2022 tariff record has no single numeric duty rate. Enter the officer-approved rate before completing this assessment." : $"{dutyRate:0.##}% from the selected national tariff item.", input.Currency),
            Line("Excise Tax", exciseRate, 2, "CIFPlusDuty", exciseRule?.SourceReference ?? ExciseSource, exciseApplies, exciseNeedsReview || specificNeedsReview ? "ReviewRequired" : exciseApplies ? "Recommended" : "NotApplicable", exciseNote, input.Currency),
            Line("Surtax", SurtaxRate, 4, "CIFPlusDutyPlusExcise", SurtaxSource, surtaxApplies, surtaxThresholdUnknown ? "ReviewRequired" : surtaxApplies ? "Recommended" : "NotApplicable", surtaxNote, input.Currency),
            Line("VAT", VatRate, 5, "CIFPlusDutyPlusExcisePlusSurtax", VatSource, !vatExempt, machineryExemption ? "Exempt" : vatExempt ? "NotApplicable" : "Recommended", machineryExemption ? machineryReason : vatExempt ? "Exemption selected; verify supporting authority." : "15% VAT is calculated after Customs Duty, Excise Tax, and Surtax in the configured assessment order.", input.Currency),
            Line("Withholding Tax", WithholdingRate, 6, "CIF", WithholdingSource, withholdingApplicable, withholdingApplicable ? "Recommended" : "NotApplicable", input.IsManufacturing ? "Not applicable: manufacturing importer/transaction exemption." : withholdingApplicable ? "3% of CIF for commercial imports; an advance income-tax payment." : "Not selected for this import or excluded by the commercial-import setting.", input.Currency),
            Line("Social Welfare Levy", SocialWelfareLevyRate, 7, "CIF", SocialWelfareSource, socialApplicable, socialExempt || surtaxApplies ? "NotApplicable" : surtaxThresholdUnknown ? "ReviewRequired" : "Recommended", socialExempt ? "Exemption selected; verify supporting authority." : surtaxApplies ? "Not applied because the import is already subject to surtax." : surtaxThresholdUnknown ? "Confirm surtax eligibility after the Customs Duty rate is resolved." : "3% of CIF when the import is not subject to surtax, subject to exemptions.", input.Currency),
            Line("Cargo Scanning Fee", CargoScanningFeeRate, 8, "CIF", "Cargo scanning fee rate specified by the business requirement.", true, "Recommended", "0.07% of CIF customs value; assessed separately and excluded from the VAT base.", input.Currency)
        };
        if (hasSpecificRate)
        {
            var comparisonOnly = exciseRule!.Mode == ExciseSpecificMode.GreaterOf;
            var specificNote = comparisonOnly
                ? $"{exciseRule.SpecificRate:0.##} ETB per {exciseRule.Unit}. Comparison amount only; the payable excise is the greater of this amount or the ad valorem excise. {exciseRule.Notes} {input.EtbRateSource}."
                : $"{exciseRule.SpecificRate:0.##} ETB per {exciseRule.Unit}. Added to the ad valorem excise. {exciseRule.Notes} {input.EtbRateSource}.";
            lines.Add(Line("Excise Tax (specific)", exciseRule.SpecificRate, 3, comparisonOnly ? "UNIT_RATE_ETB_GREATER_OF" : "UNIT_RATE_ETB", exciseRule.SourceReference ?? ExciseSource,
                exciseUnitMatches && input.EtbToTargetRate.HasValue, specificNeedsReview ? "ReviewRequired" : "Recommended", specificNote, "ETB", "PerUnit"));
        }

        var supplied = submitted.Where(line => !string.IsNullOrWhiteSpace(line.Name))
            .GroupBy(line => line.Name.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        foreach (var line in lines)
        {
            if (!supplied.TryGetValue(line.Name, out var overrideLine)) continue;
            var recommendedApplicable = line.IsApplicable;
            line.Value = overrideLine.Value;
            line.CalculationType = overrideLine.CalculationType;
            if (!string.IsNullOrWhiteSpace(overrideLine.Notes)) line.Notes = overrideLine.Notes.Trim();
            if (overrideLine.IsApplicable.HasValue) line.IsApplicable = overrideLine.IsApplicable.Value;
            var applicabilityChanged = overrideLine.IsApplicable.HasValue && overrideLine.IsApplicable.Value != recommendedApplicable;
            if (Math.Abs(line.Value - line.RecommendedValue) > 0.0001m || !string.Equals(line.CalculationType, line.Name == "Excise Tax (specific)" ? "PerUnit" : "Percentage", StringComparison.OrdinalIgnoreCase) || applicabilityChanged || string.Equals(overrideLine.Status, "OfficerAdjusted", StringComparison.OrdinalIgnoreCase)) line.Status = "OfficerAdjusted";
            if (line.Name == "Excise Tax" && input.ExciseTaxApplicable) { line.IsApplicable = true; line.Status = "OfficerAdjusted"; }
        }
        if (dutyExempt)
        {
            var exemptDuty = lines.First(line => line.Name == "Customs Duty");
            exemptDuty.IsApplicable = false;
            exemptDuty.Status = machineryExemption ? "Exempt" : "NotApplicable";
            exemptDuty.Notes = machineryExemption ? machineryReason : "Officer-selected exemption. Verify the governing authority and evidence before confirming.";
        }
        if (machineryExemption)
        {
            var exemptVat = lines.First(line => line.Name == "VAT");
            exemptVat.IsApplicable = false;
            exemptVat.Status = "Exempt";
            exemptVat.Notes = machineryReason;
        }
        foreach (var custom in submitted.Where(line => !string.IsNullOrWhiteSpace(line.Name) && !lines.Any(existing => string.Equals(existing.Name, line.Name.Trim(), StringComparison.OrdinalIgnoreCase))))
            lines.Add(Line(custom.Name.Trim(), custom.Value, 90 + (custom.Order ?? 0), custom.CalculationBasis ?? "CIF", "Officer-entered charge. An optional note may record the legal source.", true, "OfficerAdjusted", custom.Notes ?? "", custom.Currency ?? input.Currency, custom.CalculationType));

        if (input.IsManufacturing)
        {
            foreach (var line in lines)
            {
                line.IsApplicable = false;
                line.Status = "NotApplicable";
                line.Notes = "Not applicable: manufacturing product type has no assessment taxes or fees.";
            }
            if (machineryExemption)
            {
                foreach (var name in new[] { "Customs Duty", "VAT" })
                {
                    var exemptLine = lines.First(line => line.Name == name);
                    exemptLine.Status = "Exempt";
                    exemptLine.Notes = machineryReason;
                }
            }
        }

        var cif = input.CustomsValue;
        var dutyLine = lines.First(line => line.Name == "Customs Duty");
        var exciseLine = lines.First(line => line.Name == "Excise Tax");
        var surtaxLine = lines.First(line => line.Name == "Surtax");
        var vatLine = lines.First(line => line.Name == "VAT");
        var specificLine = lines.FirstOrDefault(line => line.Name == "Excise Tax (specific)");
        var specificAmount = specificLine?.IsApplicable == true && specificLine.CalculationType == "PerUnit" && input.EtbToTargetRate.HasValue
            ? Money(specificLine.Value * input.Quantity * input.EtbToTargetRate.Value) : 0m;
        var dutyAmount = dutyLine.IsApplicable ? Money(cif * dutyLine.Value / 100m) : 0m;
        var excisePercentageAmount = exciseLine.IsApplicable && exciseLine.CalculationType == "Percentage"
            ? Money((cif + dutyAmount) * exciseLine.Value / 100m) : 0m;
        var exciseAdditionalAmount = exciseRule?.Mode == ExciseSpecificMode.GreaterOf && specificLine?.IsApplicable == true && exciseUnitMatches && input.EtbToTargetRate.HasValue
            ? Math.Max(0m, Money(Math.Max(excisePercentageAmount, specificAmount) - excisePercentageAmount))
            : specificAmount;
        if (exciseRule?.Mode == ExciseSpecificMode.GreaterOf && specificLine?.IsApplicable == true && exciseUnitMatches && input.EtbToTargetRate.HasValue && exciseLine.IsApplicable)
            exciseLine.Notes += $" Applied excise is the greater of {exciseLine.Value:0.##}% or {specificLine.Value:0.##} ETB × {input.Quantity} {input.Unit}, converted to {input.Currency}.";
        var calculated = SequentialImportTaxCalculator.Calculate(
            cif, dutyLine.Value, exciseLine.Value, surtaxLine.Value, vatLine.Value, exciseAdditionalAmount,
            dutyLine.IsApplicable, exciseLine.IsApplicable, surtaxLine.IsApplicable, vatLine.IsApplicable);
        foreach (var line in lines.OrderBy(line => line.Order).ThenBy(line => line.Name, StringComparer.OrdinalIgnoreCase))
        {
            if (line.Name == "Customs Duty") { line.BaseAmount = calculated.DutyBase; line.CalculatedAmount = calculated.Duty; continue; }
            if (line.Name == "Excise Tax") { line.BaseAmount = calculated.ExciseBase; line.CalculatedAmount = exciseRule?.Mode == ExciseSpecificMode.Additive ? excisePercentageAmount : calculated.Excise; continue; }
            if (line.Name == "Excise Tax (specific)") { line.BaseAmount = input.Quantity; line.CalculatedAmount = line.IsApplicable ? specificAmount : 0m; continue; }
            if (line.Name == "Surtax") { line.BaseAmount = calculated.SurtaxBase; line.CalculatedAmount = calculated.Surtax; continue; }
            if (line.Name == "VAT") { line.BaseAmount = calculated.VatBase; line.CalculatedAmount = calculated.Vat; continue; }
            if (line.CalculationType == "PerUnit")
            {
                line.BaseAmount = input.Quantity;
                line.CalculatedAmount = line.IsApplicable ? Money(line.Value * input.Quantity * (input.EtbToTargetRate ?? 0m)) : 0m;
                continue;
            }
            line.BaseAmount = Money(BaseFor(line.CalculationBasis, cif, calculated.Duty, calculated.Excise, calculated.Surtax, calculated.Vat));
            line.CalculatedAmount = line.IsApplicable ? Money(line.CalculationType == "Fixed" ? line.Value : line.BaseAmount * line.Value / 100m) : 0m;
        }
        var surtax = lines.FirstOrDefault(line => line.Name == "Surtax");
        var social = lines.FirstOrDefault(line => line.Name == "Social Welfare Levy");
        if (social is not null && surtax is not null && surtax.IsApplicable)
        {
            social.IsApplicable = false;
            social.Status = "NotApplicable";
            social.CalculatedAmount = 0m;
            social.Notes = "Not applied because the import is subject to surtax under the configured Social Welfare Levy rule.";
        }
        return lines.OrderBy(line => line.Order).ToList();
    }

    private enum ExciseSpecificMode { Additive, GreaterOf }
    private sealed record ExciseRule(decimal AdValoremRate, decimal SpecificRate, string Unit, ExciseSpecificMode Mode, string Notes, string? SourceReference = null);

    private static bool QualifiesForMachineryExemption(ImportTaxAssessmentInput input, HashSet<string> exemptionCodes) =>
        exemptionCodes.Contains("MACHINERY_EQUIPMENT_EXEMPT") && input.IsManufacturing && input.IsMachineryOrEquipment;

    private static ExciseRule? ExciseRuleFor(NationalTariffLine? tariff)
    {
        if (tariff is null) return null;
        var code = new string((tariff.Code ?? "").Where(char.IsDigit).ToArray());
        var itemNo = new string((tariff.TariffItemNo ?? "").Where(char.IsDigit).ToArray());
        var identifier = itemNo.Length > 0 ? itemNo : code;
        if (identifier.StartsWith("240210", StringComparison.Ordinal)) return new(30m, 644m, "KG", ExciseSpecificMode.Additive, "Directive 1007/2024: 30% plus ETB 644 per kilogram for cigars, cheroots, and cigarillos.");
        if (identifier.StartsWith("240220", StringComparison.Ordinal) || identifier.StartsWith("240290", StringComparison.Ordinal)) return new(30m, 20m, "PACK20", ExciseSpecificMode.Additive, "Directive 1007/2024: 30% plus ETB 20 per pack of 20 cigarettes or covered tobacco-substitute products.");
        if (identifier.StartsWith("240319", StringComparison.Ordinal) || identifier.StartsWith("240391", StringComparison.Ordinal) || identifier.StartsWith("240399", StringComparison.Ordinal)) return new(30m, 644m, "KG", ExciseSpecificMode.Additive, "Directive 1007/2024: 30% plus ETB 644 per kilogram for the listed smoking tobacco, homogenized/reconstituted tobacco, snuff, extracts, and essences.");
        if (identifier.StartsWith("2401", StringComparison.Ordinal)) return new(20m, 0m, "KG", ExciseSpecificMode.Additive, "Excise Tax Proclamation No. 1186/2020: tobacco leaf is taxed at 20%.", ExciseProclamationSource);
        if (identifier.StartsWith("220300", StringComparison.Ordinal)) return new(40m, 28m, "L", ExciseSpecificMode.GreaterOf, "Directive 1007/2024: imported malt beer is taxed at 40% or ETB 28 per litre, whichever is higher.");
        if (identifier.StartsWith("2204", StringComparison.Ordinal)) return new(40m, 0m, "L", ExciseSpecificMode.Additive, "Excise Tax Proclamation No. 1186/2020: grape wine and other listed fermented fruit beverages are taxed at 40%.", ExciseProclamationSource);
        if (identifier.StartsWith("22060010", StringComparison.Ordinal) || identifier.StartsWith("22089010", StringComparison.Ordinal)) return new(40m, 28m, "L", ExciseSpecificMode.GreaterOf, "Directive 1007/2024: covered fermented/ready-to-drink beverages containing no more than 7% alcohol by volume are taxed at 40% or ETB 28 per litre, whichever is higher.");
        if (identifier.StartsWith("220720", StringComparison.Ordinal)) return new(60m, 0m, "L", ExciseSpecificMode.Additive, "Excise Tax Proclamation No. 1186/2020: the tariff-listed pure alcohol class is taxed at 60%.", ExciseProclamationSource);
        if (identifier.StartsWith("2206", StringComparison.Ordinal) || identifier.StartsWith("2207", StringComparison.Ordinal) || identifier.StartsWith("2208", StringComparison.Ordinal)) return new(80m, 0m, "L", ExciseSpecificMode.Additive, "Excise Tax Proclamation No. 1186/2020: the listed spirits/ethyl-alcohol classes are taxed at 80%; pure alcohol tariff item 2207.2000 is separately taxed at 60%.", ExciseProclamationSource);
        if (identifier.StartsWith("39232110", StringComparison.Ordinal) || identifier.StartsWith("39232910", StringComparison.Ordinal)) return new(0m, 103m, "KG", ExciseSpecificMode.Additive, "Directive 1007/2024: ETB 103 per kilogram for shopping plastic bags.");
        return null;
    }

    private static bool ExciseMayApply(NationalTariffLine? tariff, string productCategory)
    {
        var item = new string((tariff?.TariffItemNo ?? tariff?.Code ?? "").Where(char.IsDigit).ToArray());
        var heading = item.Length >= 4 ? item[..4] : item;
        var headingNumber = int.TryParse(heading, NumberStyles.None, CultureInfo.InvariantCulture, out var parsedHeading) ? parsedHeading : 0;
        if (heading is "1701" or "1704" or "2201" or "2202" or "2203" or "2204" or "2205" or "2206" or "2207" or "2208" or "2209"
            or "2401" or "2403" or "2710" or "2711" or "3303" or "3304" or "3305" or "3306" or "3307"
            or "7106" or "7108" or "7110" or "7112" or "8525" or "8528" or "8701" or "8702" or "8703" or "8704" or "8705" or "8706" or "8711")
            return true;
        if (headingNumber is >= 6101 and <= 6117 or >= 6201 and <= 6217) return true;
        var category = productCategory.Trim();
        return category.Contains("alcohol", StringComparison.OrdinalIgnoreCase)
            || category.Contains("beverage", StringComparison.OrdinalIgnoreCase)
            || category.Contains("tobacco", StringComparison.OrdinalIgnoreCase)
            || category.Contains("sugar", StringComparison.OrdinalIgnoreCase)
            || category.Contains("cosmetic", StringComparison.OrdinalIgnoreCase)
            || category.Contains("textile", StringComparison.OrdinalIgnoreCase)
            || category.Contains("vehicle", StringComparison.OrdinalIgnoreCase)
            || category.Contains("petroleum", StringComparison.OrdinalIgnoreCase)
            || category.Contains("plastic bag", StringComparison.OrdinalIgnoreCase)
            || category.Contains("precious metal", StringComparison.OrdinalIgnoreCase);
    }

    private static ValuationPhase2TaxLine Line(string name, decimal value, int order, string basis, string source, bool applicable, string status, string notes, string currency = "ETB", string calculationType = "Percentage") => new()
    {
        Id = Guid.NewGuid(), Name = name, CalculationType = calculationType, Value = value, RecommendedValue = value,
        Currency = currency, Order = order, CalculationBasis = basis, SourceReference = source,
        IsApplicable = applicable, Status = status, Notes = notes
    };

    private static decimal BaseFor(string basis, decimal cif, decimal duty, decimal excise, decimal surtax, decimal vat) => basis.Trim().ToUpperInvariant() switch
    {
        "CIF" => cif,
        "CIFPLUSDUTY" => cif + duty,
        "CIFPLUSDUTYPLUSEXCISE" => cif + duty + excise,
        "CIFPLUSDUTYPLUSEXCISEPLUSSURTAX" => cif + duty + excise + surtax,
        "CIFPLUSDUTYPLUSVATPLUSEXCISE" => cif + duty + vat + excise,
        "INITIALDUTY" => cif + duty,
        _ => cif
    };

    private static bool UnitMatches(string unit, string required)
    {
        var normalized = new string((unit ?? "").Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        return required switch
        {
            "KG" => normalized is "KG" or "KGS" or "KILOGRAM" or "KILOGRAMS" || normalized.Contains("KG") || normalized.Contains("KILOGRAM"),
            "L" => normalized is "L" or "LT" or "LITRE" or "LITRES" or "LITER" or "LITERS" || normalized.Contains("LITRE") || normalized.Contains("LITER"),
            "PACK20" => normalized.Contains("PACK") && normalized.Contains("20"),
            _ => false
        };
    }

    private static decimal? ParseRate(string? duty)
    {
        if (string.IsNullOrWhiteSpace(duty)) return null;
        if (duty.Contains("free", StringComparison.OrdinalIgnoreCase) || duty.Contains("exempt", StringComparison.OrdinalIgnoreCase)) return 0m;
        var match = Regex.Match(duty, @"(?<![0-9])([0-9]+(?:[.,][0-9]+)?)\s*%?");
        return match.Success && decimal.TryParse(match.Groups[1].Value.Replace(',', '.'), NumberStyles.Number, CultureInfo.InvariantCulture, out var rate) ? rate : null;
    }

    private static decimal Money(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);
}