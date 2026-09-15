using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class InitialCustoms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "audit_logs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    Username = table.Column<string>(type: "text", nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Action = table.Column<string>(type: "text", nullable: false),
                    Module = table.Column<string>(type: "text", nullable: false),
                    RecordId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousValueJson = table.Column<string>(type: "jsonb", nullable: true),
                    NewValueJson = table.Column<string>(type: "jsonb", nullable: true),
                    Decision = table.Column<string>(type: "text", nullable: true),
                    Justification = table.Column<string>(type: "text", nullable: true),
                    IpDeviceInformation = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_logs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "exchange_rates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalCurrency = table.Column<string>(type: "text", nullable: false),
                    ConvertedCurrency = table.Column<string>(type: "text", nullable: false),
                    Rate = table.Column<decimal>(type: "numeric(24,12)", precision: 24, scale: 12, nullable: false),
                    RateDate = table.Column<DateOnly>(type: "date", nullable: false),
                    NbeSourceReference = table.Column<string>(type: "text", nullable: false),
                    RetrievedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_exchange_rates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "hs_revisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    EffectiveDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    SourceReference = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hs_revisions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "local_markets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    NameEn = table.Column<string>(type: "text", nullable: false),
                    NameAm = table.Column<string>(type: "text", nullable: true),
                    Region = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_local_markets", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "price_sources",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Pool = table.Column<string>(type: "text", nullable: false),
                    ApprovalReference = table.Column<string>(type: "text", nullable: false),
                    IsApproved = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_price_sources", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "hs_codes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(6)", maxLength: 6, nullable: false),
                    DescriptionEn = table.Column<string>(type: "text", nullable: false),
                    DescriptionAm = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hs_codes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_hs_codes_hs_revisions_RevisionId",
                        column: x => x.RevisionId,
                        principalTable: "hs_revisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "historical_customs_prices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HsCodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceReference = table.Column<string>(type: "text", nullable: false),
                    ProductDescription = table.Column<string>(type: "text", nullable: false),
                    BrandModel = table.Column<string>(type: "text", nullable: true),
                    QualityGrade = table.Column<string>(type: "text", nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    QuantityUnit = table.Column<string>(type: "text", nullable: false),
                    OriginalValue = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    OriginalCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                    PriceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ExchangeRateId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConvertedValue = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                    ConvertedCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    RetrievedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeclarationReference = table.Column<string>(type: "text", nullable: false),
                    AuthorizationReference = table.Column<string>(type: "text", nullable: false),
                    ValuationMethod = table.Column<string>(type: "text", nullable: false),
                    SourceCountryCode = table.Column<string>(type: "text", nullable: false),
                    Incoterm = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_historical_customs_prices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_historical_customs_prices_exchange_rates_ExchangeRateId",
                        column: x => x.ExchangeRateId,
                        principalTable: "exchange_rates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_historical_customs_prices_hs_codes_HsCodeId",
                        column: x => x.HsCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_historical_customs_prices_price_sources_SourceId",
                        column: x => x.SourceId,
                        principalTable: "price_sources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "hs_code_correlations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MappingGroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromCodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToCodeId = table.Column<Guid>(type: "uuid", nullable: true),
                    Kind = table.Column<string>(type: "text", nullable: false),
                    SourceReference = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_hs_code_correlations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_hs_code_correlations_hs_codes_FromCodeId",
                        column: x => x.FromCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_hs_code_correlations_hs_codes_ToCodeId",
                        column: x => x.ToCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "local_prices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HsCodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceReference = table.Column<string>(type: "text", nullable: false),
                    ProductDescription = table.Column<string>(type: "text", nullable: false),
                    BrandModel = table.Column<string>(type: "text", nullable: true),
                    QualityGrade = table.Column<string>(type: "text", nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    QuantityUnit = table.Column<string>(type: "text", nullable: false),
                    OriginalValue = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    OriginalCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                    PriceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ExchangeRateId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConvertedValue = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                    ConvertedCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    RetrievedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    MarketId = table.Column<Guid>(type: "uuid", nullable: false),
                    SupplierReference = table.Column<string>(type: "text", nullable: false),
                    PriceType = table.Column<string>(type: "text", nullable: false),
                    VatIncluded = table.Column<bool>(type: "boolean", nullable: true),
                    OtherTaxesIncluded = table.Column<bool>(type: "boolean", nullable: true),
                    TransportIncluded = table.Column<bool>(type: "boolean", nullable: true),
                    VerificationDate = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_local_prices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_local_prices_exchange_rates_ExchangeRateId",
                        column: x => x.ExchangeRateId,
                        principalTable: "exchange_rates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_local_prices_hs_codes_HsCodeId",
                        column: x => x.HsCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_local_prices_local_markets_MarketId",
                        column: x => x.MarketId,
                        principalTable: "local_markets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_local_prices_price_sources_SourceId",
                        column: x => x.SourceId,
                        principalTable: "price_sources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "national_tariff_lines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HsCodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    DescriptionEn = table.Column<string>(type: "text", nullable: false),
                    DescriptionAm = table.Column<string>(type: "text", nullable: true),
                    SourceReference = table.Column<string>(type: "text", nullable: false),
                    EffectiveDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_national_tariff_lines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_national_tariff_lines_hs_codes_HsCodeId",
                        column: x => x.HsCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "reference_prices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HsCodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceReference = table.Column<string>(type: "text", nullable: false),
                    ProductDescription = table.Column<string>(type: "text", nullable: false),
                    BrandModel = table.Column<string>(type: "text", nullable: true),
                    QualityGrade = table.Column<string>(type: "text", nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    QuantityUnit = table.Column<string>(type: "text", nullable: false),
                    OriginalValue = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    OriginalCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                    PriceDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ExchangeRateId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConvertedValue = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                    ConvertedCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: true),
                    RetrievedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ImportCountryCode = table.Column<string>(type: "text", nullable: false),
                    SourceCountryCode = table.Column<string>(type: "text", nullable: false),
                    TradeFlow = table.Column<string>(type: "text", nullable: false),
                    TradePeriod = table.Column<string>(type: "text", nullable: false),
                    Incoterm = table.Column<string>(type: "text", nullable: true),
                    Freight = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                    Insurance = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reference_prices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_reference_prices_exchange_rates_ExchangeRateId",
                        column: x => x.ExchangeRateId,
                        principalTable: "exchange_rates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_reference_prices_hs_codes_HsCodeId",
                        column: x => x.HsCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_reference_prices_price_sources_SourceId",
                        column: x => x.SourceId,
                        principalTable: "price_sources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "valuation_decisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HsCodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    SelectedReferenceValue = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    Decision = table.Column<string>(type: "text", nullable: false),
                    Justification = table.Column<string>(type: "text", nullable: false),
                    OfficerSubjectId = table.Column<string>(type: "text", nullable: false),
                    RecordedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_valuation_decisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_valuation_decisions_hs_codes_HsCodeId",
                        column: x => x.HsCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "decision_evidence",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DecisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    InternationalPriceId = table.Column<Guid>(type: "uuid", nullable: true),
                    LocalPriceId = table.Column<Guid>(type: "uuid", nullable: true),
                    HistoricalCustomsPriceId = table.Column<Guid>(type: "uuid", nullable: true),
                    EvidenceSnapshotJson = table.Column<string>(type: "jsonb", nullable: false),
                    ComparisonRuleVersion = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_decision_evidence", x => x.Id);
                    table.CheckConstraint("ck_one_evidence_pool", "num_nonnulls(\"InternationalPriceId\", \"LocalPriceId\", \"HistoricalCustomsPriceId\") = 1");
                    table.ForeignKey(
                        name: "FK_decision_evidence_historical_customs_prices_HistoricalCusto~",
                        column: x => x.HistoricalCustomsPriceId,
                        principalTable: "historical_customs_prices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_decision_evidence_local_prices_LocalPriceId",
                        column: x => x.LocalPriceId,
                        principalTable: "local_prices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_decision_evidence_reference_prices_InternationalPriceId",
                        column: x => x.InternationalPriceId,
                        principalTable: "reference_prices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_decision_evidence_valuation_decisions_DecisionId",
                        column: x => x.DecisionId,
                        principalTable: "valuation_decisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_RecordId_OccurredAt",
                table: "audit_logs",
                columns: new[] { "RecordId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_decision_evidence_DecisionId",
                table: "decision_evidence",
                column: "DecisionId");

            migrationBuilder.CreateIndex(
                name: "IX_decision_evidence_HistoricalCustomsPriceId",
                table: "decision_evidence",
                column: "HistoricalCustomsPriceId");

            migrationBuilder.CreateIndex(
                name: "IX_decision_evidence_InternationalPriceId",
                table: "decision_evidence",
                column: "InternationalPriceId");

            migrationBuilder.CreateIndex(
                name: "IX_decision_evidence_LocalPriceId",
                table: "decision_evidence",
                column: "LocalPriceId");

            migrationBuilder.CreateIndex(
                name: "IX_exchange_rates_OriginalCurrency_ConvertedCurrency_RateDate",
                table: "exchange_rates",
                columns: new[] { "OriginalCurrency", "ConvertedCurrency", "RateDate" });

            migrationBuilder.CreateIndex(
                name: "IX_historical_customs_prices_ExchangeRateId",
                table: "historical_customs_prices",
                column: "ExchangeRateId");

            migrationBuilder.CreateIndex(
                name: "IX_historical_customs_prices_HsCodeId_PriceDate",
                table: "historical_customs_prices",
                columns: new[] { "HsCodeId", "PriceDate" });

            migrationBuilder.CreateIndex(
                name: "IX_historical_customs_prices_SourceId",
                table: "historical_customs_prices",
                column: "SourceId");

            migrationBuilder.CreateIndex(
                name: "IX_hs_code_correlations_FromCodeId",
                table: "hs_code_correlations",
                column: "FromCodeId");

            migrationBuilder.CreateIndex(
                name: "IX_hs_code_correlations_MappingGroupId",
                table: "hs_code_correlations",
                column: "MappingGroupId");

            migrationBuilder.CreateIndex(
                name: "IX_hs_code_correlations_ToCodeId",
                table: "hs_code_correlations",
                column: "ToCodeId");

            migrationBuilder.CreateIndex(
                name: "IX_hs_codes_RevisionId_Code",
                table: "hs_codes",
                columns: new[] { "RevisionId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_hs_revisions_Number",
                table: "hs_revisions",
                column: "Number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_local_prices_ExchangeRateId",
                table: "local_prices",
                column: "ExchangeRateId");

            migrationBuilder.CreateIndex(
                name: "IX_local_prices_HsCodeId_PriceDate",
                table: "local_prices",
                columns: new[] { "HsCodeId", "PriceDate" });

            migrationBuilder.CreateIndex(
                name: "IX_local_prices_MarketId",
                table: "local_prices",
                column: "MarketId");

            migrationBuilder.CreateIndex(
                name: "IX_local_prices_SourceId",
                table: "local_prices",
                column: "SourceId");

            migrationBuilder.CreateIndex(
                name: "IX_national_tariff_lines_HsCodeId_Code_EffectiveDate",
                table: "national_tariff_lines",
                columns: new[] { "HsCodeId", "Code", "EffectiveDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_reference_prices_ExchangeRateId",
                table: "reference_prices",
                column: "ExchangeRateId");

            migrationBuilder.CreateIndex(
                name: "IX_reference_prices_HsCodeId_PriceDate",
                table: "reference_prices",
                columns: new[] { "HsCodeId", "PriceDate" });

            migrationBuilder.CreateIndex(
                name: "IX_reference_prices_SourceId",
                table: "reference_prices",
                column: "SourceId");

            migrationBuilder.CreateIndex(
                name: "IX_valuation_decisions_HsCodeId",
                table: "valuation_decisions",
                column: "HsCodeId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_logs");

            migrationBuilder.DropTable(
                name: "decision_evidence");

            migrationBuilder.DropTable(
                name: "hs_code_correlations");

            migrationBuilder.DropTable(
                name: "national_tariff_lines");

            migrationBuilder.DropTable(
                name: "historical_customs_prices");

            migrationBuilder.DropTable(
                name: "local_prices");

            migrationBuilder.DropTable(
                name: "reference_prices");

            migrationBuilder.DropTable(
                name: "valuation_decisions");

            migrationBuilder.DropTable(
                name: "local_markets");

            migrationBuilder.DropTable(
                name: "exchange_rates");

            migrationBuilder.DropTable(
                name: "price_sources");

            migrationBuilder.DropTable(
                name: "hs_codes");

            migrationBuilder.DropTable(
                name: "hs_revisions");
        }
    }
}
