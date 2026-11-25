#!/usr/bin/env bash
set -euo pipefail

read -rsp 'Contrasena del panel admin: ' PASSWORD
echo

if [[ -z "$PASSWORD" ]]; then echo "La contrasena no puede estar vacia" >&2; exit 2; fi

HASH="$(python3 - "$PASSWORD" <<'PY'
import base64, hashlib, os, sys
salt = os.urandom(16)
dk = hashlib.pbkdf2_hmac('sha256', sys.argv[1].encode(), salt, 600000, dklen=32)
print('pbkdf2$600000$%s$%s' % (base64.b64encode(salt).decode(), base64.b64encode(dk).decode()))
PY
)"
KEY="$(openssl rand -base64 32 | tr -d '\n')"

echo
echo 'Pega esto en deploy/oracle/.env:'
echo "ADMIN_PASSWORD_HASH=$HASH"
echo "AUTH_SIGNING_KEY=$KEY"
