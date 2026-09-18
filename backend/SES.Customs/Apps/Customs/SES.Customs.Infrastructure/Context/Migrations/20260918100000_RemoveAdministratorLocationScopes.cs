using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

/// <summary>
/// Removes the obsolete multi-location administrator-scope table. Users now have one
/// primary location through AuthAccounts.PrimaryLocationId.
/// </summary>
public partial class RemoveAdministratorLocationScopes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "customs_user_location_scopes");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "customs_user_location_scopes",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                UserId = table.Column<Guid>(type: "uuid", nullable: false),
                CustomsLocationId = table.Column<Guid>(type: "uuid", nullable: false),
                IncludeChildLocations = table.Column<bool>(type: "boolean", nullable: false),
                Responsibilities = table.Column<string>(type: "text", nullable: false),
                EffectiveFrom = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                EffectiveTo = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_customs_user_location_scopes", x => x.Id);
                table.ForeignKey("FK_customs_user_location_scopes_AuthAccounts_UserId", x => x.UserId, "AuthAccounts", "Id", onDelete: ReferentialAction.Cascade);
                table.ForeignKey("FK_customs_user_location_scopes_customs_locations_CustomsLocationId", x => x.CustomsLocationId, "customs_locations", "Id", onDelete: ReferentialAction.Cascade);
            });
    }
}
