using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class AddImporterAssessmentAndNotifications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AssessedAt",
                table: "importer_declarations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AssessedCustomsValue",
                table: "importer_declarations",
                type: "numeric(20,2)",
                precision: 20,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AssessedPayable",
                table: "importer_declarations",
                type: "numeric(20,2)",
                precision: 20,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AssessedTotalTax",
                table: "importer_declarations",
                type: "numeric(20,2)",
                precision: 20,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AssessmentCurrency",
                table: "importer_declarations",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AssessmentJson",
                table: "importer_declarations",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<decimal>(
                name: "FreightAmount",
                table: "importer_declarations",
                type: "numeric(20,2)",
                precision: 20,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "InsuranceAmount",
                table: "importer_declarations",
                type: "numeric(20,2)",
                precision: 20,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "InvoiceAmount",
                table: "importer_declarations",
                type: "numeric(20,2)",
                precision: 20,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvoiceCurrency",
                table: "importer_declarations",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "importer_notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ImporterId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeclarationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Kind = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Message = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    Link = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReadAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_importer_notifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_importer_notifications_AuthAccounts_ImporterId",
                        column: x => x.ImporterId,
                        principalTable: "AuthAccounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_importer_notifications_importer_declarations_DeclarationId",
                        column: x => x.DeclarationId,
                        principalTable: "importer_declarations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_importer_notifications_DeclarationId",
                table: "importer_notifications",
                column: "DeclarationId");

            migrationBuilder.CreateIndex(
                name: "IX_importer_notifications_ImporterId_CreatedAt",
                table: "importer_notifications",
                columns: new[] { "ImporterId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "importer_notifications");

            migrationBuilder.DropColumn(
                name: "AssessedAt",
                table: "importer_declarations");

            migrationBuilder.DropColumn(
                name: "AssessedCustomsValue",
                table: "importer_declarations");

            migrationBuilder.DropColumn(
                name: "AssessedPayable",
                table: "importer_declarations");

            migrationBuilder.DropColumn(
                name: "AssessedTotalTax",
                table: "importer_declarations");

            migrationBuilder.DropColumn(
                name: "AssessmentCurrency",
                table: "importer_declarations");

            migrationBuilder.DropColumn(
                name: "AssessmentJson",
                table: "importer_declarations");

            migrationBuilder.DropColumn(
                name: "FreightAmount",
                table: "importer_declarations");

            migrationBuilder.DropColumn(
                name: "InsuranceAmount",
                table: "importer_declarations");

            migrationBuilder.DropColumn(
                name: "InvoiceAmount",
                table: "importer_declarations");

            migrationBuilder.DropColumn(
                name: "InvoiceCurrency",
                table: "importer_declarations");
        }
    }
}
