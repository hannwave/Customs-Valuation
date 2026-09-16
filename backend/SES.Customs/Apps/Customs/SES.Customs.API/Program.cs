using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using SES.Customs.API.Security;
using SES.Customs.API.Integrations.SerpApi;
using SES.Customs.API.Integrations.LocalMarket;
using SES.Customs.Core.Features.HsCodes.Contract.Query;
using SES.Customs.Infrastructure.Dependency;

var builder = WebApplication.CreateBuilder(args);
// Console logging works in local, CI and container environments without Event Log privileges.
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole();
// SerpAPI authenticates through a query parameter, so suppress request-URI
// information logs to ensure the private key is never written to application logs.
builder.Logging.AddFilter("System.Net.Http.HttpClient.SerpApiClient", LogLevel.Warning);
var demo = builder.Configuration.GetValue<bool>("Skeleton:UseDemoData");
if (demo && !builder.Environment.IsDevelopment())
    throw new InvalidOperationException("Demo data is permitted only in Development.");
// A production startup gate prevents accidentally shipping an unauthenticated starter.
if (!builder.Environment.IsDevelopment())
    throw new InvalidOperationException("Skeleton only: complete and test OIDC and production configuration before release.");

builder.Services.AddInfrastructure(builder.Configuration.GetConnectionString("Customs"), demo);
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(SearchHsCodesQuery).Assembly));
var jwt = builder.Configuration.GetSection("Jwt");
var jwtKey = jwt["Key"] ?? throw new InvalidOperationException("Jwt:Key must be configured.");
if (Encoding.UTF8.GetByteCount(jwtKey) < 32) throw new InvalidOperationException("Jwt:Key must be at least 32 bytes.");
builder.Services.AddScoped<AuthService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<WorkspaceAccess>();
builder.Services.AddScoped<WorkspaceExceptionFilter>();
builder.Services.Configure<SerpApiOptions>(builder.Configuration.GetSection(SerpApiOptions.SectionName));
builder.Services.AddHttpClient<SerpApiClient>((services, client) =>
{
    var options = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<SerpApiOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
    // Uncached Google Shopping searches can take longer than ordinary JSON APIs.
    client.Timeout = TimeSpan.FromSeconds(60);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("SES-Customs-Valuation/1.0");
});
builder.Services.Configure<LocalMarketOptions>(builder.Configuration.GetSection(LocalMarketOptions.SectionName));
builder.Services.AddScoped<LocalMarketSearchService>();
builder.Services.AddHttpClient("JijiEthiopia", (services, client) =>
{
    var options = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<LocalMarketOptions>>().Value;
    client.BaseAddress = new Uri(options.JijiBaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; SES-Customs-Valuation/1.0; +government-market-research)");
    client.DefaultRequestHeaders.Accept.ParseAdd("text/html");
});
builder.Services.AddHttpClient("EthioShop", (services, client) =>
{
    var options = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<LocalMarketOptions>>().Value;
    client.BaseAddress = new Uri(options.EthioShopApiUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("SES-Customs-Valuation/1.0");
});
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = jwt["Issuer"], ValidateAudience = true, ValidAudience = jwt["Audience"],
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(30), NameClaimType = System.Security.Claims.ClaimTypes.Name, RoleClaimType = System.Security.Claims.ClaimTypes.Role
    };
});
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    options.AddPolicy("CustomsOfficer", p => p.RequireAuthenticatedUser().RequireRole("CustomsOfficer", "CustomsAdministrator", "SystemAdministrator"));
    options.AddPolicy("OfficerOnly", p => p.RequireAuthenticatedUser().RequireRole("CustomsOfficer"));
    options.AddPolicy("CustomsAdministrator", p => p.RequireAuthenticatedUser().RequireRole("CustomsAdministrator", "SystemAdministrator"));
    options.AddPolicy("SystemAdministrator", p => p.RequireAuthenticatedUser().RequireRole("SystemAdministrator"));
});
builder.Services.AddControllers().AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [])
        .AllowAnyHeader().AllowAnyMethod()));
var app = builder.Build();
app.UseExceptionHandler();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/health/live", () => Results.Ok(new { status = "ok", mode = demo ? "demo" : "development-database" })).AllowAnonymous();
app.MapControllers();
app.Run();
