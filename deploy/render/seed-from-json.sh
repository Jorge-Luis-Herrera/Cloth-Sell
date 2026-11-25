#!/usr/bin/env bash
# Crea sesiones y productos en la API de Render desde un JSON.
# Uso: ./seed-from-json.sh catalogo.json
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SEED="${1:?Uso: $0 catalogo.json}"
BASE="${BASE_URL:-https://jenny-clothing.onrender.com}"
PASSWORD="${ADMIN_PASSWORD:-$(cat "$HERE/../huggingface/.admin_password" 2>/dev/null || true)}"

[[ -f "$SEED" ]] || { echo "No existe $SEED" >&2; exit 2; }
[[ -n "$PASSWORD" ]] || { echo "Falta ADMIN_PASSWORD o deploy/huggingface/.admin_password" >&2; exit 2; }

SEED="$SEED" BASE="$BASE" PASSWORD="$PASSWORD" python3 - <<'PY'
import json, os, urllib.error, urllib.request
from pathlib import Path

base = os.environ["BASE"].rstrip("/")
password = os.environ["PASSWORD"]
data = json.loads(Path(os.environ["SEED"]).read_text())


def call(method, path, body=None, token=None):
    payload = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(base + path, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:400]}")


status, login = call("POST", "/api/auth/login", {"password": password})
token = login["token"]

session_ids = {}
status, existing = call("GET", "/api/admin/sessions", token=token)
for s in existing or []:
    session_ids[s["name"]] = s["id"]
    if s.get("slug"):
        session_ids[s["slug"]] = s["id"]

for s in data.get("sessions", []):
    body = {k: s[k] for k in ("name", "description", "slug", "sortOrder", "visible") if k in s}
    status, created = call("POST", "/api/admin/sessions", body, token)
    session_ids[s["name"]] = created.get("id", created.get("slug"))
    print(f"sesion: {s['name']}")

for p in data.get("products", []):
    body = {k: p[k] for k in (
        "name", "description", "slug", "basePrice", "published",
        "isPremium", "premiumRank", "premium",
    ) if k in p}
    status, created = call("POST", "/api/admin/products", body, token)
    pid = created["id"]
    session = p.get("sessionSlug") or p.get("session")
    if session and session in session_ids:
        call("PATCH", f"/api/admin/products/{pid}/session", {"sessionId": session_ids[session]}, token)
    for v in p.get("variants", []):
        vbody = {k: v[k] for k in ("size", "color", "sku", "priceOverride", "isActive") if k in v}
        call("POST", f"/api/admin/products/{pid}/variants", vbody, token)
    print(f"producto: {p['name']}")

print("Importacion terminada")
PY
