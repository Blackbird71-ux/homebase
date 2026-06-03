// Read-only check for orphaned unposted draft journals.
//
// An orphan is a FinanceJournalEntry with isPosted=0 and type='auto_transaction'
// that no income entry, bill, or bill-payment links to. These are stranded when
// the parent income/bill is deleted. They have ZERO ledger impact (unposted) and
// are invisible to the Journals UI, so a direct query is the only way to see them.
//
// Usage:
//   node scripts/check-orphan-draft-journals.cjs [path-to-homebase.db]
// Defaults to the local dev DB. Exits 1 if any orphan is found, else 0.

const Database = require('better-sqlite3')

const dbPath = process.argv[2] || 'c:\\Appdev\\HomeBase\\data\\homebase.db'
const db = new Database(dbPath, { readonly: true, fileMustExist: true })

try {
  const orphans = db.prepare(`
    SELECT je.id, je.reference, je.description, je.date
    FROM FinanceJournalEntry je
    WHERE je.isPosted = 0 AND je.type = 'auto_transaction'
      AND NOT EXISTS (SELECT 1 FROM FinanceIncomeEntry  i WHERE i.journalEntryId        = je.id)
      AND NOT EXISTS (SELECT 1 FROM FinanceIncomeEntry  i WHERE i.receiptJournalEntryId = je.id)
      AND NOT EXISTS (SELECT 1 FROM FinanceRecurringBill b WHERE b.journalEntryId        = je.id)
      AND NOT EXISTS (SELECT 1 FROM FinanceBillPayment  p WHERE p.journalEntryId         = je.id)
    ORDER BY je.date
  `).all()

  console.log(`DB: ${dbPath}`)
  console.log(`Orphaned unposted draft journals: ${orphans.length}`)
  for (const o of orphans) {
    const d = (o.date || '').toString().slice(0, 10)
    console.log(`  ${(o.reference || '(no ref)').padEnd(9)} | ${d} | ${(o.description || '').slice(0, 50)} | ${o.id}`)
  }
  if (orphans.length === 0) console.log('  ✓ clean')

  process.exitCode = orphans.length > 0 ? 1 : 0
} finally {
  db.close()
}
