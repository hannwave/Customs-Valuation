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
    public DbSet<AccountPhotoEntity> AccountPhotos => Set<AccountPhotoEntity>();
    public DbSet<RegistrationRequestEntity> RegistrationRequests => Set<RegistrationRequestEntity>();
    public DbSet<ImporterDeclaration> ImporterDeclarations => Set<ImporterDeclaration>();
    public DbSet<ImporterDocument> ImporterDocuments => Set<ImporterDocument>();
    public DbSet<ValuationDecisionDocument> ValuationDecisionDocuments => Set<ValuationDecisionDocument>();
    public DbSet<ImporterNotification> ImporterNotifications => Set<ImporterNotification>();
    public DbSet<ImporterProfile> ImporterProfiles => Set<ImporterProfile>();
    public DbSet<ImporterChangeRequest> ImporterChangeRequests => Set<ImporterChangeRequest>();
    public DbSet<ImporterProfileDocument> ImporterProfileDocuments => Set<ImporterProfileDocument>();
    public DbSet<DocumentScan> DocumentScans => Set<DocumentScan>();
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
        modelBuilder.Entity<AccountPhotoEntity>(entity => {
            entity.ToTable("account_photos"); entity.HasKey(x => x.AccountId);
            entity.Property(x => x.ContentType).HasMaxLength(40);
            entity.HasOne<AuthAccountEntity>().WithOne().HasForeignKey<AccountPhotoEntity>(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<AuthAccountEntity>().HasOne<CustomsLocation>().WithMany().HasForeignKey(x => x.PrimaryLocationId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<ValuationDecision>(e => {
            e.HasOne<CustomsLocation>().WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<ImporterDeclaration>().WithMany().HasForeignKey(x => x.ImporterDeclarationId).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => x.ImporterDeclarationId).IsUnique();
            e.Property(x => x.Version).IsConcurrencyToken(); e.HasIndex(x => new { x.LocationId, x.Status });
        });
        modelBuilder.Entity<AuditLog>(entity => {
            entity.HasIndex(x => new { x.LocationId, x.OccurredAt });
            entity.HasIndex(x => new { x.Category, x.OccurredAt }); entity.HasIndex(x => new { x.RegionLocationId, x.OccurredAt });
            entity.HasIndex(x => x.SubjectUserId); entity.HasIndex(x => x.RecordId);
            entity.Property(x => x.Category).HasMaxLength(20); entity.Property(x => x.Source).HasMaxLength(30); entity.Property(x => x.ActorRole).HasMaxLength(40);
        });
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
        modelBuilder.Entity<ValuationDecisionDocument>(entity => {
            entity.ToTable("valuation_decision_documents"); entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.ValuationDecisionId, x.Kind }).IsUnique();
            entity.Property(x => x.Kind).HasMaxLength(40); entity.Property(x => x.FileName).HasMaxLength(255);
            entity.Property(x => x.ContentType).HasMaxLength(100); entity.Property(x => x.Sha256).HasMaxLength(64); entity.Property(x => x.UploadedBy).HasMaxLength(100);
        });
        modelBuilder.Entity<ImporterDocument>(entity => {
            entity.ToTable("importer_documents"); entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.DeclarationId, x.Kind }).IsUnique();
            entity.Property(x => x.Kind).HasMaxLength(40); entity.Property(x => x.FileName).HasMaxLength(255);
            entity.Property(x => x.ContentType).HasMaxLength(100); entity.Property(x => x.Sha256).HasMaxLength(64);
        });
        modelBuilder.Entity<DocumentScan>(entity => {
            entity.ToTable("document_scans"); entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.DocumentId, x.Sha256 }).IsUnique(); entity.HasIndex(x => new { x.Source, x.OwnerId }); entity.HasIndex(x => new { x.Status, x.NextAttemptAt });
            entity.Property(x => x.Source).HasMaxLength(20); entity.Property(x => x.Kind).HasMaxLength(40); entity.Property(x => x.Sha256).HasMaxLength(64);
            entity.Property(x => x.Status).HasMaxLength(20); entity.Property(x => x.Flag).HasMaxLength(20); entity.Property(x => x.DetectedType).HasMaxLength(120);
            entity.Property(x => x.Summary).HasMaxLength(1000); entity.Property(x => x.Engine).HasMaxLength(80); entity.Property(x => x.Error).HasMaxLength(1000);
        });
        modelBuilder.Entity<ImporterChangeRequest>(entity => {
            entity.ToTable("importer_change_requests"); entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.AccountId, x.Status }); entity.HasIndex(x => new { x.RegionKey, x.Status, x.CreatedAt });
            entity.HasOne<AuthAccountEntity>().WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            entity.Property(x => x.Version).IsConcurrencyToken();
            entity.Property(x => x.Status).HasMaxLength(20); entity.Property(x => x.RegionKey).HasMaxLength(120);
            entity.Property(x => x.CurrentFullName).HasMaxLength(200); entity.Property(x => x.RequestedFullName).HasMaxLength(200);
            entity.Property(x => x.CurrentLegalName).HasMaxLength(200); entity.Property(x => x.RequestedLegalName).HasMaxLength(200);
            entity.Property(x => x.CurrentTin).HasMaxLength(10); entity.Property(x => x.RequestedTin).HasMaxLength(10);
            entity.Property(x => x.Reason).HasMaxLength(1000); entity.Property(x => x.ReviewNote).HasMaxLength(2000);
            entity.Property(x => x.DocumentFileName).HasMaxLength(255); entity.Property(x => x.DocumentContentType).HasMaxLength(100); entity.Property(x => x.DocumentSha256).HasMaxLength(64);
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

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ClassifyAuditEventsAsync(CancellationToken.None).GetAwaiter().GetResult();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        await ClassifyAuditEventsAsync(cancellationToken);
        return await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    /// <summary>Fills in the category, source, actor role and region of new audit events, whichever code wrote them.</summary>
    private async Task ClassifyAuditEventsAsync(CancellationToken ct)
    {
        var pending = ChangeTracker.Entries<AuditLog>().Where(e => e.State == EntityState.Added && string.IsNullOrEmpty(e.Entity.Category)).Select(e => e.Entity).ToList();
        if (pending.Count > 0) await ClassifyAsync(pending, ct);
    }

    /// <summary>Classifies audit events; also used to back-fill events recorded before categories existed.</summary>
    public async Task ClassifyAsync(IReadOnlyList<AuditLog> events, CancellationToken ct)
    {
        var locations = await CustomsLocations.AsNoTracking().Select(l => new { l.Id, l.LocationType, l.ParentLocationId }).ToDictionaryAsync(l => l.Id, ct);
        Guid? RegionOf(Guid? locationId)
        {
            for (var depth = 0; locationId is Guid id && locations.TryGetValue(id, out var location) && depth < 6; depth++)
            {
                if (location.LocationType == "REGION") return location.Id;
                if (location.ParentLocationId is null) return location.Id;
                locationId = location.ParentLocationId;
            }
            return null;
        }
        var actorIds = events.Select(e => Guid.TryParse(e.UserId, out var id) ? id : Guid.Empty).Where(id => id != Guid.Empty).Distinct().ToList();
        var actorNames = events.Where(e => !Guid.TryParse(e.UserId, out _)).Select(e => e.UserId).Distinct().ToList();
        var subjectIds = events.Select(e => e.SubjectUserId).OfType<Guid>().Distinct().ToList();
        var accounts = await AuthAccounts.AsNoTracking().Where(a => actorIds.Contains(a.Id) || subjectIds.Contains(a.Id) || actorNames.Contains(a.Username))
            .Select(a => new { a.Id, a.Username, a.Role, a.PrimaryLocationId }).ToListAsync(ct);
        var recordIds = events.Where(e => AuditTaxonomy.IsCaseModule(e.Module)).Select(e => e.RecordId).Distinct().ToList();
        var assessments = await ValuationPhase2s.AsNoTracking().Where(p => recordIds.Contains(p.Id)).Select(p => new { p.Id, p.ValuationDecisionId }).ToDictionaryAsync(p => p.Id, p => p.ValuationDecisionId, ct);
        var decisionIds = recordIds.Concat(assessments.Values).Distinct().ToList();
        var decisions = await ValuationDecisions.AsNoTracking().Where(d => decisionIds.Contains(d.Id)).Select(d => new { d.Id, d.LocationId, d.ImporterDeclarationId }).ToDictionaryAsync(d => d.Id, ct);
        var declarations = await ImporterDeclarations.AsNoTracking().Where(d => recordIds.Contains(d.Id)).Select(d => new { d.Id, d.LocationId }).ToDictionaryAsync(d => d.Id, d => d.LocationId, ct);
        var profiles = await ImporterProfiles.AsNoTracking().Where(p => subjectIds.Contains(p.AccountId)).Select(p => new { p.AccountId, p.RegionLocationId }).ToDictionaryAsync(p => p.AccountId, p => p.RegionLocationId, ct);

        foreach (var audit in events)
        {
            var actor = Guid.TryParse(audit.UserId, out var actorId) ? accounts.FirstOrDefault(a => a.Id == actorId) : accounts.FirstOrDefault(a => a.Username == audit.UserId);
            var role = AccessRules.NormalizeRole(actor?.Role) ?? "";
            var decisionId = assessments.TryGetValue(audit.RecordId, out var assessed) ? assessed : audit.RecordId;
            var decision = decisions.TryGetValue(decisionId, out var foundDecision) ? foundDecision : null;
            var linked = decision?.ImporterDeclarationId is not null;
            audit.ActorRole = role;
            audit.Category = AuditTaxonomy.CategoryFor(audit.Module, audit.Action, role);
            audit.Source = AuditTaxonomy.SourceFor(audit.Module, audit.Action, role, linked);
            var location = audit.LocationId ?? decision?.LocationId ?? (declarations.TryGetValue(audit.RecordId, out var declarationLocation) ? declarationLocation : (Guid?)null);
            if (location is null && audit.SubjectUserId is Guid subject)
                location = (profiles.TryGetValue(subject, out var importerRegion) ? importerRegion : (Guid?)null) ?? accounts.FirstOrDefault(a => a.Id == subject)?.PrimaryLocationId;
            location ??= actor?.PrimaryLocationId;
            audit.RegionLocationId ??= RegionOf(location);
        }
    }
}
