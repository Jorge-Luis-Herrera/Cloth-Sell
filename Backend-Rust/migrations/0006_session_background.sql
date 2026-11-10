-- Foto de fondo para el boton de una sesion en la tienda (se elige desde el panel).
-- Guarda la clave del fichero dentro de /uploads (igual que product_images.blob_key)
-- para que /uploads lo sirva con cache inmutable; vacio o NULL = boton sin foto.
ALTER TABLE catalog_sessions ADD COLUMN background_image TEXT;
