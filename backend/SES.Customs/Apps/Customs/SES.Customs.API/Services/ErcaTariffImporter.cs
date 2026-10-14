using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SES.Customs.API.Controllers;
using SES.Customs.Core.Models;
using SES.Customs.Infrastructure.Context;

namespace SES.Customs.API.Services;

/// <summary>One line of the ERCA national tariff: 11-digit code, description, unit and the rate columns as published.</summary>
public sealed record ErcaTariffRow(string Code, string Description, string Unit, Dictionary<string, string> Rates);

public sealed record ErcaImportSummary(int Rows, int Updated, int Created, int HsCodesCreated, int Retired, int RetainedBecauseReferenced, int RatesWritten, int SkippedRows, IReadOnlyList<string> Warnings, bool DryRun);

/// <summary>
/// Brings the national tariff in line with the ERCA tariff book. Matching lines are updated in place so existing
/// references stay valid; new ERCA lines are created; lines ERCA no longer lists are end-dated, never deleted.
/// </summary>
public sealed class ErcaTariffImporter(CustomsDbContext db)
{
    public const string SourceUrl = "https://customs.erca.gov.et/trade/help/tariff/search";

    public static IReadOnlyList<ErcaTariffRow> Parse(string json) =>
        JsonSerializer.Deserialize<List<ErcaTariffRow>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? [];

