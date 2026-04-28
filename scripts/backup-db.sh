#!/bin/sh
# Homebase Database Backup Script
# This script creates a timestamped backup of the SQLite database
# and prunes old backups to keep only the last 30.
#
# Usage: ./scripts/backup-db.sh [backup-dir]
#   backup-dir: Directory to store backups (default: /data/backups)

set -e

BACKUP_DIR="${1:-/data/backups}"
DB_PATH="${DATABASE_URL#file:}"
DB_PATH="${DB_PATH:-/data/homebase.db}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/homebase-${TIMESTAMP}.db"
MAX_BACKUPS=30

echo "=== Homebase DB Backup ==="
echo "Database: ${DB_PATH}"
echo "Backup to: ${BACKUP_FILE}"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Create the backup using SQLite's backup API via .backup command
# This ensures a consistent snapshot even during writes
sqlite3 "${DB_PATH}" ".backup '${BACKUP_FILE}'"

# Compress the backup
gzip -f "${BACKUP_FILE}"
echo "Created: ${BACKUP_FILE}.gz"

# Prune old backups - keep only the last MAX_BACKUPS
echo "Pruning old backups (keeping last ${MAX_BACKUPS})..."
ls -t "${BACKUP_DIR}"/homebase-*.db.gz 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f

# Count remaining backups
COUNT=$(ls -1 "${BACKUP_DIR}"/homebase-*.db.gz 2>/dev/null | wc -l)
echo "Backup complete. ${COUNT} backup(s) retained."
