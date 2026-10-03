using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class AddImporterDeclarations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "importer_declarations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ImporterId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reference = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    SuggestedHsCodeId = table.Column<Guid>(type: "uuid", nullable: true),
                    SuggestedTariffLineId = table.Column<Guid>(type: "uuid", nullable: true),
                    SuggestedTariffDescription = table.Column<string>(type: "text", nullable: false),
                    ConfirmedHsCodeId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConfirmedTariffLineId = table.Column<Guid>(type: "uuid", nullable: true),
                    OriginCountryCode = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    OriginCountryName = table.Column<string>(type: "text", nullable: false),
                    ImportPurpose = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    PurposeDetails = table.Column<string>(type: "text", nullable: false),
                    IsCommercialProduct = table.Column<bool>(type: "boolean", nullable: false),
                    IsMachineryOrEquipment = table.Column<bool>(type: "boolean", nullable: false),
                    RequestedTreatmentsJson = table.Column<string>(type: "jsonb", nullable: false),
                    Brand = table.Column<string>(type: "text", nullable: false),
                    Model = table.Column<string>(type: "text", nullable: false),
                    ProductName = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Manufacturer = table.Column<string>(type: "text", nullable: false),
                    SerialOrPartNumber = table.Column<string>(type: "text", nullable: false),
                    Specifications = table.Column<string>(type: "text", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(20,4)", precision: 20, scale: 4, nullable: false),
                    Unit = table.Column<string>(type: "text", nullable: false),
                    ReviewNote = table.Column<string>(type: "text", nullable: false),
                    ReviewedById = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_importer_declarations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_importer_declarations_AuthAccounts_ImporterId",
                        column: x => x.ImporterId,
                        principalTable: "AuthAccounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_importer_declarations_customs_locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "customs_locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_importer_declarations_hs_codes_ConfirmedHsCodeId",
                        column: x => x.ConfirmedHsCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_importer_declarations_hs_codes_SuggestedHsCodeId",
                        column: x => x.SuggestedHsCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_importer_declarations_national_tariff_lines_ConfirmedTariff~",
                        column: x => x.ConfirmedTariffLineId,
                        principalTable: "national_tariff_lines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_importer_declarations_national_tariff_lines_SuggestedTariff~",
                        column: x => x.SuggestedTariffLineId,
                        principalTable: "national_tariff_lines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "importer_documents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DeclarationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    FileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Size = table.Column<long>(type: "bigint", nullable: false),
                    Sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Content = table.Column<byte[]>(type: "bytea", nullable: false),
                    UploadedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_importer_documents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_importer_documents_importer_declarations_DeclarationId",
                        column: x => x.DeclarationId,
                        principalTable: "importer_declarations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_importer_declarations_ConfirmedHsCodeId",
                table: "importer_declarations",
                column: "ConfirmedHsCodeId");

            migrationBuilder.CreateIndex(
                name: "IX_importer_declarations_ConfirmedTariffLineId",
                table: "importer_declarations",
                column: "ConfirmedTariffLineId");

            migrationBuilder.CreateIndex(
                name: "IX_importer_declarations_ImporterId_SubmittedAt",
                table: "importer_declarations",
                columns: new[] { "ImporterId", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_importer_declarations_LocationId_Status_SubmittedAt",
                table: "importer_declarations",
                columns: new[] { "LocationId", "Status", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_importer_declarations_Reference",
                table: "importer_declarations",
                column: "Reference",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_importer_declarations_SuggestedHsCodeId",
                table: "importer_declarations",
                column: "SuggestedHsCodeId");

            migrationBuilder.CreateIndex(
                name: "IX_importer_declarations_SuggestedTariffLineId",
                table: "importer_declarations",
                column: "SuggestedTariffLineId");

            migrationBuilder.CreateIndex(
                name: "IX_importer_documents_DeclarationId_Kind",
                table: "importer_documents",
                columns: new[] { "DeclarationId", "Kind" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "importer_documents");

            migrationBuilder.DropTable(
                name: "importer_declarations");
        }
    }
}
