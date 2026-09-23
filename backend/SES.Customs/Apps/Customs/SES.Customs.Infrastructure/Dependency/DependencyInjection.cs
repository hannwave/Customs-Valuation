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
        if (useDemoData || string.IsNullOrWhiteSpace(connectionString))
        {
            services.AddDbContext<CustomsDbContext>(options => options.UseInMemoryDatabase("CustomsDemoDb"));
            services.AddSingleton<IHsCodeRepository, DemoHsCodeRepository>();
            return services;
        }
        services.AddDbContext<CustomsDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<IHsCodeRepository, HsCodeRepository>();
        return services;
    }
}
