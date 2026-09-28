using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

public partial class EnforceLocationHierarchy : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Older databases may contain location types from the previous hierarchy
        // (for example REGIONAL_STATE, BRANCH_OFFICE, CUSTOMS_STATION, or CHECKPOINT).
        // The current model has exactly two levels: top-level REGIONs and their
        // child BRANCHes. Normalize all legacy values before adding the constraint.
        migrationBuilder.Sql("""
            UPDATE customs_locations
            SET "LocationType" = CASE
                WHEN "ParentLocationId" IS NULL THEN 'REGION'
                ELSE 'BRANCH'
            END
            WHERE "LocationType" NOT IN ('REGION', 'BRANCH');
            """);
        migrationBuilder.AddCheckConstraint(
            name: "CK_customs_locations_location_type",
            table: "customs_locations",
            sql: "\"LocationType\" IN ('REGION', 'BRANCH')");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint("CK_customs_locations_location_type", "customs_locations");
    }
}
