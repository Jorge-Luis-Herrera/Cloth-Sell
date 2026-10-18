# Jenny — Auditoría técnica y plan de trabajo

> Commit auditado: `05c0e83` · Fecha: 2026-10-17
> Método: backend Rust compilado y ejecutado en local (puerto 8099, BD y uploads aislados en
> `/tmp/opencode/jenny-audit`), 77 comprobaciones automáticas sobre el API real + ejecución del
> código real de `api.ts` en Node + inspección del bundle que sirve Azure.

---

## 0. Progreso

**Verificado en local tras los arreglos: 81/81 comprobaciones del API, 8/8 escrituras del panel con el
`api.ts` real y 10/10 pruebas de contrato. El frontend compila.**

Hecho:

- [x] **Fase 1 completa**: el 415 está corregido y protegido con pruebas (`Frontend/src/api.test.mjs`,
      `npm run test:api`). De paso apareció y se corrigió un segundo bug que estaba escondido detrás:
      los `PUT`/`PATCH` respondían `200` con cuerpo vacío y el panel reventaba con
      *Unexpected end of JSON input*. Ahora responden `204`.
- [x] **F1** `size_bytes` real, **F3** slug normalizado (`Bañador «Niño» Ñandú` → `banador-nino-nandu`),
      **F4** validación por bytes mágicos, **F5** `413` honesto con el motivo del tamaño.
- [x] **F2** nombre duplicado → `409` con mensaje que dice qué repetir; talla duplicada → `409` igual.
- [x] **F8** una sola moneda (EUR en tienda y panel, definida una vez en `api.ts`).
- [x] **F12** rate limit en el login: 10 fallos por IP y ventana de 15 min. No bloquea a quien acierta
      la contraseña, solo corta la fuerza bruta.
- [x] **F9 (parcial)** cabeceras `nosniff`, `SAMEORIGIN`, `Referrer-Policy` y HSTS.
- [x] CORS ya no es `*`: por defecto solo el propio origen, configurable con `ALLOWED_ORIGINS`.
- [x] **C1 (config)** `PUBLIC_SCHEME=https` y `FRONTEND_DIR` añadidos al pipeline y al script de deploy.
- [x] **C4** contexto de Docker: **1.048 GB → 415 kB**. El binario precompilado pasa por
      `deploy/prebuilt/` porque `Backend-Rust/target` está excluido del contexto.
- [x] **B7** el frontend se busca junto al ejecutable, no en el directorio de trabajo.
- [x] Dependencia `hex` sin uso eliminada.

- [x] **Fase 3 completa**: panel de subida de fotos con progreso real, varias fotos, drag & drop,
      galería ordenable con portada y texto alternativo editable.
- [x] **B6 (parcial)** los errores se muestran como texto legible y no como JSON crudo.
- [x] Las fotos se sirven con `Cache-Control: immutable` y se avisa si superan 12.000 px por lado.

Verificación de la Fase 3: **20/20** comprobaciones del panel de fotos contra el API real (progreso,
galería, reordenación, texto alternativo, caché, rechazo de ficheros que no valen) y **12/12** pruebas
de contrato de `api.ts`.

- [x] **F6 y F7 completas**: el catálogo se pagina y filtra en SQL y la tienda tiene carga incremental.
- [x] Suite de pruebas guardada en `tests/` con instrucciones (`tests/README.md`).

- [x] **B3**: migraciones versionadas con `sqlx::migrate!()`. La 0001 crea el esquema (con `IF NOT
      EXISTS`, para que aplique también sobre bases ya existentes) e indices; la 0002 pasa el dinero
      a centimos.
- [x] **B1**: el dinero se guarda en centimos enteros. La API sigue hablando en euros, asi que el
      frontend no cambia. 3 x 0.10 ahora da 0.30 exacto.
- [x] **B6 (parte)**: 20 `map_err(|_| ...)` que se traganan el motivo del fallo ahora lo registran.

### Migración del dinero, verificada sobre una base antigua

