using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Security;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;
using static SES.Customs.API.Security.WorkspaceAccess;

namespace SES.Customs.API.Controllers;

[ApiController, Route("api/workspace"), Authorize, ServiceFilter(typeof(WorkspaceExceptionFilter))]
public sealed class WorkspaceAnalyticsController(CustomsDbContext db, WorkspaceAccess access) : ControllerBase
{
    [HttpGet("analytics")]
    public async Task<IActionResult> Get(
        [FromQuery] DateTimeOffset? dateFrom,
        [FromQuery] DateTimeOffset? dateTo,
        [FromQuery] Guid? locationId,
        [FromQuery] Guid? officerId,
        [FromQuery] string? status,
        [FromQuery] string? hsChapter,
        [FromQuery] string? currency,
        CancellationToken ct)
    {
        access.Require(AccessRules.CustomsAdmin);
        if (access.Role == AccessRules.CustomsAdmin)
            throw new WorkspaceException(410, "Customs Administrator valuation analytics has been removed from this workspace.");

        var now = DateTimeOffset.UtcNow;
        var from = dateFrom ?? now.AddDays(-30);
        var to = dateTo ?? now;
        Validate(from <= to, "The analytics start date must be before the end date.");
        Validate(to - from <= TimeSpan.FromDays(366), "Choose an analytics period of 366 days or less.");

        var scope = await access.Locations(ct);
        var scopedLocations = await db.CustomsLocations.AsNoTracking()
            .Where(location => scope.Contains(location.Id))
            .OrderBy(location => location.Name)
            .ToListAsync(ct);
        var branches = scopedLocations.Where(location => location.LocationType == "BRANCH").ToArray();

        if (locationId is Guid selectedLocationId)
            Validate(branches.Any(branch => branch.Id == selectedLocationId), "Choose a branch in your assigned region.");

        var accounts = await db.AuthAccounts.AsNoTracking()
            .Where(account => account.PrimaryLocationId.HasValue && scope.Contains(account.PrimaryLocationId.Value))
            .OrderBy(account => account.FullName)
            .ToListAsync(ct);
        var officers = accounts
            .Where(account => AccessRules.NormalizeRole(account.Role) == AccessRules.Officer)
            .ToArray();

        if (officerId is Guid selectedOfficerId)
            Validate(officers.Any(officer => officer.Id == selectedOfficerId), "Choose an Officer in your assigned region.");

        var normalizedStatus = (status ?? "").Trim();
        var allowedStatuses = new[] { "Draft", "Submitted", "Returned", "Approved", "Rejected" };
        Validate(string.IsNullOrWhiteSpace(normalizedStatus) || allowedStatuses.Contains(normalizedStatus, StringComparer.OrdinalIgnoreCase), "Choose a supported valuation status.");

        var chapter = (hsChapter ?? "").Trim();
        Validate(string.IsNullOrWhiteSpace(chapter) || (chapter.Length is 2 or 4 && chapter.All(char.IsDigit)), "HS chapter must contain two or four digits.");
        var normalizedCurrency = (currency ?? "").Trim().ToUpperInvariant();
        Validate(string.IsNullOrWhiteSpace(normalizedCurrency) || (normalizedCurrency.Length == 3 && normalizedCurrency.All(char.IsLetter)), "Currency must be a three-letter code.");

        var decisionQuery = db.ValuationDecisions.AsNoTracking().Where(decision =>
            decision.HsCodeId.HasValue && decision.HsCodeId.Value != Guid.Empty && decision.LocationId.HasValue && scope.Contains(decision.LocationId.Value) &&
            decision.RecordedAt >= from && decision.RecordedAt <= to);
        if (locationId is Guid locationFilter)
            decisionQuery = decisionQuery.Where(decision => decision.LocationId == locationFilter);
        if (!string.IsNullOrWhiteSpace(normalizedCurrency))
            decisionQuery = decisionQuery.Where(decision => decision.Currency == normalizedCurrency);

        var decisions = await decisionQuery.ToListAsync(ct);
        var hsIds = decisions.Where(decision => decision.HsCodeId.HasValue).Select(decision => decision.HsCodeId!.Value).Distinct().ToArray();
        var hsCodes = await db.HsCodes.AsNoTracking().Where(code => hsIds.Contains(code.Id)).ToDictionaryAsync(code => code.Id, ct);
        if (!string.IsNullOrWhiteSpace(chapter))
            decisions = decisions.Where(decision => decision.HsCodeId.HasValue && hsCodes.TryGetValue(decision.HsCodeId.Value, out var code) && code?.Code?.StartsWith(chapter, StringComparison.Ordinal) == true).ToList();
        if (!string.IsNullOrWhiteSpace(normalizedStatus))
            decisions = decisions.Where(decision => string.Equals(decision.Status, normalizedStatus, StringComparison.OrdinalIgnoreCase)).ToList();
        if (officerId is Guid officerFilter)
            decisions = decisions.Where(decision => string.Equals(decision.OfficerSubjectId, officerFilter.ToString(), StringComparison.OrdinalIgnoreCase)).ToList();

        var statusBreakdown = decisions
            .GroupBy(decision => decision.Status)
            .OrderBy(group => StatusOrder(group.Key))
            .ThenBy(group => group.Key)
            .Select(group => new { status = group.Key, count = group.Count(), percentage = Percent(group.Count(), decisions.Count) })
            .ToArray();
        var reviewed = decisions.Where(decision => decision.SubmittedAt.HasValue && decision.ReviewedAt.HasValue && decision.ReviewedAt >= decision.SubmittedAt).ToArray();
        var pending = decisions.Count(decision => decision.Status == "Submitted");
        var returned = decisions.Count(decision => decision.Status == "Returned");
        var approved = decisions.Count(decision => decision.Status == "Approved");
        var rejected = decisions.Count(decision => decision.Status == "Rejected");
        var todayStart = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        var overdue = decisions.Count(decision => decision.Status == "Submitted" && decision.SubmittedAt < now.AddHours(-48));
        var missingEvidence = decisions.Count(decision => string.IsNullOrWhiteSpace(decision.EvidenceNotes));
        var missingJustification = decisions.Count(decision => string.IsNullOrWhiteSpace(decision.Justification));

        var locationLookup = scopedLocations.ToDictionary(location => location.Id);
        var officerLookup = officers.ToDictionary(officer => officer.Id);
        var branchPerformance = branches.Select(branch =>
        {
            var rows = decisions.Where(decision => decision.LocationId == branch.Id).ToArray();
            var assignedOfficers = officers.Count(officer => officer.PrimaryLocationId == branch.Id);
            return new
            {
                locationId = branch.Id,
                name = string.IsNullOrWhiteSpace(branch.DisplayName) ? branch.Name : branch.DisplayName,
                officialCode = branch.OfficialCode,
                status = branch.Status,
                active = branch.Status == "ACTIVE" && branch.EffectiveFrom <= now && (branch.EffectiveTo == null || branch.EffectiveTo > now),
                officers = assignedOfficers,
                decisions = rows.Length,
                pending = rows.Count(decision => decision.Status is "Submitted" or "Returned"),
                submitted = rows.Count(decision => decision.Status == "Submitted"),
                approved = rows.Count(decision => decision.Status == "Approved"),
                returned = rows.Count(decision => decision.Status == "Returned"),
                rejected = rows.Count(decision => decision.Status == "Rejected"),
                averageReviewHours = AverageReviewHours(rows),
                lastDecisionAt = rows.OrderByDescending(decision => decision.RecordedAt).Select(decision => (DateTimeOffset?)decision.RecordedAt).FirstOrDefault()
            };
        }).OrderByDescending(branch => branch.pending).ThenBy(branch => branch.name).ToArray();

        var officerPerformance = officers.Select(officer =>
        {
            var rows = decisions.Where(decision => string.Equals(decision.OfficerSubjectId, officer.Id.ToString(), StringComparison.OrdinalIgnoreCase)).ToArray();
            var branch = officer.PrimaryLocationId is Guid branchId && locationLookup.TryGetValue(branchId, out var location) ? location : null;
            return new
            {
                userId = officer.Id,
                name = officer.FullName,
                employeeNumber = officer.EmployeeNumber,
                status = officer.Status,
                active = officer.Active,
                branch = branch == null ? "Unassigned" : string.IsNullOrWhiteSpace(branch.DisplayName) ? branch.Name : branch.DisplayName,
                responsibilities = officer.Responsibilities,
                lastLoginAt = officer.LastLoginAt,
                decisions = rows.Length,
                pending = rows.Count(decision => decision.Status is "Draft" or "Returned"),
                submitted = rows.Count(decision => decision.Status == "Submitted"),
                approved = rows.Count(decision => decision.Status == "Approved"),
                returned = rows.Count(decision => decision.Status == "Returned"),
                rejected = rows.Count(decision => decision.Status == "Rejected"),
                averageReviewHours = AverageReviewHours(rows),
                lastDecisionAt = rows.OrderByDescending(decision => decision.RecordedAt).Select(decision => (DateTimeOffset?)decision.RecordedAt).FirstOrDefault()
            };
        }).OrderByDescending(officer => officer.pending).ThenBy(officer => officer.name).ToArray();

        var grain = to - from <= TimeSpan.FromDays(31) ? "day" : to - from <= TimeSpan.FromDays(120) ? "week" : "month";
        var trends = BuildTrends(decisions, from, to, grain);
        var topHsCodes = decisions
            .GroupBy(decision => decision.HsCodeId!.Value)
            .Select(group =>
            {
                hsCodes.TryGetValue(group.Key, out var code);
                var currencies = group.Select(decision => decision.Currency).Where(value => !string.IsNullOrWhiteSpace(value)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
                return new
                {
                    hsCode = code?.Code ?? "Unknown",
                    description = code?.DescriptionEn ?? "Unknown HS item",
                    decisions = group.Count(),
                    approved = group.Count(decision => decision.Status == "Approved"),
                    returned = group.Count(decision => decision.Status == "Returned"),
                    currencies = string.Join(", ", currencies),
                    averageReferenceValue = currencies.Length == 1 ? (decimal?)group.Average(decision => decision.SelectedReferenceValue) : null
                };
            })
            .OrderByDescending(item => item.decisions)
            .ThenBy(item => item.hsCode)
            .Take(10)
            .ToArray();

        var startDate = DateOnly.FromDateTime(from.UtcDateTime.Date);
        var endDate = DateOnly.FromDateTime(to.UtcDateTime.Date);
        var localQuery = db.LocalMarketObservations.AsNoTracking().Where(observation => observation.RetrievalDate >= from && observation.RetrievalDate <= to);
        var referenceQuery = db.ReferencePrices.AsNoTracking().Where(price => price.PriceDate >= startDate && price.PriceDate <= endDate);
        var historicalQuery = db.HistoricalCustomsPrices.AsNoTracking().Where(price => price.PriceDate >= startDate && price.PriceDate <= endDate);
        if (!string.IsNullOrWhiteSpace(chapter))
        {
            Guid[] referenceHsIds = await db.HsCodes.AsNoTracking().Where(code => code.Code != null && code.Code.StartsWith(chapter)).Select(code => code.Id).ToArrayAsync(ct);
            localQuery = localQuery.Where(observation => referenceHsIds.Contains(observation.HsCodeId));
            referenceQuery = referenceQuery.Where(price => referenceHsIds.Contains(price.HsCodeId));
            historicalQuery = historicalQuery.Where(price => referenceHsIds.Contains(price.HsCodeId));
        }
        var localRows = await localQuery.Select(observation => new { observation.SourceId, observation.HsCodeId, observation.NormalizedUnitPrice, observation.ClassificationStatus, observation.IsPotentialOutlier, observation.ManualReviewStatus, observation.RetrievalDate }).ToListAsync(ct);
        var referenceRows = await referenceQuery.Select(price => new { price.SourceId, price.HsCodeId, price.ConvertedValue, price.ConvertedCurrency }).ToListAsync(ct);
        var historicalRows = await historicalQuery.Select(price => new { price.SourceId, price.HsCodeId }).ToListAsync(ct);
        var validLocalRows = localRows.Where(row => row.NormalizedUnitPrice is > 0 && row.ClassificationStatus is LocalObservationStatus.ValidForStatistics or LocalObservationStatus.ManuallyApproved).ToArray();
        var localValues = validLocalRows.Select(row => row.NormalizedUnitPrice!.Value).ToArray();
        var internationalValues = referenceRows.Where(row => row.ConvertedValue is > 0 && string.Equals(row.ConvertedCurrency, "ETB", StringComparison.OrdinalIgnoreCase)).Select(row => row.ConvertedValue!.Value).ToArray();
        var localMedian = Median(localValues);
        var internationalMedian = Median(internationalValues);
        var priceVariance = localMedian is decimal local && internationalMedian is decimal international && international != 0 ? Math.Round((local - international) / international * 100m, 1) : (decimal?)null;
        var outlierTrend = BuildOutlierTrends(localRows.Where(row => row.IsPotentialOutlier).Select(row => row.RetrievalDate), from, to, grain);
        var sourceRows = await db.PriceSources.AsNoTracking().OrderBy(source => source.Pool).ThenBy(source => source.Name).ToListAsync(ct);
        var localSourceCounts = localRows.GroupBy(row => row.SourceId).ToDictionary(group => group.Key, group => group.Count());
        var referenceSourceCounts = referenceRows.GroupBy(row => row.SourceId).ToDictionary(group => group.Key, group => group.Count());
        var historicalSourceCounts = historicalRows.GroupBy(row => row.SourceId).ToDictionary(group => group.Key, group => group.Count());
        var sourceCoverage = sourceRows.Select(source => new
        {
            sourceId = source.Id,
            name = source.Name,
            pool = source.Pool.ToString(),
            approved = source.IsApproved,
            records = (localSourceCounts.TryGetValue(source.Id, out var localCount) ? localCount : 0) +
                (referenceSourceCounts.TryGetValue(source.Id, out var referenceCount) ? referenceCount : 0) +
                (historicalSourceCounts.TryGetValue(source.Id, out var historicalCount) ? historicalCount : 0)
        }).Where(source => source.records > 0 || source.approved).ToArray();

        var auditQuery = db.AuditLogs.AsNoTracking().Where(audit => audit.LocationId.HasValue && scope.Contains(audit.LocationId.Value) && audit.OccurredAt >= from && audit.OccurredAt <= to);
        if (locationId is Guid auditLocationId)
            auditQuery = auditQuery.Where(audit => audit.LocationId == auditLocationId);
        var auditRows = await auditQuery.OrderByDescending(audit => audit.OccurredAt).Take(200).ToListAsync(ct);
        if (officerId is Guid auditOfficerId)
            auditRows = auditRows.Where(audit => audit.SubjectUserId == auditOfficerId || string.Equals(audit.UserId, auditOfficerId.ToString(), StringComparison.OrdinalIgnoreCase)).ToList();
        var auditActivity = auditRows.Take(60).Select(audit => new
        {
            id = audit.Id,
            occurredAt = audit.OccurredAt,
            actor = string.IsNullOrWhiteSpace(audit.Username) ? "System" : audit.Username,
            action = audit.Action,
            module = audit.Module,
            location = audit.LocationId is Guid auditLocation && locationLookup.TryGetValue(auditLocation, out var auditOffice) ? auditOffice.DisplayName : "Assigned region",
            recordId = audit.RecordId,
            justification = audit.Justification
        }).ToArray();
        var auditSummary = auditRows.GroupBy(audit => audit.Action).OrderByDescending(group => group.Count()).Take(8).Select(group => new { action = group.Key, count = group.Count() }).ToArray();

        var activeBranches = branches.Count(branch => branch.Status == "ACTIVE" && branch.EffectiveFrom <= now && (branch.EffectiveTo == null || branch.EffectiveTo > now));
        var activeOfficers = officers.Count(officer => officer.Active && officer.Status == "ACTIVE");
        var suspendedOfficers = officers.Count(officer => officer.Status is "SUSPENDED" or "LOCKED");
        var alerts = new List<object>();
        if (overdue > 0) alerts.Add(new { severity = "HIGH", title = "Reviews are ageing", detail = $"{overdue:N0} submitted valuation{(overdue == 1 ? " is" : "s are")} older than 48 hours." });
        if (returned > 0) alerts.Add(new { severity = "MEDIUM", title = "Returned valuations need attention", detail = $"{returned:N0} valuation{(returned == 1 ? " was" : "s were")} returned for correction in the selected period." });
        if (suspendedOfficers > 0) alerts.Add(new { severity = "HIGH", title = "Employee access needs review", detail = $"{suspendedOfficers:N0} Officer account{(suspendedOfficers == 1 ? " is" : "s are")} suspended or locked." });
        if (missingEvidence > 0) alerts.Add(new { severity = "MEDIUM", title = "Evidence references are incomplete", detail = $"{missingEvidence:N0} visible valuation{(missingEvidence == 1 ? " is" : "s are")} missing evidence notes." });
        var unreviewedOutliers = localRows.Count(row => row.IsPotentialOutlier && row.ManualReviewStatus == ManualReviewStatus.Unreviewed);
        if (unreviewedOutliers > 0) alerts.Add(new { severity = "MEDIUM", title = "Shared outliers await review", detail = $"{unreviewedOutliers:N0} reference observation{(unreviewedOutliers == 1 ? " is" : "s are")} still unreviewed." });
        foreach (var branch in branchPerformance.Where(branch => branch.pending >= 5).Take(3))
            alerts.Add(new { severity = "MEDIUM", title = $"{branch.name} has a growing queue", detail = $"{branch.pending:N0} submitted or returned valuation{(branch.pending == 1 ? " case" : " cases")} require attention." });
        if (alerts.Count == 0) alerts.Add(new { severity = "INFO", title = "No urgent operational alerts", detail = "The selected region has no threshold alerts in this period." });

        return Ok(new
        {
            generatedAt = now,
            scope = new { region = await access.ActorRegion(ct) ?? "Assigned region", branchCount = branches.Length, activeBranches },
            filters = new { dateFrom = from, dateTo = to, locationId, officerId, status = normalizedStatus, hsChapter = chapter, currency = normalizedCurrency },
            scopeNote = "Valuation, workforce, and audit metrics are limited to your assigned region. Shared reference-data observations are not stored against individual branches, so outlier and source metrics cover the shared reference pools.",
            summary = new
            {
                activeOffices = activeBranches,
                totalOffices = branches.Length,
                activeOfficers,
                managedOfficers = officers.Length,
                pendingValuations = pending,
                returnedValuations = returned,
                approvedValuations = approved,
                rejectedValuations = rejected,
                decisions = decisions.Count,
                decisionsToday = decisions.Count(decision => decision.RecordedAt >= todayStart),
                suspendedAccounts = suspendedOfficers,
                averageReviewHours = AverageReviewHours(reviewed),
                overdueReviews = overdue,
                approvalRate = Percent(approved, approved + returned + rejected),
                returnRate = Percent(returned, approved + returned + rejected),
                rejectionRate = Percent(rejected, approved + returned + rejected),
                evidenceCoverage = Percent(decisions.Count - missingEvidence, decisions.Count),
                justificationCoverage = Percent(decisions.Count - missingJustification, decisions.Count)
            },
            statusBreakdown,
            trends,
            branchPerformance,
            officerPerformance,
            topHsCodes,
            quality = new
            {
                missingEvidence,
                missingJustification,
                validLocalObservations = validLocalRows.Length,
                potentialOutliers = localRows.Count(row => row.IsPotentialOutlier),
                unreviewedOutliers,
                confirmedOutliers = localRows.Count(row => row.IsPotentialOutlier && row.ManualReviewStatus == ManualReviewStatus.ConfirmedOutlier),
                rejectedOutliers = localRows.Count(row => row.IsPotentialOutlier && row.ManualReviewStatus == ManualReviewStatus.Rejected),
                outlierTrend,
                sharedReferenceData = true,
                localMedianEtb = localMedian,
                internationalMedianEtb = internationalMedian,
                localVsInternationalVariancePercent = priceVariance,
                localObservationCount = localValues.Length,
                internationalObservationCount = internationalValues.Length
            },
            sourceCoverage,
            auditSummary,
            auditActivity,
            alerts
        });
    }

    private static int StatusOrder(string status) => status switch
    {
        "Draft" => 0,
        "Submitted" => 1,
        "Returned" => 2,
        "Approved" => 3,
        "Rejected" => 4,
        _ => 9
    };

    private static decimal Percent(int numerator, int denominator) => denominator == 0 ? 0 : Math.Round(numerator * 100m / denominator, 1);

    private static decimal? AverageReviewHours(IEnumerable<ValuationDecision> decisions)
    {
        var durations = decisions
            .Where(decision => decision.SubmittedAt.HasValue && decision.ReviewedAt.HasValue && decision.ReviewedAt >= decision.SubmittedAt)
            .Select(decision => (decimal)(decision.ReviewedAt!.Value - decision.SubmittedAt!.Value).TotalHours)
            .ToArray();
        return durations.Length == 0 ? null : Math.Round(durations.Average(), 1);
    }

    private static decimal? Median(IEnumerable<decimal> values)
    {
        var ordered = values.Where(value => value > 0).OrderBy(value => value).ToArray();
        if (ordered.Length == 0) return null;
        var middle = ordered.Length / 2;
        return Math.Round(ordered.Length % 2 == 0 ? (ordered[middle - 1] + ordered[middle]) / 2m : ordered[middle], 2);
    }

    private static object[] BuildTrends(IReadOnlyCollection<ValuationDecision> decisions, DateTimeOffset from, DateTimeOffset to, string grain)
    {
        var result = new List<object>();
        for (var period = PeriodStart(from, grain); period <= PeriodStart(to, grain); period = NextPeriod(period, grain))
        {
            var next = NextPeriod(period, grain);
            var rows = decisions.Where(decision => decision.RecordedAt >= period && decision.RecordedAt < next).ToArray();
            result.Add(new
            {
                period = period.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                label = grain == "day" ? period.ToString("dd MMM", CultureInfo.InvariantCulture) : grain == "week" ? $"Week of {period:dd MMM}" : period.ToString("MMM yyyy", CultureInfo.InvariantCulture),
                decisions = rows.Length,
                submitted = rows.Count(decision => decision.Status == "Submitted"),
                approved = rows.Count(decision => decision.Status == "Approved"),
                returned = rows.Count(decision => decision.Status == "Returned"),
                averageReviewHours = AverageReviewHours(rows)
            });
        }
        return result.ToArray();
    }

    private static object[] BuildOutlierTrends(IEnumerable<DateTimeOffset> dates, DateTimeOffset from, DateTimeOffset to, string grain)
    {
        var values = dates.ToArray();
        var result = new List<object>();
        for (var period = PeriodStart(from, grain); period <= PeriodStart(to, grain); period = NextPeriod(period, grain))
        {
            var next = NextPeriod(period, grain);
            result.Add(new
            {
                period = period.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                label = grain == "day" ? period.ToString("dd MMM", CultureInfo.InvariantCulture) : grain == "week" ? $"Week of {period:dd MMM}" : period.ToString("MMM yyyy", CultureInfo.InvariantCulture),
                count = values.Count(date => date >= period && date < next)
            });
        }
        return result.ToArray();
    }

    private static DateTimeOffset PeriodStart(DateTimeOffset value, string grain)
    {
        var date = value.UtcDateTime.Date;
        if (grain == "month") return new DateTimeOffset(new DateTime(date.Year, date.Month, 1), TimeSpan.Zero);
        if (grain == "week")
        {
            var daysFromMonday = ((int)date.DayOfWeek + 6) % 7;
            date = date.AddDays(-daysFromMonday);
        }
        return new DateTimeOffset(date, TimeSpan.Zero);
    }

    private static DateTimeOffset NextPeriod(DateTimeOffset value, string grain) => grain switch
    {
        "month" => value.AddMonths(1),
        "week" => value.AddDays(7),
        _ => value.AddDays(1)
    };
}
