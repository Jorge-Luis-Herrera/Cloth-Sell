#!/usr/bin/env bash
# Crea el dataset privado donde se guardan SQLite y las fotos.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$HERE/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HERE/.env"
  set +a
fi

: "${HF_DATASET_REPO:?Exporta HF_DATASET_REPO}"
: "${HF_TOKEN:?Exporta HF_TOKEN}"

PYTHON="${HF_PYTHON:-/tmp/opencode/hf-venv/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  python3 -m venv /tmp/opencode/hf-venv
  /tmp/opencode/hf-venv/bin/pip install --quiet huggingface_hub
  PYTHON=/tmp/opencode/hf-venv/bin/python
fi

HF_DATASET_REPO="$HF_DATASET_REPO" HF_TOKEN="$HF_TOKEN" "$PYTHON" - <<'PY'
import os
from huggingface_hub import HfApi
repo = os.environ["HF_DATASET_REPO"]
HfApi(token=os.environ["HF_TOKEN"]).create_repo(
    repo, repo_type="dataset", private=True, exist_ok=True
)
print("Dataset listo: https://huggingface.co/datasets/" + repo)
PY