Se reprodujo una base con el esquema previo y datos (499.90, 0.10, un override de 0.07, un pedido y
sus fotos) y se arrancó el binario nuevo encima: las dos migraciones se aplicaron solas, los valores
pasaron a centimos exactos, la foto sobrevivio y los pedidos quedaron intactos. La migracion anade
columnas, las rellena y borra las viejas: NO reconstruye la tabla, porque un `DROP TABLE` con claves
foraneas activas borraria en cascada las tallas y las fotos del producto.

### Antes de tocar la API

`./tests/run-all.sh` levanta el backend con una base limpia y ejecuta las cinco suites:

```
  api              81/81
  test-415         8/8
  test-gallery     20/20
  test-paginacion  27/27
  test-dinero      22/22
  contrato api.ts  14/14
```

Pendiente: logout que invalide el token (**F11**), CSP, miniatura de 400 px y `PRAGMA journal_mode=WAL`
para Azure Files (**B2**).

### Verificación acumulada

| Suite | Resultado |
|---|---|
| `tests/audit-api.py` — API completa | **81/81** |
| `tests/test-415.mjs` — escrituras del panel | **8/8** |
| `tests/test-gallery.mjs` — panel de fotos | **20/20** |
| `tests/test-paginacion.mjs` — catálogo | **27/27** |
| `Frontend/src/api.test.mjs` — contrato del cliente | **14/14** |

---

## 1. Los tres síntomas reportados

### 1.1 El 415 `Expected request with Content-Type: application/json` — CAUSA RAÍZ CONFIRMADA

**No es un fallo del backend. Es una línea en `Frontend/src/api.ts:32`:**

```ts
const json = async (path: string, init?: RequestInit) => {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init });
  //                                                              ^^^^^^^^^^^^^^^^^^^^^^^^^                        ^^^^^^
  //                                                              se calcula bien                                y luego PISA el objeto headers entero
};
```

El orden de las propiedades importa: el literal `{ headers: {...} }` se construye bien, pero el `...init`
que va **después** sustituye la clave `headers` completa por `init.headers`, que es solo
`{ Authorization: ... }`. El `Content-Type` desaparece, el navegador asume
`text/plain;charset=UTF-8` y Axum responde 415.

**Prueba** (código real de `api.ts` ejecutado contra el backend local):

```
login()            (sin cabeceras)      -> 200   <- por eso sí puedes entrar al panel
createProduct()    (con token)          -> 415
updateProduct()    (con token)          -> 415
saveVariant()      (con token)          -> 415
updateVariant()    (con token)          -> 415
setStatus()        (con token)          -> 415
deleteImage / deleteVariant / deleteOrder  -> funcionan (no llevan cuerpo JSON)
uploadImage()      (FormData)           -> funciona (usa otro helper, `upload()`)
adminProducts()    (GET, sin cuerpo)    -> funciona (sin cuerpo no hay Content-Type)

Lo que ve el servidor en createProduct():
  Content-Type  = text/plain;charset=UTF-8
  Authorization = Bearer admin|1792300...
```

Idéntico byte a byte a lo que mostró Firefox.

**Consecuencia real:** hoy el panel **no puede crear ni editar productos, ni tallas, ni cambiar el estado
de un pedido**. Solo funcionan el login y los borrados.

**Arreglo (1 línea):** invertir el orden del spread.

```ts
fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
```

En `upload()` **no** añadir `Content-Type`: debe ganar el `multipart/form-data` del navegador.

---

### 1.2 «No me deja subir una foto antes de crear el producto» — YA RESUELTO EN CÓDIGO, NO EN AZURE

El commit `05c0e83` (*Allow picking a product photo at creation time*) ya añade esa función en
`ProductDialog.tsx` (estado `pendingFile` + `preview`; la foto se sube justo después del `createProduct`).

Pero **Azure sirve el bundle del commit anterior**. Comparación del JS de producción
(`/assets/index-DMFFI-Kk.js`) contra el build local de HEAD (`/assets/index-MWAJInkz.js`):

| Marcador | Azure (producción) | Build local de HEAD |
|---|---|---|
| `Guarda el producto para poder subirle fotos` | **PRESENTE** (UI vieja) | ausente |
| `La foto se subira al guardar el producto` | ausente | **PRESENTE** |
| `Subiendo la foto` / `Guardando el producto…` | ausente | **PRESENTE** |
| `.adm-busy` / `.adm-spinner` en el CSS | ausente | **PRESENTE** |

