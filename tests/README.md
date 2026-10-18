# Tests

Suites que se ejecutan contra el backend real arrancado en local. No usan dobles: lo que se
comprueba es el comportamiento observable de la API y del panel.

## Ejecutarlo todo

```bash
./tests/run-all.sh
```

El script compila el backend, genera un hash PBKDF2 de pruebas, levanta el servidor con una base de
datos limpia y ejecuta cada suite por separado. Al final resume cuántas pasan.

Cada suite corre con **su propia base de datos** porque comparten estado (crean productos, tallas y
pedidos). Si se ejecutaran todas sobre la misma, los productos que deja una suite contaminarían los
conteos de la siguiente.

Requisitos: `cargo`, `python3`, y `docker` o `node 22` para las pruebas de frontend.

## Qué prueba cada archivo

| Archivo | Qué cubre | Resultado |
|---|---|---|
| `audit-api.py` | API completa: autenticación, CRUD de productos y tallas, stock y carrera de pedidos, subida de imágenes, cabeceras de seguridad, paginación y casos límite | 81/81 |
| `test-415.mjs` | Que las ocho escrituras del panel funcionan con el `api.ts` real (el bug de `Content-Type` que devolvía 415) | 8/8 |
| `test-gallery.mjs` | Panel de fotos: progreso de subida, galería, reordenación, texto alternativo, caché y rechazo de ficheros que no valen | 20/20 |
| `test-paginacion.mjs` | Paginación del catálogo: recorrido completo, búsqueda y filtros en el servidor, parámetros absurdos y coste por página | 27/27 |
| `test-dinero.mjs` | Dinero en céntimos: sumas que fallaban en coma flotante, la API sigue hablando en euros y el histórico guarda importes exactos | 22/22 |
| `Frontend/src/api.test.mjs` | Contrato de `api.ts` sin backend: cabeceras, cuerpos vacíos y traducción de errores | 14/14 |

## Ejecutar una suite suelta

```bash
cd Backend-Rust && cargo build --release
export ADMIN_PASSWORD_HASH='pbkdf2$600000$SALT$HASH'
export AUTH_SIGNING_KEY='clave-local-de-al-menos-32-caracteres'
export PORT=8099
export DATABASE_URL="sqlite:///tmp/jenny-test/jenny.db?mode=rwc"
export UPLOADS_DIR=/tmp/jenny-test/uploads
./Backend-Rust/target/release/jenny-api &

# Las de frontend necesitan Node 22 (usan --experimental-strip-types):
docker run --rm --network host -v "$PWD:/repo" -w /repo node:22-bookworm-slim \
  node --experimental-strip-types tests/test-dinero.mjs

# La de API es Python:
python3 tests/audit-api.py
```

La contraseña que usan las pruebas es `AuditPass2026`. Si la cambias, cámbiala también en
`audit-api.py` y en los cuatro `.mjs`.

Para generar el hash:

```bash
python3 -c "import hashlib,base64,os;s=os.urandom(16);h=hashlib.pbkdf2_hmac('sha256',b'AuditPass2026',s,600000,32);print('pbkdf2\$600000\$%s\$%s'%(base64.b64encode(s).decode(),base64.b64encode(h).decode()))"
```

## Antes de tocar la API

Ejecuta `./tests/run-all.sh`. Todas las suites limpian lo que crean y devuelven código de salida
distinto de cero si algo falla, así que valen como puerta en un pipeline.