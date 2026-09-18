using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SES.Customs.Infrastructure.Context.Migrations;

public partial class EmployeeRegistrationRequests : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(name: "Username", table: "RegistrationRequests", type: "text", nullable: false, defaultValue: "");
        migrationBuilder.AddColumn<Guid>(name: "LocationId", table: "RegistrationRequests", type: "uuid", nullable: true);
        migrationBuilder.AddColumn<DateTimeOffset>(name: "ReviewedAt", table: "RegistrationRequests", type: "timestamp with time zone", nullable: true);
        migrationBuilder.AddColumn<string>(name: "ReviewedBy", table: "RegistrationRequests", type: "text", nullable: true);
        migrationBuilder.AddColumn<string>(name: "ReviewReason", table: "RegistrationRequests", type: "text", nullable: true);
        migrationBuilder.CreateIndex(name: "IX_RegistrationRequests_Username", table: "RegistrationRequests", column: "Username");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(name: "IX_RegistrationRequests_Username", table: "RegistrationRequests");
        migrationBuilder.DropColumn(name: "Username", table: "RegistrationRequests");
        migrationBuilder.DropColumn(name: "LocationId", table: "RegistrationRequests");
        migrationBuilder.DropColumn(name: "ReviewedAt", table: "RegistrationRequests");
        migrationBuilder.DropColumn(name: "ReviewedBy", table: "RegistrationRequests");
        migrationBuilder.DropColumn(name: "ReviewReason", table: "RegistrationRequests");
    }
}
