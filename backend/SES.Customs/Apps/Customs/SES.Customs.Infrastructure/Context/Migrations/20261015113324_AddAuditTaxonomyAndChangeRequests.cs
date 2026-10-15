using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditTaxonomyAndChangeRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ActorRole",
                table: "audit_logs",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "audit_logs",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "RegionLocationId",
                table: "audit_logs",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Source",
                table: "audit_logs",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "importer_change_requests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProfileId = table.Column<Guid>(type: "uuid", nullable: true),
                    RegionLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                    RegionKey = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    CurrentFullName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    RequestedFullName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CurrentLegalName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    RequestedLegalName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    CurrentTin = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    RequestedTin = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    DocumentFileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    DocumentContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DocumentSize = table.Column<long>(type: "bigint", nullable: false),
                    DocumentSha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    DocumentContent = table.Column<byte[]>(type: "bytea", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ReviewNote = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    ReviewedById = table.Column<Guid>(type: "uuid", nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_importer_change_requests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_importer_change_requests_AuthAccounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "AuthAccounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_Category_OccurredAt",
                table: "audit_logs",
                columns: new[] { "Category", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_RecordId",
                table: "audit_logs",
                column: "RecordId");

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_RegionLocationId_OccurredAt",
                table: "audit_logs",
                columns: new[] { "RegionLocationId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_SubjectUserId",
                table: "audit_logs",
                column: "SubjectUserId");

            migrationBuilder.CreateIndex(
                name: "IX_importer_change_requests_AccountId_Status",
                table: "importer_change_requests",
                columns: new[] { "AccountId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_importer_change_requests_RegionKey_Status_CreatedAt",
                table: "importer_change_requests",
                columns: new[] { "RegionKey", "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "importer_change_requests");

            migrationBuilder.DropIndex(
                name: "IX_audit_logs_Category_OccurredAt",
                table: "audit_logs");

            migrationBuilder.DropIndex(
                name: "IX_audit_logs_RecordId",
                table: "audit_logs");

            migrationBuilder.DropIndex(
                name: "IX_audit_logs_RegionLocationId_OccurredAt",
                table: "audit_logs");

            migrationBuilder.DropIndex(
                name: "IX_audit_logs_SubjectUserId",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "ActorRole",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "Category",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "RegionLocationId",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "Source",
                table: "audit_logs");
        }
    }
}
