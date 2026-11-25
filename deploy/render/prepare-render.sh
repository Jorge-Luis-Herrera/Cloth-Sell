#!/usr/bin/env bash
# Genera deploy/render/Dockerfile a partir del Dockerfile principal.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

python3 - "$ROOT/Dockerfile" "$HERE/Dockerfile" <<'PY'
import re, sys
src = open(sys.argv[1]).read()
checks = {
    'ca-certificates libssl3 curl': 'ca-certificates libssl3 curl python3 python3-pip',
    'RUN mkdir -p /app/data /app/uploads && chown -R jenny:jenny /app':
        'RUN mkdir -p /app/data /app/uploads && chown -R jenny:jenny /app\n'
        'RUN pip3 install --no-cache-dir --break-system-packages huggingface_hub\n'
        'COPY deploy/huggingface/hf_sync.py deploy/huggingface/entrypoint.sh /app/\n'
        'RUN chmod +x /app/hf_sync.py /app/entrypoint.sh && chown jenny:jenny /app/hf_sync.py /app/entrypoint.sh',
    'ENV PORT=8080': 'ENV PORT=10000',
    'EXPOSE 8080': 'EXPOSE 10000',
    'ENTRYPOINT ["/app/jenny-api"]': 'ENTRYPOINT ["/app/entrypoint.sh"]',
}
for old, new in checks.items():
    if old not in src:
        raise SystemExit(f'No encontré en el Dockerfile: {old}')
    src = src.replace(old, new, 1)
src = re.sub(r'^HEALTHCHECK .*\n', '', src, flags=re.M)
open(sys.argv[2], 'w').write(src)
PY

echo "Dockerfile para Render generado en $HERE/Dockerfile"
