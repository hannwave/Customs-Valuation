using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class AddRoleScopedOperations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EvidenceNotes",
                table: "valuation_decisions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "LocationId",
                table: "valuation_decisions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LocationSnapshotJson",
                table: "valuation_decisions",
                type: "jsonb",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<string>(
                name: "ReviewJustification",
                table: "valuation_decisions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReviewedAt",
                table: "valuation_decisions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewedBy",
                table: "valuation_decisions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "valuation_decisions",
                type: "text",
                nullable: false,
                defaultValue: "Draft");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SubmittedAt",
                table: "valuation_decisions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "Version",
                table: "valuation_decisions",
                type: "uuid",
                nullable: false,
                defaultValueSql: "gen_random_uuid()");

            migrationBuilder.AddColumn<string>(
                name: "EmployeeNumber",
                table: "AuthAccounts",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastLoginAt",
                table: "AuthAccounts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                table: "AuthAccounts",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "PrimaryLocationId",
                table: "AuthAccounts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "AuthAccounts",
                type: "text",
                nullable: false,
                defaultValue: "ACTIVE");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "AuthAccounts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LocationId",
                table: "audit_logs",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "customs_locations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OfficialCode = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    DisplayName = table.Column<string>(type: "text", nullable: false),
                    LocationType = table.Column<string>(type: "text", nullable: false),
                    ParentLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Region = table.Column<string>(type: "text", nullable: false),
                    Zone = table.Column<string>(type: "text", nullable: false),
                    CityWoreda = table.Column<string>(type: "text", nullable: false),
                    BorderCountry = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    EffectiveFrom = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EffectiveTo = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    IsEntryPoint = table.Column<bool>(type: "boolean", nullable: false),
                    IsExitPoint = table.Column<bool>(type: "boolean", nullable: false),
                    SupportsImport = table.Column<bool>(type: "boolean", nullable: false),
                    SupportsExport = table.Column<bool>(type: "boolean", nullable: false),
                    SupportsTransit = table.Column<bool>(type: "boolean", nullable: false),
                    SupportsValuation = table.Column<bool>(type: "boolean", nullable: false),
                    SupportsInspection = table.Column<bool>(type: "boolean", nullable: false),
                    Latitude = table.Column<decimal>(type: "numeric", nullable: true),
                    Longitude = table.Column<decimal>(type: "numeric", nullable: true),
                    Source = table.Column<string>(type: "text", nullable: false),
                    SourceReference = table.Column<string>(type: "text", nullable: false),
                    LastVerifiedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedBy = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customs_locations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customs_locations_customs_locations_ParentLocationId",
                        column: x => x.ParentLocationId,
                        principalTable: "customs_locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "customs_location_history",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomsLocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChangedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ChangedBy = table.Column<string>(type: "text", nullable: false),
                    ChangeReason = table.Column<string>(type: "text", nullable: false),
                    PreviousValueJson = table.Column<string>(type: "text", nullable: false),
                    NewValueJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customs_location_history", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customs_location_history_customs_locations_CustomsLocationId",
                        column: x => x.CustomsLocationId,
                        principalTable: "customs_locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

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
                    EffectiveTo = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedBy = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customs_user_location_scopes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customs_user_location_scopes_AuthAccounts_UserId",
                        column: x => x.UserId,
                        principalTable: "AuthAccounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_customs_user_location_scopes_customs_locations_CustomsLocat~",
                        column: x => x.CustomsLocationId,
                        principalTable: "customs_locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_valuation_decisions_LocationId_Status",
                table: "valuation_decisions",
                columns: new[] { "LocationId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_AuthAccounts_PrimaryLocationId",
                table: "AuthAccounts",
                column: "PrimaryLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_LocationId_OccurredAt",
                table: "audit_logs",
                columns: new[] { "LocationId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_customs_location_history_CustomsLocationId_ChangedAt",
                table: "customs_location_history",
                columns: new[] { "CustomsLocationId", "ChangedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_customs_locations_OfficialCode",
                table: "customs_locations",
                column: "OfficialCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_customs_locations_ParentLocationId",
                table: "customs_locations",
                column: "ParentLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_customs_user_location_scopes_CustomsLocationId",
                table: "customs_user_location_scopes",
                column: "CustomsLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_customs_user_location_scopes_UserId_EffectiveTo",
                table: "customs_user_location_scopes",
                columns: new[] { "UserId", "EffectiveTo" });

            migrationBuilder.AddForeignKey(
                name: "FK_AuthAccounts_customs_locations_PrimaryLocationId",
                table: "AuthAccounts",
                column: "PrimaryLocationId",
                principalTable: "customs_locations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_valuation_decisions_customs_locations_LocationId",
                table: "valuation_decisions",
                column: "LocationId",
                principalTable: "customs_locations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AuthAccounts_customs_locations_PrimaryLocationId",
                table: "AuthAccounts");

            migrationBuilder.DropForeignKey(
                name: "FK_valuation_decisions_customs_locations_LocationId",
                table: "valuation_decisions");

            migrationBuilder.DropTable(
                name: "customs_location_history");

            migrationBuilder.DropTable(
                name: "customs_user_location_scopes");

            migrationBuilder.DropTable(
                name: "customs_locations");

            migrationBuilder.DropIndex(
                name: "IX_valuation_decisions_LocationId_Status",
                table: "valuation_decisions");

            migrationBuilder.DropIndex(
                name: "IX_AuthAccounts_PrimaryLocationId",
                table: "AuthAccounts");

            migrationBuilder.DropIndex(
                name: "IX_audit_logs_LocationId_OccurredAt",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "EvidenceNotes",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "LocationId",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "LocationSnapshotJson",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "ReviewJustification",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "ReviewedAt",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "ReviewedBy",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "SubmittedAt",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "EmployeeNumber",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "LastLoginAt",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "Phone",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "PrimaryLocationId",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "LocationId",
                table: "audit_logs");
        }
    }
}
