using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using SES.Customs.Infrastructure.Context;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

[DbContext(typeof(CustomsDbContext))]
[Migration("20260918130000_RepairMissingUserLocationScopes")]
public partial class RepairMissingUserLocationScopes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS "customs_user_location_scopes" (
                "Id" uuid NOT NULL,
                "UserId" uuid NOT NULL,
                "CustomsLocationId" uuid NOT NULL,
                "IncludeChildLocations" boolean NOT NULL,
                "Responsibilities" text NOT NULL,
                "EffectiveFrom" timestamp with time zone NOT NULL,
                "EffectiveTo" timestamp with time zone NULL,
                "CreatedBy" text NOT NULL,
                CONSTRAINT "PK_customs_user_location_scopes" PRIMARY KEY ("Id"),
                CONSTRAINT "FK_customs_user_location_scopes_AuthAccounts_UserId"
                    FOREIGN KEY ("UserId") REFERENCES "AuthAccounts" ("Id") ON DELETE RESTRICT,
                CONSTRAINT "FK_customs_user_location_scopes_customs_locations_CustomsLocationId"
                    FOREIGN KEY ("CustomsLocationId") REFERENCES "customs_locations" ("Id") ON DELETE RESTRICT
            );
            CREATE INDEX IF NOT EXISTS "IX_customs_user_location_scopes_CustomsLocationId"
                ON "customs_user_location_scopes" ("CustomsLocationId");
            CREATE INDEX IF NOT EXISTS "IX_customs_user_location_scopes_UserId_EffectiveTo"
                ON "customs_user_location_scopes" ("UserId", "EffectiveTo");
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP TABLE IF EXISTS \"customs_user_location_scopes\";");
    }
}
