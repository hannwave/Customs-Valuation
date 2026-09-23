using SES.Customs.Common;
using SES.Customs.Core.Dtos;
using SES.Customs.Core.Features.HsCodes.Contract.Repository;

namespace SES.Customs.Infrastructure.Repository;

// Synthetic, read-only fixtures. Never connect to a real database in demo mode.
public sealed class DemoHsCodeRepository : IHsCodeRepository
{
    public static readonly Guid RevisionId = Guid.Parse("11111111-1111-4111-8111-111111111111");

    public static readonly HsCodeDto[] Codes = [
        new(Guid.Parse("44444444-4444-4444-4444-444444444444"), RevisionId, "851713", "Smartphones, for cellular networks or for other wireless networks (including Apple iPhone)", "ስማርትፎኖች እና ተንቀሳቃሽ ስልኮች", "15%", "8517.1390", "u", "XVI", "Machinery and electrical equipment", 85, "Electrical machinery", "8517"),
        new(Guid.Parse("55555555-5555-5555-5555-555555555555"), RevisionId, "240210", "Cigars, cheroots and cigarillos, containing tobacco", "ሲጋሮች እና ቼሩቶች", "35%", "2402.1000", "kg", "IV", "Prepared foodstuffs; tobacco", 24, "Tobacco", "2402"),
        new(Guid.Parse("66666666-6666-6666-6666-666666666666"), RevisionId, "240220", "Cigarettes containing tobacco", "ሲጋራዎች", "35%", "2402.2000", "kg", "IV", "Prepared foodstuffs; tobacco", 24, "Tobacco", "2402"),
        new(Guid.Parse("77777777-7777-7777-7777-777777777777"), RevisionId, "847130", "Portable automatic data processing machines, weighing not more than 10 kg (laptops/notebooks)", "ተንቀሳቃሽ ኮምፒውተሮች", "10%", "8471.3000", "u", "XVI", "Machinery and electrical equipment", 84, "Nuclear reactors, boilers, machinery", "8471"),
        new(Guid.Parse("88888888-8888-8888-8888-888888888888"), RevisionId, "870323", "Motor cars and vehicles designed for transport of persons (1500 cc to 3000 cc)", "የሞተር ተሽከርካሪዎች", "35%", "8703.2390", "u", "XVII", "Vehicles, aircraft, vessels", 87, "Vehicles", "8703"),
        new(Guid.Parse("22222222-2222-4222-8222-222222222222"), RevisionId, "850440", "Static converters (e.g. electrical inverters and chargers)", "የኤሌክትሪክ መቀየሪያ", "15%", "8504.4000", "u", "XVI", "Machinery and electrical equipment", 85, "Electrical machinery", "8504"),
        new(Guid.Parse("33333333-3333-4333-8333-333333333333"), RevisionId, "090111", "Coffee, not roasted, not decaffeinated", "ያልተቆላ ቡና", "Free", "0901.1100", "kg", "II", "Vegetable products", 9, "Coffee, tea, maté and spices", "0901")
    ];

    public Task<PagedResult<HsCodeDto>> SearchAsync(string? search, Guid? revisionId, int page, int pageSize, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var term = (search ?? "").Trim().ToLowerInvariant();
        var cleanCode = term.Replace(".", "").Replace(" ", "");

        var matches = Codes.Where(x =>
        {
            if (revisionId.HasValue && x.RevisionId != revisionId) return false;
            if (string.IsNullOrWhiteSpace(term)) return true;

            var codeMatch = (!string.IsNullOrEmpty(x.Code) && x.Code.ToLowerInvariant().Contains(cleanCode))
                || (!string.IsNullOrEmpty(x.TariffItemNo) && x.TariffItemNo.ToLowerInvariant().Replace(".", "").Contains(cleanCode))
                || (!string.IsNullOrEmpty(x.TariffItemNo) && x.TariffItemNo.ToLowerInvariant().Contains(term));

            var descMatch = x.DescriptionEn.Contains(term, StringComparison.OrdinalIgnoreCase)
                || (!string.IsNullOrEmpty(x.DescriptionAm) && x.DescriptionAm.Contains(term, StringComparison.OrdinalIgnoreCase))
                || x.ChapterName.Contains(term, StringComparison.OrdinalIgnoreCase)
                || x.SectionName.Contains(term, StringComparison.OrdinalIgnoreCase);

            // Special keyword synonyms
            var keywordMatch = (term.Contains("iphone") || term.Contains("phone") || term.Contains("mobile") || term.Contains("smartphone")) && x.Code == "851713"
                || (term.Contains("cigar") || term.Contains("habano")) && x.Code == "240210"
                || (term.Contains("cigarette") || term.Contains("smoke")) && x.Code == "240220"
                || (term.Contains("laptop") || term.Contains("notebook") || term.Contains("computer")) && x.Code == "847130"
                || (term.Contains("car") || term.Contains("vehicle") || term.Contains("auto")) && x.Code == "870323";

            return codeMatch || descMatch || keywordMatch;
        }).OrderBy(x => x.Code).ToArray();

        var paged = matches.Skip((page - 1) * pageSize).Take(pageSize).ToArray();
        return Task.FromResult(new PagedResult<HsCodeDto>(paged, matches.Length, page, pageSize));
    }

    public Task<HsCodeDto?> GetByIdAsync(Guid id, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult(Codes.SingleOrDefault(x => x.Id == id));
    }

    public Task<IReadOnlyList<HsRevisionDto>> GetRevisionsAsync(CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        return Task.FromResult<IReadOnlyList<HsRevisionDto>>([new(RevisionId, "HS 2022 · National Tariff Schedule", 2022, new(2022, 1, 1), null, "Active", "HS2017", "HS2022", Codes.Length)]);
    }
}
