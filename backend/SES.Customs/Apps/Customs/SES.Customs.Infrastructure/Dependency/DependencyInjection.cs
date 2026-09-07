using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SES.Customs.Core.Features.HsCodes.Contract.Repository;
using SES.Customs.Infrastructure.Context;
using SES.Customs.Infrastructure.Repository;
namespace SES.Customs.Infrastructure.Dependency;
public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, string? connectionString, bool useDemoData)
    {
        if (useDemoData) return services.AddSingleton<IHsCodeRepository, DemoHsCodeRepository>();
        if (string.IsNullOrWhiteSpace(connectionString)) throw new InvalidOperationException("Configure ConnectionStrings:Customs.");
        services.AddDbContext<CustomsDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<IHsCodeRepository, HsCodeRepository>();
        return services;
    }
}
