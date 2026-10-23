-- Producto premium y su ficha tecnica.
--
-- `is_premium` es curaduria manual: Jenny decide que prendas forman la serie, no se calcula
-- por precio. `premium_rank` fija el orden dentro de la serie; si es NULL, van al final.
--
-- La ficha vive en su propia tabla 1:1 para no engordar `products`, y para que un producto
-- normal no arrastre columnas que nunca usa. Los campos compuestos (composicion, cuidados,
-- ensayos) se guardan como JSON y el backend valida al escribir.
--
-- Todo es aditivo, como en la 0002: se aplica sobre una base existente sin tocar datos.

ALTER TABLE products ADD COLUMN is_premium INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN premium_rank INTEGER;

-- La tienda pide la serie premium por separado del catalogo.
CREATE INDEX IF NOT EXISTS idx_products_premium ON products(is_premium, premium_rank);

CREATE TABLE IF NOT EXISTS product_premium (
    product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    tagline TEXT NOT NULL DEFAULT '',
    composition TEXT NOT NULL DEFAULT '[]',
    fabric_weight_gsm INTEGER,
    origin TEXT NOT NULL DEFAULT '',
    care TEXT NOT NULL DEFAULT '[]',
    tests TEXT NOT NULL DEFAULT '[]',
    story TEXT NOT NULL DEFAULT '',
    limited_units INTEGER,
    updated_at TEXT NOT NULL DEFAULT ''
);
