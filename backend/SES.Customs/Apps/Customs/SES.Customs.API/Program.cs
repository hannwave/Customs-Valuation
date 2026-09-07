using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using SES.Customs.API.Security;
using SES.Customs.Core.Features.HsCodes.Contract.Query;
using SES.Customs.Infrastructure.Dependency;

var builder = WebApplication.CreateBuilder(args);
// Console logging works in local, CI and container environments without Event Log privileges.
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole();
var demo = builder.Configuration.GetValue<bool>("Skeleton:UseDemoData");
if (demo && !builder.Environment.IsDevelopment())
    throw new InvalidOperationException("Demo data is permitted only in Development.");
// A production startup gate prevents accidentally shipping an unauthenticated starter.
if (!builder.Environment.IsDevelopment())
    throw new InvalidOperationException("Skeleton only: complete and test OIDC and production configuration before release.");

builder.Services.AddInfrastructure(builder.Configuration.GetConnectionString("Customs"), demo);
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(SearchHsCodesQuery).Assembly));
builder.Services.AddAuthentication("Unconfigured").AddScheme<AuthenticationSchemeOptions, UnconfiguredAuthenticationHandler>("Unconfigured", _ => { });
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    options.AddPolicy("CustomsOfficer", p => p.RequireAuthenticatedUser().RequireRole("CustomsOfficer"));
    options.AddPolicy("CustomsAdministrator", p => p.RequireAuthenticatedUser().RequireRole("CustomsAdministrator"));
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
