#!/usr/bin/env bash
# Ejecuta todas las suites contra el backend real, cada una con una base de datos limpia.
#
# Las pruebas comparten estado (crean productos, variantes y pedidos), asi que van en bases
# separadas: si se ejecutaran todas sobre la misma, los totales de una suite contamination los
# conteos de la siguiente. Por eso este script levanta y apaga el servidor cada vez.
#
# Uso:  ./tests/run-all.sh
# Requiere: cargo, python3, docker (para las suites de frontend) y el backend compilado.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${WORK:-/tmp/jenny-test}"
PORT="${PORT:-8099}"
PASSWORD="${PASSWORD:-AuditPass2026}"

mkdir -p "$WORK/uploads"

# --- Hash PBKDF2 de la contraseña de pruebas (solo para este entorno, nunca para produccion)
hash="$WORK/hash.env"
if [ ! -f "$hash" ]; then
  PASSWORD="$PASSWORD" python3 - "$hash" <<'PY'
import base64, hashlib, os, sys
password = os.environ['PASSWORD'].encode()
salt = os.urandom(16)
derived = hashlib.pbkdf2_hmac('sha256', password, salt, 600_000, 32)
value = 'pbkdf2$600000$%s$%s' % (base64.b64encode(salt).decode(), base64.b64encode(derived).decode())
open(sys.argv[1], 'w').write("export ADMIN_PASSWORD_HASH='%s'\n" % value)
PY
fi

cargo build --release --manifest-path "$ROOT/Backend-Rust/Cargo.toml" || exit 1
BIN="$ROOT/Backend-Rust/target/release/jenny-api"

# El hash lleva comillas simples porque sus separadores son '$': se carga el fichero entero en vez
# de recortarlo con grep, que dejaba una comilla pegada al final y hacia fallar todos los logins.
# shellcheck disable=SC1090
. "$hash"

pass=0
fail=0

run_suite() {
  local suite="$1"
  rm -f "$WORK"/jenny.db*
  AUTH_SIGNING_KEY="clave-de-pruebas-local-de-al-menos-32-caracteres" \
  DATABASE_URL="sqlite://$WORK/jenny.db?mode=rwc" \
  UPLOADS_DIR="$WORK/uploads" \
  PORT="$PORT" "$BIN" > "$WORK/server.log" 2>&1 &
  local server=$!
  sleep 2

  local out
  if [ "$suite" = "api" ]; then
    out="$(python3 "$ROOT/tests/audit-api.py" 2>&1)"
  elif docker info > /dev/null 2>&1; then
    out="$(docker run --rm --network host -v "$ROOT:/repo" -w /repo node:22-bookworm-slim \
      node --experimental-strip-types "tests/$suite.mjs" 2>&1)"
  else
    out="$(node --experimental-strip-types "$ROOT/tests/$suite.mjs" 2>&1)"
  fi

  kill "$server" 2>/dev/null
  wait "$server" 2>/dev/null

  local resumen
  resumen="$(printf '%s' "$out" | grep -oE '[0-9]+/[0-9]+' | tail -1)"
  printf '  %-16s %s\n' "$suite" "${resumen:-sin resumen}"
  printf '%s' "$out" | grep -E '^  FALLA|^  - ' | head -5

  if [ -n "$resumen" ] && [ "${resumen%%/*}" = "${resumen##*/}" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
  fi
}

echo "Suites (base de datos limpia para cada una):"
run_suite api
run_suite test-415
run_suite test-gallery
run_suite test-paginacion
run_suite test-dinero

echo
if command -v npm > /dev/null 2>&1 && [ -d "$ROOT/Frontend/node_modules" ]; then
  echo "  contrato api.ts  $(cd "$ROOT/Frontend" && npm run --silent test:api 2>&1 | grep -oE '[0-9]+/[0-9]+' | tail -1)"
fi

echo
echo "Sin fallos: $pass · Con fallos: $fail"
exit $((fail > 0 ? 1 : 0))