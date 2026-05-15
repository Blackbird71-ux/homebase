#!/bin/sh
# =============================================================================
# HomeBase — Wipe All Finance Transactional Data via SSH
#
# Connects to your NAS via SSH, backs up the database, then deletes all
# financial transactions, journal entries, bill payments, attachments,
# report snapshots — while preserving chart of accounts, vendors, entities,
# budget rules, bank accounts, locations, savings goals, and the bill/income
# template definitions (which are reset to a clean state).
#
# Usage:
#   1) Edit the NAS_* variables below (or set them as env vars).
#   2) Run:  sh scripts/wipe-finance-data.sh
#
# Requirements:
#   - SSH access to the NAS (public-key auth recommended)
#   - The homebase-app container must be running on the NAS
#   - sqlite3 must be available inside the container (it already is)
# =============================================================================

set -e

# ─── CONFIGURATION ────────────────────────────────────────────────────────────
# Change these to match your NAS setup.
# You can also set the environment variables instead of editing this file.

: "${NAS_USER:=liddlem}"                          # SSH username
: "${NAS_HOST:=homebase-nas}"                     # NAS hostname or IP
: "${NAS_DATA_DIR:=/volume1/docker/homebase/Data}" # Database parent dir on NAS
: "${CONTAINER_NAME:=homebase-app}"                # Docker container name
: "${DB_PATH:=/data/homebase.db}"                  # Database path INSIDE container

# ─── DERIVED ──────────────────────────────────────────────────────────────────
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${NAS_DATA_DIR}/backups"
BACKUP_FILE="${BACKUP_DIR}/homebase-pre-wipe-${TIMESTAMP}.db"
WIPE_SQL="$(dirname "$0")/finance-data-wipe.sql"

# ─── CHECKS ───────────────────────────────────────────────────────────────────

if [ ! -f "$WIPE_SQL" ]; then
  echo "ERROR: Cannot find wipe SQL script at: $WIPE_SQL"
  echo "       Make sure finance-data-wipe.sql is in the same directory."
  exit 1
fi

echo "═══════════════════════════════════════════════════════════════════════════"
echo "  HomeBase — Finance Data Wipe"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "  NAS:       ${NAS_USER}@${NAS_HOST}"
echo "  Container: ${CONTAINER_NAME}"
echo "  DB:        ${DB_PATH}"
echo "  Backup:    ${BACKUP_FILE}"
echo ""

# ─── 1. CREATE BACKUP ─────────────────────────────────────────────────────────

echo "─── Step 1: Creating backup ───"
echo ""

ssh "${NAS_USER}@${NAS_HOST}" \
  "mkdir -p \"${BACKUP_DIR}\" && \
   docker exec \"${CONTAINER_NAME}\" sqlite3 \"${DB_PATH}\" \
     \"VACUUM INTO '${BACKUP_FILE}'\" && \
   echo '  ✓ Backup created:' && \
   ls -lh \"${BACKUP_FILE}\""

echo ""

# ─── 2. RUN WIPE ──────────────────────────────────────────────────────────────

echo "─── Step 2: Running data wipe inside container ───"
echo ""

# Pipe the SQL file into sqlite3 inside the container via SSH
ssh "${NAS_USER}@${NAS_HOST}" \
  "docker exec -i \"${CONTAINER_NAME}\" sqlite3 \"${DB_PATH}\"" \
  < "$WIPE_SQL"

echo ""

# ─── 3. VERIFY ────────────────────────────────────────────────────────────────

echo "─── Step 3: Verification check ───"
echo ""

ssh "${NAS_USER}@${NAS_HOST}" \
  "docker exec \"${CONTAINER_NAME}\" sqlite3 \"${DB_PATH}\" \
    \"SELECT 'FinanceTransaction count:', COUNT(*) FROM \\\"FinanceTransaction\\\";
     SELECT 'FinanceJournalEntry count:', COUNT(*) FROM \\\"FinanceJournalEntry\\\";
     SELECT 'FinanceRecurringBill count:', COUNT(*) FROM \\\"FinanceRecurringBill\\\";
     SELECT 'FinanceIncomeEntry count:', COUNT(*) FROM \\\"FinanceIncomeEntry\\\";
     SELECT 'FinanceCategory count:', COUNT(*) FROM \\\"FinanceCategory\\\";\""

echo ""
echo "─── Done ───"
echo ""
echo "  • Backup saved to: ${BACKUP_FILE}"
echo "  • All finance transaction data has been wiped."
echo "  • Bill and income templates have been reset to a clean state."
echo "  • Chart of accounts, vendors, entities, budgets etc. are preserved."
echo ""
echo "  To restore from backup, run:"
echo "    docker exec ${CONTAINER_NAME} sqlite3 ${DB_PATH} \\"
echo "      \".restore '${BACKUP_FILE}'\""
echo ""
