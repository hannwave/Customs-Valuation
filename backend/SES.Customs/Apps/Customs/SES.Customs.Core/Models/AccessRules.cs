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
        CustomsAdmin => [.. Shared, "officers.create", "officers.update", "officers.activate", "officers.suspend", "officers.deactivate", "officers.assign_location", "locations.view_scoped", "operations.view_scoped", "workload.view_scoped", "valuations.review_scoped", "audit.view_scoped"],
        Officer => [.. Shared, "reference_prices.view", "local_prices.view", "historical_prices.view", "statistics.view", "trends.view", "country_analysis.view", "outliers.view", "outliers.review", "locations.view_assigned", "valuation.create", "valuation.update_own", "valuation.submit", "valuation.view_authorized", "audit.view_own"],
        _ => []
    };
    private static readonly string[] Shared = ["hs_codes.view", "hs_revisions.view"];

    // Traversal is cycle-safe even when examining legacy or imported data.
    public static HashSet<Guid> Expand(IEnumerable<(Guid Id, Guid? ParentId)> locations, IEnumerable<(Guid LocationId, bool IncludeChildren)> assignments)
    {
        var children = locations.Where(x => x.ParentId.HasValue).ToLookup(x => x.ParentId!.Value, x => x.Id);
        var result = new HashSet<Guid>();
        foreach (var assignment in assignments)
        {
            result.Add(assignment.LocationId);
            if (!assignment.IncludeChildren) continue;
            var seen = new HashSet<Guid> { assignment.LocationId };
            var queue = new Queue<Guid>(); queue.Enqueue(assignment.LocationId);
            while (queue.TryDequeue(out var parent))
                foreach (var child in children[parent])
                    if (seen.Add(child)) { result.Add(child); queue.Enqueue(child); }
        }
        return result;
    }
    public static bool CanManageOfficer(string actorRole, IReadOnlySet<Guid> scope, string targetRole, IEnumerable<Guid> targetLocations) =>
        NormalizeRole(actorRole) == SystemAdmin ||
        NormalizeRole(actorRole) == CustomsAdmin && NormalizeRole(targetRole) == Officer &&
        targetLocations.Any() && targetLocations.All(scope.Contains);
}
