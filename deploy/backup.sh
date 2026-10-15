#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="${DATABASE_FILE:-$PROJECT_DIR/.local-dev/data/jenny.db}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/.local-dev/backups}"
mkdir -p "$BACKUP_DIR"
if [[ "${1:-}" == "--integrity" ]]; then sqlite3 "$DB_PATH" 'PRAGMA integrity_check;'; exit; fi
[[ -f "$DB_PATH" ]] || { echo "Database not found: $DB_PATH" >&2; exit 1; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; TARGET="$BACKUP_DIR/jenny-$STAMP.db"
sqlite3 "$DB_PATH" ".backup '$TARGET'"
sqlite3 "$TARGET" 'PRAGMA integrity_check;'
echo "Backup created: $TARGET"
