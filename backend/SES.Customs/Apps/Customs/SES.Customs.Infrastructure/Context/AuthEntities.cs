namespace SES.Customs.Infrastructure.Context;

public sealed class AuthAccountEntity
{
    public Guid Id { get; set; }
    public string Username { get; set; } = "";
    public string Email { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Role { get; set; } = "";
    public bool Active { get; set; }
    public string Status { get; set; } = "ACTIVE";
    public Guid? PrimaryLocationId { get; set; }
    public string RegionKey { get; set; } = "";
    public DateTimeOffset? RegionJoinedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public Guid? ArchivedBy { get; set; }
    public string? ArchiveReason { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public string EmployeeNumber { get; set; } = "";
    public string Phone { get; set; } = "";
    public DateTimeOffset? UpdatedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }
    public string PasswordHash { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
}

public sealed class RegistrationRequestEntity
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = "";
    public string StaffId { get; set; } = "";
    public string Email { get; set; } = "";
    public string? Phone { get; set; }
    public string Department { get; set; } = "";
    public string Role { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Status { get; set; } = "Pending";
    public DateTimeOffset SubmittedAt { get; set; }
}
