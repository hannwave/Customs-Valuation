using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;
using SES.Customs.Infrastructure.Context;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

[DbContext(typeof(CustomsDbContext))]
[Migration("20260923090000_AddHsOfficialLetters")]
public partial class AddHsOfficialLetters : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<byte[]>(
            name: "OfficialLetterContent",
            table: "hs_codes",
            type: "bytea",
            nullable: false,
            defaultValue: Array.Empty<byte>());

        migrationBuilder.AddColumn<string>(
            name: "OfficialLetterContentType",
            table: "hs_codes",
            type: "character varying(120)",
            maxLength: 120,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "OfficialLetterFileName",
            table: "hs_codes",
            type: "character varying(255)",
            maxLength: 255,
            nullable: false,
            defaultValue: "");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "OfficialLetterContent", table: "hs_codes");
        migrationBuilder.DropColumn(name: "OfficialLetterContentType", table: "hs_codes");
        migrationBuilder.DropColumn(name: "OfficialLetterFileName", table: "hs_codes");
    }
}
