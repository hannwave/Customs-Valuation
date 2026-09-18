namespace SES.Customs.Core.Models;

public static class AccessRules
{
    public const string SystemAdmin = "SystemAdministrator";
    public const string CustomsAdmin = "CustomsAdministrator";
    public const string Officer = "CustomsOfficer";
    public static string? NormalizeRole(string? role) => role?.Replace("_", "").Replace(" ", "").ToUpperInvariant() switch
    {
        "SYSTEMADMIN" or "SYSTEMADMINISTRATOR" => SystemAdmin,
        "CUSTOMSADMIN" or "CUSTOMSADMINISTRATOR" => CustomsAdmin,
        "CUSTOMSOFFICER" => Officer,
        _ => null
    };
    public static string Code(string role) => NormalizeRole(role) switch { SystemAdmin => "SYSTEM_ADMIN", CustomsAdmin => "CUSTOMS_ADMIN", Officer => "CUSTOMS_OFFICER", _ => "" };
    public static string[] Permissions(string role) => NormalizeRole(role) switch
    {
        SystemAdmin => [.. Shared, "users.manage_all", "roles.manage", "permissions.manage", "customs_admin.manage", "locations.manage", "hs_codes.manage", "hs_revisions.manage", "price_sources.manage", "exchange_rates.configure", "integrations.manage", "system_settings.manage", "audit.view_global", "valuations.review_global"],
        CustomsAdmin => [.. Shared, "locations.view_assigned", "operations.view_assigned", "workload.view_assigned", "valuations.review_assigned", "audit.view_assigned"],
        Officer => [.. Shared, "reference_prices.view", "local_prices.view", "historical_prices.view", "statistics.view", "trends.view", "country_analysis.view", "outliers.view", "outliers.review", "locations.view_assigned", "valuation.create", "valuation.update_own", "valuation.submit", "valuation.view_authorized", "audit.view_own"],
        _ => []
    };
    private static readonly string[] Shared = ["hs_codes.view", "hs_revisions.view"];

    public static HashSet<Guid> Descendants(IEnumerable<(Guid Id, Guid? ParentId)> locations, Guid root)
    {
        var children = locations.Where(location => location.ParentId.HasValue)
            .ToLookup(location => location.ParentId!.Value, location => location.Id);
        var result = new HashSet<Guid> { root };
        var queue = new Queue<Guid>(new[] { root });
        while (queue.TryDequeue(out var parent))
        {
            foreach (var child in children[parent])
                if (result.Add(child)) queue.Enqueue(child);
        }
        return result;
    }

}
