namespace SES.Customs.Core.Models;

public sealed record SequentialImportTaxAmounts(
    decimal DutyBase,
    decimal Duty,
    decimal ExciseBase,
    decimal Excise,
    decimal SurtaxBase,
    decimal Surtax,
    decimal VatBase,
    decimal Vat)
{
    public decimal Total => Duty + Excise + Surtax + Vat;
    public decimal LandedCost(decimal cif) => cif + Total;
}

/// <summary>
/// Applies the officer-workflow's configured order: duty, excise, surtax, VAT.
/// Specific excise amounts are supplied as an already-converted amount in the
/// assessment currency and are included in the excise amount before surtax.
/// </summary>
public static class SequentialImportTaxCalculator
{
    public static SequentialImportTaxAmounts Calculate(
        decimal cif,
        decimal dutyRate,
        decimal exciseRate,
        decimal surtaxRate,
        decimal vatRate,
        decimal exciseSpecificAmount = 0m,
        bool dutyApplies = true,
        bool exciseApplies = true,
        bool surtaxApplies = true,
        bool vatApplies = true)
    {
        if (cif < 0 || dutyRate < 0 || exciseRate < 0 || surtaxRate < 0 || vatRate < 0 || exciseSpecificAmount < 0)
            throw new ArgumentOutOfRangeException(nameof(cif), "CIF, tax rates, and specific excise amount cannot be negative.");

        var dutyBase = Money(cif);
        var duty = dutyApplies ? Money(dutyBase * dutyRate / 100m) : 0m;
        var exciseBase = Money(cif + duty);
        var excise = exciseApplies ? Money(exciseBase * exciseRate / 100m + exciseSpecificAmount) : 0m;
        var surtaxBase = Money(cif + duty + excise);
        var surtax = surtaxApplies ? Money(surtaxBase * surtaxRate / 100m) : 0m;
        var vatBase = Money(cif + duty + excise + surtax);
        var vat = vatApplies ? Money(vatBase * vatRate / 100m) : 0m;

        return new(dutyBase, duty, exciseBase, excise, surtaxBase, surtax, vatBase, vat);
    }

    private static decimal Money(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);
}
