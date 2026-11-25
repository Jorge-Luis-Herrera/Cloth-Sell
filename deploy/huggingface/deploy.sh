#!/usr/bin/env bash
# Crea/actualiza el Space y el dataset privado en Hugging Face.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SPACE_DIR="$HERE/space"

# Opcional: deploy/huggingface/.env con HF_USERNAME, HF_TOKEN, ADMIN_PASSWORD_HASH, AUTH_SIGNING_KEY.
if [[ -f "$HERE/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HERE/.env"
  set +a
fi

: "${HF_USERNAME:?Exporta HF_USERNAME}"
: "${HF_TOKEN:?Exporta HF_TOKEN (Write)}"
: "${ADMIN_PASSWORD_HASH:?Exporta ADMIN_PASSWORD_HASH}"
: "${AUTH_SIGNING_KEY:?Exporta AUTH_SIGNING_KEY}"

[[ "$ADMIN_PASSWORD_HASH" == pbkdf2\$*\$*\$* ]] || { echo "ADMIN_PASSWORD_HASH mal formado" >&2; exit 2; }
[[ ${#AUTH_SIGNING_KEY} -ge 32 ]] || { echo "AUTH_SIGNING_KEY debe tener al menos 32 caracteres" >&2; exit 2; }
[[ -f "$SPACE_DIR/Dockerfile" ]] || { echo "Falta $SPACE_DIR/Dockerfile: ejecuta ./prepare-space.sh" >&2; exit 2; }

PYTHON="${HF_PYTHON:-/tmp/opencode/hf-venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  python3 -m venv /tmp/opencode/hf-venv
  /tmp/opencode/hf-venv/bin/pip install --quiet huggingface_hub
  PYTHON=/tmp/opencode/hf-venv/bin/python
fi

export HF_USERNAME HF_TOKEN ADMIN_PASSWORD_HASH AUTH_SIGNING_KEY SPACE_DIR

"$PYTHON" - <<'PY'
import os
from huggingface_hub import HfApi

user = os.environ["HF_USERNAME"]
token = os.environ["HF_TOKEN"]
space = f"{user}/jenny-clothing"
data = f"{user}/jenny-clothing-data"

api = HfApi(token=token)
api.create_repo(space, repo_type="space", space_sdk="docker", exist_ok=True)
api.create_repo(data, repo_type="dataset", private=True, exist_ok=True)

api.upload_folder(
    repo_id=space,
    repo_type="space",
    folder_path=os.environ["SPACE_DIR"],
    ignore_patterns=[".git", "__pycache__"],
    commit_message="Deploy from OpenCode",
)

secrets = {
    "ADMIN_PASSWORD_HASH": os.environ["ADMIN_PASSWORD_HASH"],
    "AUTH_SIGNING_KEY": os.environ["AUTH_SIGNING_KEY"],
    "PUBLIC_SCHEME": "https",
    "HF_DATASET_REPO": data,
    "HF_TOKEN": token,
    "HF_SYNC_INTERVAL": "60",
}
for key, value in secrets.items():
    api.add_space_secret(space, key, value)

print(f"Space:   https://huggingface.co/spaces/{space}")
print(f"Dataset: https://huggingface.co/datasets/{data}")
PY
