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
    public DbSet<ValuationAuditSnapshot> ValuationAuditSnapshots => Set<ValuationAuditSnapshot>();
    public DbSet<AuthAccountEntity> AuthAccounts => Set<AuthAccountEntity>();
    public DbSet<RegistrationRequestEntity> RegistrationRequests => Set<RegistrationRequestEntity>();
    public DbSet<ImporterDeclaration> ImporterDeclarations => Set<ImporterDeclaration>();
    public DbSet<ImporterDocument> ImporterDocuments => Set<ImporterDocument>();
    public DbSet<ImporterNotification> ImporterNotifications => Set<ImporterNotification>();
    public DbSet<ImporterProfile> ImporterProfiles => Set<ImporterProfile>();
    public DbSet<ImporterProfileDocument> ImporterProfileDocuments => Set<ImporterProfileDocument>();
    public DbSet<NationalTariffLine> NationalTariffLines => Set<NationalTariffLine>();
    public DbSet<TariffTaxType> TariffTaxTypes => Set<TariffTaxType>();
    public DbSet<TariffTaxRate> TariffTaxRates => Set<TariffTaxRate>();
    public DbSet<HsCodeUpdateMapping> HsCodeUpdateMappings => Set<HsCodeUpdateMapping>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<MarketPriceSnapshot>(e => {
            e.ToTable("market_price_snapshots"); e.HasKey(x => x.Id);
            e.HasIndex(x => x.ObservedDate); e.Property(x => x.Price).HasPrecision(20, 6);
        });
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CustomsDbContext).Assembly);
        modelBuilder.Entity<CustomsLocation>(e => {
            e.ToTable("customs_locations", t =>
            {
                t.HasCheckConstraint("CK_customs_locations_location_type", "\"LocationType\" IN ('REGION', 'BRANCH')");
                t.HasCheckConstraint("CK_customs_locations_coordinates_complete", "(\"Latitude\" IS NULL AND \"Longitude\" IS NULL) OR (\"Latitude\" IS NOT NULL AND \"Longitude\" IS NOT NULL)");
                t.HasCheckConstraint("CK_customs_locations_coordinates_ethiopia", "\"Latitude\" IS NULL OR (\"Latitude\" >= 3.35 AND \"Latitude\" <= 14.95 AND \"Longitude\" >= 33.00 AND \"Longitude\" <= 48.05)");
            });
            e.HasKey(x => x.Id);
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
            e.HasOne<ImporterDeclaration>().WithMany().HasForeignKey(x => x.ImporterDeclarationId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.ImporterDeclarationId).IsUnique();
            e.Property(x => x.Version).IsConcurrencyToken(); e.HasIndex(x => new { x.LocationId, x.Status });
        });
        modelBuilder.Entity<AuditLog>().HasIndex(x => new { x.LocationId, x.OccurredAt });
        modelBuilder.Entity<AuthAccountEntity>(entity => { entity.HasKey(x => x.Id); entity.HasIndex(x => x.Username).IsUnique(); entity.HasIndex(x => x.Email).IsUnique(); entity.Property(x => x.Username).HasMaxLength(120).IsRequired(); entity.Property(x => x.Email).HasMaxLength(240).IsRequired(); entity.Property(x => x.Role).HasMaxLength(60).IsRequired(); });
        modelBuilder.Entity<HsRevision>(entity => { entity.Property(x => x.OriginalHsVersion).HasMaxLength(30); entity.Property(x => x.UpdatedHsVersion).HasMaxLength(30); entity.Property(x => x.MetadataJson).HasColumnType("jsonb"); });
        modelBuilder.Entity<HsCode>(entity => { entity.Property(x => x.Code).HasMaxLength(6); entity.Property(x => x.SectionNumber).HasMaxLength(20); entity.Property(x => x.SectionName).HasMaxLength(300); entity.Property(x => x.ChapterName).HasMaxLength(300); entity.Property(x => x.HeadingNumber).HasMaxLength(20); entity.Property(x => x.HsUpdateStatus).HasMaxLength(50); entity.Property(x => x.HsUpdateCandidatesJson).HasColumnType("jsonb"); });
        modelBuilder.Entity<NationalTariffLine>(entity => { entity.Property(x => x.TariffItemNo).HasMaxLength(30); });
        modelBuilder.Entity<HsCodeUpdateMapping>(entity => { entity.ToTable("hs_code_update_mappings"); entity.HasKey(x => x.Id); entity.HasIndex(x => new { x.RevisionId, x.SourceHsCode }); entity.HasIndex(x => new { x.RevisionId, x.TargetHsCode }); entity.Property(x => x.SourceHsCode).HasMaxLength(20); entity.Property(x => x.TargetHsCode).HasMaxLength(20); entity.Property(x => x.Status).HasMaxLength(50); entity.Property(x => x.Note).HasColumnType("text"); entity.Property(x => x.SourceReference).HasColumnType("text"); });
        modelBuilder.Entity<RegistrationRequestEntity>(entity => { entity.HasKey(x => x.Id); entity.HasIndex(x => new { x.Status, x.SubmittedAt }); entity.HasIndex(x => x.Username); entity.Property(x => x.Status).HasMaxLength(30).IsRequired(); entity.Property(x => x.Email).HasMaxLength(240).IsRequired(); entity.Property(x => x.Username).HasMaxLength(120).IsRequired(); });
        modelBuilder.Entity<ImporterDeclaration>(entity => {
            entity.ToTable("importer_declarations"); entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.Reference).IsUnique(); entity.HasIndex(x => new { x.ImporterId, x.SubmittedAt }); entity.HasIndex(x => new { x.LocationId, x.Status, x.SubmittedAt });
            entity.HasOne<AuthAccountEntity>().WithMany().HasForeignKey(x => x.ImporterId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<CustomsLocation>().WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<HsCode>().WithMany().HasForeignKey(x => x.SuggestedHsCodeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<HsCode>().WithMany().HasForeignKey(x => x.ConfirmedHsCodeId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<NationalTariffLine>().WithMany().HasForeignKey(x => x.SuggestedTariffLineId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<NationalTariffLine>().WithMany().HasForeignKey(x => x.ConfirmedTariffLineId).OnDelete(DeleteBehavior.Restrict);
            entity.Property(x => x.Version).IsConcurrencyToken(); entity.Property(x => x.Status).HasMaxLength(40);
            entity.Property(x => x.Reference).HasMaxLength(40); entity.Property(x => x.OriginCountryCode).HasMaxLength(2);
            entity.Property(x => x.ImportPurpose).HasMaxLength(40); entity.Property(x => x.RequestedTreatmentsJson).HasColumnType("jsonb");
            entity.Property(x => x.Quantity).HasPrecision(20, 4);
            entity.Property(x => x.InvoiceAmount).HasPrecision(20, 2); entity.Property(x => x.InvoiceCurrency).HasMaxLength(3);
            entity.Property(x => x.FreightAmount).HasPrecision(20, 2); entity.Property(x => x.InsuranceAmount).HasPrecision(20, 2);
            entity.Property(x => x.AssessmentCurrency).HasMaxLength(3); entity.Property(x => x.AssessedCustomsValue).HasPrecision(20, 2);
            entity.Property(x => x.AssessedTotalTax).HasPrecision(20, 2); entity.Property(x => x.AssessedPayable).HasPrecision(20, 2);
            entity.Property(x => x.AssessmentJson).HasColumnType("jsonb");
            entity.HasMany(x => x.Documents).WithOne().HasForeignKey(x => x.DeclarationId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<ImporterNotification>(entity => {
            entity.ToTable("importer_notifications"); entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.ImporterId, x.CreatedAt });
            entity.HasOne<AuthAccountEntity>().WithMany().HasForeignKey(x => x.ImporterId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ImporterDeclaration>().WithMany().HasForeignKey(x => x.DeclarationId).OnDelete(DeleteBehavior.Cascade);
            entity.Property(x => x.Kind).HasMaxLength(60); entity.Property(x => x.Title).HasMaxLength(200);
            entity.Property(x => x.Message).HasMaxLength(2000); entity.Property(x => x.Link).HasMaxLength(300);
        });
        modelBuilder.Entity<ImporterDocument>(entity => {
            entity.ToTable("importer_documents"); entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.DeclarationId, x.Kind }).IsUnique();
            entity.Property(x => x.Kind).HasMaxLength(40); entity.Property(x => x.FileName).HasMaxLength(255);
            entity.Property(x => x.ContentType).HasMaxLength(100); entity.Property(x => x.Sha256).HasMaxLength(64);
        });
        modelBuilder.Entity<ImporterProfile>(entity => {
            entity.ToTable("importer_profiles"); entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.AccountId).IsUnique(); entity.HasIndex(x => new { x.RegionKey, x.VerificationStatus, x.SubmittedAt });
            entity.HasIndex(x => x.Tin); entity.HasIndex(x => x.IdNumber);
            entity.HasOne<AuthAccountEntity>().WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne<CustomsLocation>().WithMany().HasForeignKey(x => x.RegionLocationId).OnDelete(DeleteBehavior.Restrict);
            entity.Property(x => x.Version).IsConcurrencyToken();
            entity.Property(x => x.ImporterType).HasMaxLength(30); entity.Property(x => x.VerificationStatus).HasMaxLength(30);
            entity.Property(x => x.LegalName).HasMaxLength(200); entity.Property(x => x.TradeName).HasMaxLength(200);
            entity.Property(x => x.Tin).HasMaxLength(10); entity.Property(x => x.TradeLicenseNumber).HasMaxLength(60);
            entity.Property(x => x.BusinessRegistrationNumber).HasMaxLength(60); entity.Property(x => x.VatNumber).HasMaxLength(30);
            entity.Property(x => x.AgentLicenseNumber).HasMaxLength(60); entity.Property(x => x.IdType).HasMaxLength(30);
            entity.Property(x => x.IdNumber).HasMaxLength(30); entity.Property(x => x.Nationality).HasMaxLength(2);
            entity.Property(x => x.ResidencyStatus).HasMaxLength(30); entity.Property(x => x.RepresentativeRole).HasMaxLength(120);
            entity.Property(x => x.Phone).HasMaxLength(20); entity.Property(x => x.RegionKey).HasMaxLength(120);
            entity.Property(x => x.City).HasMaxLength(120); entity.Property(x => x.Woreda).HasMaxLength(120);
            entity.Property(x => x.AddressLine).HasMaxLength(300); entity.Property(x => x.ReviewNote).HasMaxLength(2000);
            entity.HasMany(x => x.Documents).WithOne().HasForeignKey(x => x.ProfileId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<ImporterProfileDocument>(entity => {
            entity.ToTable("importer_profile_documents"); entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.ProfileId, x.Kind }).IsUnique();
            entity.Property(x => x.Kind).HasMaxLength(40); entity.Property(x => x.FileName).HasMaxLength(255);
            entity.Property(x => x.ContentType).HasMaxLength(100); entity.Property(x => x.Sha256).HasMaxLength(64);
        });
    }
}
