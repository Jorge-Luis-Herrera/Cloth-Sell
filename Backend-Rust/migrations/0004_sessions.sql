-- Sesiones del catalogo. Cada producto podra pertenecer a una sola sesion.
-- `session_id` queda nullable para conservar productos existentes sin clasificar.

CREATE TABLE IF NOT EXISTS catalog_sessions (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

ALTER TABLE products ADD COLUMN session_id TEXT REFERENCES catalog_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_order ON catalog_sessions(visible, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_products_session ON products(session_id);
