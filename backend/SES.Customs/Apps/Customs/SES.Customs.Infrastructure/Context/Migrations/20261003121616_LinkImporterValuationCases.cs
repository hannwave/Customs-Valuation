using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class LinkImporterValuationCases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ImporterDeclarationId",
                table: "valuation_decisions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_valuation_decisions_ImporterDeclarationId",
                table: "valuation_decisions",
                column: "ImporterDeclarationId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_valuation_decisions_importer_declarations_ImporterDeclarati~",
                table: "valuation_decisions",
                column: "ImporterDeclarationId",
                principalTable: "importer_declarations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_valuation_decisions_importer_declarations_ImporterDeclarati~",
                table: "valuation_decisions");

            migrationBuilder.DropIndex(
                name: "IX_valuation_decisions_ImporterDeclarationId",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "ImporterDeclarationId",
                table: "valuation_decisions");
        }
    }
}
