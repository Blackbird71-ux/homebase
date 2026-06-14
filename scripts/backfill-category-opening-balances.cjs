/**
 * WI-1 (P7-FC-01) — Category opening-balance backfill DETECTOR (dry run).
 *
 * Background
 * ──────────
 * Before WI-1, a Chart-of-Accounts (FinanceCategory) opening balance was written
 * ONLY to the `openingBalance` field — no journal entry, no equity contra. The
 * Trial Balance (JE-only) never saw it, and the Balance Sheet posted no Opening
 * Balances equity line, so BS ≠ TB. WI-1 makes `setCategoryOpeningBalance` post a
 * real, balanced `opening_balance` journal (DR/CR the category on its normal side,
 * contra to the system "Opening Balances" equity account).
 *
 * Any opening balance SET AFTER the fix is already journalised. This script finds
 * the legacy, pre-fix case: a category with a non-null `openingBalance` field but
 * NO `opening_balance` journal line on that category — e.g. on an old database or
 * a restored backup that predates WI-1.
 *
 * Why this is DETECTION-ONLY (no --apply)
 * ───────────────────────────────────────
 * Two standing rules forbid an in-script write path:
 *   • GL writes go through the shared helper (`setCategoryOpeningBalance`), never
 *     raw SQL — a hand-rolled SQL JE would diverge from the helper and is exactly
 *     the untested-GL-writing-SQL pattern QA.md warns against.
 *   • Never run write statements against the live/prod database.
 * So this opens the DB READ-ONLY and only REPORTS. To actually backfill a flagged
 * category, re-save its opening balance in the Categories UI (POST
 * /api/finance/categories/opening-balance) — that route calls the helper, which
 * posts the correct journal idempotently (it replaces any prior opening JE).
 *
 * Usage
 * ─────
 *   node scripts/backfill-category-opening-balances.cjs [path-to-db]
 * Defaults to data/homebase.db (a read-only copy of production). Exit code is 0
 * when there is nothing to backfill, 1 when candidates are found.
 */
const path = require('node:path')
const Database = require('better-sqlite3')

const dbPath = process.argv[2] || path.resolve(__dirname, '..', 'data', 'homebase.db')

const db = new Database(dbPath, { readonly: true, fileMustExist: true })

// Categories that carry an opening-balance field value and are a real-balance
// type (income/expense reset each period and never carry an opening balance).
const categories = db.prepare(`
  SELECT id, name, type, familyId, openingBalance, openingBalanceDate
  FROM FinanceCategory
  WHERE openingBalance IS NOT NULL
    AND openingBalance != 0
    AND type IN ('asset', 'liability', 'equity')
`).all()

// Does this category already have an opening_balance journal line? (idempotency)
const hasOpeningJournal = db.prepare(`
  SELECT COUNT(*) AS n
  FROM FinanceJournalLine jl
  JOIN FinanceJournalEntry je ON je.id = jl.journalEntryId
  WHERE jl.glAccountId = ?
    AND je.type = 'opening_balance'
    AND je.familyId = ?
`)

const candidates = []
for (const cat of categories) {
  const { n } = hasOpeningJournal.get(cat.id, cat.familyId)
  if (n > 0) continue // already journalised — nothing to do

  // Mirror setCategoryOpeningBalance sign logic for the report.
  const normalDebit = cat.type === 'asset'
  const categoryOnDebit = normalDebit ? cat.openingBalance > 0 : cat.openingBalance < 0
  candidates.push({
    id: cat.id,
    name: cat.name,
    type: cat.type,
    amount: cat.openingBalance,
    date: cat.openingBalanceDate,
    categorySide: categoryOnDebit ? 'debit' : 'credit',
    obeSide: categoryOnDebit ? 'credit' : 'debit',
  })
}

console.log(`DB: ${dbPath}`)
console.log(`Field-only opening balances scanned: ${categories.length}`)
console.log(`Already journalised (skipped): ${categories.length - candidates.length}`)
console.log(`Needing backfill: ${candidates.length}`)

if (candidates.length === 0) {
  console.log('\n✓ Nothing to backfill — every COA opening balance is journalised (or none exist).')
  db.close()
  process.exit(0)
}

console.log('\nThe following categories have a field-only opening balance with NO journal.')
console.log('Re-save each in the Categories UI to post the entry via setCategoryOpeningBalance:\n')
for (const c of candidates) {
  const abs = Math.abs(c.amount).toFixed(2)
  console.log(`  • ${c.name} (${c.type}, ${c.id})  opening=${c.amount}  as-at=${c.date ?? 'n/a'}`)
  console.log(`      would post:  DR/CR ${c.categorySide.toUpperCase()} ${c.name} ${abs}  /  ${c.obeSide.toUpperCase()} Opening Balances ${abs}`)
}

db.close()
process.exit(1)
