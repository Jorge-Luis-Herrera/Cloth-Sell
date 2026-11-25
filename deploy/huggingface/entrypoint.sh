#!/usr/bin/env bash
# Arranca la API y mantiene SQLite/fotos sincronizados con el dataset de HF.
set -euo pipefail

SYNC_ON=0
if [[ -n "${HF_DATASET_REPO:-}" && -n "${HF_TOKEN:-}" ]]; then
  SYNC_ON=1
  python3 /app/hf_sync.py pull || echo "No se pudo restaurar del dataset; arranco con datos locales"
fi

/app/jenny-api &
APP_PID=$!
trap 'kill "$APP_PID" 2>/dev/null || true' TERM INT

if [[ "$SYNC_ON" == "1" ]]; then
  while kill -0 "$APP_PID" 2>/dev/null; do
    sleep "${HF_SYNC_INTERVAL:-60}"
    python3 /app/hf_sync.py push || echo "Fallo al sincronizar con el dataset"
  done
fi

wait "$APP_PID"
