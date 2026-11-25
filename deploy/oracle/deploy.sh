#!/usr/bin/env bash
# Se ejecuta en tu maquina local. Despliega en la VM ARM de Oracle por SSH.
set -euo pipefail

VM_HOST="${1:?Uso: $0 IP_PUBLICA [usuario]}"
VM_USER="${2:-ubuntu}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$HERE/.env}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_oracle}"
REPO_URL="${REPO_URL:-https://github.com/Jorge-Luis-Herrera/Cloth-Sell.git}"
REMOTE_SUBDIR="${REMOTE_SUBDIR:-Cloth-Sell}"

[[ -f "$ENV_FILE" ]] || { echo "Falta $ENV_FILE: copia .env.example y rellénalo" >&2; exit 2; }
[[ -f "$SSH_KEY" ]] || { echo "Falta la clave SSH $SSH_KEY" >&2; exit 2; }
grep -q '^ADMIN_PASSWORD_HASH=pbkdf2\$' "$ENV_FILE" || { echo "ADMIN_PASSWORD_HASH mal formado" >&2; exit 2; }
grep -qE '^AUTH_SIGNING_KEY=.{32,}$' "$ENV_FILE" || { echo "AUTH_SIGNING_KEY debe tener al menos 32 caracteres" >&2; exit 2; }

DOMAIN="$(sed -n 's/^DOMAIN=//p' "$ENV_FILE" | tail -n1)"
if [[ -n "$DOMAIN" ]]; then TEMPLATE="$HERE/Caddyfile.domain"; else TEMPLATE="$HERE/Caddyfile.http"; fi

TMP="$(mktemp -d /tmp/opencode/jenny-oracle.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
cp "$ENV_FILE" "$TMP/.env"
cp "$TEMPLATE" "$TMP/Caddyfile"
if [[ -n "$DOMAIN" ]]; then
  sed -i 's/^PUBLIC_SCHEME=.*/PUBLIC_SCHEME=https/' "$TMP/.env"
  grep -q '^PUBLIC_SCHEME=' "$TMP/.env" || echo 'PUBLIC_SCHEME=https' >> "$TMP/.env"
else
  sed -i 's/^PUBLIC_SCHEME=.*/PUBLIC_SCHEME=http/' "$TMP/.env"
  grep -q '^PUBLIC_SCHEME=' "$TMP/.env" || echo 'PUBLIC_SCHEME=http' >> "$TMP/.env"
fi
chmod 600 "$TMP/.env"

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

echo "Preparando $VM_USER@$VM_HOST ..."
ssh "${SSH_OPTS[@]}" "$VM_USER@$VM_HOST" 'mkdir -p ~/.jenny-oracle'
scp "${SSH_OPTS[@]}" "$TMP/.env" "$TMP/Caddyfile" "$HERE/setup-vm.sh" "$VM_USER@$VM_HOST:~/.jenny-oracle/"

ssh "${SSH_OPTS[@]}" "$VM_USER@$VM_HOST" \
  "REPO_URL='$REPO_URL' REMOTE_SUBDIR='$REMOTE_SUBDIR' bash -s" <<'REMOTE'
set -euo pipefail
bash "$HOME/.jenny-oracle/setup-vm.sh"

REPO_DIR="$HOME/$REMOTE_SUBDIR"
if [[ ! -d "$REPO_DIR/.git" ]]; then
  git clone "$REPO_URL" "$REPO_DIR"
else
  git -C "$REPO_DIR" pull --ff-only
fi

mkdir -p "$REPO_DIR/deploy/oracle"
install -m 600 "$HOME/.jenny-oracle/.env" "$REPO_DIR/deploy/oracle/.env"
install -m 644 "$HOME/.jenny-oracle/Caddyfile" "$REPO_DIR/deploy/oracle/Caddyfile"

cd "$REPO_DIR/deploy/oracle"
sudo docker compose --env-file .env up -d --build
sudo docker compose --env-file .env exec -T app \
  curl --fail --silent --retry 15 --retry-delay 5 http://127.0.0.1:8080/api/health
echo
sudo docker compose --env-file .env ps
REMOTE

if [[ -n "$DOMAIN" ]]; then URL="https://$DOMAIN"; else URL="http://$VM_HOST"; fi
echo
if curl --fail --silent --show-error --max-time 20 "$URL/api/health" >/dev/null; then
  echo "Despliegue OK: $URL"
else
  echo "Contenedor sano, pero $URL no responde todavia."
  echo "Revisa los Ingress Rules (TCP 80/443) de la VCN y, si usas dominio, el DNS."
fi
