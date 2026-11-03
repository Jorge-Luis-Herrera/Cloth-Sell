-- Imagenes opcionalmente asociadas a una variante.
-- Las imagenes existentes quedan como galeria general del producto.

ALTER TABLE product_images ADD COLUMN variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_images_variant ON product_images(variant_id, sort_order);