La frase exacta que se lee en pantalla («Guarda el producto para poder subirle fotos») es el código viejo.

**Indicio adicional (historial de imágenes Docker locales):** existían las imágenes
`jenny-clothing:05c0e83` y `jenny-clothing:latest` con el mismo ID (`b6954deba88c`), junto a las de
`952b9e9` y `ca1aedc`. Es decir, **la imagen del último commit sí se construyó**, pero el sitio no la está
sirviendo. Eso apunta a un despliegue interrumpido a mitad (fallo en `docker push` sin VPN, o el
`az webapp config set --linux-fx-version` sin efecto, o un reinicio que no llegó a tiempo) y no a que
nunca se intentara. Hay que comprobar paso a paso cuando haya VPN: build → push a ACR → `linux-fx-version`
→ restart → health.

---

### 1.3 «No hay panel de carga de subiendo fotos» — MISMO ORIGEN, Y ADEMÁS INSUFICIENTE

El overlay `.adm-busy` con spinner ya existe en HEAD, pero tampoco está en Azure. Y aun cuando se
despliegue, sigue siendo insuficiente:

- `fetch` **no puede informar del progreso de subida**. Sin `XMLHttpRequest` nunca habrá barra de %.
- Solo se acepta **una** foto (`pendingFile` es un único `File`). El backend además solo lee el primer
  campo `file` del multipart (verificado: 2 ficheros en una petición → guarda 1).
- `sort_order` siempre vale 0 → **no se puede reordenar la galería ni marcar portada**.
- No hay drag & drop real: es un `<button>` que abre el selector de archivos.
- Si la foto falla tras crear el producto, el toast avisa pero el modal queda abierto con el producto ya
  creado (correcto, pero sin reintento).

---

## 2. Hallazgos adicionales

### Críticos

| # | Hallazgo | Evidencia |
|---|---|---|
| C1 | **Ninguna foto se verá nunca en Azure.** `PUBLIC_SCHEME` no está definido ni en `azure-pipelines.yml` ni en `deploy-appservice.sh`, así que el API devuelve `http://jenny-clothing-.../uploads/x.png` sobre un sitio HTTPS → *mixed content*, el navegador lo bloquea | URL real devuelta por el API de producción: `http://...azurewebsites.net/uploads/4f39...png` (confirmado también en local) |
| C2 | **Contraseña de prueba en producción.** `.local-dev/deploy-test-secrets.env` documenta `Admin panel password: JennyTest2026!` y que se generó «para desbloquear el despliegue» | Lectura del fichero (está gitignored, pero la contraseña es adivinable: proyecto + año) |
| C3 | **Posible pérdida total de datos en cada despliegue.** Ni el pipeline ni `deploy-appservice.sh` montan Azure Files en `/app/data` ni `/app/uploads`. Si el montaje no se hizo a mano, la BD y las fotos viven en el disco efímero del contenedor | Requiere VPN para confirmar |
| C4 | **`.dockerignore` contradictorio**: excluye `Backend-Rust/target` y luego lo re-incluye con `!`, así que Docker envía **1.048 GB de contexto** en cada build | `Sending build context to Docker daemon 1.048GB` |

### Funcionales

