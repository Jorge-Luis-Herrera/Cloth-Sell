# Jenny integration hand-off

## Backend
- Folder: `Backend`
- Run: `dotnet run --project Backend/Jenny.Api.csproj`
- Container port: `8080`
- Build: `dotnet publish Backend/Jenny.Api.csproj -c Release`
- Health: `GET /api/health`
- Persistence: SQLite via `ConnectionStrings__Default`; local uploads via `UPLOADS_DIR`; production Blob implementation remains the next integration step.

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
- SQLite, EF Core; schema is created at controlled startup in MVP.
- Production path: `/app/data/jenny.db`, mount Azure Files.
- Env: `ConnectionStrings__Default`, `ADMIN_PASSWORD`, `AUTH_SIGNING_KEY`, `UPLOADS_DIR`, optional `BLOB_STORAGE_CONNECTION`, `ALLOWED_ORIGINS`.
- No seed data is included.

## Services
- Essential: ASP.NET Core API, SQLite, React/Vite SPA, Docker, ACR/App Service, local upload storage.
- Enhancement: Azure Blob Storage adapter, EF migration bundle/release job, Azure Files backup automation.
