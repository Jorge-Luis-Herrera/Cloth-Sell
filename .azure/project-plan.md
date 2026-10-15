# Jenny Clothing Commerce Project Plan

**Status**: Approved
**Created**: 2026-10-14
**Mode**: MVP

## 1. Project Summary

Jenny será un e-commerce de ropa con catálogo público, carrito y creación de pedidos, acompañado de un panel administrativo protegido. El backend seguirá ASP.NET Core/C# y el frontend será React con TypeScript. El MVP prioriza vender y gestionar inventario de forma simple, sin pasarela de pago ni cuentas de cliente.

La solución toma como referencia técnica Pizzeria: API REST, autenticación administrativa por token, totales calculados en servidor, límites de subida, health check, contenedor no privilegiado, configuración por variables de entorno, ejecución local aislada y despliegue de imagen etiquetada por commit a Azure Container Registry y Azure App Service for Containers.

## 2. Requirements

- Catálogo público de productos de ropa con nombre, descripción, precio, imágenes, estado de publicación y variantes.
- Variantes por talla y color, con SKU opcional, precio heredado o sobrescrito y stock independiente.
- CRUD administrativo de productos, imágenes, variantes y stock.
- Carrito en el navegador y creación de pedidos sin cuenta de cliente.
- Gestión administrativa de pedidos: consulta, detalle y estados `Pending`, `Confirmed`, `Preparing`, `Shipped`, `Delivered` y `Cancelled`.
- Autenticación administrativa obligatoria para mutaciones y consultas privadas.
- Subida de imágenes validada por MIME real/extensión permitida, tamaño máximo, dimensiones razonables, nombre generado por el servidor y eliminación segura de archivos reemplazados.
- SQLite para el MVP, con migraciones y volumen persistente en producción.
- Docker multi-stage, usuario sin privilegios y configuración por entorno.
- Azure Container Registry para imágenes y Azure App Service for Containers como runtime.
- Persistencia: Azure Files montado para la base SQLite y datos de respaldo; Azure Blob Storage para imágenes de producto como decisión de producción preferida. En local, las imágenes usan una carpeta equivalente para conservar el flujo de Pizzeria.
- Backup, restauración e integrity check de SQLite documentados como operación de producción.
- No se incluye pago online, cuentas de clientes, cupones, envíos calculados ni multi-tienda en el MVP.

## 3. Services & Architecture

**Backend service**: ASP.NET Core Web API sobre .NET 8 LTS o la versión LTS disponible al comenzar la implementación. Expone rutas públicas de catálogo y pedidos, y rutas administrativas protegidas. La API sirve el contrato JSON y registra logs estructurados.

**Frontend service**: React + TypeScript + Vite. La aplicación contiene la tienda pública y el panel admin en la misma SPA, separando rutas públicas y privadas. En desarrollo Vite usa proxy hacia la API; en producción el frontend se compila y se copia al contenedor para servirlo desde App Service mediante ASP.NET Core, siguiendo el despliegue same-origin de Pizzeria.

**Request flow**:

1. El navegador consulta productos publicados y variantes disponibles.
2. El carrito conserva solo IDs, cantidades y selección de talla/color.
3. El backend vuelve a cargar precios y stock desde SQLite, valida cada línea y calcula el total; nunca acepta el precio enviado por el cliente.
4. El pedido se guarda en una transacción con snapshot de nombre, variante y precio.
5. El administrador inicia sesión y usa un token de sesión firmado para las rutas privadas.
6. Las imágenes pasan por validación y se guardan en Blob Storage en producción; una referencia estable queda asociada al producto.

**Adaptación desde Pizzeria**: se reemplazan Rust/Axum/SeaORM por ASP.NET Core, Entity Framework Core y SQLite, manteniendo separación de handlers, límites de entrada, autenticación por bearer token, archivos de configuración, scripts de ejecución local y pipeline Docker/ACR/App Service.

## 4. Data Model & Persistence

**Product**: `Id`, `Slug`, `Name`, `Description`, `BasePrice`, `Published`, `CreatedAt`, `UpdatedAt`.

**ProductVariant**: `Id`, `ProductId`, `Size`, `Color`, `Sku`, `PriceOverride`, `StockQuantity`, `IsActive`.

