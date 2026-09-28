using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

public partial class EnforceEthiopiaLocationCoordinates : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Earlier records may have a single coordinate or a point outside Ethiopia.
        // Keep the location itself intact, but remove unusable legacy coordinates so
        // the map can use its clearly marked approximate fallback until an
        // administrator records the actual point.
        migrationBuilder.Sql("""
            UPDATE customs_locations
            SET "Latitude" = NULL,
                "Longitude" = NULL
            WHERE ("Latitude" IS NULL AND "Longitude" IS NOT NULL)
               OR ("Latitude" IS NOT NULL AND "Longitude" IS NULL)
               OR ("Latitude" < 3.35 OR "Latitude" > 14.95)
               OR ("Longitude" < 33.00 OR "Longitude" > 48.05);
            """);

        migrationBuilder.AddCheckConstraint(
            name: "CK_customs_locations_coordinates_complete",
            table: "customs_locations",
            sql: "(\"Latitude\" IS NULL AND \"Longitude\" IS NULL) OR (\"Latitude\" IS NOT NULL AND \"Longitude\" IS NOT NULL)");

        migrationBuilder.AddCheckConstraint(
            name: "CK_customs_locations_coordinates_ethiopia",
            table: "customs_locations",
            sql: "\"Latitude\" IS NULL OR (\"Latitude\" >= 3.35 AND \"Latitude\" <= 14.95 AND \"Longitude\" >= 33.00 AND \"Longitude\" <= 48.05)");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint("CK_customs_locations_coordinates_ethiopia", "customs_locations");
        migrationBuilder.DropCheckConstraint("CK_customs_locations_coordinates_complete", "customs_locations");
    }
}
