# Jenny integration hand-off

## Backend
- Folder: `Backend-Rust`
- Run: `cargo run --manifest-path Backend-Rust/Cargo.toml`
- Container port: `8080`
- Build: `cargo build --manifest-path Backend-Rust/Cargo.toml --release`
- Health: `GET /api/health`
- Persistence: SQLite via `DATABASE_URL`; local uploads via `UPLOADS_DIR`; production Blob implementation remains the next integration step.

## Frontend
- Folder: `Frontend`
- Install/build: `npm ci` / `npm run build`
- Dev: `npm run dev`
- API seam: `Frontend/src/api.ts`
- Current UI: `Frontend/src/main.tsx`, public storefront, persistent cart, checkout and admin login/catalog.

## API routes
- `GET /api/health`
- `GET /api/products`, `GET /api/products/{id}`
- `POST /api/orders`
- `POST /api/auth/login`, `POST /api/auth/logout`
- `GET/POST/PUT/DELETE /api/admin/products`
- `POST/DELETE /api/admin/products/{id}/images`
- `POST/PUT/DELETE /api/admin/products/{id}/variants`
- `GET /api/admin/orders`, `GET /api/admin/orders/{id}`, `PATCH /api/admin/orders/{id}/status`

## Database
- SQLite via SQLx; schema is created at controlled startup in MVP.
- Production path: `/app/data/jenny.db`, mount Azure Files.
- Env: `DATABASE_URL`, `ADMIN_PASSWORD_HASH`, `AUTH_SIGNING_KEY`, `UPLOADS_DIR`, optional `BLOB_STORAGE_CONNECTION`, `ALLOWED_ORIGINS`.
- No seed data is included.

## Services
- Essential: Axum API, SQLite, React/Vite SPA, Docker, ACR/App Service, local upload storage.
- Enhancement: Azure Blob Storage adapter, SQLx migration release job, Azure Files backup automation.
