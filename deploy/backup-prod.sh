#!/usr/bin/env bash
# Descarga la BASE DE DATOS DE PRODUCCION desde Azure Files a la laptop.
#
# La BD ahora vive en el share `jenny-data` de la cuenta jennyclothdata2026 (Azure Files),
# montada en /app/data del App Service: sobrevive a los deploys y reinicios. Pero una copia
# local es la unica red de seguridad contra borrados accidentales o corrupcion de la BD.
#
# Uso:
#   export AZURE_STORAGE_KEY='...clave del storage...'   (az storage account keys list)
#   ./deploy/backup-prod.sh                              (crea .local-dev/backups/prod-jenny-...db)
set -euo pipefail
: "${AZURE_STORAGE_KEY:?Exporta AZURE_STORAGE_KEY (az storage account keys list -n jennyclothdata2026 -g rg-jenny --query '[0].value' -o tsv)}"
ACCOUNT="${ACCOUNT:-jennyclothdata2026}"
SHARE="${SHARE:-jenny-data}"
FILE="${FILE:-jenny.db}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/.local-dev/backups}"
TARGET="$BACKUP_DIR/prod-jenny-$(date -u +%Y%m%dT%H%M%SZ).db"
mkdir -p "$BACKUP_DIR"
az storage file download --account-name "$ACCOUNT" --share-name "$SHARE" --path "$FILE" \
  --dest "$TARGET" --account-key "$AZURE_STORAGE_KEY" --output none
if command -v sqlite3 >/dev/null; then
  echo "Integridad: $(sqlite3 "$TARGET" 'PRAGMA integrity_check;')"
fi
echo "Backup creado: $TARGET"
