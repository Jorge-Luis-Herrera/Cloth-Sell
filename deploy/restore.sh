#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_FILE:?Set DATABASE_FILE to the target SQLite file}"
BACKUP="${1:?Usage: restore.sh BACKUP_FILE}"
[[ -f "$BACKUP" ]] || { echo "Backup not found" >&2; exit 1; }
mkdir -p "$(dirname "$DATABASE_FILE")"
cp "$BACKUP" "$DATABASE_FILE"
if command -v sqlite3 >/dev/null; then sqlite3 "$DATABASE_FILE" 'PRAGMA integrity_check;'; fi
echo "Restored $BACKUP to $DATABASE_FILE"
