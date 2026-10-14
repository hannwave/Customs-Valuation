using System.Security.Cryptography;
using SES.Customs.API.Security;

namespace SES.Customs.API.Services;

public sealed record UploadedDocument(string FileName, string ContentType, byte[] Content, string Sha256);

/// <summary>Accepts only PDF, JPEG and PNG uploads whose bytes match their extension.</summary>
public static class UploadedDocumentReader
{
    public const long MaxBytes = 10_000_000;

    public static async Task<UploadedDocument> ReadAsync(IFormFile file, CancellationToken ct)
    {
        if (file.Length is < 1 or > MaxBytes) throw new WorkspaceException(400, "Each document must be between 1 byte and 10 MB.");
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var contentType = extension switch { ".pdf" => "application/pdf", ".jpg" or ".jpeg" => "image/jpeg", ".png" => "image/png", _ => "" };
        if (contentType.Length == 0) throw new WorkspaceException(400, "Documents must be PDF, JPG, JPEG or PNG files.");
        await using var stream = file.OpenReadStream();
        using var output = new MemoryStream();
        await stream.CopyToAsync(output, ct);
        var bytes = output.ToArray();
        var valid = contentType switch
        {
            "application/pdf" => bytes.Length >= 5 && bytes.AsSpan(0, 5).SequenceEqual("%PDF-"u8),
            "image/jpeg" => bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff,
            "image/png" => bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a }),
            _ => false
        };
        if (!valid) throw new WorkspaceException(400, "Document content does not match its file type.");
        return new UploadedDocument(Path.GetFileName(file.FileName), contentType, bytes, Convert.ToHexString(SHA256.HashData(bytes)));
    }
}