**ProductImage**: `Id`, `ProductId`, `BlobKey`, `ContentType`, `SizeBytes`, `SortOrder`, `AltText`, `CreatedAt`.

**Order**: `Id`, `Status`, `CustomerName`, `CustomerPhone`, `DeliveryAddress`, `Notes`, `Total`, `CreatedAt`, `UpdatedAt`.

**OrderItem**: `Id`, `OrderId`, `ProductId`, `VariantId`, `ProductNameSnapshot`, `SizeSnapshot`, `ColorSnapshot`, `UnitPrice`, `Quantity`, `LineTotal`.

SQLite será el datastore transaccional del MVP. Las migraciones se ejecutarán de forma explícita durante el arranque controlado o el paso de release, nunca mediante una mutación silenciosa no revisada. La ruta local por defecto será `.local-dev/data/jenny.db`; la ruta de producción será `/app/data/jenny.db` sobre Azure Files.

La operación de stock debe ejecutarse dentro de una transacción y rechazar cantidades insuficientes. Los pedidos guardan snapshots para que cambios posteriores del catálogo no alteren el historial. Azure Files conserva SQLite, WAL y archivos de recuperación entre reinicios y despliegues. Las imágenes se almacenan en Blob Storage; si el MVP necesita reducir servicios inicialmente, el plan permite usar `/app/uploads` sobre el mismo Azure Files mediante una implementación `IImageStorage` intercambiable.

## 5. API, Security & Validation

**Public routes**:

- `GET /api/health` verifica que la aplicación y SQLite responden.
- `GET /api/products` lista productos publicados con variantes y paginación básica.
- `GET /api/products/{id}` obtiene el detalle público.
- `POST /api/orders` valida cliente, líneas, variantes, stock y crea un pedido.

**Admin routes** requieren `Authorization: Bearer <token>`:

- `POST /api/auth/login` y `POST /api/auth/logout`.
- `GET/POST/PUT/DELETE /api/admin/products`.
- `POST/DELETE /api/admin/products/{id}/images`.
- `POST/PUT/DELETE /api/admin/products/{id}/variants`.
- `GET/PATCH /api/admin/orders` y `/api/admin/orders/{id}/status`.

La sesión administrativa será un token firmado con HMAC-SHA256, expiración configurable y secreto únicamente en variables de entorno; la contraseña se compara con hash, nunca en texto plano. Se aplican límites de intentos de login por IP y usuario, CORS explícito, HTTPS en Azure, validación de tamaño de JSON/multipart, rate limiting de pedidos y respuestas sin secretos.

La subida acepta inicialmente JPEG, PNG y WebP, con límite por defecto de 5 MB. El servidor inspecciona los bytes y el tipo detectado, no confía solo en `Content-Type`, genera un nombre aleatorio, evita path traversal, rechaza archivos corruptos y limita dimensiones para impedir cargas abusivas. Se recomienda re-encodear a un formato seguro antes de publicar. Los endpoints de imagen no permiten sobrescribir claves arbitrarias.

## 6. Design System & UI

**Component Library**: Fluent UI v9

**Visual direction**: tienda limpia y cálida, con tipografía legible, énfasis en fotografía de prendas y controles compactos para inventario. La interfaz debe funcionar bien en móvil para compradores y en escritorio para administración.

**Storefront**: navegación principal, búsqueda, filtros por talla/color, grid de productos, detalle con selector de variante, indicador de stock, carrito persistente y formulario de pedido. Los estados de carga, vacío, error y stock agotado se diseñan explícitamente.

**Admin**: navegación por catálogo, inventario y pedidos; tablas con edición clara, formularios con validación, previsualización de imágenes, gestión de variantes y cambio de estado de pedidos. Las acciones destructivas requieren confirmación y los errores del servidor se muestran cerca del control afectado.

**Accessibility**: labels asociados, foco visible, navegación por teclado, contraste AA, texto alternativo obligatorio para imágenes y mensajes de validación anunciables. No se depende del color para comunicar stock o estado.

## 7. Docker & Azure Deployment

