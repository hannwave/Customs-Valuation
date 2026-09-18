using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class AddRegionalEmployeeAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ArchiveReason",
                table: "AuthAccounts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                table: "AuthAccounts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ArchivedBy",
                table: "AuthAccounts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RegionJoinedAt",
                table: "AuthAccounts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RegionKey",
                table: "AuthAccounts",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "Version",
                table: "AuthAccounts",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "SubjectUserId",
                table: "audit_logs",
                type: "uuid",
                nullable: true);

            // Existing assignments predate region tracking. Use the latest currently active
            // assignment as a conservative visibility boundary for legacy accounts.
            migrationBuilder.Sql("""
                WITH RECURSIVE paths AS (
                    SELECT a."Id" AS user_id, l."Id", l."ParentLocationId", l."Region", l."OfficialCode", 0 AS depth
                    FROM "AuthAccounts" a JOIN customs_locations l ON l."Id" = a."PrimaryLocationId"
                    UNION ALL
                    SELECT p.user_id, l."Id", l."ParentLocationId", l."Region", l."OfficialCode", p.depth + 1
                    FROM paths p JOIN customs_locations l ON l."Id" = p."ParentLocationId" WHERE p.depth < 30
                ), ranked AS (
                    SELECT user_id, UPPER(BTRIM(CASE WHEN NULLIF(BTRIM("Region"), '') IS NOT NULL THEN "Region" ELSE "OfficialCode" END)) AS region_key,
                           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY CASE WHEN NULLIF(BTRIM("Region"), '') IS NOT NULL THEN 0 ELSE 1 END,
                             CASE WHEN NULLIF(BTRIM("Region"), '') IS NOT NULL THEN depth ELSE -depth END) AS rank
                    FROM paths
                )
                UPDATE "AuthAccounts" a SET "RegionKey" = r.region_key FROM ranked r WHERE a."Id" = r.user_id AND r.rank = 1;
                """);
            migrationBuilder.Sql("""
                UPDATE "AuthAccounts" a SET "RegionJoinedAt" = COALESCE(
                    (SELECT MAX(s."EffectiveFrom") FROM customs_user_location_scopes s
                     WHERE s."UserId" = a."Id" AND s."EffectiveFrom" <= NOW() AND (s."EffectiveTo" IS NULL OR s."EffectiveTo" > NOW())),
                    NOW());
                """);
            migrationBuilder.Sql("""
                UPDATE audit_logs a SET "SubjectUserId" = a."RecordId" WHERE a."Module" = 'Users';
                UPDATE audit_logs a SET "SubjectUserId" = a."UserId"::uuid
                WHERE a."SubjectUserId" IS NULL AND a."UserId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  AND a."Module" IN ('Valuation', 'ValuationPhase2', 'Valuations', 'LocalPrices');
                """);

            migrationBuilder.CreateIndex(
                name: "IX_AuthAccounts_EmployeeNumber",
                table: "AuthAccounts",
                column: "EmployeeNumber");

            migrationBuilder.CreateIndex(
                name: "IX_AuthAccounts_RegionKey_Status",
                table: "AuthAccounts",
                columns: new[] { "RegionKey", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_SubjectUserId_OccurredAt",
                table: "audit_logs",
                columns: new[] { "SubjectUserId", "OccurredAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AuthAccounts_EmployeeNumber",
                table: "AuthAccounts");

            migrationBuilder.DropIndex(
                name: "IX_AuthAccounts_RegionKey_Status",
                table: "AuthAccounts");

            migrationBuilder.DropIndex(
                name: "IX_audit_logs_SubjectUserId_OccurredAt",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "ArchiveReason",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "ArchivedAt",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "ArchivedBy",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "RegionJoinedAt",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "RegionKey",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "AuthAccounts");

            migrationBuilder.DropColumn(
                name: "SubjectUserId",
                table: "audit_logs");
        }
    }
}
