using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

public partial class AddHs2022TariffStructure : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>("TariffItemNo", "national_tariff_lines", "character varying(30)", maxLength: 30, nullable: true);
        migrationBuilder.AddColumn<string>("MetadataJson", "hs_revisions", "jsonb", nullable: false, defaultValue: "{}");
        migrationBuilder.AddColumn<string>("OriginalHsVersion", "hs_revisions", "character varying(30)", maxLength: 30, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<int>("TotalRecords", "hs_revisions", "integer", nullable: false, defaultValue: 0);
        migrationBuilder.AddColumn<string>("UpdatedHsVersion", "hs_revisions", "character varying(30)", maxLength: 30, nullable: false, defaultValue: "");
        migrationBuilder.AlterColumn<string>("Code", "hs_codes", "character varying(6)", maxLength: 6, nullable: true, oldClrType: typeof(string), oldType: "character varying(6)", oldMaxLength: 6);
        migrationBuilder.AddColumn<string>("ChapterName", "hs_codes", "character varying(300)", maxLength: 300, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<int>("ChapterNumber", "hs_codes", "integer", nullable: true);
        migrationBuilder.AddColumn<string>("HeadingNumber", "hs_codes", "character varying(20)", maxLength: 20, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>("HsUpdateCandidatesJson", "hs_codes", "jsonb", nullable: false, defaultValue: "[]");
        migrationBuilder.AddColumn<string>("HsUpdateNote", "hs_codes", "text", nullable: true);
        migrationBuilder.AddColumn<string>("HsUpdateStatus", "hs_codes", "character varying(50)", maxLength: 50, nullable: true);
        migrationBuilder.AddColumn<string>("SectionName", "hs_codes", "character varying(300)", maxLength: 300, nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<string>("SectionNumber", "hs_codes", "character varying(20)", maxLength: 20, nullable: false, defaultValue: "");
        migrationBuilder.CreateTable(
            name: "hs_code_update_mappings",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                SourceHsCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                TargetHsCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                TargetDescription = table.Column<string>(type: "text", nullable: true),
                Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                Note = table.Column<string>(type: "text", nullable: false),
                SourceReference = table.Column<string>(type: "text", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_hs_code_update_mappings", x => x.Id));
        migrationBuilder.CreateIndex("IX_hs_code_update_mappings_RevisionId_SourceHsCode", "hs_code_update_mappings", new[] { "RevisionId", "SourceHsCode" });
        migrationBuilder.CreateIndex("IX_hs_code_update_mappings_RevisionId_TargetHsCode", "hs_code_update_mappings", new[] { "RevisionId", "TargetHsCode" });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable("hs_code_update_mappings");
        migrationBuilder.DropColumn("TariffItemNo", "national_tariff_lines");
        migrationBuilder.DropColumn("MetadataJson", "hs_revisions");
        migrationBuilder.DropColumn("OriginalHsVersion", "hs_revisions");
        migrationBuilder.DropColumn("TotalRecords", "hs_revisions");
        migrationBuilder.DropColumn("UpdatedHsVersion", "hs_revisions");
        migrationBuilder.DropColumn("ChapterName", "hs_codes");
        migrationBuilder.DropColumn("ChapterNumber", "hs_codes");
        migrationBuilder.DropColumn("HeadingNumber", "hs_codes");
        migrationBuilder.DropColumn("HsUpdateCandidatesJson", "hs_codes");
        migrationBuilder.DropColumn("HsUpdateNote", "hs_codes");
        migrationBuilder.DropColumn("HsUpdateStatus", "hs_codes");
        migrationBuilder.DropColumn("SectionName", "hs_codes");
        migrationBuilder.DropColumn("SectionNumber", "hs_codes");
        migrationBuilder.AlterColumn<string>("Code", "hs_codes", "character varying(6)", maxLength: 6, nullable: false, defaultValue: "", oldClrType: typeof(string), oldType: "character varying(6)", oldMaxLength: 6, oldNullable: true);
    }
}
