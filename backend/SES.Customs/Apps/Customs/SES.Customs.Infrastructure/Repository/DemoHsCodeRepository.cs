
using SES.Customs.Common;
using SES.Customs.Core.Dtos;
using SES.Customs.Core.Features.HsCodes.Contract.Repository;

namespace SES.Customs.Infrastructure.Repository;

// Synthetic, read-only fixtures.
// Never connect to a real database in demo mode.
public sealed class DemoHsCodeRepository : IHsCodeRepository
{
    public static readonly Guid RevisionId2022 =
        Guid.Parse("11111111-1111-4111-8111-111111111111");

    public static readonly Guid RevisionId2021 =
        Guid.Parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    private static readonly HsCodeDto[] Codes =
    [
        // =========================
        // HS 2022 DEMO
        // =========================

        new(
            Guid.Parse("22222222-2222-4222-8222-222222222222"),
            RevisionId2022,
            "850440",
            "Demo electrical converter",
            "የሙከራ ኤሌክትሪክ መቀየሪያ"
        ),

        new(
            Guid.Parse("33333333-3333-4333-8333-333333333333"),
            RevisionId2022,
            "090111",
            "Demo coffee product",
            "የሙከራ ቡና"
        ),

        new(
            Guid.Parse("44444444-4444-4444-8444-444444444444"),
            RevisionId2022,
            "040110",
            "Demo fresh milk",
            "የሙከራ ትኩስ ወተት"
        ),

        new(
            Guid.Parse("55555555-5555-4555-8555-555555555555"),
            RevisionId2022,
            "040210",
            "Demo milk powder",
            "የሙከራ ወተት ዱቄት"
        ),

        new(
            Guid.Parse("66666666-6666-4666-8666-666666666666"),
            RevisionId2022,
            "040510",
            "Demo butter",
            "የሙከራ ቅቤ"
        ),

        new(
            Guid.Parse("77777777-7777-4777-8777-777777777777"),
            RevisionId2022,
            "040610",
            "Demo fresh cheese",
            "የሙከራ አዲስ አይብ"
        ),

        new(
            Guid.Parse("88888888-8888-4888-8888-888888888888"),
            RevisionId2022,
            "040900",
            "Demo natural honey",
            "የሙከራ ተፈጥሮአዊ ማር"
        ),

        new(
            Guid.Parse("99999999-9999-4999-8999-999999999999"),
            RevisionId2022,
            "070200",
            "Demo fresh tomatoes",
            "የሙከራ ትኩስ ቲማቲም"
        ),

        new(
            Guid.Parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
            RevisionId2022,
            "070320",
            "Demo fresh garlic",
            "የሙከራ ትኩስ ነጭ ሽንኩርት"
        ),

        new(
            Guid.Parse("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
            RevisionId2022,
            "070410",
            "Demo fresh cabbage",
            "የሙከራ ትኩስ ጎመን"
        ),

        new(
            Guid.Parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
            RevisionId2022,
            "070511",
            "Demo fresh lettuce",
            "የሙከራ ትኩስ ሰላጣ"
        ),

        new(
            Guid.Parse("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
            RevisionId2022,
            "070610",
            "Demo fresh carrots",
            "የሙከራ ትኩስ ካሮት"
        ),

        new(
            Guid.Parse("ffffffff-ffff-4fff-8fff-ffffffffffff"),
            RevisionId2022,
            "070700",
            "Demo fresh cucumbers",
            "የሙከራ ትኩስ ኪያር"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111112"),
            RevisionId2022,
            "070960",
            "Demo fresh peppers",
            "የሙከራ ትኩስ ቃሪያ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111113"),
            RevisionId2022,
            "071010",
            "Demo frozen potatoes",
            "የሙከራ የቀዘቀዘ ድንች"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111114"),
            RevisionId2022,
            "071331",
            "Demo dried beans",
            "የሙከራ ደረቅ ቦሎቄ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111115"),
            RevisionId2022,
            "080310",
            "Demo fresh bananas",
            "የሙከራ ትኩስ ሙዝ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111116"),
            RevisionId2022,
            "080510",
            "Demo fresh oranges",
            "የሙከራ ትኩስ ብርቱካን"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111117"),
            RevisionId2022,
            "080521",
            "Demo fresh mandarins",
            "የሙከራ ትኩስ ማንዳሪን"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111118"),
            RevisionId2022,
            "080530",
            "Demo fresh lemons",
            "የሙከራ ትኩስ ሎሚ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111119"),
            RevisionId2022,
            "080610",
            "Demo fresh grapes",
            "የሙከራ ትኩስ ወይን"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111120"),
            RevisionId2022,
            "080711",
            "Demo fresh watermelon",
            "የሙከራ ትኩስ ሐብሐብ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111121"),
            RevisionId2022,
            "080810",
            "Demo fresh apples",
            "የሙከራ ትኩስ ፖም"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111122"),
            RevisionId2022,
            "080830",
            "Demo fresh pears",
            "የሙከራ ትኩስ ፒር"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111123"),
            RevisionId2022,
            "081010",
            "Demo fresh strawberries",
            "የሙከራ ትኩስ ስትሮቤሪ"
        ),

        // =========================
        // HS 2021 DEMO
        // =========================

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111124"),
            RevisionId2021,
            "090121",
            "Demo roasted coffee",
            "የሙከራ የተጠበሰ ቡና"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111125"),
            RevisionId2021,
            "090210",
            "Demo green tea",
            "የሙከራ አረንጓዴ ሻይ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111126"),
            RevisionId2021,
            "090230",
            "Demo black tea",
            "የሙከራ ጥቁር ሻይ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111127"),
            RevisionId2021,
            "100190",
            "Demo wheat grain",
            "የሙከራ ስንዴ እህል"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111128"),
            RevisionId2021,
            "100590",
            "Demo maize corn",
            "የሙከራ በቆሎ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111129"),
            RevisionId2021,
            "100630",
            "Demo milled rice",
            "የሙከራ ሩዝ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111130"),
            RevisionId2021,
            "100890",
            "Demo teff grain",
            "የሙከራ ጤፍ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111131"),
            RevisionId2021,
            "110100",
            "Demo wheat flour",
            "የሙከራ ስንዴ ዱቄት"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111132"),
            RevisionId2021,
            "150910",
            "Demo olive oil",
            "የሙከራ የወይራ ዘይት"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111133"),
            RevisionId2021,
            "151110",
            "Demo palm oil",
            "የሙከራ የዘንባባ ዘይት"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111134"),
            RevisionId2021,
            "170199",
            "Demo refined sugar",
            "የሙከራ የተጣራ ስኳር"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111135"),
            RevisionId2021,
            "180690",
            "Demo chocolate",
            "የሙከራ ቸኮሌት"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111136"),
            RevisionId2021,
            "190219",
            "Demo pasta",
            "የሙከራ ፓስታ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111137"),
            RevisionId2021,
            "190590",
            "Demo bread",
            "የሙከራ ዳቦ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111138"),
            RevisionId2021,
            "200990",
            "Demo fruit juice",
            "የሙከራ የፍራፍሬ ጭማቂ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111139"),
            RevisionId2021,
            "220110",
            "Demo mineral water",
            "የሙከራ ማዕድን ውሃ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111140"),
            RevisionId2021,
            "220210",
            "Demo soft drink",
            "የሙከራ ለስላሳ መጠጥ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111141"),
            RevisionId2021,
            "220300",
            "Demo beer",
            "የሙከራ ቢራ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111142"),
            RevisionId2021,
            "220421",
            "Demo red wine",
            "የሙከራ ቀይ ወይን"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111143"),
            RevisionId2021,
            "240220",
            "Demo cigarettes",
            "የሙከራ ሲጋራ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111144"),
            RevisionId2021,
            "250100",
            "Demo salt",
            "የሙከራ ጨው"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111145"),
            RevisionId2021,
            "252329",
            "Demo cement",
            "የሙከራ ሲሚንቶ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111146"),
            RevisionId2021,
            "271019",
            "Demo diesel fuel",
            "የሙከራ ናፍጣ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111147"),
            RevisionId2021,
            "300490",
            "Demo medicine",
            "የሙከራ መድኃኒት"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111148"),
            RevisionId2021,
            "320890",
            "Demo paint",
            "የሙከራ ቀለም"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111149"),
            RevisionId2021,
            "340111",
            "Demo soap",
            "የሙከራ ሳሙና"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111150"),
            RevisionId2021,
            "340220",
            "Demo detergent",
            "የሙከራ ማጠቢያ ዱቄት"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111151"),
            RevisionId2021,
            "392330",
            "Demo plastic bottle",
            "የሙከራ የፕላስቲክ ጠርሙስ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111152"),
            RevisionId2021,
            "441900",
            "Demo wooden table",
            "የሙከራ የእንጨት ጠረጴዛ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111153"),
            RevisionId2021,
            "520100",
            "Demo cotton",
            "የሙከራ ጥጥ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111154"),
            RevisionId2021,
            "610910",
            "Demo cotton t-shirt",
            "የሙከራ የጥጥ ቲሸርት"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111155"),
            RevisionId2021,
            "640399",
            "Demo leather shoes",
            "የሙከራ የቆዳ ጫማ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111156"),
            RevisionId2021,
            "721420",
            "Demo steel rebar",
            "የሙከራ የብረት ዘንግ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111157"),
            RevisionId2021,
            "847130",
            "Demo laptop computer",
            "የሙከራ ላፕቶፕ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111158"),
            RevisionId2021,
            "851712",
            "Demo mobile phone",
            "የሙከራ ሞባይል ስልክ"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111159"),
            RevisionId2021,
            "870323",
            "Demo passenger car",
            "የሙከራ መንገደኛ መኪና"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111160"),
            RevisionId2021,
            "871120",
            "Demo motorcycle",
            "የሙከራ ሞተር ብስክሌት"
        ),

        new(
            Guid.Parse("11111111-1111-4111-8111-111111111161"),
            RevisionId2021,
            "940360",
            "Demo wooden furniture",
            "የሙከራ የእንጨት እቃ"
        )
    ];

    public Task<PagedResult<HsCodeDto>> SearchAsync(
        string? search,
        Guid? revisionId,
        int page,
        int pageSize,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        var term = search?.Trim() ?? string.Empty;

        var rows = Codes
            .Where(x =>
                (!revisionId.HasValue || x.RevisionId == revisionId) &&
                (
                    x.Code.Contains(term.Replace(".", "")) ||
                    x.DescriptionEn.Contains(
                        term,
                        StringComparison.OrdinalIgnoreCase) ||
                    (x.DescriptionAm?.Contains(term) ?? false)
                ))
            .OrderBy(x => x.Code)
            .ToArray();

        return Task.FromResult(
            new PagedResult<HsCodeDto>(
                rows
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .ToArray(),
                rows.Length,
                page,
                pageSize
            )
        );
    }

    public Task<HsCodeDto?> GetByIdAsync(
        Guid id,
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        return Task.FromResult(
            Codes.SingleOrDefault(x => x.Id == id)
        );
    }

    public Task<IReadOnlyList<HsRevisionDto>> GetRevisionsAsync(
        CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        return Task.FromResult<IReadOnlyList<HsRevisionDto>>(
        [
            new(
                RevisionId2022,
                "HS 2022 · DEMO",
                2022,
                new DateOnly(2022, 1, 1),
                null,
                "Demo"
            ),

            new(
                RevisionId2021,
                "HS 2021 · DEMO",
                2021,
                new DateOnly(2021, 1, 1),
                new DateOnly(2021, 12, 31),
                "Demo"
            )
        ]);
    }
}

