/**
 * Retire the two UNUSED `Accrued SGC - Mark` / `Accrued SGC - Michelle` asset
 * accounts by setting hideFromReports=1 (removes them from GL pickers, dialogs,
 * and the balance sheet — see categories/route.ts & balance-sheet/route.ts).
 *
 * Context: F6 audit finding. The SGC mechanism itself is correct SMSF accounting
 * (employer SGC = contribution income to the fund; cash -> fund bank). These two
 * named asset accounts were created but NEVER posted to (zero balance, zero refs)
 * and only clutter the chart. User decision 2026-06-01: leave SGC postings as-is,
 * retire these dead accounts.
 *
 * Guarded: re-verifies ZERO references at runtime and aborts if any are found, or
 * if the current state isn't the expected (hideFromReports=0). DRY-RUN by default.
 *
 * Usage:
 *   node scripts/retire-accrued-sgc-accounts.cjs --db data/homebase.audit-copy.db --apply   (prove on copy)
 *   node scripts/retire-accrued-sgc-accounts.cjs --db data/homebase.db                       (DRY-RUN on live)
 *   node scripts/retire-accrued-sgc-accounts.cjs --db data/homebase.db --apply               (commit on live)
 */
const path = require('path');
const Database = require(path.join(process.cwd(), 'node_modules', 'better-sqlite3'));

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const dbArg = (() => { const i = argv.indexOf('--db'); return i >= 0 ? argv[i + 1] : 'data/homebase.db'; })();
const dbPath = path.isAbsolute(dbArg) ? dbArg : path.join(process.cwd(), dbArg);

const TARGETS = [
  { id: 'cmp0f2hlv000r01pdr2dyl3b1', name: 'Accrued SGC - Mark' },
  { id: 'cmp0f22eh000q01pdtc3wym4z', name: 'Accrued SGC - Michelle' },
];
const ids = TARGETS.map(t => t.id);

const db = new Database(dbPath, { readonly: !apply });
console.log(`DB: ${dbPath}`);
console.log(`Mode: ${apply ? 'APPLY (will write)' : 'DRY-RUN (read-only)'}\n`);

// 1. Verify current state is exactly what we expect (asset, hideFromReports=0, present).
const rows = db.prepare('SELECT id,name,type,hideFromReports FROM FinanceCategory WHERE id IN (?,?)').all(...ids);
if (rows.length !== 2) { console.error(`ABORT: expected 2 target rows, found ${rows.length}.`); process.exit(1); }
for (const r of rows) {
  const t = TARGETS.find(x => x.id === r.id);
  if (r.name !== t.name) { console.error(`ABORT: ${r.id} name is "${r.name}", expected "${t.name}".`); process.exit(1); }
  if (r.type !== 'asset') { console.error(`ABORT: ${r.id} type is "${r.type}", expected "asset".`); process.exit(1); }
}
const alreadyHidden = rows.filter(r => r.hideFromReports === 1).map(r => r.name);
if (alreadyHidden.length === 2) { console.log('Both already hidden — nothing to do.'); db.close(); process.exit(0); }

// 2. Re-verify ZERO references at runtime (defensive — do not trust prior checks).
const refChecks = {
  'FinanceJournalLine.glAccountId':  'SELECT COUNT(*) n FROM FinanceJournalLine WHERE glAccountId IN (?,?)',
  'FinanceIncomeEntry.categoryId':   'SELECT COUNT(*) n FROM FinanceIncomeEntry WHERE categoryId IN (?,?)',
  'FinanceRecurringBill.categoryId': 'SELECT COUNT(*) n FROM FinanceRecurringBill WHERE categoryId IN (?,?)',
  'FinanceTransaction.categoryId':   'SELECT COUNT(*) n FROM FinanceTransaction WHERE categoryId IN (?,?)',
  'FinanceTransaction.glAccountId':  'SELECT COUNT(*) n FROM FinanceTransaction WHERE glAccountId IN (?,?)',
  'FinanceCategory.parentId(child)': 'SELECT COUNT(*) n FROM FinanceCategory WHERE parentId IN (?,?)',
  'FinanceVendor.defaultCategoryId': 'SELECT COUNT(*) n FROM FinanceVendor WHERE defaultCategoryId IN (?,?)',
  'FinanceBudget.categoryId':        'SELECT COUNT(*) n FROM FinanceBudget WHERE categoryId IN (?,?)',
};
let total = 0;
console.log('Zero-reference re-check:');
for (const [label, sql] of Object.entries(refChecks)) {
  try { const r = db.prepare(sql).get(...ids); total += r.n; console.log(`  ${label.padEnd(34)} => ${r.n}`); }
  catch { console.log(`  ${label.padEnd(34)} => (table/col absent, skipped)`); }
}
if (total !== 0) { console.error(`\nABORT: ${total} reference(s) found — not safe to retire.`); db.close(); process.exit(1); }
console.log('  TOTAL => 0  ✅\n');

// 3. Apply (or report intent).
if (!apply) {
  console.log('DRY-RUN: would set hideFromReports=1 on:');
  rows.forEach(r => console.log(`  - ${r.name} (${r.id})`));
  console.log('\nRe-run with --apply to commit.');
  db.close();
  process.exit(0);
}
const upd = db.prepare("UPDATE FinanceCategory SET hideFromReports=1, updatedAt=? WHERE id IN (?,?) AND hideFromReports=0");
const info = upd.run(new Date().toISOString(), ...ids);
console.log(`APPLIED: ${info.changes} row(s) updated.`);
const after = db.prepare('SELECT name,hideFromReports FROM FinanceCategory WHERE id IN (?,?)').all(...ids);
after.forEach(r => console.log(`  - ${r.name}: hideFromReports=${r.hideFromReports}`));
db.close();
