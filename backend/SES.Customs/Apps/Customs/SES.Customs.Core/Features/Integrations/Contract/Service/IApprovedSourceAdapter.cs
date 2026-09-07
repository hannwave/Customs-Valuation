namespace SES.Customs.Core.Features.Integrations.Contract.Service;
public sealed record SourceImportRequest(Guid SourceId, string ApprovalReference, string IdempotencyKey, DateOnly From, DateOnly To);
public sealed record SourceImportResult(Guid JobId, string Status, int Accepted, int Quarantined);
public interface IApprovedSourceAdapter
{
    string SourceKey { get; }
    Task<SourceImportResult> StageAsync(SourceImportRequest request, CancellationToken ct);
}
