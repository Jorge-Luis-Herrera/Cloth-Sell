# This project is a simple project to an e-commerce of a girl that needs to sell clothes

## Backend Rust y frontend React


### Things to do XD 

# Jenny Clothing Commerce

E-commerce de ropa con catalogo publico, variantes de talla/color, stock transaccional, pedidos sin cuenta y panel administrativo protegido. Backend Rust + Axum/SQLx/SQLite; frontend React/TypeScript/Vite con Fluent UI; despliegue como imagen multi-stage en Azure Container Registry y App Service for Containers.

## Desarrollo local

Requisitos: Rust estable, Docker para la validacion reproducible, o Node 22 para el frontend.

```bash
export ADMIN_PASSWORD_HASH='pbkdf2$600000$BASE64_SALT$BASE64_HASH'
export AUTH_SIGNING_KEY='local-only-signing-key-at-least-32-chars'
./deploy/run-local.sh
```

Para frontend aislado: `cd Frontend && npm ci && npm run dev`. Vite hace proxy de `/api` a `localhost:8080`.

## Docker

```bash
docker build -t jenny-clothing:local .
docker run --rm -p 8080:8080 -e ADMIN_PASSWORD -e AUTH_SIGNING_KEY -v "$PWD/.local-dev/data:/app/data" -v "$PWD/.local-dev/uploads:/app/uploads" jenny-clothing:local
curl http://localhost:8080/api/health
```

No hay secretos, credenciales Azure, bases reales ni seed data en el repositorio. El panel admin exige `ADMIN_PASSWORD_HASH` en formato `pbkdf2$iterations$base64Salt$base64Hash`; los tokens se firman con `AUTH_SIGNING_KEY`. Genera el hash con una herramienta PBKDF2 fuera del repositorio.

## Operacion

- Backup: `DATABASE_FILE=... ./deploy/backup.sh`; integrity check: `./deploy/backup.sh --integrity`.
- Restore: `DATABASE_FILE=... ./deploy/restore.sh backup.db` con la aplicacion detenida.
- Deploy: exportar `ACR_NAME`, `RESOURCE_GROUP`, `WEB_APP`, `ADMIN_PASSWORD_HASH` y `AUTH_SIGNING_KEY`, y ejecutar `./deploy/deploy-appservice.sh`.
- Azure App Service debe montar Azure Files en `/app/data` y `/app/uploads`; SQLite MVP asume una sola replica. Blob Storage es la evolucion recomendada para imagenes.

## Endpoints

Publicos: `/api/health`, `/api/products`, `/api/products/{id}`, `/api/orders`.
Admin Bearer: login/logout, CRUD de productos, imagenes, variantes/stock y consulta/estado de pedidos.


# This project is a simple e-commerce project for a girl who wants to sell clothes.

## Backend Rust con Axum y frontend React.

### Things to do

* Main Menu []
* Search []
* Digital Wallet []
* Remote Service []
* Login System []