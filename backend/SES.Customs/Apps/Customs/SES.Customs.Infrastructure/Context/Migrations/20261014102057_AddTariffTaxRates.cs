using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class AddTariffTaxRates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NationalCode",
                table: "national_tariff_lines",
                type: "character varying(11)",
                maxLength: 11,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "tariff_tax_types",
                columns: table => new
                {
                    Code = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Description = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    Scope = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tariff_tax_types", x => x.Code);
                });

            migrationBuilder.CreateTable(
                name: "tariff_tax_rates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TariffLineId = table.Column<Guid>(type: "uuid", nullable: false),
                    TaxCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Rate = table.Column<decimal>(type: "numeric(9,4)", precision: 9, scale: 4, nullable: false),
                    SourceReference = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    RetrievedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tariff_tax_rates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_tariff_tax_rates_national_tariff_lines_TariffLineId",
                        column: x => x.TariffLineId,
                        principalTable: "national_tariff_lines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_tariff_tax_rates_tariff_tax_types_TaxCode",
                        column: x => x.TaxCode,
                        principalTable: "tariff_tax_types",
                        principalColumn: "Code",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "tariff_tax_types",
                columns: new[] { "Code", "Description", "DisplayOrder", "Name", "Scope" },
                values: new object[,]
                {
                    { "D2R", "Duty under the tariff's second schedule.", 7, "Duty 2nd Schedule Rate", "SECOND_SCHEDULE" },
                    { "DAR", "Additional rate under the tariff's second schedule.", 9, "Duty 2nd Schedule Additional Rate", "SECOND_SCHEDULE" },
                    { "DR", "Customs import duty, percent of CIF value.", 1, "Duty Rate", "IMPORT" },
                    { "DSR", "Special rate under the tariff's second schedule.", 8, "Duty 2nd Schedule Special Rate", "SECOND_SCHEDULE" },
                    { "ER", "Excise tax, percent of CIF plus customs duty.", 2, "Excise Rate", "IMPORT" },
                    { "EXR", "Duty charged on exports of the item.", 6, "Export Duty Rate", "EXPORT" },
                    { "SR", "Import surtax, percent of CIF plus duty and excise.", 5, "Surtax Rate", "IMPORT" },
                    { "VAT", "VAT on imports, percent of CIF plus duty, excise and surtax.", 3, "Value Added Tax", "IMPORT" },
                    { "WHR", "Withholding (advance income) tax, percent of CIF value.", 4, "With Hold Rate", "IMPORT" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_national_tariff_lines_NationalCode",
                table: "national_tariff_lines",
                column: "NationalCode");

            migrationBuilder.CreateIndex(
                name: "IX_tariff_tax_rates_TariffLineId_TaxCode",
                table: "tariff_tax_rates",
                columns: new[] { "TariffLineId", "TaxCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_tariff_tax_rates_TaxCode",
                table: "tariff_tax_rates",
                column: "TaxCode");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tariff_tax_rates");

            migrationBuilder.DropTable(
                name: "tariff_tax_types");

            migrationBuilder.DropIndex(
                name: "IX_national_tariff_lines_NationalCode",
                table: "national_tariff_lines");

            migrationBuilder.DropColumn(
                name: "NationalCode",
                table: "national_tariff_lines");
        }
    }
}
