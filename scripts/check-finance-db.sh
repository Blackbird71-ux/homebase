#!/bin/sh
# =============================================================================
# check-finance-db.sh
#
# SSH script to inspect the HomeBase SQLite database for finance / bill data.
# Run this on the Synology NAS where the docker container is running.
#
# The database lives at /volume1/docker/homebase/Data/homebase.db on the NAS
# and is mounted to /data/homebase.db inside the container.
#
# Usage:
#   1) SSH into the NAS:
#        ssh user@synology-ip
#   2) Run this script:
#        sh /volume1/docker/homebase/check-finance-db.sh
#
#   OR run a single query directly:
#        docker exec homebase-app sqlite3 /data/homebase.db \
#          "SELECT id, name, amount, status FROM FinanceRecurringBill ORDER BY createdAt DESC LIMIT 20;"
# =============================================================================

set -e

echo ""
echo "============================================"
echo " 🏦 HomeBase — Finance DB Inspector"
echo "============================================"
echo ""

# ── Helper: run a query inside the docker container ─────────────────────────
sql() {
  docker exec homebase-app sqlite3 -header -column /data/homebase.db "$1"
}

sql_no_header() {
  docker exec homebase-app sqlite3 -noheader -column /data/homebase.db "$1"
}

# ── 1. Finance Recurring Bills (all, most recent first) ─────────────────────
echo "════════════════════════════════════════════"
echo " 1. ALL FINANCE BILLS (recent first)"
echo "════════════════════════════════════════════"
echo ""

sql "
SELECT
  id,
  substr(id, 1, 8) AS short_id,
  name,
  printf('%.2f', amount) AS amount,
  billType,
  status,
  isActive,
  paid,
  nextDueDate,
  createdAt,
  templateId IS NOT NULL AS has_template
FROM FinanceRecurringBill
ORDER BY createdAt DESC
LIMIT 50;
"

echo ""
echo "── Bill count by status ──"
sql "
SELECT status, COUNT(*) AS count
FROM FinanceRecurringBill
GROUP BY status
ORDER BY count DESC;
"

echo ""
echo "── Bill count by billType ──"
sql "
SELECT billType, COUNT(*) AS count
FROM FinanceRecurringBill
GROUP BY billType
ORDER BY count DESC;
"

# ── 2. Draft bills specifically ────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo " 2. DRAFT BILLS (status = 'draft')"
echo "════════════════════════════════════════════"
echo ""

sql "
SELECT
  substr(id, 1, 8) AS short_id,
  name,
  printf('%.2f', amount) AS amount,
  nextDueDate,
  spawnedAt,
  billType,
  templateId IS NOT NULL AS from_template,
  substr(templateId, 1, 8) AS template_short
FROM FinanceRecurringBill
WHERE status = 'draft'
ORDER BY nextDueDate DESC;
"

# ── 3. Finance Transactions ─────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo " 3. FINANCE TRANSACTIONS (recent 30)"
echo "════════════════════════════════════════════"
echo ""

sql "
SELECT
  substr(id, 1, 8) AS short_id,
  type,
  printf('%.2f', amount) AS amount,
  payee,
  description,
  date,
  isCleared,
  isRecurring,
  substr(recurringBillId, 1, 8) AS bill_short
FROM FinanceTransaction
ORDER BY date DESC
LIMIT 30;
"

echo ""
echo "── Transaction count by type ──"
sql "
SELECT type, COUNT(*) AS count
FROM FinanceTransaction
GROUP BY type
ORDER BY count DESC;
"

# ── 4. Bills linked to transactions ────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo " 4. BILLS WITH THEIR TRANSACTIONS"
echo "    (LEFT JOIN — shows bills even if no tx)"
echo "════════════════════════════════════════════"
echo ""

sql "
SELECT
  substr(b.id, 1, 8) AS bill_id,
  b.name AS bill_name,
  b.status,
  b.paid,
  substr(t.id, 1, 8) AS tx_id,
  t.type AS tx_type,
  printf('%.2f', t.amount) AS tx_amount,
  t.date AS tx_date
FROM FinanceRecurringBill b
LEFT JOIN FinanceTransaction t ON t.recurringBillId = b.id
ORDER BY b.createdAt DESC
LIMIT 40;
"

# ── 5. Finance Recurring Templates ─────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo " 5. RECURRING TEMPLATES (draft spawners)"
echo "════════════════════════════════════════════"
echo ""

sql "
SELECT
  substr(id, 1, 8) AS short_id,
  name,
  kind,
  enabled,
  isActive,
  createAutomatically,
  frequency,
  nextOccurrenceDate,
  lastSpawnedDate,
  createInAdvanceDays
FROM FinanceRecurringTemplate
ORDER BY nextOccurrenceDate ASC;
"

echo ""
echo "── Drafts spawned per template ──"
sql "
SELECT
  substr(t.id, 1, 8) AS template_id,
  t.name AS template_name,
  (SELECT COUNT(*) FROM FinanceRecurringBill b WHERE b.templateId = t.id AND b.status = 'draft') AS draft_bills,
  (SELECT COUNT(*) FROM FinanceRecurringBill b WHERE b.templateId = t.id) AS total_bills
FROM FinanceRecurringTemplate t
ORDER BY t.name;
"

# ── 6. Income entries (for completeness) ───────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo " 6. FINANCE INCOME ENTRIES (recent 15)"
echo "════════════════════════════════════════════"
echo ""

sql "
SELECT
  substr(id, 1, 8) AS short_id,
  name,
  printf('%.2f', amount) AS amount,
  status,
  received,
  incomeType,
  nextExpectedDate
FROM FinanceIncomeEntry
ORDER BY nextExpectedDate DESC
LIMIT 15;
"

# ── 7. Summary ────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo " 📊 SUMMARY"
echo "════════════════════════════════════════════"

echo ""
total_bills=$(sql_no_header "SELECT COUNT(*) FROM FinanceRecurringBill;")
echo "  Total Bills:            ${total_bills}"

draft_count=$(sql_no_header "SELECT COUNT(*) FROM FinanceRecurringBill WHERE status = 'draft';")
echo "  Draft Bills:            ${draft_count}"

awaiting_count=$(sql_no_header "SELECT COUNT(*) FROM FinanceRecurringBill WHERE status = 'awaiting_payment';")
echo "  Awaiting Payment:       ${awaiting_count}"

paid_count=$(sql_no_header "SELECT COUNT(*) FROM FinanceRecurringBill WHERE status = 'paid';")
echo "  Paid:                   ${paid_count}"

cancelled_count=$(sql_no_header "SELECT COUNT(*) FROM FinanceRecurringBill WHERE status = 'cancelled';")
echo "  Cancelled:              ${cancelled_count}"

null_status=$(sql_no_header "SELECT COUNT(*) FROM FinanceRecurringBill WHERE status IS NULL;")
echo "  Status NULL (legacy):   ${null_status}"

echo ""
total_tx=$(sql_no_header "SELECT COUNT(*) FROM FinanceTransaction;")
echo "  Total Transactions:     ${total_tx}"

templates_count=$(sql_no_header "SELECT COUNT(*) FROM FinanceRecurringTemplate;")
echo "  Recurring Templates:    ${templates_count}"

echo ""
echo "============================================"
echo " ✅ Done"
echo "============================================"
echo ""
