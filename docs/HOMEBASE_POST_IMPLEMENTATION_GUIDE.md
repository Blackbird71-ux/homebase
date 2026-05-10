# Homebase — Post-Implementation Audit & Action Guide
## What Was Built, What Needs Fixing, What Data Was Lost

---

## PART 1 — SPEC COMPLIANCE AUDIT

### ✅ Things Built Correctly

**Schema fields — all 6 new columns present and correct:**
- `FinanceCategory.taxIncludeInReporting` ✓
- `FinanceCategory.taxDisplayLabel` ✓
- `FinanceTransaction.taxClassification` ✓
- `FinanceTransaction.isTransfer` ✓
- `FinanceRecurringBill.taxClassification` ✓
- `FinanceIncomeEntry.taxClassification` ✓

**Migration file `20260517000000_add_tax_classification`** — correct SQL, all 5 ALTER TABLE statements present. ✓

**Docker entrypoint** (`docker/entrypoint.sh`) — `npx prisma migrate deploy` is step 3/6, with pre-migration backup, stale migration auto-resolve, and health check. This is better than the spec required. ✓

**Navigation** (`finance/layout.tsx`) — both "Tax Report" and "P&L" links present, correct hrefs (`/finance/tax-report`, `/finance/profit-loss`). ✓

**Bills modal** — `taxClassification` in interface, `emptyForm`, and `validate()` function present. `errors` state present. ✓

**P&L page** (`profit-loss/page.tsx`) — entity filter pills (All + per entity) implemented with correct state (`selectedEntityId`), re-filters on change, Cash/Forecast toggle, period navigator (month/quarter/year), drill-down on category click. Entity filter works. ✓

**Tax Report page** (`tax-report/page.tsx`) — entity filter tabs present, re-fetches on entity change, expandable classification sections, summary cards, super cap indicator with progress bar. ✓

---

### ❌ Issues Found — Must Fix

---

#### ISSUE 1 — CRITICAL: `isTransfer` NOT in migration SQL

**File:** `prisma/migrations/20260517000000_add_tax_classification/migration.sql`

**Problem:** The migration SQL has 5 ALTER TABLE statements but is **missing** the `isTransfer` column on `FinanceTransaction`. The schema.prisma has `isTransfer Boolean @default(false)` but it was never added to the migration file. This means:
- On Windows dev: the column exists because `prisma generate` was run after editing schema.prisma directly (Prisma synced it via `db push` or it was already there from another route).
- On NAS production: **the column does NOT exist**. Any bill, income entry, or transaction save that touches `isTransfer` will crash with a SQLite "no such column" error.
- P&L filtering (`isTransfer: false`) will fail silently or crash on NAS.

**Fix — add this line to the existing migration SQL file:**

`prisma/migrations/20260517000000_add_tax_classification/migration.sql`

Add after the last ALTER TABLE line:
```sql
-- Add isTransfer to FinanceTransaction (inter-entity fund movements excluded from P&L)
ALTER TABLE "FinanceTransaction" ADD COLUMN "isTransfer" BOOLEAN NOT NULL DEFAULT false;
```

Then run on Windows dev:
```bash
npx prisma migrate deploy
```

