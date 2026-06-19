/**
 * Retire the stray "Accounts Receivable (deprecated)" control account by
 * setting hideFromReports=1 (removes it from GL pickers, dialogs, and the
 * balance sheet — see categories/route.ts forPicker/default filters).
 *
 * Context: 2026-06-19 finance audit, finding #2. A second, NON-system AR
 * account existed alongside the system "Accounts Receivable". The AR aging
 * route resolves the AR account with isSystem=true, so any entry posted to
 * this deprecated (non-system) AR category would split the AR control total
 * and silently break the subledger↔GL reconciliation. Nothing references it
 * (verified by this script), so it is pure clutter. Retiring it (not deleting)
 * is the safe, reversible cleanup.
 *
 * Looked up BY NAME (not a hardcoded id) so it is safe to run on any DB copy —
 * the cuid differs between environments. Guarded: aborts if the account is
 * referenced by any journal line, if multiple/none match, or if it is already
 * retired. DRY-RUN by default.
 *
 * Usage:
 *   node scripts/retire-deprecated-ar-account.cjs --db data/homebase.db            (DRY-RUN)
 *   node scripts/retire-deprecated-ar-account.cjs --db data/homebase.db --apply     (commit)
 */
const path = require('path');
const Database = require(path.join(process.cwd(), 'node_modules', 'better-sqlite3'));

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const dbArg = (() => { const i = argv.indexOf('--db'); return i >= 0 ? argv[i + 1] : 'data/homebase.db'; })();
const dbPath = path.isAbsolute(dbArg) ? dbArg : path.join(process.cwd(), dbArg);

const TARGET_NAME = 'Accounts Receivable (deprecated)';

const db = new Database(dbPath, { readonly: !apply });
console.log(`DB: ${dbPath}`);
console.log(`Mode: ${apply ? 'APPLY (will write)' : 'DRY-RUN (read-only)'}\n`);

// 1. Locate the target by name.
const rows = db.prepare(
  "SELECT id, name, type, isSystem, hideFromReports FROM FinanceCategory WHERE name = ?"
).all(TARGET_NAME);

if (rows.length === 0) {
  console.log(`No "${TARGET_NAME}" category found — nothing to retire. Already clean.`);
  process.exit(0);
}
if (rows.length > 1) {
  console.error(`ABORT: ${rows.length} categories share the name "${TARGET_NAME}". Resolve manually before retiring.`);
  rows.forEach(r => console.error(`  - ${r.id} (type=${r.type}, isSystem=${r.isSystem})`));
  process.exit(1);
}

const target = rows[0];
console.log(`Found: id=${target.id}, type=${target.type}, isSystem=${target.isSystem}, hideFromReports=${target.hideFromReports}`);

// 2. Sanity: it must be the deprecated asset, not a real system AR account.
if (target.isSystem === 1 || target.isSystem === true) {
  console.error('ABORT: target is a SYSTEM account — refusing to retire a system control account.');
  process.exit(1);
}

// 3. Already retired?
if (target.hideFromReports === 1 || target.hideFromReports === true) {
  console.log('Already retired (hideFromReports=1). Nothing to do.');
  process.exit(0);
}

// 4. CRITICAL guard: never retire an account that is referenced by posted or
//    unposted journal lines — hiding it would make those lines invisible in
//    reports/dialogs and silently corrupt AR reconciliation.
const refCount = db.prepare(
  'SELECT COUNT(*) AS n FROM FinanceJournalLine WHERE glAccountId = ?'
).get(target.id).n;
if (refCount > 0) {
  console.error(`ABORT: "${TARGET_NAME}" is referenced by ${refCount} journal line(s). ` +
    `Repoint or reverse those entries before retiring, or merge into the system AR account.`);
  process.exit(1);
}

// 5. Apply (or report the dry-run).
if (apply) {
  const res = db.prepare('UPDATE FinanceCategory SET hideFromReports = 1 WHERE id = ?').run(target.id);
  console.log(`\nRetired: set hideFromReports=1 on "${TARGET_NAME}" (${target.id}). Updated ${res.changes} row(s).`);
} else {
  console.log(`\nDRY-RUN: would set hideFromReports=1 on "${TARGET_NAME}" (${target.id}). Re-run with --apply to commit.`);
}

db.close();