| # | Hallazgo | Evidencia |
|---|---|---|
| F1 | `size_bytes` se guarda **siempre 0** (`main.rs:127` hace `.bind(0_i64)`) | Fichero de 70 bytes → `sizeBytes: 0` en la respuesta real |
| F2 | Slug duplicado → `400 {"request":"Could not create product"}` opaco, sin decir «ese nombre ya existe» | Reproducido 3 veces |
| F3 | `slugify` no normaliza: `"Bañador «Niño» Ñandú"` → `bañador-«niño»-ñandú` (URLs con acentos, comillas y eñes) | Reproducido |
| F4 | Sin validar bytes mágicos: un `.txt` declarado `image/png` se acepta y se guarda | Reproducido (201) |
| F5 | Pasarse del límite de cuerpo da `400 "Could not read image"` en vez de `413 Payload Too Large`: el mensaje miente | Reproducido con 6 MB |
| F6 | **La tienda solo ve los primeros 24 productos.** `main.tsx` llama `api.products()` sin paginación y no hay «ver más» | Con 241 productos: `total: 241`, `items: 24` |
| F7 | Filtrado y paginado en memoria + N+1 (2 queries por producto): pedir 1 producto cuesta casi lo mismo que pedir 100 (13 ms vs 19 ms con 241) → escala linealmente mal | Medido |
| F8 | **Moneda incoherente**: la tienda formatea en EUR (`es-ES`) y el panel en MXN (`es-MX`); las fechas del panel en `es-MX` | `main.tsx:8` vs `admin/ui.tsx:109` |
| F9 | `ServeDir` no pone `Cache-Control` ni ETag a las fotos, y no hay cabeceras de seguridad (HSTS, CSP, X-Frame-Options, X-Content-Type-Options) | Inspección de respuestas |
| F10 | El panel afirma «El cliente ve el estado en cuanto lo cambias», pero **no hay consulta de pedido para el cliente**: no existe token ni seguimiento | `OrdersTab.tsx:59` vs ausencia en la tienda |
| F11 | `logout` es un no-op: devuelve 204 y el token sigue sirviendo 8 h | Verificado |
| F12 | Sin rate limit en `/api/auth/login` (20 intentos fallidos seguidos, todos 401 sin bloqueo) | Verificado |
| F13 | El editor de variantes no resincroniza `drafts` cuando cambian las variantes del servidor (no hay `useEffect`): si se guarda desde otra pestaña, la lista queda desfasada | `VariantsEditor.tsx:26` |
| F14 | La contraseña es case-sensitive y sin normalizar espacios (correcto, pero conviene documentarlo) | Verificado |

### Corrección y robustez del backend

| # | Hallazgo | Evidencia |
|---|---|---|
| B1 | **Dinero en coma flotante**: 3 × 0.10 = `0.30000000000000004` en la BD y en el total del pedido | Verificado |
| B2 | SQLite en `journal_mode=delete` (no WAL). Sobre Azure Files (SMB) el riesgo de bloqueos y corrupción es mayor | Cabecera del fichero de BD |
| B3 | Sin migraciones: solo `CREATE TABLE IF NOT EXISTS`; cualquier cambio de esquema futuro es manual | `init_db` en `main.rs:156` |
| B4 | Sin una sola prueba automática (ni Rust ni TS) y **sin Node instalado en local**: el frontend solo se puede verificar dentro de Docker | Búsqueda de tests = 0 |
| B5 | `main.rs` tiene 165 líneas con funciones de una sola línea de 500+ caracteres: imposible de revisar, testear o diferenciar en un `git blame` | Lectura |
| B6 | Errores inconsistentes: `bad()` devuelve `{"request": ...}` y `login` devuelve `{"error": ...}`; los 422 de Axum son `text/plain`; el panel muestra el JSON crudo al usuario | Lectura |
| B7 | `ServeDir::new("Frontend/dist")` es una ruta relativa al directorio de trabajo: si el binario se ejecuta desde otro sitio, la tienda y el panel desaparecen | `main.rs:165` |
| B8 | El campo `sku` existe en el modelo pero el editor de variantes no lo expone | `VariantsEditor.tsx` |

### Lo que está bien (no tocar)

- La **carrera de stock** está protegida: 4 pedidos simultáneos por la última unidad → `[201, 400, 400, 400]`.
- El total del pedido se recalcula en servidor, nunca se acepta el precio enviado por el cliente.
- La escritura del pedido es transaccional y guarda snapshots.
- Token HMAC-SHA256 y PBKDF2-600k bien implementados, con comparación en tiempo constante.
- Contenedor con usuario sin privilegios y healthcheck.
- `deploy-appservice.sh` ya detecta el binario obsoleto por checksum.

---

## 3. Plan de trabajo

### Fase 0 — Entorno local reproducible (bloqueante para el resto)

- [ ] Instalar Node 22 para poder ejecutar `npm ci && npm run build` y `tsc` sin Docker.
- [ ] Crear `.env.local` gitignored con `ADMIN_PASSWORD_HASH`, `AUTH_SIGNING_KEY`, `DATABASE_URL` y
      `UPLOADS_DIR`, más un comando único documentado (`deploy/run-local.sh` ya existe, pero hoy obliga a
      exportar las variables a mano).
