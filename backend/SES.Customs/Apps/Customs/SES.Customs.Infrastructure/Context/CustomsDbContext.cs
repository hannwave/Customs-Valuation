using Microsoft.EntityFrameworkCore;
using SES.Customs.Core.Models;
namespace SES.Customs.Infrastructure.Context;
public sealed class CustomsDbContext(DbContextOptions<CustomsDbContext> options) : DbContext(options)
{
    public DbSet<HsRevision> HsRevisions => Set<HsRevision>();
    public DbSet<CustomsLocation> CustomsLocations => Set<CustomsLocation>();
    public DbSet<CustomsLocationHistory> CustomsLocationHistory => Set<CustomsLocationHistory>();
    public DbSet<UserLocationScope> UserLocationScopes => Set<UserLocationScope>();
    public DbSet<HsCode> HsCodes => Set<HsCode>();
    public DbSet<InternationalReferencePrice> ReferencePrices => Set<InternationalReferencePrice>();
    public DbSet<LocalMarketPrice> LocalPrices => Set<LocalMarketPrice>();
    public DbSet<LocalMarketObservation> LocalMarketObservations => Set<LocalMarketObservation>();
    public DbSet<HistoricalCustomsPrice> HistoricalCustomsPrices => Set<HistoricalCustomsPrice>();
    public DbSet<PriceSource> PriceSources => Set<PriceSource>();
    public DbSet<ValuationDecision> ValuationDecisions => Set<ValuationDecision>();
    public DbSet<ValuationPhase2> ValuationPhase2s => Set<ValuationPhase2>();
    public DbSet<ValuationPhase2TaxLine> ValuationPhase2TaxLines => Set<ValuationPhase2TaxLine>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<AuthAccountEntity> AuthAccounts => Set<AuthAccountEntity>();
    public DbSet<RegistrationRequestEntity> RegistrationRequests => Set<RegistrationRequestEntity>();
    public DbSet<NationalTariffLine> NationalTariffLines => Set<NationalTariffLine>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CustomsDbContext).Assembly);
        modelBuilder.Entity<CustomsLocation>(e => {
            e.ToTable("customs_locations"); e.HasKey(x => x.Id);
            e.HasIndex(x => x.OfficialCode).IsUnique(); e.Property(x => x.OfficialCode).HasMaxLength(40);
            e.HasIndex(x => x.ParentLocationId); e.Property(x => x.Version).IsConcurrencyToken();
            e.HasOne<CustomsLocation>().WithMany().HasForeignKey(x => x.ParentLocationId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<CustomsLocationHistory>(e => {
            e.ToTable("customs_location_history"); e.HasKey(x => x.Id); e.HasIndex(x => new { x.CustomsLocationId, x.ChangedAt });
            e.HasOne<CustomsLocation>().WithMany().HasForeignKey(x => x.CustomsLocationId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<UserLocationScope>(e => {
            e.ToTable("customs_user_location_scopes"); e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.UserId, x.EffectiveTo });
            e.HasOne<AuthAccountEntity>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<CustomsLocation>().WithMany().HasForeignKey(x => x.CustomsLocationId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<AuthAccountEntity>().HasOne<CustomsLocation>().WithMany().HasForeignKey(x => x.PrimaryLocationId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<ValuationDecision>(e => {
            e.HasOne<CustomsLocation>().WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
            e.Property(x => x.Version).IsConcurrencyToken(); e.HasIndex(x => new { x.LocationId, x.Status });
        });
        modelBuilder.Entity<AuditLog>(entity => { entity.HasIndex(x => new { x.LocationId, x.OccurredAt }); entity.HasIndex(x => new { x.SubjectUserId, x.OccurredAt }); });
        modelBuilder.Entity<AuthAccountEntity>(entity => { entity.HasKey(x => x.Id); entity.HasIndex(x => x.Username).IsUnique(); entity.HasIndex(x => x.Email).IsUnique(); entity.HasIndex(x => x.EmployeeNumber); entity.HasIndex(x => new { x.RegionKey, x.Status }); entity.Property(x => x.Version).IsConcurrencyToken(); entity.Property(x => x.RegionKey).HasMaxLength(120); entity.Property(x => x.Username).HasMaxLength(120).IsRequired(); entity.Property(x => x.Email).HasMaxLength(240).IsRequired(); entity.Property(x => x.Role).HasMaxLength(60).IsRequired(); });
        modelBuilder.Entity<RegistrationRequestEntity>(entity => { entity.HasKey(x => x.Id); entity.HasIndex(x => new { x.Status, x.SubmittedAt }); entity.Property(x => x.Status).HasMaxLength(30).IsRequired(); entity.Property(x => x.Email).HasMaxLength(240).IsRequired(); });
    }
}
