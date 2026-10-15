using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http.Features;
using Jenny.Api;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddEnvironmentVariables();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.Configure<FormOptions>(options => options.MultipartBodyLengthLimit = 6 * 1024 * 1024);
var connection = builder.Configuration.GetConnectionString("Default") ?? "Data Source=.local-dev/data/jenny.db";
var databasePath = connection.Replace("Data Source=", "", StringComparison.OrdinalIgnoreCase);
if (!Path.IsPathRooted(databasePath)) Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(databasePath))!);
builder.Services.AddDbContext<JennyDb>(options => options.UseSqlite(connection));
builder.Services.AddSingleton<AuthService>();
builder.Services.AddSingleton<IImageStorage, LocalImageStorage>();
builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("orders", policy => { policy.PermitLimit = 30; policy.Window = TimeSpan.FromMinutes(1); policy.QueueLimit = 0; }));
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    var origins = builder.Configuration["ALLOWED_ORIGINS"]?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) ?? [];
    if (origins.Length > 0) policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
}));
var app = builder.Build();
Directory.CreateDirectory(builder.Configuration["UPLOADS_DIR"] ?? Path.Combine(app.Environment.ContentRootPath, "uploads"));
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<JennyDb>();
    await db.Database.EnsureCreatedAsync();
}
app.UseCors();
app.UseRateLimiter();
app.UseStaticFiles();

bool IsAdmin(HttpContext context) => context.Request.Headers.Authorization.ToString() is var value && value.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) && app.Services.GetRequiredService<AuthService>().IsValid(value[7..]);
static IResult ValidationError(string message) => Results.ValidationProblem(new Dictionary<string, string[]> { ["request"] = [message] });
static object ProductView(Product p, string baseUrl) => new { p.Id, p.Slug, p.Name, p.Description, p.BasePrice, p.Published, p.CreatedAt, p.UpdatedAt, variants = p.Variants.Where(v => v.IsActive).Select(v => new { v.Id, v.Size, v.Color, v.Sku, Price = v.PriceOverride ?? p.BasePrice, v.StockQuantity, v.IsActive }), images = p.Images.OrderBy(i => i.SortOrder).Select(i => new { i.Id, url = $"{baseUrl}/uploads/{i.BlobKey}", i.ContentType, i.SizeBytes, i.SortOrder, i.AltText }) };

app.MapGet("/api/health", async (JennyDb db) => await db.Database.CanConnectAsync() ? Results.Ok(new { status = "ok", database = "sqlite" }) : Results.StatusCode(503));
app.MapPost("/api/auth/login", (LoginRequest request, AuthService auth) =>
    auth.CheckPassword(request.Password) ? Results.Ok(new { token = auth.CreateToken(), expiresInHours = 8 }) : Results.Unauthorized());
app.MapPost("/api/auth/logout", () => Results.NoContent());

