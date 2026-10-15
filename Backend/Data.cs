using Microsoft.EntityFrameworkCore;

namespace Jenny.Api;

public sealed class JennyDb(DbContextOptions<JennyDb> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductVariant> ProductVariants => Set<ProductVariant>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Product>().HasIndex(x => x.Slug).IsUnique();
        modelBuilder.Entity<ProductVariant>().HasIndex(x => new { x.ProductId, x.Size, x.Color }).IsUnique();
        modelBuilder.Entity<Product>().Property(x => x.BasePrice).HasPrecision(18, 2);
        modelBuilder.Entity<ProductVariant>().Property(x => x.PriceOverride).HasPrecision(18, 2);
        modelBuilder.Entity<Order>().Property(x => x.Total).HasPrecision(18, 2);
        modelBuilder.Entity<OrderItem>().Property(x => x.UnitPrice).HasPrecision(18, 2);
        modelBuilder.Entity<OrderItem>().Property(x => x.LineTotal).HasPrecision(18, 2);
        modelBuilder.Entity<Product>().HasMany(x => x.Variants).WithOne(x => x.Product).HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Product>().HasMany(x => x.Images).WithOne(x => x.Product).HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<Order>().HasMany(x => x.Items).WithOne(x => x.Order).HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Cascade);
    }
}
