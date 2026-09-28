using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SES.Customs.Infrastructure.Context;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

[DbContext(typeof(CustomsDbContext))]
[Migration("20260918143000_AddIphoneHsClassification")]
public partial class AddIphoneHsClassification : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DO $$
            DECLARE revision_id uuid;
            DECLARE hs_id uuid;
            BEGIN
                SELECT "Id" INTO revision_id FROM "hs_revisions" WHERE "Number" = 5 ORDER BY "EffectiveDate" DESC LIMIT 1;
                IF revision_id IS NULL THEN
                    revision_id := gen_random_uuid();
                    INSERT INTO "hs_revisions" ("Id", "Name", "Number", "EffectiveDate", "EndDate", "Status", "SourceReference")
                    VALUES (revision_id, 'Ethiopian Tariff Items v5', 5, DATE '2025-01-01', NULL, 'Active', 'International HS 2022 smartphone classification');
                END IF;
                SELECT "Id" INTO hs_id FROM "hs_codes" WHERE "RevisionId" = revision_id AND "Code" = '851713' LIMIT 1;
                IF hs_id IS NULL THEN
                    hs_id := gen_random_uuid();
                    INSERT INTO "hs_codes" ("Id", "RevisionId", "Code", "DescriptionEn", "DescriptionAm")
                    VALUES (hs_id, revision_id, '851713', 'Smartphones and other telephones for cellular networks or for other wireless networks, including Apple iPhone devices', NULL);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM "national_tariff_lines" WHERE "HsCodeId" = hs_id AND "Code" = '85171300') THEN
                    INSERT INTO "national_tariff_lines" ("Id", "HsCodeId", "Code", "DescriptionEn", "DescriptionAm", "Unit", "Duty", "SourceReference", "EffectiveDate", "EndDate")
                    VALUES (gen_random_uuid(), hs_id, '85171300', 'Smartphones and other telephones for cellular networks or for other wireless networks, including Apple iPhone devices', NULL, 'PCS', '', 'International HS 2022 smartphone classification', DATE '2025-01-01', NULL);
                END IF;
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM "national_tariff_lines" WHERE "Code" = '85171300';
            DELETE FROM "hs_codes" WHERE "Code" = '851713';
            """);
    }
}
