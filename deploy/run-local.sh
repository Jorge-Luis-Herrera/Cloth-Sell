#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8080}"
DATA_DIR="${DATA_DIR:-$PROJECT_DIR/.local-dev/data}"
UPLOADS_DIR="${UPLOADS_DIR:-$PROJECT_DIR/.local-dev/uploads}"
mkdir -p "$DATA_DIR" "$UPLOADS_DIR"
RUST_DIR="$PROJECT_DIR/Backend-Rust"
: "${ADMIN_PASSWORD_HASH:?Export ADMIN_PASSWORD_HASH before running (pbkdf2\$iterations\$salt\$hash)}"
: "${AUTH_SIGNING_KEY:?Export AUTH_SIGNING_KEY before running}"
export ASPNETCORE_URLS="http://127.0.0.1:${PORT}"
export PORT
export DATABASE_URL="sqlite://${DATA_DIR}/jenny.db?mode=rwc"
export UPLOADS_DIR
cd "$PROJECT_DIR"
cargo run --manifest-path "$RUST_DIR/Cargo.toml"
