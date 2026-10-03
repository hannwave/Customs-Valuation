using SES.Customs.Core.Models;

namespace SES.Customs.API.Queries;

public static class AuditHistoryQuery
{
    // Keep this as IQueryable: callers count and page only after applying access and filters.
    public static IQueryable<AuditLog> Filter(IQueryable<AuditLog> query, string? category,
        string? eventType, DateTimeOffset? from, DateTimeOffset? to, string? officer)
    {
        if (category == "valuations") query = query.Where(a => a.Module == "Valuation" || a.Module == "Valuations" || a.Module == "EthiopianImportTaxAssessment");
        if (category == "changes") query = query.Where(a => a.Module != "Valuation" && a.Module != "Valuations" && a.Module != "EthiopianImportTaxAssessment");
        if (from.HasValue) query = query.Where(a => a.OccurredAt >= from.Value);
        if (to.HasValue) query = query.Where(a => a.OccurredAt < to.Value);
        if (!string.IsNullOrWhiteSpace(eventType)) query = query.Where(a => a.Action == eventType);
        if (!string.IsNullOrWhiteSpace(officer)) query = query.Where(a => a.Username.Contains(officer));
        return query;
    }

    public static IQueryable<AuditLog> Page(IQueryable<AuditLog> query, int page, int pageSize, bool chronological)
    {
        var ordered = chronological ? query.OrderBy(a => a.OccurredAt).ThenBy(a => a.Id)
            : query.OrderByDescending(a => a.OccurredAt).ThenByDescending(a => a.Id);
        return ordered.Skip((page - 1) * pageSize).Take(pageSize);
    }
}
