#!/usr/bin/env bash
# Importa una copia de jenny.db (y opcionalmente uploads/) al dataset de HF.
# Uso: ./import-backup.sh /ruta/prod-jenny.db [ruta/a/uploads]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DB="${1:?Uso: $0 /ruta/jenny.db [ uploads/ ]}"
UPLOADS="${2:-}"

if [[ -f "$HERE/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HERE/.env"
  set +a
fi

: "${HF_DATASET_REPO:?Exporta HF_DATASET_REPO}"
: "${HF_TOKEN:?Exporta HF_TOKEN}"

[[ -f "$DB" ]] || { echo "No existe $DB" >&2; exit 2; }
if command -v sqlite3 >/dev/null 2>&1; then
  echo "Integridad: $(sqlite3 "$DB" 'PRAGMA integrity_check;')"
fi

PYTHON="${HF_PYTHON:-/tmp/opencode/hf-venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  python3 -m venv /tmp/opencode/hf-venv
  /tmp/opencode/hf-venv/bin/pip install --quiet huggingface_hub
  PYTHON=/tmp/opencode/hf-venv/bin/python
fi

DB="$DB" UPLOADS="$UPLOADS" HF_DATASET_REPO="$HF_DATASET_REPO" HF_TOKEN="$HF_TOKEN" "$PYTHON" - <<'PY'
import os
from pathlib import Path
from huggingface_hub import HfApi

api = HfApi(token=os.environ["HF_TOKEN"])
repo = os.environ["HF_DATASET_REPO"]

api.upload_file(
    path_or_fileobj=os.environ["DB"],
    path_in_repo="data/jenny.db",
    repo_id=repo,
    repo_type="dataset",
)

uploads = os.environ["UPLOADS"]
if uploads:
    root = Path(uploads)
    for p in root.rglob("*"):
        if p.is_file():
            api.upload_file(
                path_or_fileobj=str(p),
                path_in_repo=f"uploads/{p.relative_to(root)}",
                repo_id=repo,
                repo_type="dataset",
            )

print(f"Importado a https://huggingface.co/datasets/{repo}")
print("Ahora reinicia el servicio en Render para que haga pull del dataset.")
PY