app.MapGet("/api/products", async (JennyDb db, HttpRequest request, string? search, string? size, string? color, int page = 1, int pageSize = 24) =>
{
    page = Math.Clamp(page, 1, 10000); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.Products.AsNoTracking().Include(p => p.Variants).Include(p => p.Images).Where(p => p.Published);
    if (!string.IsNullOrWhiteSpace(search)) query = query.Where(p => p.Name.Contains(search) || p.Description.Contains(search));
    if (!string.IsNullOrWhiteSpace(size)) query = query.Where(p => p.Variants.Any(v => v.IsActive && v.Size == size && v.StockQuantity > 0));
    if (!string.IsNullOrWhiteSpace(color)) query = query.Where(p => p.Variants.Any(v => v.IsActive && v.Color == color && v.StockQuantity > 0));
    var total = await query.CountAsync();
    var products = await query.OrderByDescending(p => p.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
    return Results.Ok(new { items = products.Select(p => ProductView(p, $"{request.Scheme}://{request.Host}")), total, page, pageSize });
});
app.MapGet("/api/products/{id:guid}", async (Guid id, JennyDb db, HttpRequest request) =>
{
    var product = await db.Products.AsNoTracking().Include(p => p.Variants).Include(p => p.Images).SingleOrDefaultAsync(p => p.Id == id && p.Published);
    return product is null ? Results.NotFound() : Results.Ok(ProductView(product, $"{request.Scheme}://{request.Host}"));
});

app.MapPost("/api/orders", async (CreateOrderRequest request, JennyDb db) =>
{
    if (string.IsNullOrWhiteSpace(request.CustomerName) || string.IsNullOrWhiteSpace(request.CustomerPhone) || string.IsNullOrWhiteSpace(request.DeliveryAddress) || request.Items is not { Count: > 0 and <= 50 }) return ValidationError("Customer details and 1-50 items are required.");
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = new Order { CustomerName = request.CustomerName.Trim(), CustomerPhone = request.CustomerPhone.Trim(), DeliveryAddress = request.DeliveryAddress.Trim(), Notes = request.Notes?.Trim() };
    foreach (var line in request.Items)
    {
        if (line.Quantity is < 1 or > 20) return ValidationError("Quantity must be between 1 and 20.");
        var variant = await db.ProductVariants.Include(v => v.Product).SingleOrDefaultAsync(v => v.Id == line.VariantId && v.IsActive && v.Product.Published);
        if (variant is null || variant.StockQuantity < line.Quantity) return ValidationError("A selected variant is unavailable or out of stock.");
        var price = variant.PriceOverride ?? variant.Product.BasePrice;
        variant.StockQuantity -= line.Quantity;
        order.Items.Add(new OrderItem { ProductId = variant.ProductId, VariantId = variant.Id, ProductNameSnapshot = variant.Product.Name, SizeSnapshot = variant.Size, ColorSnapshot = variant.Color, UnitPrice = price, Quantity = line.Quantity, LineTotal = price * line.Quantity });
    }
    order.Total = order.Items.Sum(x => x.LineTotal);
    db.Orders.Add(order);
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/orders/{order.Id}", new { order.Id, order.Status, order.Total, order.CreatedAt });
}).RequireRateLimiting("orders");

app.MapGet("/api/admin/products", async (JennyDb db, HttpContext context, HttpRequest request) =>
{
    if (!IsAdmin(context)) return Results.Unauthorized();
    var products = await db.Products.AsNoTracking().Include(p => p.Variants).Include(p => p.Images).OrderByDescending(p => p.CreatedAt).ToListAsync();
    return Results.Ok(products.Select(p => ProductView(p, $"{request.Scheme}://{request.Host}")));
});
app.MapPost("/api/admin/products", async (ProductRequest request, JennyDb db, HttpContext context) =>
{
    if (!IsAdmin(context)) return Results.Unauthorized();
    if (string.IsNullOrWhiteSpace(request.Name) || request.BasePrice < 0) return ValidationError("Name and a non-negative price are required.");
    var product = new Product { Slug = string.IsNullOrWhiteSpace(request.Slug) ? Slugify(request.Name) : Slugify(request.Slug), Name = request.Name.Trim(), Description = request.Description?.Trim() ?? "", BasePrice = request.BasePrice, Published = request.Published };
    db.Products.Add(product); await db.SaveChangesAsync(); return Results.Created($"/api/admin/products/{product.Id}", product);
});
app.MapPut("/api/admin/products/{id:guid}", async (Guid id, ProductRequest request, JennyDb db, HttpContext context) =>
{
    if (!IsAdmin(context)) return Results.Unauthorized();
    var product = await db.Products.FindAsync(id); if (product is null) return Results.NotFound();
    product.Slug = string.IsNullOrWhiteSpace(request.Slug) ? product.Slug : Slugify(request.Slug); product.Name = request.Name.Trim(); product.Description = request.Description?.Trim() ?? ""; product.BasePrice = request.BasePrice; product.Published = request.Published; product.UpdatedAt = DateTime.UtcNow; await db.SaveChangesAsync(); return Results.Ok(product);
});
app.MapDelete("/api/admin/products/{id:guid}", async (Guid id, JennyDb db, HttpContext context) => { if (!IsAdmin(context)) return Results.Unauthorized(); var product = await db.Products.FindAsync(id); if (product is null) return Results.NotFound(); db.Products.Remove(product); await db.SaveChangesAsync(); return Results.NoContent(); });
app.MapPost("/api/admin/products/{id:guid}/variants", async (Guid id, VariantRequest request, JennyDb db, HttpContext context) => { if (!IsAdmin(context)) return Results.Unauthorized(); if (request.StockQuantity < 0 || string.IsNullOrWhiteSpace(request.Size) || string.IsNullOrWhiteSpace(request.Color)) return ValidationError("Size, color and non-negative stock are required."); if (!await db.Products.AnyAsync(p => p.Id == id)) return Results.NotFound(); var v = new ProductVariant { ProductId = id, Size = request.Size.Trim(), Color = request.Color.Trim(), Sku = request.Sku?.Trim(), PriceOverride = request.PriceOverride, StockQuantity = request.StockQuantity, IsActive = request.IsActive }; db.ProductVariants.Add(v); await db.SaveChangesAsync(); return Results.Created($"/api/admin/products/{id}/variants/{v.Id}", v); });
app.MapPut("/api/admin/products/{id:guid}/variants/{variantId:guid}", async (Guid id, Guid variantId, VariantRequest request, JennyDb db, HttpContext context) => { if (!IsAdmin(context)) return Results.Unauthorized(); var v = await db.ProductVariants.SingleOrDefaultAsync(x => x.ProductId == id && x.Id == variantId); if (v is null) return Results.NotFound(); v.Size = request.Size.Trim(); v.Color = request.Color.Trim(); v.Sku = request.Sku?.Trim(); v.PriceOverride = request.PriceOverride; v.StockQuantity = request.StockQuantity; v.IsActive = request.IsActive; await db.SaveChangesAsync(); return Results.Ok(v); });
app.MapDelete("/api/admin/products/{id:guid}/variants/{variantId:guid}", async (Guid id, Guid variantId, JennyDb db, HttpContext context) => { if (!IsAdmin(context)) return Results.Unauthorized(); var v = await db.ProductVariants.SingleOrDefaultAsync(x => x.ProductId == id && x.Id == variantId); if (v is null) return Results.NotFound(); db.ProductVariants.Remove(v); await db.SaveChangesAsync(); return Results.NoContent(); });
app.MapPost("/api/admin/products/{id:guid}/images", async (Guid id, IFormFile file, string? altText, JennyDb db, IImageStorage storage, HttpContext context) =>
{
    if (!IsAdmin(context)) return Results.Unauthorized(); var product = await db.Products.Include(p => p.Images).SingleOrDefaultAsync(p => p.Id == id); if (product is null) return Results.NotFound();
    try { var saved = await storage.SaveAsync(file, context.RequestAborted); var image = new ProductImage { ProductId = id, BlobKey = saved.Key, ContentType = saved.ContentType, SizeBytes = saved.Bytes, SortOrder = product.Images.Count, AltText = altText?.Trim() ?? product.Name }; db.ProductImages.Add(image); await db.SaveChangesAsync(); return Results.Created($"/api/admin/products/{id}/images/{image.Id}", image); } catch (InvalidDataException error) { return ValidationError(error.Message); }
}).DisableAntiforgery();
app.MapDelete("/api/admin/products/{id:guid}/images/{imageId:guid}", async (Guid id, Guid imageId, JennyDb db, IImageStorage storage, HttpContext context) => { if (!IsAdmin(context)) return Results.Unauthorized(); var image = await db.ProductImages.SingleOrDefaultAsync(x => x.Id == imageId && x.ProductId == id); if (image is null) return Results.NotFound(); await storage.DeleteAsync(image.BlobKey, context.RequestAborted); db.ProductImages.Remove(image); await db.SaveChangesAsync(); return Results.NoContent(); });

app.MapGet("/api/admin/orders", async (JennyDb db, HttpContext context, OrderStatus? status) => { if (!IsAdmin(context)) return Results.Unauthorized(); var query = db.Orders.AsNoTracking().Include(o => o.Items).OrderByDescending(o => o.CreatedAt).AsQueryable(); if (status.HasValue) query = query.Where(o => o.Status == status); return Results.Ok(await query.ToListAsync()); });
app.MapGet("/api/admin/orders/{id:guid}", async (Guid id, JennyDb db, HttpContext context) => { if (!IsAdmin(context)) return Results.Unauthorized(); var order = await db.Orders.AsNoTracking().Include(o => o.Items).SingleOrDefaultAsync(o => o.Id == id); return order is null ? Results.NotFound() : Results.Ok(order); });
app.MapPatch("/api/admin/orders/{id:guid}/status", async (Guid id, UpdateStatusRequest request, JennyDb db, HttpContext context) => { if (!IsAdmin(context)) return Results.Unauthorized(); if (!Enum.TryParse<OrderStatus>(request.Status, true, out var status)) return ValidationError("Invalid order status."); var order = await db.Orders.FindAsync(id); if (order is null) return Results.NotFound(); order.Status = status; order.UpdatedAt = DateTime.UtcNow; await db.SaveChangesAsync(); return Results.Ok(order); });

app.MapFallbackToFile("index.html");
await app.RunAsync();

static string Slugify(string value) => string.Join('-', value.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries)).Replace("/", "-");
public partial class Program { }
public sealed record LoginRequest(string Password);
public sealed record ProductRequest(string Name, string? Description, string? Slug, decimal BasePrice, bool Published);
public sealed record VariantRequest(string Size, string Color, string? Sku, decimal? PriceOverride, int StockQuantity, bool IsActive);
public sealed record OrderLineRequest(Guid VariantId, int Quantity);
public sealed record CreateOrderRequest(string CustomerName, string CustomerPhone, string DeliveryAddress, string? Notes, List<OrderLineRequest> Items);
public sealed record UpdateStatusRequest(string Status);
