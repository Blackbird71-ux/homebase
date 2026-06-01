/**
 * F7-parity (income side) data fix: correct the one Michelle's SGC income entry whose
 * invoiceReceivedDate (the tax point) diverges from its posted GL entry's date.
 *
 * Why: the AR subledger includes an income entry when invoiceReceivedDate <= asAt; the
 * GL AR control includes its accrual when the JE date <= asAt. These boundaries must
 * align or AR control != subledger. Here invoiceReceivedDate=2026-05-18 but JE-0012
 * (and receivedDate) = 2026-05-22, so in the window 2026-05-18..05-21 the entry sits in
 * the subledger while the control omits it (a $159.91 historical AR gap). It is the
 * income-side mirror of the F7 Charity AP fix (AGENTS.md bills<->income parity).
 *
 * Correct tax point = JE date = receivedDate = 2026-05-22 (every other anchor agrees).
 * The entry is already `received` (receivedDate 2026-05-22), so it is excluded from the
 * open-AR subledger as-at today regardless — today's reconciliation is unchanged; this
 * only realigns historical as-at snapshots and the stored tax point.
 *
 * Guarded: aborts unless the row is in exactly the known-divergent state. DRY-RUN by
 * default. We copy receivedDate's stored string verbatim so the stored format is identical.
 *
 * Usage:
 *   node scripts/fix-sgc-income-tax-point.cjs --db data/homebase.audit-copy.db --apply   (prove on copy)
 *   node scripts/fix-sgc-income-tax-point.cjs --db data/homebase.db                       (DRY-RUN on live)
 *   node scripts/fix-sgc-income-tax-point.cjs --db data/homebase.db --apply               (commit on live)
 */
const path = require('path');
const Database = require(path.join(process.cwd(), 'node_modules', 'better-sqlite3'));

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const dbArg = (() => { const i = argv.indexOf('--db'); return i >= 0 ? argv[i + 1] : 'data/homebase.db'; })();
const dbPath = path.isAbsolute(dbArg) ? dbArg : path.join(process.cwd(), dbArg);

const INCOME_ID = 'cmpehkeak000e01nryts8f100';
const EXPECTED_DIVERGENT_IRD = '2026-05-18T00:00:00.000+00:00';
const EXPECTED_JE_DATE       = '2026-05-22T00:00:00.000+00:00';
const EXPECTED_RECEIVED_DATE = '2026-05-22T00:00:00.000+00:00';

const db = new Database(dbPath, { readonly: !apply });
console.log(`DB: ${dbPath}`);
console.log(`Mode: ${apply ? 'APPLY (will write)' : 'DRY-RUN (read-only)'}\n`);

const row = db.prepare(
  'SELECT i.id,i.name,i.invoiceReceivedDate,i.receivedDate,i.journalEntryId,je.date AS jeDate, je.reference AS jeRef ' +
  'FROM FinanceIncomeEntry i LEFT JOIN FinanceJournalEntry je ON i.journalEntryId=je.id WHERE i.id=?'
).get(INCOME_ID);

if (!row) { console.error(`ABORT: income entry ${INCOME_ID} not found.`); db.close(); process.exit(1); }
console.log('Target row:');
console.log(`  name                = ${row.name}`);
console.log(`  invoiceReceivedDate = ${row.invoiceReceivedDate}   (divergent tax point)`);
console.log(`  receivedDate        = ${row.receivedDate}`);
console.log(`  JE date (${row.jeRef||'—'})       = ${row.jeDate}\n`);

// Guard: only proceed if the row is exactly the known-divergent state.
if (row.invoiceReceivedDate !== EXPECTED_DIVERGENT_IRD) {
  if (row.invoiceReceivedDate === row.receivedDate) { console.log('Already corrected (invoiceReceivedDate == receivedDate). Nothing to do.'); db.close(); process.exit(0); }
  console.error(`ABORT: invoiceReceivedDate is "${row.invoiceReceivedDate}", expected divergent "${EXPECTED_DIVERGENT_IRD}".`); db.close(); process.exit(1);
}
if (row.jeDate !== EXPECTED_JE_DATE) { console.error(`ABORT: JE date is "${row.jeDate}", expected "${EXPECTED_JE_DATE}".`); db.close(); process.exit(1); }
if (row.receivedDate !== EXPECTED_RECEIVED_DATE) { console.error(`ABORT: receivedDate is "${row.receivedDate}", expected "${EXPECTED_RECEIVED_DATE}".`); db.close(); process.exit(1); }

const newValue = row.receivedDate; // verbatim = JE date, identical format

if (!apply) {
  console.log(`DRY-RUN: would set invoiceReceivedDate = "${newValue}" (= JE date = receivedDate).`);
  console.log('\nRe-run with --apply to commit.'); db.close(); process.exit(0);
}
const info = db.prepare('UPDATE FinanceIncomeEntry SET invoiceReceivedDate=?, updatedAt=? WHERE id=? AND invoiceReceivedDate=?')
  .run(newValue, new Date().toISOString(), INCOME_ID, EXPECTED_DIVERGENT_IRD);
console.log(`APPLIED: ${info.changes} row(s) updated.`);
const after = db.prepare('SELECT invoiceReceivedDate,receivedDate FROM FinanceIncomeEntry WHERE id=?').get(INCOME_ID);
console.log(`  invoiceReceivedDate = ${after.invoiceReceivedDate}`);
console.log(`  receivedDate        = ${after.receivedDate}`);
console.log(`  match               = ${after.invoiceReceivedDate === after.receivedDate ? 'YES ✅' : 'NO ❌'}`);
db.close();