- [ ] Fijar **una** fuente de verdad para el hash: hoy está en `.local-dev/deploy-test-secrets.env` y también
      en las variables del pipeline.

### Fase 1 — Fix del 415 (bloqueante, ~15 min)

- [x] `Frontend/src/api.ts:32` → invertir el orden del spread.
- [x] Añadir una prueba que afirme que `createProduct` manda `Content-Type: application/json` (evita la recaída).
- [x] Verificar en local: crear producto, crear variante y cambiar estado de pedido → 201/200, cero 415.

### Fase 2 — Desplegar y confirmar que llega a Azure (requiere VPN)

- [x] `PUBLIC_SCHEME=https` y `FRONTEND_DIR` ya están en el pipeline y en `deploy-appservice.sh`
      (**fix de C1**); falta aplicar el/appsettings en la App Service real cuando haya VPN.
- [ ] Sustituir `ADMIN_PASSWORD_HASH` y `AUTH_SIGNING_KEY` por secretos de producción (**fix de C2**).
- [ ] Confirmar el montaje de Azure Files en `/app/data` y `/app/uploads` (**fix de C3**): crear un producto,
      reiniciar la app y comprobar que sigue ahí.
- [ ] Lanzar el pipeline (o `deploy-appservice.sh`).
- [ ] Comprobar paso a paso que el despliegue **realmente** toma efecto: `docker pull` de la etiqueta nueva
      en ACR, `az webapp config container show` (debe apuntar a la etiqueta del commit actual) y solo
      después el reinicio. Un `linux-fx-version` que no cambia es el fallo silencioso típico de este proyecto.
- [ ] Comprobar que el bundle servido contiene `La foto se subira al guardar el producto` y que el CSS trae `.adm-busy`.
- [ ] Repetir el flujo completo en producción: crear producto con foto → publicarlo → comprarlo en la tienda.

### Fase 3 — Panel de subida de fotos

- [x] `upload()` migrado a `XMLHttpRequest` con **porcentaje real de progreso** (fetch no lo da).
- [x] Varias fotos por producto (selección múltiple y arrastrando varias a la vez).
- [x] `sort_order` real, endpoints de reordenación y de texto alternativo; la primera foto es la portada.
- [x] Drag & drop de verdad (`dragover`/`drop`) con zona resaltada.
- [x] `size_bytes` real, validación de bytes mágicos (**F1, F4**) y error 413 honesto (**F5**).
- [x] `Cache-Control: immutable` en `/uploads` y aviso cuando la imagen pasa de 12.000 px por lado (**F9**).
- [x] Barra de progreso con % visible, contador «foto X de N» y bloqueo del diálogo mientras sube.
- [ ] Miniatura/optimización: generar una versión de 400 px al subir (sigue pendiente).

### Fase 4 — Validación y mensajes

- [x] Slug único legible (`bañador-nino-nandu`) y `409 «Ya existe un producto con el nombre X»`.
- [ ] Límites de longitud en nombre/descripción y validación de precio coherente entre servidor y panel
      (hoy el backend acepta 0 y 1e308).
- [ ] Formato de error único `{ "error": { "code": "...", "message": "..." } }` y traducción en el panel (**B6**).

### Fase 5 — Dinero

- [x] Migrado a enteros en céntimos (`base_price_cents`, `unit_price_cents`, `total_cents`) con la
      migración `0002_money_in_cents.sql`. La conversion a decimal ocurre solo al serializar (**B1**).

### Fase 6 — Catálogo y tienda

- [x] Paginación real en la tienda: 12 por página, carga automática al llegar al final y botón
      «Cargar más prendas», con contador «Has visto las N prendas» (**F6**).
- [x] Filtro y paginación movidos a SQL y N+1 eliminado: de 2 consultas por producto a 2 en total
      por página. Con 30 productos, pedir 12 cuesta lo mismo que pedir 100 (2-3 ms) (**F7**).
- [ ] Una sola moneda y locale en todo el proyecto (**F8**).
- [ ] Exponer `sku` en el editor de variantes (**B8**) o quitarlo del modelo.

### Fase 7 — Seguridad

