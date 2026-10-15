using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;

namespace Jenny.Api;

public sealed class AuthService(IConfiguration configuration)
{
    private readonly string passwordHash = configuration["ADMIN_PASSWORD_HASH"] ?? throw new InvalidOperationException("ADMIN_PASSWORD_HASH is required");
    private readonly string signingKey = configuration["AUTH_SIGNING_KEY"] ?? throw new InvalidOperationException("AUTH_SIGNING_KEY is required");
    private readonly TimeSpan lifetime = TimeSpan.FromHours(configuration.GetValue("AUTH_TOKEN_HOURS", 8));
    public bool CheckPassword(string candidate)
    {
        try
        {
            var parts = passwordHash.Split('$');
            if (parts.Length != 4 || parts[0] != "pbkdf2" || !int.TryParse(parts[1], out var iterations)) return false;
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(candidate, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch { return false; }
    }
    public string CreateToken()
    {
        var payload = $"admin|{DateTimeOffset.UtcNow.Add(lifetime).ToUnixTimeSeconds()}";
        var signature = Convert.ToBase64String(HMACSHA256.HashData(Encoding.UTF8.GetBytes(signingKey), Encoding.UTF8.GetBytes(payload)));
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(payload + "." + signature));
    }
    public bool IsValid(string? token)
    {
        try
        {
            var parts = Encoding.UTF8.GetString(Convert.FromBase64String(token ?? "")).Split('.');
            if (parts.Length != 2 || parts[0].Split('|') is not ["admin", var expiry] || !long.TryParse(expiry, out var seconds) || DateTimeOffset.UtcNow.ToUnixTimeSeconds() >= seconds) return false;
            var expected = Convert.ToBase64String(HMACSHA256.HashData(Encoding.UTF8.GetBytes(signingKey), Encoding.UTF8.GetBytes(parts[0])));
            return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(parts[1]));
        }
        catch { return false; }
    }
}

public interface IImageStorage
{
    Task<(string Key, string ContentType, long Bytes)> SaveAsync(IFormFile file, CancellationToken cancellationToken);
    Task DeleteAsync(string key, CancellationToken cancellationToken);
}

public sealed class LocalImageStorage(IConfiguration configuration, IWebHostEnvironment environment) : IImageStorage
{
    private static readonly HashSet<string> AllowedTypes = ["image/jpeg", "image/png", "image/webp"];
    private readonly string root = configuration["UPLOADS_DIR"] ?? Path.Combine(environment.ContentRootPath, "uploads");
    public async Task<(string Key, string ContentType, long Bytes)> SaveAsync(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 or > 5 * 1024 * 1024) throw new InvalidDataException("Image must be between 1 byte and 5 MB.");
        Directory.CreateDirectory(root);
        await using var input = file.OpenReadStream();
        var format = await Image.DetectFormatAsync(input, cancellationToken) ?? throw new InvalidDataException("Unsupported or corrupt image.");
        var type = format.DefaultMimeType ?? "";
        if (!AllowedTypes.Contains(type)) throw new InvalidDataException("Only JPEG, PNG and WebP images are accepted.");
        input.Position = 0;
        using var image = await Image.LoadAsync(input, cancellationToken);
        if (image.Width > 5000 || image.Height > 5000) throw new InvalidDataException("Image dimensions are too large.");
        var extension = type switch { "image/jpeg" => ".jpg", "image/png" => ".png", _ => ".webp" };
        var key = $"{Guid.NewGuid():N}{extension}";
        await using var output = File.Create(Path.Combine(root, key));
        input.Position = 0;
        await input.CopyToAsync(output, cancellationToken);
        return (key, type, file.Length);
    }
    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        var safeKey = Path.GetFileName(key);
        var path = Path.Combine(root, safeKey);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }
}
