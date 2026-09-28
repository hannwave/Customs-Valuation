using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SES.Customs.Infrastructure.Context;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

[DbContext(typeof(CustomsDbContext))]
[Migration("20260917120000_DeferHsClassificationToPhase2")]
public partial class DeferHsClassificationToPhase2 : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_valuation_decisions_hs_codes_HsCodeId",
            table: "valuation_decisions");

        migrationBuilder.AlterColumn<Guid>(
            name: "HsCodeId",
            table: "valuation_decisions",
            type: "uuid",
            nullable: true,
            oldClrType: typeof(Guid),
            oldType: "uuid");

        migrationBuilder.AddForeignKey(
            name: "FK_valuation_decisions_hs_codes_HsCodeId",
            table: "valuation_decisions",
            column: "HsCodeId",
            principalTable: "hs_codes",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict);

        migrationBuilder.DropForeignKey(
            name: "FK_valuation_phase2_hs_codes_OriginalHsCodeId",
            table: "valuation_phase2");

        migrationBuilder.AlterColumn<Guid>(
            name: "OriginalHsCodeId",
            table: "valuation_phase2",
            type: "uuid",
            nullable: true,
            oldClrType: typeof(Guid),
            oldType: "uuid");

        migrationBuilder.AddForeignKey(
            name: "FK_valuation_phase2_hs_codes_OriginalHsCodeId",
            table: "valuation_phase2",
            column: "OriginalHsCodeId",
            principalTable: "hs_codes",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropForeignKey(
            name: "FK_valuation_decisions_hs_codes_HsCodeId",
            table: "valuation_decisions");

        migrationBuilder.AlterColumn<Guid>(
            name: "HsCodeId",
            table: "valuation_decisions",
            type: "uuid",
            nullable: false,
            oldClrType: typeof(Guid),
            oldType: "uuid",
            oldNullable: true);

        migrationBuilder.AddForeignKey(
            name: "FK_valuation_decisions_hs_codes_HsCodeId",
            table: "valuation_decisions",
            column: "HsCodeId",
            principalTable: "hs_codes",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict);

        migrationBuilder.DropForeignKey(
            name: "FK_valuation_phase2_hs_codes_OriginalHsCodeId",
            table: "valuation_phase2");

        migrationBuilder.AlterColumn<Guid>(
            name: "OriginalHsCodeId",
            table: "valuation_phase2",
            type: "uuid",
            nullable: false,
            oldClrType: typeof(Guid),
            oldType: "uuid",
            oldNullable: true);

        migrationBuilder.AddForeignKey(
            name: "FK_valuation_phase2_hs_codes_OriginalHsCodeId",
            table: "valuation_phase2",
            column: "OriginalHsCodeId",
            principalTable: "hs_codes",
            principalColumn: "Id",
            onDelete: ReferentialAction.Restrict);
    }
}
