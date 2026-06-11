// Clears all finance TRANSACTIONAL data so the books can be re-entered from scratch.
// Keeps setup data: chart of accounts (FinanceCategory), recurring templates + lines,
// vendors, entities, locations, budgets, budget planner items, savings goals, accounts.
//
// Usage: node scripts/clear-finance-transactions.cjs <path-to-db> [--apply]
// Without --apply it is a dry run: prints what would be deleted and rolls back.

const path = process.argv[2]
const apply = process.argv.includes('--apply')
if (!path) {
  console.error('Usage: node scripts/clear-finance-transactions.cjs <path-to-db> [--apply]')
  process.exit(1)
}

const db = require('better-sqlite3')(path)
db.pragma('foreign_keys = ON')

// Child-first order. Several FK columns added via ALTER TABLE have no constraint
// in the DDL (e.g. bill.journalEntryId, budget.billId), so nothing is left to cascade.
const deleteTables = [
  'FinanceJournalLine',
  'FinancePrepaymentScheduleLine',
  'FinancePrepaymentSchedule',
  'report_emails',
  'finance_snapshots',
  'BillAttachment',
  'IncomeAttachment',
  'FinancePayslip',
  'FinanceBillPayment',
  'FinanceJournalEntry',
  'FinanceRecurringBill',
  'FinanceIncomeEntry',
  'FinanceTransaction',
]
const keepTables = [
  'FinanceCategory', 'FinanceRecurringTemplate', 'FinanceRecurringTemplateLine',
  'FinanceVendor', 'FinanceEntity', 'FinanceLocation', 'FinanceBudget',
  'BudgetPlannerItem', 'FinanceAccount', 'FinanceSavingsGoal',
]

const count = (t) => db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c

console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN (no changes saved)'}\n`)

const run = db.transaction(() => {
  for (const t of deleteTables) {
    const before = count(t)
    db.prepare(`DELETE FROM "${t}"`).run()
    console.log(`deleted  ${t.padEnd(32)} ${before}`)
  }
  // Budgets are kept but may point at deleted bills (no FK in DDL → null manually)
  const nulled = db.prepare('UPDATE "FinanceBudget" SET "billId" = NULL WHERE "billId" IS NOT NULL').run()
  console.log(`\nFinanceBudget.billId nulled: ${nulled.changes}`)

  const fkErrors = db.pragma('foreign_key_check')
  if (fkErrors.length > 0) {
    console.error('FOREIGN KEY VIOLATIONS:', fkErrors)
    throw new Error('foreign_key_check failed — rolling back')
  }
  console.log('foreign_key_check: clean')

  console.log('\nKept tables (unchanged):')
  for (const t of keepTables) console.log(`kept     ${t.padEnd(32)} ${count(t)}`)

  if (!apply) throw new Error('DRY_RUN_ROLLBACK')
})

try {
  run()
  console.log('\nCommitted.')
} catch (e) {
  if (e.message === 'DRY_RUN_ROLLBACK') {
    console.log('\nDry run complete — all changes rolled back. Re-run with --apply to commit.')
  } else {
    console.error('\nRolled back due to error:', e.message)
    process.exit(1)
  }
}
