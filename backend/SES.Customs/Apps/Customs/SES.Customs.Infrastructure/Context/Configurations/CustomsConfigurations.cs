using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SES.Customs.Core.Models;
namespace SES.Customs.Infrastructure.Context.Configurations;

public sealed class HsRevisionConfiguration : IEntityTypeConfiguration<HsRevision>
{
    public void Configure(EntityTypeBuilder<HsRevision> b)
    {
        b.ToTable("hs_revisions"); b.HasKey(x => x.Id); b.HasIndex(x => x.Number).IsUnique();
        b.Property(x => x.Name).HasMaxLength(100); b.Property(x => x.Status).HasMaxLength(30);
    }
}
public sealed class HsCodeConfiguration : IEntityTypeConfiguration<HsCode>
{
    public void Configure(EntityTypeBuilder<HsCode> b)
    {
        b.ToTable("hs_codes"); b.HasKey(x => x.Id); b.Property(x => x.Code).HasMaxLength(6);
        b.HasIndex(x => new { x.RevisionId, x.Code }).IsUnique();
        b.HasOne<HsRevision>().WithMany().HasForeignKey(x => x.RevisionId).OnDelete(DeleteBehavior.Restrict);
    }
}
public sealed class CorrelationConfiguration : IEntityTypeConfiguration<HsCodeCorrelation>
{
    public void Configure(EntityTypeBuilder<HsCodeCorrelation> b)
    {
        b.ToTable("hs_code_correlations"); b.HasKey(x => x.Id); b.HasIndex(x => x.MappingGroupId);
        b.Property(x => x.Kind).HasConversion<string>();
        b.HasOne<HsCode>().WithMany().HasForeignKey(x => x.FromCodeId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<HsCode>().WithMany().HasForeignKey(x => x.ToCodeId).OnDelete(DeleteBehavior.Restrict);
    }
}
public sealed class TariffConfiguration : IEntityTypeConfiguration<NationalTariffLine>
{
    public void Configure(EntityTypeBuilder<NationalTariffLine> b)
    {
        b.ToTable("national_tariff_lines"); b.HasKey(x => x.Id);
        b.HasIndex(x => new { x.HsCodeId, x.Code, x.EffectiveDate }).IsUnique();
        b.HasOne<HsCode>().WithMany().HasForeignKey(x => x.HsCodeId).OnDelete(DeleteBehavior.Restrict);
    }
}
public sealed class PriceConfiguration : IEntityTypeConfiguration<PriceEvidence>
{
    public void Configure(EntityTypeBuilder<PriceEvidence> b)
    {
        b.UseTpcMappingStrategy(); b.HasKey(x => x.Id);
        b.Property(x => x.Quantity).HasPrecision(24, 8);
        b.Property(x => x.OriginalValue).HasPrecision(24, 8);
        b.Property(x => x.UnitPrice).HasPrecision(24, 8);
        b.Property(x => x.ConvertedValue).HasPrecision(24, 8);
        b.Property(x => x.OriginalCurrency).HasMaxLength(3);
        b.Property(x => x.ConvertedCurrency).HasMaxLength(3);
        b.HasIndex(x => new { x.HsCodeId, x.PriceDate });
        b.HasOne<HsCode>().WithMany().HasForeignKey(x => x.HsCodeId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<PriceSource>().WithMany().HasForeignKey(x => x.SourceId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<ExchangeRate>().WithMany().HasForeignKey(x => x.ExchangeRateId).OnDelete(DeleteBehavior.Restrict);
    }
}
public sealed class InternationalConfiguration : IEntityTypeConfiguration<InternationalReferencePrice>
{
    public void Configure(EntityTypeBuilder<InternationalReferencePrice> b)
    {
        b.ToTable("reference_prices");
        b.Property(x => x.Freight).HasPrecision(24, 8); b.Property(x => x.Insurance).HasPrecision(24, 8);
    }
}
public sealed class LocalConfiguration : IEntityTypeConfiguration<LocalMarketPrice>
{
    public void Configure(EntityTypeBuilder<LocalMarketPrice> b)
    {
        b.ToTable("local_prices"); b.Property(x => x.PriceType).HasConversion<string>();
        b.HasOne<LocalMarket>().WithMany().HasForeignKey(x => x.MarketId).OnDelete(DeleteBehavior.Restrict);
    }
}
public sealed class HistoricalConfiguration : IEntityTypeConfiguration<HistoricalCustomsPrice>
{
    public void Configure(EntityTypeBuilder<HistoricalCustomsPrice> b) => b.ToTable("historical_customs_prices");
}
public sealed class SourceConfiguration : IEntityTypeConfiguration<PriceSource>
{
    public void Configure(EntityTypeBuilder<PriceSource> b)
    { b.ToTable("price_sources"); b.HasKey(x => x.Id); b.Property(x => x.Pool).HasConversion<string>(); }
}
public sealed class MarketConfiguration : IEntityTypeConfiguration<LocalMarket>
{
    public void Configure(EntityTypeBuilder<LocalMarket> b) { b.ToTable("local_markets"); b.HasKey(x => x.Id); }
}
public sealed class ExchangeRateConfiguration : IEntityTypeConfiguration<ExchangeRate>
{
    public void Configure(EntityTypeBuilder<ExchangeRate> b)
    {
        b.ToTable("exchange_rates"); b.HasKey(x => x.Id); b.Property(x => x.Rate).HasPrecision(24, 12);
        b.HasIndex(x => new { x.OriginalCurrency, x.ConvertedCurrency, x.RateDate });
    }
}
public sealed class DecisionConfiguration : IEntityTypeConfiguration<ValuationDecision>
{
    public void Configure(EntityTypeBuilder<ValuationDecision> b)
    {
        b.ToTable("valuation_decisions"); b.HasKey(x => x.Id);
        b.Property(x => x.SelectedReferenceValue).HasPrecision(24, 8);
        b.HasOne<HsCode>().WithMany().HasForeignKey(x => x.HsCodeId).OnDelete(DeleteBehavior.Restrict);
        b.HasMany(x => x.Evidence).WithOne().HasForeignKey(x => x.DecisionId).OnDelete(DeleteBehavior.Restrict);
    }
}
public sealed class EvidenceConfiguration : IEntityTypeConfiguration<DecisionEvidence>
{
    public void Configure(EntityTypeBuilder<DecisionEvidence> b)
    {
        b.ToTable("decision_evidence", t => t.HasCheckConstraint("ck_one_evidence_pool",
            "num_nonnulls(\"InternationalPriceId\", \"LocalPriceId\", \"HistoricalCustomsPriceId\") = 1"));
        b.HasKey(x => x.Id); b.Property(x => x.EvidenceSnapshotJson).HasColumnType("jsonb");
        b.HasOne<InternationalReferencePrice>().WithMany().HasForeignKey(x => x.InternationalPriceId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<LocalMarketPrice>().WithMany().HasForeignKey(x => x.LocalPriceId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne<HistoricalCustomsPrice>().WithMany().HasForeignKey(x => x.HistoricalCustomsPriceId).OnDelete(DeleteBehavior.Restrict);
    }
}
public sealed class AuditConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> b)
    {
        b.ToTable("audit_logs"); b.HasKey(x => x.Id); b.HasIndex(x => new { x.RecordId, x.OccurredAt });
        b.Property(x => x.PreviousValueJson).HasColumnType("jsonb");
        b.Property(x => x.NewValueJson).HasColumnType("jsonb");
    }
}
