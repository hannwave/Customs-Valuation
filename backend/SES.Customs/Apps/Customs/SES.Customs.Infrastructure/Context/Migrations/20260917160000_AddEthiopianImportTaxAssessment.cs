using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using SES.Customs.Infrastructure.Context;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

[DbContext(typeof(CustomsDbContext))]
[Migration("20260917160000_AddEthiopianImportTaxAssessment")]
public partial class AddEthiopianImportTaxAssessment : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<decimal>("CustomsValueAmount", "valuation_phase2", type: "numeric(24,8)", precision: 24, scale: 8, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<string>("CustomsValueCurrency", "valuation_phase2", type: "character varying(3)", maxLength: 3, nullable: false, defaultValue: "ETB");
        migrationBuilder.AddColumn<string>("OriginCountry", "valuation_phase2", type: "character varying(120)", maxLength: 120, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>("ProductCategory", "valuation_phase2", type: "character varying(120)", maxLength: 120, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>("ExemptionCodes", "valuation_phase2", type: "character varying(1000)", maxLength: 1000, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<bool>("OriginPreferenceClaimed", "valuation_phase2", type: "boolean", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<bool>("ExciseTaxApplicable", "valuation_phase2", type: "boolean", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<bool>("IsCommercialImport", "valuation_phase2", type: "boolean", nullable: false, defaultValue: true);
        migrationBuilder.AddColumn<bool>("WithholdingApplicable", "valuation_phase2", type: "boolean", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<string>("AdjustmentReason", "valuation_phase2", type: "character varying(2000)", maxLength: 2000, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<bool>("OfficerConfirmed", "valuation_phase2", type: "boolean", nullable: false, defaultValue: false);
        migrationBuilder.AddColumn<decimal>("TotalTax", "valuation_phase2", type: "numeric(24,8)", precision: 24, scale: 8, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>("RecommendedValue", "valuation_phase2_tax_lines", type: "numeric(24,8)", precision: 24, scale: 8, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<string>("Status", "valuation_phase2_tax_lines", type: "character varying(40)", maxLength: 40, nullable: false, defaultValue: "Recommended");
        migrationBuilder.AddColumn<string>("SourceReference", "valuation_phase2_tax_lines", type: "character varying(1000)", maxLength: 1000, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<bool>("IsApplicable", "valuation_phase2_tax_lines", type: "boolean", nullable: false, defaultValue: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn("CustomsValueAmount", "valuation_phase2");
        migrationBuilder.DropColumn("CustomsValueCurrency", "valuation_phase2");
        migrationBuilder.DropColumn("OriginCountry", "valuation_phase2");
        migrationBuilder.DropColumn("ProductCategory", "valuation_phase2");
        migrationBuilder.DropColumn("ExemptionCodes", "valuation_phase2");
        migrationBuilder.DropColumn("OriginPreferenceClaimed", "valuation_phase2");
        migrationBuilder.DropColumn("ExciseTaxApplicable", "valuation_phase2");
        migrationBuilder.DropColumn("IsCommercialImport", "valuation_phase2");
        migrationBuilder.DropColumn("WithholdingApplicable", "valuation_phase2");
        migrationBuilder.DropColumn("AdjustmentReason", "valuation_phase2");
        migrationBuilder.DropColumn("OfficerConfirmed", "valuation_phase2");
        migrationBuilder.DropColumn("TotalTax", "valuation_phase2");
        migrationBuilder.DropColumn("RecommendedValue", "valuation_phase2_tax_lines");
        migrationBuilder.DropColumn("Status", "valuation_phase2_tax_lines");
        migrationBuilder.DropColumn("SourceReference", "valuation_phase2_tax_lines");
        migrationBuilder.DropColumn("IsApplicable", "valuation_phase2_tax_lines");
    }
}
