#!/usr/bin/env bash
# Copia la SQLite y las fotos desde los volumenes a OUT ( por defecto ~/backups).
set -euo pipefail

OUT="${1:-$HOME/backups}"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

sudo docker run --rm -v jenny-clothing_jenny-data:/data -v "$OUT:/backup" \
  alpine:3.20 tar czf "/backup/jenny-db-$TS.tar.gz" -C /data .
sudo docker run --rm -v jenny-clothing_jenny-uploads:/uploads -v "$OUT:/backup" \
  alpine:3.20 tar czf "/backup/jenny-uploads-$TS.tar.gz" -C /uploads .

echo "$OUT/jenny-db-$TS.tar.gz"
echo "$OUT/jenny-uploads-$TS.tar.gz"