This will re-apply the updated migration cleanly on Windows (it will skip the already-applied statements due to SQLite's idempotent ALTER TABLE behaviour and update the migration record). Then deploy to NAS — the column will be created there for the first time.

**If the above causes a migration conflict**, create a new migration file instead:

`prisma/migrations/20260518100000_add_is_transfer/migration.sql`
```sql
ALTER TABLE "FinanceTransaction" ADD COLUMN "isTransfer" BOOLEAN NOT NULL DEFAULT false;
```

---

#### ISSUE 2 — CRITICAL: Bills validation requires `taxClassification` — wrong behaviour

**File:** `src/app/(app)/finance/bills/page.tsx`

**Problem:** The `validate()` function contains:
```typescript
if (!form.taxClassification) errs.taxClassification = 'Tax classification is required'
```

This makes tax classification **mandatory** on every bill. The spec says it is optional (value of `null` = not classified). Most existing bills have no tax classification and users creating a simple household bill (Netflix, electricity) should not be forced to classify it.

**Fix — remove that validation rule:**
```typescript
function validate(): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!form.name.trim())                     errs.name = 'Name is required'
  if (!form.amount || form.amount <= 0)      errs.amount = 'Amount must be greater than 0'
  if (!form.nextDueDate)                     errs.nextDueDate = 'Due date is required'
  // taxClassification is intentionally optional — remove the required check
  return errs
}
```

---

#### ISSUE 3 — P&L page uses Bills + Income entries but NOT actual Transactions

**File:** `src/app/(app)/finance/profit-loss/page.tsx`

**Problem:** The P&L page fetches from `/api/finance/bills` and `/api/finance/income` only. It does **not** include actual `FinanceTransaction` records. This means:
- One-off expenses entered as transactions (not bills) are invisible in the P&L.
- Income received and confirmed as a transaction (not an income entry) is missing.
- The P&L does not match reality for any month where ad-hoc transactions were entered directly.

The spec calls for transactions (with `isTransfer = false`) to be included in expense rows, and income-type transactions to appear in income rows.

**Fix — update the P&L page to also fetch transactions:**

In the `load()` function, add:
```typescript
const [billsRes, incomeRes, entitiesRes, txRes] = await Promise.all([
  fetch('/api/finance/bills?includeAll=true'),
  fetch('/api/finance/income'),
  fetch('/api/finance/entities'),
  fetch(`/api/finance/transactions?from=${start.toISOString().split('T')[0]}&to=${end.toISOString().split('T')[0]}&excludeTransfers=true`),
])
if (txRes.ok) setTransactions(await txRes.json())
```

Add a `transactions` state. In the expense grouping `useMemo`, also loop through transactions where `type === 'expense'` and `isTransfer === false`. In the income grouping, also loop through transactions where `type === 'income'` and `isTransfer === false`.

Note: The transactions API will also need to support `excludeTransfers=true` and date range query params if not already present. Check `src/app/api/finance/transactions/route.ts` before implementing.

---

#### ISSUE 4 — Tax Report API: tax brackets calculation is incorrect

**File:** `src/app/api/finance/tax-report/route.ts`

**Problem:** The `estimateTax` function iterates all brackets and overwrites `incomeTax` on each iteration, but the loop logic is wrong — it sets `incomeTax = b.base + taxableInBracket * b.rate` rather than correctly applying only the top bracket's marginal calculation. For an income of $50,000 (which falls in the $45,001–$135,000 bracket), it would produce `4288 + (50000 - 45000) * 0.30 = $5,788`. That is actually correct for that one case — but the loop `min` boundary is wrong. The bracket says `min: 45_001` but the check is `if (taxableIncome > b.min)` meaning at exactly $45,001 it would skip the bracket. Minor but will cause $1 rounding errors at bracket boundaries.

More importantly, the tax calculations happen in the **API** not the **page component**. The spec requires brackets to live in the page so they can be updated each July without redeployment.

**Fix — move the bracket calculation to the tax-report page component.** The API should return raw income, deduction, and PAYG figures. The page component applies the brackets. This matches the spec's design decision in §10 and makes annual bracket updates a one-file edit.

For now, move the `TAX_BRACKETS` constant and `estimateTax` function from `route.ts` into `page.tsx`. Remove the tax calculation from the API. Add `taxableIncome` to what the API returns per classification (it already returns `netTaxable`). The page then calls `estimateTax(c.netTaxable)` for display.

---

#### ISSUE 5 — Tax Report does not show per-person workings

**File:** `src/app/(app)/finance/tax-report/page.tsx`

**Problem:** The tax report shows income grouped by `taxClassification` (taxable_income, exempt_income, tax_deduction, tax_payment) but does **not** break down by person (Mark vs Michelle). There are no side-by-side panels, no joint income split, no per-person PAYG credits, no per-person refund/owing calculation. The page is a classification summary, not the Tax_Calculator.xlsx equivalent the spec requires.

This is a significant gap. The current implementation is a useful start but does not meet the spec for the Tax Report page (§6).

**This is the largest remaining item to implement.** See the V2 spec §6 for the full layout and calculation rules. Prioritise after fixing Issues 1–4.

---

#### ISSUE 6 — P&L page uses period navigation (month/quarter/year) not financial year + monthly columns

**File:** `src/app/(app)/finance/profit-loss/page.tsx`

**Problem:** The implemented P&L uses a month/quarter/year period navigator showing totals for that period. The spec calls for a **financial year view with 12 monthly columns** (Jul–Jun) and a TOTAL column — identical to the NETT sheet of 2027_BUDGET.xlsx. The current implementation is a useful cashflow view but is a different product to what was specified.

**Options:**
1. Keep the current period-based P&L as-is (rename it "Cashflow" or keep as "P&L") and add the financial year + monthly column view as a separate page (`/finance/annual-pnl`).
2. Replace the current P&L with the spec's annual view.

**Recommendation:** Keep both. The current monthly/quarterly view is useful for cashflow management. Add the annual FY view as per the spec. Update the nav to have both tabs: "P&L" (current cashflow view) and "Annual" (new FY monthly column view).

---

#### ISSUE 7 — Income modal: `taxClassification` not confirmed present

The spec requires `taxClassification` in the income modal. Confirm it is implemented:

```bash
# Check from Windows terminal:
grep -n "taxClassification" src/app/\(app\)/finance/income/page.tsx
```

If the grep returns no results, the income modal is missing this field. Add it following the Bills modal pattern.

---

#### ISSUE 8 — Transactions modal: `isTransfer` checkbox not confirmed present

```bash
grep -n "isTransfer" src/app/\(app\)/finance/transactions/page.tsx
```

If missing, add the isTransfer checkbox and taxClassification dropdown per the spec §4.4. This is critical for correct P&L filtering.

---

#### ISSUE 9 — Categories modal: `taxIncludeInReporting` and `taxDisplayLabel` not confirmed present

```bash
grep -n "taxIncludeInReporting\|taxDisplayLabel\|TAX RPT" src/app/\(app\)/finance/categories/page.tsx
```

If missing, add per spec §4.1.

---

## PART 2 — DATA LOSS ASSESSMENT

### What Data Was Lost and Why

When the new schema fields were added via migration, existing records were unaffected — the new columns defaulted to `null` or `false`. **No existing data was deleted by the migration.**

However, you mentioned data appears lost. The most likely causes are:

#### Cause A — NAS database was not migrated

If the container on the NAS was not rebuilt and redeployed after the migration was added, the NAS database is missing all 6 new columns. Any page or API that tries to read or write `taxClassification`, `isTransfer`, `taxIncludeInReporting`, or `taxDisplayLabel` will throw a SQLite error. This can cause entire pages to fail to load, which may look like data loss.

**Check:** SSH into NAS and run:
```bash
docker exec homebase-app sqlite3 /data/homebase.db \
  "PRAGMA table_info(FinanceTransaction);" | grep -E "taxClassification|isTransfer"
```
If those columns are not listed, the migration has not run on the NAS.

**Fix:** Rebuild and redeploy:
```bash
# On Windows dev machine:
docker build -t homebase:latest .
# Then on NAS — copy the new image and restart:
docker compose down && docker compose up -d
```
The entrypoint.sh will run `prisma migrate deploy` automatically on startup and apply the missing columns.

#### Cause B — `isTransfer` column missing on NAS (see Issue 1)

If `isTransfer` is not in the migration SQL, the transaction API will crash when it tries to query `isTransfer: false`. This means the transactions page, P&L page, and any API that filters by `isTransfer` will return errors — which looks like all your transactions have disappeared.

**Fix:** See Issue 1 above. Add the ALTER TABLE for `isTransfer` to the migration and redeploy.

#### Cause C — Finance data entered on Windows dev is in the Windows database, not the NAS database

The Windows dev environment uses `homebase.db` in the project root. The NAS uses `/volume1/docker/homebase/Data/homebase.db`. These are two separate databases. Data entered while testing on Windows (`localhost:3000` or `localhost:3001`) is in the Windows DB only.

**Check:** Look at `homebase.db` file size vs NAS db size. If the Windows DB is much larger, data was entered there.

**Fix — copy the Windows dev database to the NAS:**
```bash
# 1. Stop the NAS container first
# On NAS via SSH:
docker stop homebase-app

# 2. Copy the Windows DB to the NAS data volume
# (adjust path to your NAS SCP/SFTP setup):
scp C:\Appdev\HomeBase\homebase.db user@nas-ip:/volume1/docker/homebase/Data/homebase.db

# 3. Restart the NAS container
docker start homebase-app
```

⚠️ WARNING: This replaces the entire NAS database with the Windows dev database. Only do this if the NAS database has no data you want to keep. If both databases have data, you need to merge them manually (see Cause D).

#### Cause D — Data existed on NAS before finance module was added

If the NAS was running a pre-finance version of Homebase and the finance models were added via the `20260508300000_add_finance_models` migration, all finance data would need to be re-entered. Non-finance data (events, lists, recipes, chores, notes) should be intact.

**To verify:** On NAS:
```bash
docker exec homebase-app sqlite3 /data/homebase.db \
  "SELECT count(*) FROM FinanceTransaction;"
docker exec homebase-app sqlite3 /data/homebase.db \
  "SELECT count(*) FROM FinanceRecurringBill;"
docker exec homebase-app sqlite3 /data/homebase.db \
  "SELECT count(*) FROM FinanceIncomeEntry;"
```

If all return 0 but you entered data via the app, check Cause A and C first.

---

## PART 3 — PRIORITISED ACTION LIST

Do these in order. Do not skip ahead.

### Step 1 — Fix the `isTransfer` migration (30 minutes)

This is blocking production deployment. Without it the NAS will crash on any P&L or transaction query.

**On Windows dev:**

Add this line to `prisma/migrations/20260517000000_add_tax_classification/migration.sql`:
```sql
ALTER TABLE "FinanceTransaction" ADD COLUMN "isTransfer" BOOLEAN NOT NULL DEFAULT false;
```

Then run:
```bash
npx prisma migrate deploy
npx prisma generate
```

Verify:
```bash
sqlite3 homebase.db "PRAGMA table_info(FinanceTransaction);" | grep isTransfer
```
Should show the column. Then commit and redeploy.

---

### Step 2 — Fix the bills validation (15 minutes)

Remove `taxClassification` from the required fields in `validate()` in `bills/page.tsx`. All new bills should save without being forced to set a tax classification.

---

### Step 3 — Confirm income, transactions, categories modals have the new fields (30 minutes)

Run these grep checks from your terminal in `C:\Appdev\HomeBase`:

```bash
grep -n "taxClassification" "src/app/(app)/finance/income/page.tsx"
grep -n "isTransfer" "src/app/(app)/finance/transactions/page.tsx"
grep -n "taxIncludeInReporting" "src/app/(app)/finance/categories/page.tsx"
```

For any file that returns no results, implement the fields per spec §4.

---

### Step 4 — Diagnose and recover lost data (1–2 hours)

Follow the Cause A → B → C → D sequence in Part 2 above.

Run the sqlite3 row count checks on the NAS. Identify which database has your actual data. Copy the correct database to the correct location.

---

### Step 5 — Rebuild and redeploy to NAS (30 minutes)

After Steps 1–4 are complete:

```bash
# On Windows dev:
docker build -t homebase:latest .
```

Copy the image to NAS (via `docker save` / `docker load` or your existing deploy script), then:
```bash
# On NAS:
docker compose down
docker compose up -d
docker logs homebase-app --follow
```

Confirm the migration log shows:
```
>> [3/6] Running database migrations...
✓ Migrations completed successfully
```

Confirm all 6 columns are present:
```bash
docker exec homebase-app sqlite3 /data/homebase.db \
  "SELECT name FROM pragma_table_info('FinanceTransaction') WHERE name IN ('taxClassification','isTransfer');"
docker exec homebase-app sqlite3 /data/homebase.db \
  "SELECT name FROM pragma_table_info('FinanceCategory') WHERE name IN ('taxIncludeInReporting','taxDisplayLabel');"
```

---

### Step 6 — Tag all existing bills and income entries with tax classifications (ongoing)

Now that the fields exist, go through your data and classify everything:

**In Bills:**
- PAYG - Me, PAYG - Mark → `tax_payment`
- Super (voluntary) contributions → `tax_deduction`
- Work-related expenses → `tax_deduction`
- Regular household bills (Netflix, insurance, etc.) → leave as `null`

**In Income:**
- Wages/Salary → `taxable_income`, `isTaxTracked: true`
- Bank interest → `taxable_income`, `isTaxTracked: true`
- SGC (super contributions from employer) → tag with the Super entity
- Rental income → `taxable_income` on the Super entity
- Hopevale distributions → `taxable_income`

**In Categories:**
- Tick "Include in Tax Report" on: Salary, Wages, Bank Interest, Rent, SGC, Interest Income
- Set "Tax Report Label" overrides where the category name is too technical (e.g. "NAB TD" → "Bank Interest — NAB")

---

### Step 7 — Implement the per-person Tax Report (large item, separate session)

The current tax report shows classification buckets. The full Tax_Calculator.xlsx equivalent — with Mark and Michelle side-by-side panels, joint income split, PAYG credits, and per-entity Super/Unitrak sections — is the remaining major feature.

Brief the AI agent with the V2 spec §6 and show them the current `tax-report/page.tsx` as the starting point to extend, not replace.

---

### Step 8 — Add annual FY P&L view (separate session)

The current P&L is a monthly/quarterly cashflow view. The spec's 12-column FY view (mirroring 2027_BUDGET.xlsx NETT sheet) is still to build.

Brief the agent with V2 spec §5.3–§5.11. The current `profit-loss/page.tsx` stays as-is. The new page goes at `/finance/annual-pnl`. Add it as a nav tab labelled "Annual P&L".

---

## PART 4 — QUICK REFERENCE: WHAT EACH PAGE DOES NOW

| Page | What it does | Gap vs spec |
|---|---|---|
| `/finance/profit-loss` | P&L by category, period navigator (month/quarter/year), entity filter pills, cash vs forecast toggle, drill-down | Missing: actual transactions (only bills + income entries). Missing: 12-column annual view. |
| `/finance/tax-report` | Tax data grouped by classification (taxable_income, deductions, payments), entity filter, expandable drill-down, super cap indicator | Missing: per-person workings (Mark/Michelle panels), joint income split, PAYG credits, refund/owing calc, Super entity P&L, Unitrak P&L |
| `/finance/bills` | Bill management with taxClassification dropdown | taxClassification wrongly required (Issue 2) |
| Schema / migrations | All 6 new columns in schema.prisma | isTransfer missing from migration SQL (Issue 1) — NAS will crash |
| `entrypoint.sh` | Runs migrate deploy, pre-migration backup, health check, auto-resolves stale migrations | Better than spec required ✓ |

---

## PART 5 — COMMANDS CHEAT SHEET

```bash
# Check which migrations have run on the NAS database
docker exec homebase-app sqlite3 /data/homebase.db \
  "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at;"

# Check all columns on key finance tables
docker exec homebase-app sqlite3 /data/homebase.db \
  "PRAGMA table_info(FinanceTransaction);"
docker exec homebase-app sqlite3 /data/homebase.db \
  "PRAGMA table_info(FinanceRecurringBill);"
docker exec homebase-app sqlite3 /data/homebase.db \
  "PRAGMA table_info(FinanceIncomeEntry);"
docker exec homebase-app sqlite3 /data/homebase.db \
  "PRAGMA table_info(FinanceCategory);"

# Count rows in key tables to confirm data is present
docker exec homebase-app sqlite3 /data/homebase.db \
  "SELECT 'Bills' as tbl, count(*) FROM FinanceRecurringBill
   UNION ALL SELECT 'Income', count(*) FROM FinanceIncomeEntry
   UNION ALL SELECT 'Transactions', count(*) FROM FinanceTransaction
   UNION ALL SELECT 'Categories', count(*) FROM FinanceCategory;"

# Rebuild and redeploy
cd C:\Appdev\HomeBase
docker build -t homebase:latest .
# ... then copy to NAS and restart container

# Run migration status check locally
npx prisma migrate status

# Apply pending migrations locally
npx prisma migrate deploy

# Regenerate prisma client after schema changes
npx prisma generate
```

---

*Audit based on direct code inspection of: `prisma/schema.prisma`, `migration.sql` (20260517), `docker/entrypoint.sh`, `src/app/api/finance/pnl/route.ts`, `src/app/api/finance/tax-report/route.ts`, `src/app/(app)/finance/profit-loss/page.tsx`, `src/app/(app)/finance/tax-report/page.tsx`, `src/app/(app)/finance/bills/page.tsx`, `src/app/(app)/finance/layout.tsx`.*
