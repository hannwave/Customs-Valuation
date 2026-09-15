using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class AddLocalMarketObservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "local_market_observations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    HsCodeId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceListingId = table.Column<string>(type: "text", nullable: false),
                    Marketplace = table.Column<string>(type: "text", nullable: false),
                    ListingUrl = table.Column<string>(type: "text", nullable: false),
                    ListingTitle = table.Column<string>(type: "text", nullable: false),
                    ListingDescription = table.Column<string>(type: "text", nullable: true),
                    SellerName = table.Column<string>(type: "text", nullable: true),
                    Location = table.Column<string>(type: "text", nullable: true),
                    RawPrice = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    RawCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    RetrievalDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ListingDate = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ImageUrl = table.Column<string>(type: "text", nullable: true),
                    RawCategory = table.Column<string>(type: "text", nullable: true),
                    SearchQuery = table.Column<string>(type: "text", nullable: false),
                    TargetProfileJson = table.Column<string>(type: "jsonb", nullable: false),
                    Brand = table.Column<string>(type: "text", nullable: true),
                    Model = table.Column<string>(type: "text", nullable: true),
                    Variant = table.Column<string>(type: "text", nullable: true),
                    ProductType = table.Column<string>(type: "text", nullable: true),
                    Condition = table.Column<string>(type: "text", nullable: false),
                    PriceType = table.Column<string>(type: "text", nullable: false),
                    OriginalQuantity = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    OriginalUnit = table.Column<string>(type: "text", nullable: false),
                    NormalizedQuantity = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: false),
                    NormalizedUnit = table.Column<string>(type: "text", nullable: false),
                    NormalizedPrice = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                    NormalizedCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    NormalizedUnitPrice = table.Column<decimal>(type: "numeric(24,8)", precision: 24, scale: 8, nullable: true),
                    RelevanceScore = table.Column<int>(type: "integer", nullable: false),
                    ClassificationStatus = table.Column<string>(type: "text", nullable: false),
                    ClassificationReason = table.Column<string>(type: "text", nullable: false),
                    MatchedKeywordsJson = table.Column<string>(type: "jsonb", nullable: false),
                    ExcludedKeywordsJson = table.Column<string>(type: "jsonb", nullable: false),
                    IsDuplicate = table.Column<bool>(type: "boolean", nullable: false),
                    DuplicateOfId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsPotentialOutlier = table.Column<bool>(type: "boolean", nullable: false),
                    OutlierMethod = table.Column<string>(type: "text", nullable: false),
                    OutlierScore = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: true),
                    OutlierReason = table.Column<string>(type: "text", nullable: true),
                    ManualReviewStatus = table.Column<string>(type: "text", nullable: false),
                    ReviewedBy = table.Column<string>(type: "text", nullable: true),
                    ReviewedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ReviewJustification = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_local_market_observations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_local_market_observations_hs_codes_HsCodeId",
                        column: x => x.HsCodeId,
                        principalTable: "hs_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_local_market_observations_local_market_observations_Duplica~",
                        column: x => x.DuplicateOfId,
                        principalTable: "local_market_observations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_local_market_observations_price_sources_SourceId",
                        column: x => x.SourceId,
                        principalTable: "price_sources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_local_market_observations_DuplicateOfId",
                table: "local_market_observations",
                column: "DuplicateOfId");

            migrationBuilder.CreateIndex(
                name: "IX_local_market_observations_HsCodeId_ClassificationStatus_Ret~",
                table: "local_market_observations",
                columns: new[] { "HsCodeId", "ClassificationStatus", "RetrievalDate" });

            migrationBuilder.CreateIndex(
                name: "IX_local_market_observations_SourceId_SourceListingId",
                table: "local_market_observations",
                columns: new[] { "SourceId", "SourceListingId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "local_market_observations");
        }
    }
}
