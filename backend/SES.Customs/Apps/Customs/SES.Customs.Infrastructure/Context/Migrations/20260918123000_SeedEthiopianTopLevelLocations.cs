using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SES.Customs.Infrastructure.Context;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

[DbContext(typeof(CustomsDbContext))]
[Migration("20260918123000_SeedEthiopianTopLevelLocations")]
public partial class SeedEthiopianTopLevelLocations : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            WITH seeds("Id", "OfficialCode", "Name", "DisplayName", "LocationType", "Region") AS (
                VALUES
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000001'::uuid, 'AFAR', 'Afar Region', 'Afar Region', 'REGION', 'AFAR'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000002'::uuid, 'AMHARA', 'Amhara Region', 'Amhara Region', 'REGION', 'AMHARA'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000003'::uuid, 'BENISHANGUL_GUMUZ', 'Benishangul-Gumuz Region', 'Benishangul-Gumuz Region', 'REGION', 'BENISHANGUL_GUMUZ'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000004'::uuid, 'CENTRAL_ETHIOPIA', 'Central Ethiopia Regional State', 'Central Ethiopia Regional State', 'REGION', 'CENTRAL_ETHIOPIA'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000005'::uuid, 'GAMBELA', 'Gambela Region', 'Gambela Region', 'REGION', 'GAMBELA'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000006'::uuid, 'HARARI', 'Harari Region', 'Harari Region', 'REGION', 'HARARI'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000007'::uuid, 'OROMIA', 'Oromia Region', 'Oromia Region', 'REGION', 'OROMIA'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000008'::uuid, 'SIDAMA', 'Sidama Region', 'Sidama Region', 'REGION', 'SIDAMA'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000009'::uuid, 'SOMALI', 'Somali Region', 'Somali Region', 'REGION', 'SOMALI'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000010'::uuid, 'SOUTH_ETHIOPIA', 'South Ethiopia Regional State', 'South Ethiopia Regional State', 'REGION', 'SOUTH_ETHIOPIA'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000011'::uuid, 'SOUTH_WEST_ETHIOPIA_PEOPLES', 'South West Ethiopia Peoples'' Region', 'South West Ethiopia Peoples'' Region', 'REGION', 'SOUTH_WEST_ETHIOPIA_PEOPLES'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000012'::uuid, 'TIGRAY', 'Tigray Region', 'Tigray Region', 'REGION', 'TIGRAY'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000013'::uuid, 'ADDIS_ABABA', 'Addis Ababa', 'Addis Ababa', 'REGION', 'ADDIS_ABABA'),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000014'::uuid, 'DIRE_DAWA', 'Dire Dawa', 'Dire Dawa', 'REGION', 'DIRE_DAWA')
            )
            INSERT INTO customs_locations
                ("Id", "OfficialCode", "Name", "DisplayName", "LocationType", "ParentLocationId", "Region", "Zone", "CityWoreda", "BorderCountry", "Status", "EffectiveFrom", "EffectiveTo", "IsEntryPoint", "IsExitPoint", "SupportsImport", "SupportsExport", "SupportsTransit", "SupportsValuation", "SupportsInspection", "Latitude", "Longitude", "Source", "SourceReference", "LastVerifiedAt", "CreatedBy", "UpdatedBy", "CreatedAt", "UpdatedAt", "Version")
            SELECT s."Id", s."OfficialCode", s."Name", s."DisplayName", s."LocationType", NULL, s."Region", '', '', '', 'ACTIVE', NOW(), NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, NULL, NULL, 'SYSTEM_SEED', 'Ethiopia top-level administrative locations', NOW(), 'SYSTEM_SEED', 'SYSTEM_SEED', NOW(), NOW(), gen_random_uuid()
            FROM seeds s
            WHERE NOT EXISTS (
                SELECT 1 FROM customs_locations existing
                WHERE UPPER(existing."OfficialCode") = s."OfficialCode"
            );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM customs_locations location
            WHERE location."Source" = 'SYSTEM_SEED'
              AND location."OfficialCode" IN ('AFAR', 'AMHARA', 'BENISHANGUL_GUMUZ', 'CENTRAL_ETHIOPIA', 'GAMBELA', 'HARARI', 'OROMIA', 'SIDAMA', 'SOMALI', 'SOUTH_ETHIOPIA', 'SOUTH_WEST_ETHIOPIA_PEOPLES', 'TIGRAY', 'ADDIS_ABABA', 'DIRE_DAWA')
              AND NOT EXISTS (SELECT 1 FROM customs_locations child WHERE child."ParentLocationId" = location."Id")
              AND NOT EXISTS (SELECT 1 FROM "AuthAccounts" account WHERE account."PrimaryLocationId" = location."Id")
              AND NOT EXISTS (SELECT 1 FROM valuation_decisions decision WHERE decision."LocationId" = location."Id")
              AND NOT EXISTS (SELECT 1 FROM audit_logs audit WHERE audit."LocationId" = location."Id");
            """);
    }
}
