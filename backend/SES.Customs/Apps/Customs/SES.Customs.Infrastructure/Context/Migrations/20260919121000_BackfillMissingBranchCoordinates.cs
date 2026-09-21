using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

/// <summary>
/// Gives legacy branches a valid map position when their parent region already
/// has a recorded coordinate. Administrators can replace this starter position
/// with the exact operational branch coordinates later.
/// </summary>
public partial class BackfillMissingBranchCoordinates : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE customs_locations branch
            SET "Latitude" = parent."Latitude",
                "Longitude" = parent."Longitude",
                "Source" = CASE WHEN branch."Source" = '' THEN 'SYSTEM_NORMALIZATION' ELSE branch."Source" END,
                "SourceReference" = CASE
                    WHEN branch."SourceReference" = '' THEN 'Coordinate inherited from the parent region; verify the exact operational position.'
                    ELSE branch."SourceReference"
                END,
                "UpdatedAt" = NOW(),
                "UpdatedBy" = 'SYSTEM_NORMALIZATION'
            FROM customs_locations parent
            WHERE branch."LocationType" = 'BRANCH'
              AND branch."ParentLocationId" = parent."Id"
              AND (branch."Latitude" IS NULL OR branch."Longitude" IS NULL)
              AND parent."Latitude" IS NOT NULL
              AND parent."Longitude" IS NOT NULL;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            UPDATE customs_locations
            SET "Latitude" = NULL,
                "Longitude" = NULL
            WHERE "UpdatedBy" = 'SYSTEM_NORMALIZATION'
              AND "LocationType" = 'BRANCH'
              AND "SourceReference" = 'Coordinate inherited from the parent region; verify the exact operational position.';
            """);
    }
}
