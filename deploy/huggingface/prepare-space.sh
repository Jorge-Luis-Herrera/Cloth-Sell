#!/usr/bin/env bash
# Construye deploy/huggingface/space/ con todo lo que HF necesita para compilar.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SPACE="$HERE/space"

rm -rf "$SPACE"
mkdir -p "$SPACE"

cp "$ROOT/.dockerignore" "$SPACE/.dockerignore"
cp "$HERE/hf_sync.py" "$HERE/entrypoint.sh" "$SPACE/"

python3 - "$ROOT/Dockerfile" "$SPACE/Dockerfile" <<'PY'
import sys
src = open(sys.argv[1]).read()
checks = {
    'ca-certificates libssl3 curl': 'ca-certificates libssl3 curl python3 python3-pip',
    'RUN mkdir -p /app/data /app/uploads && chown -R jenny:jenny /app':
        'RUN mkdir -p /app/data /app/uploads && chown -R jenny:jenny /app\n'
        'RUN pip3 install --no-cache-dir --break-system-packages huggingface_hub\n'
        'COPY hf_sync.py entrypoint.sh /app/\n'
        'RUN chmod +x /app/hf_sync.py /app/entrypoint.sh && chown jenny:jenny /app/hf_sync.py /app/entrypoint.sh',
    'ENV PORT=8080': 'ENV PORT=7860',
    'EXPOSE 8080': 'EXPOSE 7860',
    '127.0.0.1:8080': '127.0.0.1:7860',
    'ENTRYPOINT ["/app/jenny-api"]': 'ENTRYPOINT ["/app/entrypoint.sh"]',
}
for old, new in checks.items():
    if old not in src:
        raise SystemExit(f'No encontré en el Dockerfile: {old}')
    src = src.replace(old, new, 1)
open(sys.argv[2], 'w').write(src)
PY

cat > "$SPACE/README.md" <<'EOF'
---
title: Jenny Clothing
emoji: 🧥
colorFrom: red
colorTo: pink
sdk: docker
app_port: 7860
---

# Jenny Clothing

Tienda de ropa: frontend React + API Rust/Axum + SQLite. Los datos se sincronizan
con un dataset privado de Hugging Face cada 60 segundos y se restauran al arrancar.
EOF

tar -C "$ROOT" -cf - \
  --exclude='Frontend/node_modules' \
  --exclude='Frontend/dist' \
  --exclude='Frontend/*.tsbuildinfo' \
  --exclude='Frontend/vite.config.js' \
  --exclude='Frontend/vite.config.d.ts' \
  --exclude='Backend-Rust/target' \
  Frontend Backend-Rust | tar -C "$SPACE" -xf -

echo "Space preparado en $SPACE"