- [x] Rate limit por IP en `/api/auth/login`: 10 fallos y ventana de 15 min, sin bloquear a quien acierta (**F12**).
- [ ] Token con `jti` + lista de revocación, para que `logout` invalide de verdad (**F11**).
- [x] `CorsLayer` restringido al propio dominio en lugar de `permissive()`, con `ALLOWED_ORIGINS` para excepciones.
- [x] Cabeceras HSTS, `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy`.
- [ ] CSP básica (queda pendiente: hay que decidir si se sirve un bundle único como ya ocurre).
- [ ] Sacar el token de `localStorage` a memoria + `sessionStorage`, o aceptar el riesgo documentado.

### Fase 8 — Persistencia (requiere VPN)

- [ ] Azure Files montado y verificado, o migrar las fotos a **Blob Storage** (ya estaba en el plan
      original y sigue pendiente).
- [ ] `PRAGMA journal_mode=WAL` y `busy_timeout` antes de abrir la BD (**B2**).
- [x] Migraciones versionadas con `sqlx::migrate!()` sobre `Backend-Rust/migrations/` (**B3**).

### Fase 9 — Calidad y mantenibilidad

- [ ] Partir `main.rs` en módulos (`routes/products.rs`, `routes/orders.rs`, `routes/auth.rs`, `images.rs`, `db.rs`) (**B5**).
- [ ] Tests: empezar por los 77 casos de esta auditoría como suite, luego unitarios del backend (**B4**).
- [x] Arreglar `.dockerignore`: el contexto baja de **1.048 GB a 415 kB** (**C4**).
- [x] `ServeDir` con ruta absoluta derivada del ejecutable, o `FRONTEND_DIR` (**B7**).
- [x] Quitada la dependencia `hex` sin uso. Quedan 2 avisos de clippy por el estilo de una sola linea.
- [ ] Reducir el bundle de 377 kB (109 kB gzip): Fluent UI entero para cuatro componentes.
- [ ] Sincronizar el editor de variantes con el servidor (**F13**) y resolver la frase sobre el estado del
      pedido visible por el cliente (**F10**).

---

## 4. Orden recomendado

1. **Fase 1** (el 415) — 15 minutos y desbloquea el panel entero.
2. **Fase 0** (Node local) — sin esto no se puede validar el frontend salvo dentro de Docker.
3. **Fase 2** (desplegar con VPN) — comprobar que llega a Azure y que las fotos se ven; `PUBLIC_SCHEME=https`
   es imprescindible.
4. **Fase 3** (subida de fotos con progreso y galería) — lo que pedías originalmente.
5. Fases 4 a 9 según prioridad de negocio.

---

## 5. Reproducir esta auditoría en local

```bash
# 1. Hash de prueba (PBKDF2, fuera del repo)
python3 -c "import hashlib,base64,os;s=os.urandom(16);h=hashlib.pbkdf2_hmac('sha256',b'AuditPass2026',s,600000,32);print('pbkdf2\$600000\$%s\$%s'%(base64.b64encode(s).decode(),base64.b64encode(h).decode()))"

# 2. Backend con BD y uploads aislados
cd Backend-Rust && cargo build --release
export ADMIN_PASSWORD_HASH='pbkdf2$600000$SALT$HASH'
export AUTH_SIGNING_KEY='clave-local-de-al-menos-32-caracteres'
export PORT=8099
export DATABASE_URL="sqlite:///tmp/audit/jenny.db?mode=rwc"
export UPLOADS_DIR=/tmp/audit/uploads
./target/release/jenny-api

# 3. Suite de comprobaciones (77 casos)
python3 /tmp/opencode/jenny-audit/audit2.py
```

El script imprime cada comprobación con su comportamiento esperado y, al final, la lista de lo que no se
comporta como debería.

### Comprobaciones usadas para el 415 (Node vía Docker, porque no hay Node local)

```js
// reproduce literalmente Frontend/src/api.ts
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const json = async (path, init) =>
  fetch(path, { headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init });

// y la inspección de cabeceras:
//   Content-Type  = text/plain;charset=UTF-8
//   Authorization = Bearer admin|...
docker run --rm --network host -v /tmp/opencode/jenny-audit/repro.js:/repro.js jenny-fe-head node /repro.js
```