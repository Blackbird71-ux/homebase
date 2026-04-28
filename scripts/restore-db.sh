#!/bin/sh
# Homebase Database Restore Script
# Usage: ./scripts/restore-db.sh <backup-file>
#   backup-file: Path to a .db.gz backup file to restore

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <backup-file>"
  echo "Example: $0 /data/backups/homebase-20260428_120000.db.gz"
  exit 1
fi

BACKUP_FILE="$1"
DB_PATH="${DATABASE_URL#file:}"
DB_PATH="${DB_PATH:-/data/homebase.db}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "=== Homebase DB Restore ==="
echo "Restoring from: ${BACKUP_FILE}"
echo "Target database: ${DB_PATH}"

# Create a backup of the current database before restoring
CURRENT_BACKUP="${DB_PATH}.pre-restore-$(date +%Y%m%d_%H%M%S)"
echo "Backing up current database to: ${CURRENT_BACKUP}"
cp "${DB_PATH}" "${CURRENT_BACKUP}"

# Decompress and restore
if echo "${BACKUP_FILE}" | grep -q '\.gz$'; then
  gunzip -c "${BACKUP_FILE}" > "${DB_PATH}"
else
  cp "${BACKUP_FILE}" "${DB_PATH}"
fi

echo "Restore complete. Current database replaced with backup."
echo "Previous database saved as: ${CURRENT_BACKUP}"
