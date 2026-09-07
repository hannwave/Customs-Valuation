using SES.Customs.Core.Models;
namespace SES.Customs.Core.Features.ExchangeRates.Service;
public sealed record ConversionSnapshot(decimal OriginalValue, string OriginalCurrency, Guid RateId,
    decimal Rate, DateOnly RateDate, decimal ConvertedValue, string ConvertedCurrency, string NbeSourceReference, DateTimeOffset RetrievedAt);
public static class PriceConverter
{
    // Caller must resolve the approved applicable date. No nearest-date fallback.
    // No rounding here; the approved reporting precision is a phase 0 decision.
    public static ConversionSnapshot Convert(decimal original, string currency, DateOnly requiredRateDate, ExchangeRate? rate)
    {
        if (rate is null) throw new InvalidOperationException("The required approved exchange rate is unavailable.");
        if (original < 0 || rate.Rate <= 0 || rate.Id == Guid.Empty || rate.RetrievedAt == default
            || rate.OriginalCurrency != currency || rate.ConvertedCurrency != "ETB"
            || rate.RateDate != requiredRateDate || string.IsNullOrWhiteSpace(rate.NbeSourceReference))
            throw new ArgumentException("An explicit matching NBE rate and valid provenance are required.");
        return new(original, currency, rate.Id, rate.Rate, rate.RateDate,
            checked(original * rate.Rate), rate.ConvertedCurrency, rate.NbeSourceReference, rate.RetrievedAt);
    }
}
