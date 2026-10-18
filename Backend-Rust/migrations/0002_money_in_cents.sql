-- El dinero pasa de coma flotante a enteros en centimos.
--
-- Motivo: 3 x 0.10 en REAL da 0.30000000000000004, y ese numero se guardaba en el pedido y se
-- quedaba ahi. Con enteros la suma es exacta siempre.
--
-- Las columnas nuevas se anaden, se rellenan con el valor antigo redondeado y las viejas se
-- borran. No se reconstruye la tabla porque en SQLite un DROP TABLE con las claves foraneas
-- activas borra en cascada las tallas y las fotos del producto.

ALTER TABLE products ADD COLUMN base_price_cents INTEGER NOT NULL DEFAULT 0;
UPDATE products SET base_price_cents = CAST(ROUND(base_price * 100.0) AS INTEGER);
ALTER TABLE products DROP COLUMN base_price;

ALTER TABLE product_variants ADD COLUMN price_override_cents INTEGER;
UPDATE product_variants SET price_override_cents = CAST(ROUND(price_override * 100.0) AS INTEGER) WHERE price_override IS NOT NULL;
ALTER TABLE product_variants DROP COLUMN price_override;

ALTER TABLE orders ADD COLUMN total_cents INTEGER NOT NULL DEFAULT 0;
UPDATE orders SET total_cents = CAST(ROUND(total * 100.0) AS INTEGER);
ALTER TABLE orders DROP COLUMN total;

ALTER TABLE order_items ADD COLUMN unit_price_cents INTEGER NOT NULL DEFAULT 0;
UPDATE order_items SET unit_price_cents = CAST(ROUND(unit_price * 100.0) AS INTEGER);
ALTER TABLE order_items ADD COLUMN line_total_cents INTEGER NOT NULL DEFAULT 0;
UPDATE order_items SET line_total_cents = CAST(ROUND(line_total * 100.0) AS INTEGER);
ALTER TABLE order_items DROP COLUMN unit_price;
ALTER TABLE order_items DROP COLUMN line_total;