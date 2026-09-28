using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SES.Customs.Infrastructure.Context;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

[DbContext(typeof(CustomsDbContext))]
[Migration("20260923133000_AddPhase2QuantityUnit")]
public sealed class AddPhase2QuantityUnit : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<decimal>("Quantity", "valuation_phase2", type: "numeric(24,8)", precision: 24, scale: 8, nullable: false, defaultValue: 1m);
        migrationBuilder.AddColumn<string>("Unit", "valuation_phase2", type: "character varying(40)", maxLength: 40, nullable: false, defaultValue: "PCS");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("Quantity", "valuation_phase2");
        migrationBuilder.DropColumn("Unit", "valuation_phase2");
    }
}
