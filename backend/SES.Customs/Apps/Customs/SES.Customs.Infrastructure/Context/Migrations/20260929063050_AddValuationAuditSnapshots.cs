using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

public partial class AddValuationAuditSnapshots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(name: "ProductId", table: "valuation_decisions", type: "uuid", nullable: true);
        migrationBuilder.AddColumn<string>(name: "ProductName", table: "valuation_decisions", type: "character varying(300)", maxLength: 300, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>(name: "ProductPhotoUrl", table: "valuation_decisions", type: "character varying(2048)", maxLength: 2048, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>(name: "PurchaseCountryCode", table: "valuation_decisions", type: "character varying(2)", maxLength: 2, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>(name: "PurchaseCountryName", table: "valuation_decisions", type: "character varying(120)", maxLength: 120, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>(name: "SelectedPriceSource", table: "valuation_decisions", type: "character varying(80)", maxLength: 80, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>(name: "ValuationMethod", table: "valuation_decisions", type: "character varying(120)", maxLength: 120, nullable: false, defaultValue: "");

        migrationBuilder.Sql("""
            DO $$
            DECLARE valuation record; evidence jsonb;
            BEGIN
              FOR valuation IN SELECT "Id", "EvidenceNotes" FROM valuation_decisions WHERE COALESCE("EvidenceNotes", '') <> '' LOOP
                BEGIN
                  evidence := valuation."EvidenceNotes"::jsonb;
                  UPDATE valuation_decisions
                  SET "ProductName" = COALESCE(NULLIF(evidence->>'product', ''), "ProductName"),
                      "PurchaseCountryCode" = UPPER(COALESCE(NULLIF(evidence->>'purchaseCountryCode', ''), "PurchaseCountryCode")),
                      "PurchaseCountryName" = COALESCE(NULLIF(evidence->>'purchaseCountryName', ''), "PurchaseCountryName"),
                      "SelectedPriceSource" = COALESCE(NULLIF(evidence->>'supportingSource', ''), "SelectedPriceSource"),
                      "ValuationMethod" = COALESCE(NULLIF(evidence->>'valuationMethod', ''), "ValuationMethod"),
                      "ProductPhotoUrl" = COALESCE(NULLIF(evidence->>'productPhoto', ''), evidence#>>'{internationalEvidence,0,thumbnailUrl}', "ProductPhotoUrl")
                  WHERE "Id" = valuation."Id";
                EXCEPTION WHEN others THEN
                  -- Preserve free-text legacy evidence without failing the migration.
                END;
              END LOOP;
            END $$;
            """);

        migrationBuilder.CreateTable(
            name: "valuation_audit_snapshots",
            columns: table => new
            {
                AuditLogId = table.Column<Guid>(type: "uuid", nullable: false),
                ValuationDecisionId = table.Column<Guid>(type: "uuid", nullable: false),
                ValuationPhase2Id = table.Column<Guid>(type: "uuid", nullable: true),
                ProductId = table.Column<Guid>(type: "uuid", nullable: true),
                ProductName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                HsCode = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                HsDescription = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                PurchaseCountryCode = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                PurchaseCountryName = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                OriginCountry = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                SelectedPriceAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                SelectedPriceCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                SelectedPriceSource = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                ValuationMethod = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                TotalTaxDue = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                CustomsDutyAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                ExciseAdValoremAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                ExciseSpecificAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                ExciseTotalAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                VatAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                SurtaxAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                OtherTaxAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                TaxCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                TaxBreakdownJson = table.Column<string>(type: "jsonb", nullable: false),
                OfficerAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                OfficerName = table.Column<string>(type: "character varying(240)", maxLength: 240, nullable: false),
                OfficerLocationId = table.Column<Guid>(type: "uuid", nullable: true),
                OfficerLocationName = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                ProductPhotoUrl = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                ReceiptValuationDecisionId = table.Column<Guid>(type: "uuid", nullable: true),
                ReceiptFileName = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                ReceiptContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                DecisionDetailsJson = table.Column<string>(type: "jsonb", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_valuation_audit_snapshots", x => x.AuditLogId);
                table.ForeignKey("FK_valuation_audit_snapshots_AuthAccounts_OfficerAccountId", x => x.OfficerAccountId, "AuthAccounts", "Id", onDelete: ReferentialAction.SetNull);
                table.ForeignKey("FK_valuation_audit_snapshots_audit_logs_AuditLogId", x => x.AuditLogId, "audit_logs", "Id", onDelete: ReferentialAction.Cascade);
                table.ForeignKey("FK_valuation_audit_snapshots_customs_locations_OfficerLocationId", x => x.OfficerLocationId, "customs_locations", "Id", onDelete: ReferentialAction.SetNull);
                table.ForeignKey("FK_valuation_audit_snapshots_valuation_decisions_ValuationDecisionId", x => x.ValuationDecisionId, "valuation_decisions", "Id", onDelete: ReferentialAction.Restrict);
                table.ForeignKey("FK_valuation_audit_snapshots_valuation_phase2_ValuationPhase2Id", x => x.ValuationPhase2Id, "valuation_phase2", "Id", onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(name: "IX_valuation_audit_snapshots_OfficerAccountId", table: "valuation_audit_snapshots", column: "OfficerAccountId");
        migrationBuilder.CreateIndex(name: "IX_valuation_audit_snapshots_OfficerLocationId", table: "valuation_audit_snapshots", column: "OfficerLocationId");
        migrationBuilder.CreateIndex(name: "IX_valuation_audit_snapshots_PurchaseCountryCode_ValuationDecisionId", table: "valuation_audit_snapshots", columns: new[] { "PurchaseCountryCode", "ValuationDecisionId" });
        migrationBuilder.CreateIndex(name: "IX_valuation_audit_snapshots_ValuationDecisionId_AuditLogId", table: "valuation_audit_snapshots", columns: new[] { "ValuationDecisionId", "AuditLogId" });
        migrationBuilder.CreateIndex(name: "IX_valuation_audit_snapshots_ValuationPhase2Id", table: "valuation_audit_snapshots", column: "ValuationPhase2Id");

        migrationBuilder.Sql("""
            INSERT INTO valuation_audit_snapshots
            ("AuditLogId", "ValuationDecisionId", "ValuationPhase2Id", "ProductId", "ProductName", "HsCode", "HsDescription",
             "PurchaseCountryCode", "PurchaseCountryName", "OriginCountry", "SelectedPriceAmount", "SelectedPriceCurrency",
             "SelectedPriceSource", "ValuationMethod", "TotalTaxDue", "CustomsDutyAmount", "ExciseAdValoremAmount",
             "ExciseSpecificAmount", "ExciseTotalAmount", "VatAmount", "SurtaxAmount", "OtherTaxAmount", "TaxCurrency",
             "TaxBreakdownJson", "OfficerAccountId", "OfficerName", "OfficerLocationId", "OfficerLocationName",
             "ProductPhotoUrl", "ReceiptValuationDecisionId", "ReceiptFileName", "ReceiptContentType", "DecisionDetailsJson")
            SELECT a."Id", d."Id", p."Id", d."ProductId", d."ProductName", COALESCE(h."Code", ''), COALESCE(h."DescriptionEn", ''),
                   d."PurchaseCountryCode", d."PurchaseCountryName", COALESCE(p."OriginCountry", ''), d."SelectedReferenceValue", d."Currency",
                   d."SelectedPriceSource", d."ValuationMethod", p."TotalTax", tx.duty, tx.excise_ad_valorem, tx.excise_specific,
                   tx.excise_total, tx.vat, tx.surtax,
                   CASE WHEN p."TotalTax" IS NULL THEN NULL ELSE GREATEST(0, p."TotalTax" - COALESCE(tx.duty,0) - COALESCE(tx.excise_total,0) - COALESCE(tx.vat,0) - COALESCE(tx.surtax,0)) END,
                   COALESCE(p."TargetCurrency", d."Currency"), COALESCE(tx.breakdown, '[]'::jsonb), officer."Id",
                   COALESCE(NULLIF(officer."FullName", ''), officer."Username", d."OfficerSubjectId"), d."LocationId",
                   COALESCE(NULLIF(office."DisplayName", ''), office."Name", ''), d."ProductPhotoUrl",
                   CASE WHEN COALESCE(d."ReceiptFileName", '') = '' THEN NULL ELSE d."Id" END,
                   COALESCE(d."ReceiptFileName", ''), COALESCE(d."ReceiptContentType", ''),
                   jsonb_build_object('decision', d."Decision", 'justification', d."Justification", 'status', d."Status",
                                      'recordedAt', d."RecordedAt", 'submittedAt', d."SubmittedAt", 'phase2Status', p."Status",
                                      'adjustmentReason', p."AdjustmentReason", 'notes', p."Notes", 'finalAmount', p."FinalAmount",
                                      'calculationRuleVersion', p."CalculationRuleVersion")
            FROM audit_logs a
            LEFT JOIN valuation_phase2 p ON a."Module" = 'EthiopianImportTaxAssessment' AND p."Id" = a."RecordId"
            JOIN valuation_decisions d ON d."Id" = CASE WHEN a."Module" IN ('Valuations','Valuation') THEN a."RecordId" ELSE p."ValuationDecisionId" END
            LEFT JOIN hs_codes h ON h."Id" = COALESCE(p."SelectedHsCodeId", d."HsCodeId")
            LEFT JOIN "AuthAccounts" officer ON officer."Id"::text = d."OfficerSubjectId"
            LEFT JOIN customs_locations office ON office."Id" = d."LocationId"
            LEFT JOIN LATERAL (
              SELECT
                MAX(l."CalculatedAmount") FILTER (WHERE l."Name" = 'Customs Duty') AS duty,
                MAX(ROUND(l."BaseAmount" * l."Value" / 100, 2)) FILTER (WHERE l."Name" = 'Excise Tax' AND l."CalculationType" = 'Percentage') AS excise_ad_valorem,
                MAX(l."CalculatedAmount") FILTER (WHERE l."Name" = 'Excise Tax (specific)') AS excise_specific,
                COALESCE(MAX(l."CalculatedAmount") FILTER (WHERE l."Name" = 'Excise Tax'),0) +
                  COALESCE(MAX(l."CalculatedAmount") FILTER (WHERE l."Name" = 'Excise Tax (specific)' AND l."CalculationBasis" <> 'UNIT_RATE_ETB_GREATER_OF'),0) AS excise_total,
                MAX(l."CalculatedAmount") FILTER (WHERE l."Name" = 'VAT') AS vat,
                MAX(l."CalculatedAmount") FILTER (WHERE l."Name" = 'Surtax') AS surtax,
                jsonb_agg(to_jsonb(l) - 'ValuationPhase2Id' ORDER BY l."Order") FILTER (WHERE l."IsApplicable") AS breakdown
              FROM valuation_phase2_tax_lines l WHERE l."ValuationPhase2Id" = p."Id"
            ) tx ON true
            WHERE a."Module" IN ('Valuations','Valuation','EthiopianImportTaxAssessment')
            ON CONFLICT ("AuditLogId") DO NOTHING;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "valuation_audit_snapshots");
        migrationBuilder.DropColumn(name: "ProductId", table: "valuation_decisions");
        migrationBuilder.DropColumn(name: "ProductName", table: "valuation_decisions");
        migrationBuilder.DropColumn(name: "ProductPhotoUrl", table: "valuation_decisions");
        migrationBuilder.DropColumn(name: "PurchaseCountryCode", table: "valuation_decisions");
        migrationBuilder.DropColumn(name: "PurchaseCountryName", table: "valuation_decisions");
        migrationBuilder.DropColumn(name: "SelectedPriceSource", table: "valuation_decisions");
        migrationBuilder.DropColumn(name: "ValuationMethod", table: "valuation_decisions");
    }
}
