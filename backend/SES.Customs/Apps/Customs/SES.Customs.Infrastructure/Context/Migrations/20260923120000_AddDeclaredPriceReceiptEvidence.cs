using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SES.Customs.Infrastructure.Context;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

[DbContext(typeof(CustomsDbContext))]
[Migration("20260923120000_AddDeclaredPriceReceiptEvidence")]
public partial class AddDeclaredPriceReceiptEvidence : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<decimal>("DeclaredPriceAmount", "valuation_decisions", "numeric(24,8)", nullable: true);
        migrationBuilder.AddColumn<string>("DeclaredPriceCurrency", "valuation_decisions", "character varying(3)", maxLength: 3, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<decimal>("DeclaredPriceConvertedAmount", "valuation_decisions", "numeric(24,8)", nullable: true);
        migrationBuilder.AddColumn<string>("DeclaredPriceConvertedCurrency", "valuation_decisions", "character varying(3)", maxLength: 3, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<decimal>("DeclaredPriceExchangeRate", "valuation_decisions", "numeric(24,12)", nullable: true);
        migrationBuilder.AddColumn<string>("DeclaredPriceExchangeRateSource", "valuation_decisions", "text", nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<DateOnly>("DeclaredPriceExchangeRateDate", "valuation_decisions", "date", nullable: true);
        migrationBuilder.AddColumn<string>("ReceiptFileName", "valuation_decisions", "character varying(260)", maxLength: 260, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>("ReceiptContentType", "valuation_decisions", "character varying(100)", maxLength: 100, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<long>("ReceiptFileSize", "valuation_decisions", "bigint", nullable: true);
        migrationBuilder.AddColumn<string>("ReceiptSha256", "valuation_decisions", "character varying(64)", maxLength: 64, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<DateTimeOffset>("ReceiptUploadedAt", "valuation_decisions", "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<string>("ReceiptUploadedBy", "valuation_decisions", "text", nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<byte[]>("ReceiptData", "valuation_decisions", "bytea", nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        foreach (var column in new[] { "DeclaredPriceAmount", "DeclaredPriceCurrency", "DeclaredPriceConvertedAmount", "DeclaredPriceConvertedCurrency", "DeclaredPriceExchangeRate", "DeclaredPriceExchangeRateSource", "DeclaredPriceExchangeRateDate", "ReceiptFileName", "ReceiptContentType", "ReceiptFileSize", "ReceiptSha256", "ReceiptUploadedAt", "ReceiptUploadedBy", "ReceiptData" })
            migrationBuilder.DropColumn(column, "valuation_decisions");
    }
}
