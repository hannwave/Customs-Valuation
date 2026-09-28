using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations
{
    /// <inheritdoc />
    public partial class AddMarketPriceSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "market_price_snapshots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Source = table.Column<string>(type: "text", nullable: false),
                    ListingId = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Url = table.Column<string>(type: "text", nullable: false),
                    Condition = table.Column<string>(type: "text", nullable: false),
                    Price = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    ObservedDate = table.Column<DateOnly>(type: "date", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_market_price_snapshots", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_market_price_snapshots_ObservedDate",
                table: "market_price_snapshots",
                column: "ObservedDate");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "market_price_snapshots");
        }
    }
}
