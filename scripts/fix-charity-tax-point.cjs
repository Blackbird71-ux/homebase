/**
 * F7 data fix: correct the one legacy Charity bill whose invoiceReceivedDate (the
 * tax point) is a future, divergent value (2026-06-26) that does NOT match its own
 * posted GL entry / billDate (2026-06-18).
 *
 * Why: the AP subledger includes a bill when invoiceReceivedDate <= asAt; the GL AP
 * control includes its accrual when the JE date <= asAt. These boundaries must align
 * or AP control != subledger (here, a $50 gap in the window 2026-06-18..06-25) and
 * aging mis-buckets. The correct tax point = billDate = posted JE-0018 date = the
 * pattern every other occurrence (incl. the May sibling) already follows.
 *
 * The corrupt value is a pre-fix legacy artifact: current code (finance-draft-
 * approval-service.ts) sets invoiceReceivedDate = accrualDate = billDate, so it can
 * no longer reproduce this divergence. This is a one-row historical correction.
 *
 * Guarded: aborts unless the row is in exactly the known-corrupt state. DRY-RUN by
 * default. We copy billDate's stored string verbatim into invoiceReceivedDate so the
 * stored format is identical.
 *
 * Usage:
 *   node scripts/fix-charity-tax-point.cjs --db data/homebase.audit-copy.db --apply   (prove on copy)
 *   node scripts/fix-charity-tax-point.cjs --db data/homebase.db                       (DRY-RUN on live)
 *   node scripts/fix-charity-tax-point.cjs --db data/homebase.db --apply               (commit on live)
 */
const path = require('path');
const Database = require(path.join(process.cwd(), 'node_modules', 'better-sqlite3'));

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const dbArg = (() => { const i = argv.indexOf('--db'); return i >= 0 ? argv[i + 1] : 'data/homebase.db'; })();
const dbPath = path.isAbsolute(dbArg) ? dbArg : path.join(process.cwd(), dbArg);

const BILL_ID = 'cmpm3tl25009a01nr67t3kngf';
const EXPECTED_CORRUPT_IRD = '2026-06-26T03:57:23.547+00:00';
const EXPECTED_BILLDATE   = '2026-06-18T00:00:00.000+00:00';

const db = new Database(dbPath, { readonly: !apply });
console.log(`DB: ${dbPath}`);
console.log(`Mode: ${apply ? 'APPLY (will write)' : 'DRY-RUN (read-only)'}\n`);

const row = db.prepare(
  'SELECT b.id,b.name,b.billDate,b.invoiceReceivedDate,b.journalEntryId,je.date AS jeDate, je.reference AS jeRef ' +
  'FROM FinanceRecurringBill b LEFT JOIN FinanceJournalEntry je ON b.journalEntryId=je.id WHERE b.id=?'
).get(BILL_ID);

if (!row) { console.error(`ABORT: bill ${BILL_ID} not found.`); db.close(); process.exit(1); }
console.log('Target row:');
console.log(`  name                = ${row.name}`);
console.log(`  invoiceReceivedDate = ${row.invoiceReceivedDate}   (corrupt)`);
console.log(`  billDate            = ${row.billDate}`);
console.log(`  JE date (${row.jeRef||'—'})       = ${row.jeDate}\n`);

// Guard: only proceed if the row is exactly the known-corrupt state.
if (row.invoiceReceivedDate !== EXPECTED_CORRUPT_IRD) {
  if (row.invoiceReceivedDate === row.billDate) { console.log('Already corrected (invoiceReceivedDate == billDate). Nothing to do.'); db.close(); process.exit(0); }
  console.error(`ABORT: invoiceReceivedDate is "${row.invoiceReceivedDate}", expected corrupt "${EXPECTED_CORRUPT_IRD}".`); db.close(); process.exit(1);
}
if (row.billDate !== EXPECTED_BILLDATE) { console.error(`ABORT: billDate is "${row.billDate}", expected "${EXPECTED_BILLDATE}".`); db.close(); process.exit(1); }
if (!row.jeDate || row.jeDate.slice(0,10) !== row.billDate.slice(0,10)) { console.error(`ABORT: JE date "${row.jeDate}" must match billDate "${row.billDate}".`); db.close(); process.exit(1); }

const newValue = row.billDate; // verbatim, identical format

if (!apply) {
  console.log(`DRY-RUN: would set invoiceReceivedDate = "${newValue}" (= billDate = JE date).`);
  console.log('\nRe-run with --apply to commit.'); db.close(); process.exit(0);
}
const info = db.prepare('UPDATE FinanceRecurringBill SET invoiceReceivedDate=?, updatedAt=? WHERE id=? AND invoiceReceivedDate=?')
  .run(newValue, new Date().toISOString(), BILL_ID, EXPECTED_CORRUPT_IRD);
console.log(`APPLIED: ${info.changes} row(s) updated.`);
const after = db.prepare('SELECT invoiceReceivedDate,billDate FROM FinanceRecurringBill WHERE id=?').get(BILL_ID);
console.log(`  invoiceReceivedDate = ${after.invoiceReceivedDate}`);
console.log(`  billDate            = ${after.billDate}`);
console.log(`  match               = ${after.invoiceReceivedDate === after.billDate ? 'YES ✅' : 'NO ❌'}`);
db.close();
