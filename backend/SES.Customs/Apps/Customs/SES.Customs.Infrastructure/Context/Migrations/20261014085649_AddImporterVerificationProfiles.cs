using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class AddImporterVerificationProfiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "importer_profiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    ImporterType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    VerificationStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    LegalName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    TradeName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Tin = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    TradeLicenseNumber = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    TradeLicenseExpiry = table.Column<DateOnly>(type: "date", nullable: true),
                    BusinessRegistrationNumber = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    VatNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    AgentLicenseNumber = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    AgentLicenseExpiry = table.Column<DateOnly>(type: "date", nullable: true),
                    IdType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    IdNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Nationality = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    ResidencyStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    RepresentativeRole = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    RegionLocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    RegionKey = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    City = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Woreda = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    AddressLine = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    ReviewNote = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ReviewedById = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    SubmittedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_importer_profiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_importer_profiles_AuthAccounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "AuthAccounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_importer_profiles_customs_locations_RegionLocationId",
                        column: x => x.RegionLocationId,
                        principalTable: "customs_locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "importer_profile_documents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProfileId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_importer_profile_documents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_importer_profile_documents_importer_profiles_ProfileId",
                        column: x => x.ProfileId,
                        principalTable: "importer_profiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_importer_profile_documents_ProfileId_Kind",
                table: "importer_profile_documents",
                columns: new[] { "ProfileId", "Kind" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_importer_profiles_AccountId",
                table: "importer_profiles",
                column: "AccountId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_importer_profiles_IdNumber",
                table: "importer_profiles",
                column: "IdNumber");

            migrationBuilder.CreateIndex(
                name: "IX_importer_profiles_RegionKey_VerificationStatus_SubmittedAt",
                table: "importer_profiles",
                columns: new[] { "RegionKey", "VerificationStatus", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_importer_profiles_RegionLocationId",
                table: "importer_profiles",
                column: "RegionLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_importer_profiles_Tin",
                table: "importer_profiles",
                column: "Tin");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "importer_profile_documents");

            migrationBuilder.DropTable(
                name: "importer_profiles");
        }
    }
}
