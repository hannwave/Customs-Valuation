using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

/// <summary>
/// Normalizes the fixed Ethiopia region catalog, merges duplicate region rows,
/// and creates one editable starter branch for every region.
/// </summary>
public partial class NormalizeEthiopianRegionsAndSeedBranches : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TEMP TABLE _ethiopian_regions (
                "Id" uuid NOT NULL,
                "OfficialCode" text NOT NULL,
                "Name" text NOT NULL,
                "DisplayName" text NOT NULL,
                "Region" text NOT NULL,
                "Latitude" numeric NOT NULL,
                "Longitude" numeric NOT NULL
            ) ON COMMIT DROP;

            INSERT INTO _ethiopian_regions
                ("Id", "OfficialCode", "Name", "DisplayName", "Region", "Latitude", "Longitude")
            VALUES
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000001', 'AFAR', 'Afar Region', 'Afar Region', 'AFAR', 11.75, 40.75),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000002', 'AMHARA', 'Amhara Region', 'Amhara Region', 'AMHARA', 11.50, 38.50),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000003', 'BENISHANGUL_GUMUZ', 'Benishangul-Gumuz Region', 'Benishangul-Gumuz Region', 'BENISHANGUL_GUMUZ', 10.75, 35.80),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000004', 'CENTRAL_ETHIOPIA', 'Central Ethiopia Regional State', 'Central Ethiopia Regional State', 'CENTRAL_ETHIOPIA', 8.20, 38.30),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000005', 'GAMBELA', 'Gambela Region', 'Gambela Region', 'GAMBELA', 8.25, 34.60),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000006', 'HARARI', 'Harari Region', 'Harari Region', 'HARARI', 9.31, 42.13),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000007', 'OROMIA', 'Oromia Region', 'Oromia Region', 'OROMIA', 7.55, 39.00),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000008', 'SIDAMA', 'Sidama Region', 'Sidama Region', 'SIDAMA', 6.70, 38.40),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000009', 'SOMALI', 'Somali Region', 'Somali Region', 'SOMALI', 6.50, 44.50),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000010', 'SOUTH_ETHIOPIA', 'South Ethiopia Regional State', 'South Ethiopia Regional State', 'SOUTH_ETHIOPIA', 6.00, 37.50),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000011', 'SOUTH_WEST_ETHIOPIA_PEOPLES', 'South West Ethiopia Peoples'' Region', 'South West Ethiopia Peoples'' Region', 'SOUTH_WEST_ETHIOPIA_PEOPLES', 7.00, 35.60),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000012', 'TIGRAY', 'Tigray Region', 'Tigray Region', 'TIGRAY', 14.10, 38.50),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000013', 'ADDIS_ABABA', 'Addis Ababa', 'Addis Ababa', 'ADDIS_ABABA', 9.03, 38.74),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000000014', 'DIRE_DAWA', 'Dire Dawa', 'Dire Dawa', 'DIRE_DAWA', 9.60, 41.85);

            INSERT INTO customs_locations
                ("Id", "OfficialCode", "Name", "DisplayName", "LocationType", "ParentLocationId", "Region",
                 "Zone", "CityWoreda", "BorderCountry", "Status", "EffectiveFrom", "EffectiveTo",
                 "IsEntryPoint", "IsExitPoint", "SupportsImport", "SupportsExport", "SupportsTransit",
                 "SupportsValuation", "SupportsInspection", "Latitude", "Longitude", "Source",
                 "SourceReference", "LastVerifiedAt", "CreatedBy", "UpdatedBy", "CreatedAt", "UpdatedAt", "Version")
            SELECT r."Id", r."OfficialCode", r."Name", r."DisplayName", 'REGION', NULL, r."Region",
                   '', '', '', 'ACTIVE', NOW(), NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
                   r."Latitude", r."Longitude", 'SYSTEM_SEED',
                   'Canonical Ethiopia region catalog; coordinates are representative regional centers.',
                   NOW(), 'SYSTEM_SEED', 'SYSTEM_SEED', NOW(), NOW(), gen_random_uuid()
            FROM _ethiopian_regions r
            WHERE NOT EXISTS (
                SELECT 1 FROM customs_locations l
                WHERE UPPER(l."OfficialCode") = r."OfficialCode"
            );

            UPDATE customs_locations l
            SET "LocationType" = 'REGION',
                "ParentLocationId" = NULL,
                "Region" = r."Region",
                "Latitude" = COALESCE(l."Latitude", r."Latitude"),
                "Longitude" = COALESCE(l."Longitude", r."Longitude"),
                "UpdatedAt" = NOW(),
                "UpdatedBy" = 'SYSTEM_NORMALIZATION'
            FROM _ethiopian_regions r
            WHERE UPPER(l."OfficialCode") = r."OfficialCode";

            CREATE TEMP TABLE _duplicate_region_map ("DuplicateId" uuid PRIMARY KEY, "CanonicalId" uuid NOT NULL) ON COMMIT DROP;

            INSERT INTO _duplicate_region_map ("DuplicateId", "CanonicalId")
            SELECT duplicate."Id", canonical."Id"
            FROM customs_locations duplicate
            JOIN _ethiopian_regions r ON
                regexp_replace(lower(duplicate."Name"), '[^a-z0-9]', '', 'g') = regexp_replace(lower(r."Name"), '[^a-z0-9]', '', 'g')
                OR (r."OfficialCode" = 'ADDIS_ABABA' AND UPPER(duplicate."OfficialCode") IN ('AA', '01100'))
            JOIN customs_locations canonical ON UPPER(canonical."OfficialCode") = r."OfficialCode"
            WHERE duplicate."LocationType" = 'REGION'
              AND duplicate."Id" <> canonical."Id";

            UPDATE customs_locations child
            SET "ParentLocationId" = mapping."CanonicalId",
                "UpdatedAt" = NOW(),
                "UpdatedBy" = 'SYSTEM_NORMALIZATION'
            FROM _duplicate_region_map mapping
            WHERE child."ParentLocationId" = mapping."DuplicateId";

            UPDATE "AuthAccounts" account
            SET "PrimaryLocationId" = mapping."CanonicalId"
            FROM _duplicate_region_map mapping
            WHERE account."PrimaryLocationId" = mapping."DuplicateId";

            UPDATE valuation_decisions decision
            SET "LocationId" = mapping."CanonicalId"
            FROM _duplicate_region_map mapping
            WHERE decision."LocationId" = mapping."DuplicateId";

            UPDATE audit_logs audit
            SET "LocationId" = mapping."CanonicalId"
            FROM _duplicate_region_map mapping
            WHERE audit."LocationId" = mapping."DuplicateId";

            UPDATE customs_location_history history
            SET "CustomsLocationId" = mapping."CanonicalId"
            FROM _duplicate_region_map mapping
            WHERE history."CustomsLocationId" = mapping."DuplicateId";

            DO $$
            BEGIN
                IF to_regclass('public.customs_user_location_scopes') IS NOT NULL THEN
                    DROP TABLE customs_user_location_scopes;
                END IF;
            END $$;

            DELETE FROM customs_locations duplicate
            USING _duplicate_region_map mapping
            WHERE duplicate."Id" = mapping."DuplicateId"
              AND NOT EXISTS (SELECT 1 FROM customs_locations child WHERE child."ParentLocationId" = duplicate."Id")
              AND NOT EXISTS (SELECT 1 FROM "AuthAccounts" account WHERE account."PrimaryLocationId" = duplicate."Id")
              AND NOT EXISTS (SELECT 1 FROM valuation_decisions decision WHERE decision."LocationId" = duplicate."Id")
              AND NOT EXISTS (SELECT 1 FROM audit_logs audit WHERE audit."LocationId" = duplicate."Id")
              AND NOT EXISTS (SELECT 1 FROM customs_location_history history WHERE history."CustomsLocationId" = duplicate."Id");

            CREATE TEMP TABLE _ethiopian_branches (
                "Id" uuid NOT NULL,
                "OfficialCode" text NOT NULL,
                "RegionCode" text NOT NULL,
                "Name" text NOT NULL,
                "Latitude" numeric NOT NULL,
                "Longitude" numeric NOT NULL
            ) ON COMMIT DROP;

            INSERT INTO _ethiopian_branches
                ("Id", "OfficialCode", "RegionCode", "Name", "Latitude", "Longitude")
            VALUES
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001001', 'AFAR-BR-001', 'AFAR', 'Afar Regional Customs Branch', 11.75, 40.75),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001002', 'AMHARA-BR-001', 'AMHARA', 'Amhara Regional Customs Branch', 11.50, 38.50),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001003', 'BENISHANGUL_GUMUZ-BR-001', 'BENISHANGUL_GUMUZ', 'Benishangul-Gumuz Regional Customs Branch', 10.75, 35.80),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001004', 'CENTRAL_ETHIOPIA-BR-001', 'CENTRAL_ETHIOPIA', 'Central Ethiopia Regional Customs Branch', 8.20, 38.30),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001005', 'GAMBELA-BR-001', 'GAMBELA', 'Gambela Regional Customs Branch', 8.25, 34.60),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001006', 'HARARI-BR-001', 'HARARI', 'Harari Regional Customs Branch', 9.31, 42.13),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001007', 'OROMIA-BR-001', 'OROMIA', 'Oromia Regional Customs Branch', 7.55, 39.00),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001008', 'SIDAMA-BR-001', 'SIDAMA', 'Sidama Regional Customs Branch', 6.70, 38.40),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001009', 'SOMALI-BR-001', 'SOMALI', 'Somali Regional Customs Branch', 6.50, 44.50),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001010', 'SOUTH_ETHIOPIA-BR-001', 'SOUTH_ETHIOPIA', 'South Ethiopia Regional Customs Branch', 6.00, 37.50),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001011', 'SOUTH_WEST_ETHIOPIA_PEOPLES-BR-001', 'SOUTH_WEST_ETHIOPIA_PEOPLES', 'South West Ethiopia Peoples Regional Customs Branch', 7.00, 35.60),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001012', 'TIGRAY-BR-001', 'TIGRAY', 'Tigray Regional Customs Branch', 14.10, 38.50),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001013', 'ADDIS_ABABA-BR-001', 'ADDIS_ABABA', 'Addis Ababa Regional Customs Branch', 9.03, 38.74),
                ('d8c4a7e1-7e8e-4fc0-a0a1-000000001014', 'DIRE_DAWA-BR-001', 'DIRE_DAWA', 'Dire Dawa Regional Customs Branch', 9.60, 41.85);

            INSERT INTO customs_locations
                ("Id", "OfficialCode", "Name", "DisplayName", "LocationType", "ParentLocationId", "Region",
                 "Zone", "CityWoreda", "BorderCountry", "Status", "EffectiveFrom", "EffectiveTo",
                 "IsEntryPoint", "IsExitPoint", "SupportsImport", "SupportsExport", "SupportsTransit",
                 "SupportsValuation", "SupportsInspection", "Latitude", "Longitude", "Source",
                 "SourceReference", "LastVerifiedAt", "CreatedBy", "UpdatedBy", "CreatedAt", "UpdatedAt", "Version")
            SELECT b."Id", b."OfficialCode", b."Name", b."Name", 'BRANCH', region."Id", b."RegionCode",
                   '', '', '', 'ACTIVE', NOW(), NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
                   b."Latitude", b."Longitude", 'SYSTEM_SEED',
                   'Starter branch for the canonical region; verify the operational coordinates before use.',
                   NOW(), 'SYSTEM_SEED', 'SYSTEM_SEED', NOW(), NOW(), gen_random_uuid()
            FROM _ethiopian_branches b
            JOIN customs_locations region ON UPPER(region."OfficialCode") = b."RegionCode"
            WHERE NOT EXISTS (
                SELECT 1 FROM customs_locations existing
                WHERE existing."ParentLocationId" = region."Id"
                  AND existing."LocationType" = 'BRANCH'
            )
              AND NOT EXISTS (
                SELECT 1 FROM customs_locations existing
                WHERE UPPER(existing."OfficialCode") = b."OfficialCode"
            );
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DELETE FROM customs_locations branch
            WHERE branch."Source" = 'SYSTEM_SEED'
              AND branch."OfficialCode" LIKE '%-BR-001'
              AND NOT EXISTS (SELECT 1 FROM customs_locations child WHERE child."ParentLocationId" = branch."Id")
              AND NOT EXISTS (SELECT 1 FROM "AuthAccounts" account WHERE account."PrimaryLocationId" = branch."Id")
              AND NOT EXISTS (SELECT 1 FROM valuation_decisions decision WHERE decision."LocationId" = branch."Id")
              AND NOT EXISTS (SELECT 1 FROM audit_logs audit WHERE audit."LocationId" = branch."Id")
              AND NOT EXISTS (SELECT 1 FROM customs_location_history history WHERE history."CustomsLocationId" = branch."Id");
            """);
    }
}
