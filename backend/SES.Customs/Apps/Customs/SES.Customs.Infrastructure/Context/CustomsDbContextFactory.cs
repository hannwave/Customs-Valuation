using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SES.Customs.Infrastructure.Context;

/// <summary>Creates the PostgreSQL model for EF tooling without requiring runtime secrets.</summary>
public sealed class CustomsDbContextFactory : IDesignTimeDbContextFactory<CustomsDbContext>
{
    public CustomsDbContext CreateDbContext(string[] args)
    {
        // Migration generation can use the inert fallback; database update must
        // receive the same environment variable as the running API.
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Customs");
        var options = new DbContextOptionsBuilder<CustomsDbContext>()
            .UseNpgsql(string.IsNullOrWhiteSpace(connection)
                ? "Host=localhost;Database=customs_design;Username=postgres;Password=design-time-only"
                : connection)
            .Options;
        return new CustomsDbContext(options);
    }
}
