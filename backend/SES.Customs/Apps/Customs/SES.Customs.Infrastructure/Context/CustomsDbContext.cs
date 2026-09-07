using Microsoft.EntityFrameworkCore;
using SES.Customs.Core.Models;
namespace SES.Customs.Infrastructure.Context;
public sealed class CustomsDbContext(DbContextOptions<CustomsDbContext> options) : DbContext(options)
{
    public DbSet<HsRevision> HsRevisions => Set<HsRevision>();
    public DbSet<HsCode> HsCodes => Set<HsCode>();
    public DbSet<InternationalReferencePrice> ReferencePrices => Set<InternationalReferencePrice>();
    public DbSet<LocalMarketPrice> LocalPrices => Set<LocalMarketPrice>();
    public DbSet<HistoricalCustomsPrice> HistoricalCustomsPrices => Set<HistoricalCustomsPrice>();
    public DbSet<ValuationDecision> ValuationDecisions => Set<ValuationDecision>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    protected override void OnModelCreating(ModelBuilder modelBuilder) => modelBuilder.ApplyConfigurationsFromAssembly(typeof(CustomsDbContext).Assembly);
}