    public async Task<ErcaImportSummary> ApplyAsync(IReadOnlyList<ErcaTariffRow> input, DateOnly retrievedOn, bool dryRun, string actor, CancellationToken ct)
    {
        var warnings = new List<string>();
        var rows = input.Select(row => row with { Code = Digits(row.Code) }).Where(row => row.Code.Length == 11).GroupBy(row => row.Code).Select(group => group.First()).OrderBy(row => row.Code).ToList();
        var skipped = input.Count - rows.Count;
        if (rows.Count == 0) throw new InvalidOperationException("The ERCA file contains no 11-digit tariff codes.");
        var source = $"ERCA national tariff ({SourceUrl}), retrieved {retrievedOn:yyyy-MM-dd}";
        var retrievedAt = new DateTimeOffset(retrievedOn.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var revision = await db.HsRevisions.Where(r => r.Status == "Active").OrderByDescending(r => r.EffectiveDate).FirstOrDefaultAsync(ct)
            ?? throw new InvalidOperationException("No active HS revision exists to attach the tariff to.");

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var lines = await db.NationalTariffLines.Include(line => line.TaxRates).Where(line => line.EndDate == null || line.EndDate >= today).ToListAsync(ct);
        var hsCodes = await db.HsCodes.Where(code => code.RevisionId == revision.Id && code.Code != null).ToListAsync(ct);
        var hsByCode = hsCodes.GroupBy(code => code.Code!).ToDictionary(group => group.Key, group => group.First());
        var byNational = lines.Where(line => !string.IsNullOrEmpty(line.NationalCode)).GroupBy(line => line.NationalCode!).ToDictionary(group => group.Key, group => group.First());
        var byItem = lines.GroupBy(ItemKey).Where(group => group.Key.Length == 8).ToDictionary(group => group.Key, group => group.OrderBy(line => line.NationalCode is null ? 0 : 1).ThenBy(line => line.Code).ToList());
        var sixDigitDescriptions = rows.Where(row => row.Code.EndsWith("00000", StringComparison.Ordinal)).GroupBy(row => row.Code[..6]).ToDictionary(group => group.Key, group => CleanDescription(group.First().Description));
        var claimed = new HashSet<Guid>();
        int updated = 0, created = 0, hsCreated = 0, ratesWritten = 0;

        foreach (var row in rows)
        {
            var item = row.Code[..8];
            var line = byNational.TryGetValue(row.Code, out var known) && claimed.Add(known.Id) ? known : null;
            if (line is null && byItem.TryGetValue(item, out var candidates))
            {
                line = candidates.FirstOrDefault(candidate => !claimed.Contains(candidate.Id) && (candidate.NationalCode is null || candidate.NationalCode == row.Code));
                if (line is not null) claimed.Add(line.Id);
            }
            if (line is null)
            {
                var hs = ResolveHsCode(row.Code, lines, hsByCode);
                if (hs is null)
                {
                    var chapter = int.Parse(row.Code[..2], CultureInfo.InvariantCulture);
                    var section = HsCodesController.SectionForChapter(row.Code[..2]);
                    hs = new HsCode { Id = Guid.NewGuid(), RevisionId = revision.Id, Code = row.Code[..6], DescriptionEn = sixDigitDescriptions.GetValueOrDefault(row.Code[..6], CleanDescription(row.Description)),
                        ChapterNumber = chapter, ChapterName = hsCodes.FirstOrDefault(code => code.ChapterNumber == chapter && code.ChapterName != "")?.ChapterName ?? "", HeadingNumber = $"{row.Code[..2]}.{row.Code.Substring(2, 2)}",
                        SectionNumber = section.Code, SectionName = section.Name };
                    db.HsCodes.Add(hs); hsByCode[hs.Code] = hs; hsCodes.Add(hs); hsCreated++;
                }
                line = new NationalTariffLine { Id = Guid.NewGuid(), HsCodeId = hs.Id, Code = row.Code, EffectiveDate = retrievedOn };
                db.NationalTariffLines.Add(line); lines.Add(line); claimed.Add(line.Id); created++;
            }
            else updated++;

            line.NationalCode = row.Code;
            line.TariffItemNo = $"{item[..4]}.{item[4..]}";
            line.DescriptionEn = CleanDescription(row.Description);
            line.Unit = row.Unit?.Trim() ?? "";
            line.SourceReference = source;
            var duty = ParseRate(row.Rates.GetValueOrDefault(TariffTaxCodes.Duty));
            line.Duty = duty is null ? (row.Rates.GetValueOrDefault(TariffTaxCodes.Duty)?.Trim() ?? "") : duty == 0 ? "Free" : $"{duty.Value.ToString("0.##", CultureInfo.InvariantCulture)}%";
            db.TariffTaxRates.RemoveRange(line.TaxRates);
            line.TaxRates.Clear();
            foreach (var type in TariffTaxCodes.All)
            {
                var raw = row.Rates.GetValueOrDefault(type.Code)?.Trim();
                if (string.IsNullOrEmpty(raw)) continue;
                var rate = ParseRate(raw);
                if (rate is null) { if (warnings.Count < 50) warnings.Add($"{row.Code} {type.Code}: '{raw}' is not a numeric rate and was not stored."); continue; }
                var taxRate = new TariffTaxRate { Id = Guid.NewGuid(), TariffLineId = line.Id, TaxCode = type.Code, Rate = rate.Value, SourceReference = source, RetrievedAt = retrievedAt };
                line.TaxRates.Add(taxRate); db.TariffTaxRates.Add(taxRate); ratesWritten++;
            }
        }

        // Keep lines that declarations point at; end-date everything else ERCA no longer lists.
        var referenced = (await db.ImporterDeclarations.Select(d => d.SuggestedTariffLineId).ToListAsync(ct))
            .Concat(await db.ImporterDeclarations.Select(d => d.ConfirmedTariffLineId).ToListAsync(ct))
            .Where(id => id.HasValue).Select(id => id!.Value).ToHashSet();
        int retired = 0, kept = 0;
        foreach (var stale in lines.Where(line => !claimed.Contains(line.Id)))
        {
            if (referenced.Contains(stale.Id)) { kept++; continue; }
            stale.EndDate = today.AddDays(-1); retired++;
        }

        var summary = new ErcaImportSummary(rows.Count, updated, created, hsCreated, retired, kept, ratesWritten, skipped, warnings, dryRun);
        db.AuditLogs.Add(new AuditLog { Id = Guid.NewGuid(), UserId = actor, Username = actor, OccurredAt = DateTimeOffset.UtcNow, Action = dryRun ? "ERCA_TARIFF_IMPORT_PREVIEW" : "ERCA_TARIFF_IMPORTED", Module = "HsCodes", RecordId = revision.Id, Justification = source, NewValueJson = JsonSerializer.Serialize(summary with { Warnings = warnings.Take(10).ToList() }) });
        await db.SaveChangesAsync(ct);
        if (dryRun) await transaction.RollbackAsync(ct); else await transaction.CommitAsync(ct);
        return summary;
    }

    private static HsCode? ResolveHsCode(string code, List<NationalTariffLine> lines, Dictionary<string, HsCode> hsByCode)
    {
        if (hsByCode.TryGetValue(code[..6], out var exact)) return exact;
        var sibling = lines.FirstOrDefault(line => ItemKey(line).StartsWith(code[..6], StringComparison.Ordinal));
        return sibling is null ? null : hsByCode.Values.FirstOrDefault(hs => hs.Id == sibling.HsCodeId);
    }

    /// <summary>8-digit national item number of an existing line, from its tariff item or code.</summary>
    internal static string ItemKey(NationalTariffLine line)
    {
        var item = Digits(line.TariffItemNo);
        if (item.Length == 7) item = "0" + item;
        if (item.Length == 8) return item;
        var code = Digits(line.Code.Split('-')[0]);
        if (code.Length == 7) code = "0" + code;
        return code.Length >= 8 ? code[..8] : "";
    }

    internal static decimal? ParseRate(string? value)
    {
        var text = value?.Trim().TrimEnd('%') ?? "";
        return decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var rate) ? rate : null;
    }

    private static string CleanDescription(string value) => value.Trim().TrimStart('-', ' ').Trim();
    private static string Digits(string? value) => new((value ?? "").Where(char.IsDigit).ToArray());
}
