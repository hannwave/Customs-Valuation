using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

public partial class NormalizeLocationHierarchy : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("UPDATE customs_locations SET \"LocationType\" = 'REGION' WHERE \"LocationType\" IN ('REGIONAL_STATE', 'CHARTERED_CITY');");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // The original distinction cannot be reconstructed safely after normalization.
    }
}