**Dockerfile**: build multi-stage con SDK de .NET para compilar backend y Node para compilar React; runtime ASP.NET Core minimal. El contenedor crea `/app/data` y `/app/uploads`, ejecuta como usuario no privilegiado, expone `8080`, define `ASPNETCORE_URLS=http://+:8080` y no incluye secretos ni bases reales.

**ACR**: el script `deploy/deploy-appservice.sh` valida formato, tests y build, autentica contra `ACR_NAME.azurecr.io`, publica tags `git-sha` y `latest`, y conserva el SHA como referencia de rollback. Las credenciales deben venir del entorno o de un archivo local protegido que nunca se commitea.

**App Service for Containers**: el Web App apunta a `DOCKER|<acr>/<image>:<git-sha>`, configura health check en `/api/health`, reinicia tras actualizar la imagen y espera una respuesta HTTP válida antes de declarar el deploy correcto. Se configuran `ADMIN_PASSWORD`, `AUTH_SIGNING_KEY`, `DATABASE_URL`, `UPLOADS_DIR`, `BLOB_STORAGE_CONNECTION` o identidad administrada, `ALLOWED_ORIGINS` y logging mediante App Settings.

**Persistencia Azure**: Azure Files se monta en `/app/data` para SQLite y en una ruta de respaldo; Blob Storage mantiene las imágenes publicadas. Se documenta que SQLite en un único App Service es una decisión de MVP y no una estrategia multi-réplica. Si se escala horizontalmente, el siguiente paso es migrar a Azure Database for PostgreSQL y mantener Blob Storage.

**Operación**: scripts previstos: `run-local.sh` con base aislada y seed, `deploy-appservice.sh`, `backup.sh` con descarga/consolidación/integrity check y `restore.sh` o modo restore explícito. Los secretos se gestionan fuera del repositorio. Logs y health check permiten diagnosticar arranques fallidos.

## 8. Testing & Verification

- Tests unitarios de validación de variantes, stock, precios, estados de pedido, autenticación y límites de imagen.
- Tests de integración contra el WebApplicationFactory con SQLite temporal para rutas públicas y admin.
- Tests de seguridad: acceso sin token, token expirado, credenciales inválidas, CORS y path traversal.
- Tests de upload con MIME falso, extensión falsa, archivo corrupto, exceso de tamaño y reemplazo de imagen.
- Tests de concurrencia de stock para garantizar que no se vende más inventario del disponible.
- Tests del frontend para carrito, selección talla/color, estados de stock, login admin y formularios.
- Smoke test del contenedor: arranque como usuario no root, `/api/health`, migraciones, lectura/escritura en volumen y serving del frontend.
- Smoke test posterior a Azure deploy contra el FQDN del App Service y verificación de una imagen persistida tras reinicio.

## 9. Decisions, Assumptions & Open Items

- **Decidido para MVP**: ASP.NET Core/C#, React/TypeScript, SQLite, autenticación solo administrativa, pedidos sin pago online, Fluent UI v9, Docker y Azure ACR + App Service for Containers.
- **Decidido por referencia**: token bearer firmado, totales server-side, validaciones estrictas, usuario de contenedor sin privilegios, configuración por entorno, tags por commit, health check y backups verificables.
- **Decisión de persistencia**: Azure Files para SQLite por compatibilidad con el patrón de Pizzeria; Blob Storage para imágenes por durabilidad y desacoplamiento. La interfaz de almacenamiento permite fallback local durante desarrollo.
- **Supuesto**: una única instancia de App Service durante el MVP. No se promete consistencia de escritura SQLite con múltiples réplicas.
- **Supuesto**: el pedido se considera reservado al crearse y el administrador actualiza su estado; no se integra proveedor de pagos ni cálculo automático de envío.
- **Pendiente no bloqueante**: nombre final del dominio, región Azure, nombres de recursos, límite exacto de imágenes, política de expiración de pedidos, proveedor de correo/WhatsApp y si las imágenes serán públicas mediante CDN o URLs firmadas.
- **Criterio de salida**: catálogo navegable, CRUD admin completo, variantes y stock transaccionales, pedido reproducible, upload validado, datos supervivientes a reinicio, imagen Docker publicada en ACR y App Service respondiendo al health check.
