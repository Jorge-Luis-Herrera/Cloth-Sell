using System.ComponentModel.DataAnnotations;

namespace Jenny.Api;

public enum OrderStatus { Pending, Confirmed, Preparing, Shipped, Delivered, Cancelled }

public sealed class Product
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(120)] public string Slug { get; set; } = "";
    [MaxLength(160)] public string Name { get; set; } = "";
    [MaxLength(4000)] public string Description { get; set; } = "";
    public decimal BasePrice { get; set; }
    public bool Published { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public List<ProductVariant> Variants { get; set; } = [];
    public List<ProductImage> Images { get; set; } = [];
}
public sealed class ProductVariant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;
    [MaxLength(30)] public string Size { get; set; } = "";
    [MaxLength(60)] public string Color { get; set; } = "";
    [MaxLength(80)] public string? Sku { get; set; }
    public decimal? PriceOverride { get; set; }
    public int StockQuantity { get; set; }
    public bool IsActive { get; set; } = true;
}
public sealed class ProductImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProductId { get; set; }
    public Product Product { get; set; } = null!;
    [MaxLength(255)] public string BlobKey { get; set; } = "";
    [MaxLength(80)] public string ContentType { get; set; } = "";
    public long SizeBytes { get; set; }
    public int SortOrder { get; set; }
    [MaxLength(160)] public string AltText { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
public sealed class Order
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    [MaxLength(120)] public string CustomerName { get; set; } = "";
    [MaxLength(40)] public string CustomerPhone { get; set; } = "";
    [MaxLength(500)] public string DeliveryAddress { get; set; } = "";
    [MaxLength(1000)] public string? Notes { get; set; }
    public decimal Total { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public List<OrderItem> Items { get; set; } = [];
}
public sealed class OrderItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = null!;
    public Guid ProductId { get; set; }
    public Guid VariantId { get; set; }
    [MaxLength(160)] public string ProductNameSnapshot { get; set; } = "";
    [MaxLength(30)] public string SizeSnapshot { get; set; } = "";
    [MaxLength(60)] public string ColorSnapshot { get; set; } = "";
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public decimal LineTotal { get; set; }
}
