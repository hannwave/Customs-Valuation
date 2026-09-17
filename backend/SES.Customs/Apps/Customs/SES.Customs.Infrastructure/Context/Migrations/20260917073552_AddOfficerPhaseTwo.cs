using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class AddOfficerPhaseTwo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "InitialDuty",
                table: "valuation_decisions",
                type: "numeric(24,8)",
                precision: 24,
                scale: 8,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InitialDutyCurrency",
                table: "valuation_decisions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "valuation_phase2",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ValuationDecisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalHsCodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    SelectedHsCodeId = table.Column<Guid>(type: "uuid", nullable: true),
                    InitialDutyAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    InitialDutyCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    TargetCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    ExchangeRate = table.Column<decimal>(type: "numeric(24,12)", precision: 24, scale: 12, nullable: false),
                    ExchangeRateSource = table.Column<string>(type: "text", nullable: false),
                    ExchangeRateDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ExemptionAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    WaiverAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    ManualAdjustmentAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    ManualAdjustmentType = table.Column<string>(type: "text", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    TotalAdditionalTax = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    FinalAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    CalculationRuleVersion = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    CalculatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_valuation_phase2", x => x.Id);
                    table.ForeignKey(
                        name: "FK_valuation_phase2_hs_codes_OriginalHsCodeId",
                        column: x => x.OriginalHsCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_valuation_phase2_hs_codes_SelectedHsCodeId",
                        column: x => x.SelectedHsCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_valuation_phase2_valuation_decisions_ValuationDecisionId",
                        column: x => x.ValuationDecisionId,
                        principalTable: "valuation_decisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "valuation_phase2_tax_lines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ValuationPhase2Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    CalculationType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Value = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    Order = table.Column<int>(type: "integer", nullable: false),
                    CalculationBasis = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    BaseAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    CalculatedAmount = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_valuation_phase2_tax_lines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_valuation_phase2_tax_lines_valuation_phase2_ValuationPhase2~",
                        column: x => x.ValuationPhase2Id,
                        principalTable: "valuation_phase2",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_valuation_phase2_OriginalHsCodeId",
                table: "valuation_phase2",
                column: "OriginalHsCodeId");

            migrationBuilder.CreateIndex(
                name: "IX_valuation_phase2_SelectedHsCodeId",
                table: "valuation_phase2",
                column: "SelectedHsCodeId");

            migrationBuilder.CreateIndex(
                name: "IX_valuation_phase2_ValuationDecisionId",
                table: "valuation_phase2",
                column: "ValuationDecisionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_valuation_phase2_tax_lines_ValuationPhase2Id_Order",
                table: "valuation_phase2_tax_lines",
                columns: new[] { "ValuationPhase2Id", "Order" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "valuation_phase2_tax_lines");

            migrationBuilder.DropTable(
                name: "valuation_phase2");

            migrationBuilder.DropColumn(
                name: "InitialDuty",
                table: "valuation_decisions");

            migrationBuilder.DropColumn(
                name: "InitialDutyCurrency",
                table: "valuation_decisions");
        }
    }
}
