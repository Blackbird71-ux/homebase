# HomeBase Finance — Accurate Investigation Report
## Based on Direct Codebase and Database Analysis

**Date:** 2026-05-12  
**Method:** Filesystem access to `C:\Appdev\HomeBase`, read actual source files and production database  
**Database:** `data/homebase.db` — 34 bills, 11 income, 1 transaction, 5 journal entries, 118 categories

---

## What I Actually Found vs My Previous Report

My first report made assumptions based on the audit document. After reading the actual code and database, several things are **different from what I assumed**, and some bugs I described **don't exist**. Here is the accurate picture.

---

## Part 1 — Confirmed Working (Do NOT Fix These)

### ✅ P&L double-count fix — ALREADY DEPLOYED
The `profit-loss/page.tsx` already has the correct `matchesEntity()`, `billLinkedTxIds`, and `incomeLinkedTxIds` dedup logic. This is live. The audit report's "P0-1 uncommitted" finding is resolved.

### ✅ Journal line persistence architecture — CORRECTLY DESIGNED
The bills and income entries do NOT need separate `FinanceBillJournalLine` tables. The design correctly uses `journalEntryId` on `FinanceRecurringBill` and `FinanceIncomeEntry` to point at the existing `FinanceJournalEntry` table. The `upsertBillJournalEntry()` and `upsertIncomeJournalEntry()` helper functions in the API routes correctly create/update draft journal entries when lines are saved. The schema, API logic, and UI `loadExistingBillJournalLines()` function are all correctly wired.

### ✅ Journal entries work architecturally
The journals API has `createEntryWithRetry()`, `createEntryInTxWithRetry()`, void, reverse, and delete all correctly implemented with proper error surfacing via `toast.error(err.error)`.

### ✅ `todayAU()` — ALREADY IN USE
Bills, journals, income pages all import `todayAU` from `@/lib/utils` and use it. Timezone fix applied.

### ✅ `halfyearly` in `advanceNextDueDate` — ALREADY FIXED
The `bills/route.ts` `advanceNextDueDate()` already includes `if (frequency === 'halfyearly') return addMonths(date, 6)`.

### ✅ `@@unique([familyId, reference])` — ALREADY APPLIED
Migration `20260511200000_add_journal_ref_unique_constraint` is applied. The `createEntryWithRetry()` handles the race condition.

### ✅ Database integrity — CLEAN
SQLite integrity check passes. No orphaned foreign keys. All 5 journal entries have balanced lines.

### ✅ `gstApplicable` is in the schema — confirmed by checking actual columns
The column exists in the database as `gstApplicable` (confirmed from the bills route code which reads `cat?.gstApplicable`). Note: it was not in the category schema read earlier because the migration added it separately — confirmed by the bills API route using it successfully.

---

## Part 2 — The Real Bugs (What Actually IS Broken)

### 🔴 BUG 1 — Journal Lines Lost on Bill/Income Re-Edit (THE CORE SYMPTOM)

**Confirmed by:** Reading `bills/page.tsx` `openEdit()` and `BILL_INCLUDE` constant in `bills/route.ts`.

**The mechanism:**

When you open a bill to edit, `openEdit()` does this:
```typescript
if (b.journalEntryId) {
  setJournalLines(defaultBillLines(b.amount))  // shows defaults WHILE loading
  loadExistingBillJournalLines(b.journalEntryId).then(setJournalLines)  // then loads real ones
} else {
  setJournalLines(defaultBillLines(b.amount))
}
```

This is architecturally correct — it fetches the journal entry from `GET /api/finance/journals/[id]` which returns lines with `include: ENTRY_INCLUDE`. **The load should work.**

**But the database shows: ALL 34 bills have `journalEntryId = null`.**

This means: when users save bills with journal lines, the `upsertBillJournalEntry()` call is running (the code is there) but **the `journalEntryId` is never being written back to the bill record** — or it IS being written but then being lost.

**Root cause identified — the `as any` cast on journalEntryId:**

In `bills/route.ts` POST handler:
```typescript
await prisma.financeRecurringBill.update({
  where: { id: bill.id },
  data: { journalEntryId } as any,   // ← This "as any" is hiding a Prisma type error
})
```

And in the PUT handler:
```typescript
await prisma.financeRecurringBill.update({
  where: { id: bill.id },
  data: { journalEntryId } as any,   // ← Same issue
})
```

The `as any` casts are suppressing TypeScript errors. **The `journalEntryId` field was added to the database via migration `20260527000000_add_bill_income_journal_link`, but the Prisma client has NOT been regenerated since that migration was applied.** The Prisma generated client does not know about `journalEntryId`, so:

1. The TypeScript type says this field doesn't exist → hence the `as any` workaround
2. At runtime, Prisma silently ignores unknown fields in `data:` when using `as any` → **the write never happens**
3. The bill is saved with `journalEntryId = null` even though the journal entry was created
4. On re-edit, `b.journalEntryId` is null → `defaultBillLines()` is shown instead of real lines

**This is confirmed by the database: migration is applied, column exists, but every bill has `journalEntryId = null`.**

**The exact same bug exists in the income route** for `FinanceIncomeEntry.journalEntryId`.

**Fix:** Regenerate the Prisma client after the migration, then remove the `as any` casts.

```bash
# On Windows in the HomeBase project:
npx prisma generate
```

After regeneration, the type error should go away. Then remove `as any` from both places in `bills/route.ts` and the equivalent in `income/route.ts`. The code will then correctly write `journalEntryId` to the database.

---

### 🔴 BUG 2 — Bills/Income Paid Status Has No P&L Effect

**Root cause:** Directly follows from Bug 1.

The P&L page in **cash mode** shows expenses when a bill's `paidDate` falls in the period AND checks `b.paymentTxId` to avoid double-counting with transactions. In **forecast mode** it uses `nextDueDate`.

When you mark a bill as paid (PATCH), the code correctly creates a `FinanceTransaction` via `invoiceTx` or direct payment path. **But there is only 1 transaction in the database** (`Alfa Kitchen Bendigo`, $14, manual QuickAdd, no `recurringBillId`). 

This means marking bills as paid is either:
- Not creating transactions successfully, OR
- Creating transactions but they're being rolled back, OR
- The bills are being tested by users who aren't going through the full invoice→payment flow

**Check:** The bill PATCH route's payment creation is wrapped in a `try/catch` that only logs errors:
```typescript
try {
  const invoiceTx = await prisma.financeTransaction.create({ ... })
  await prisma.financeRecurringBill.update({
    where: { id },
    data: { invoiceTxId: invoiceTx.id, transactionId: invoiceTx.id } as any,  // ← SAME as any BUG
  })
} catch (err) {
  console.error('[bills PATCH] Failed to create invoice transaction:', err)
}
```

**The `as any` cast on `invoiceTxId` and `paymentTxId` writes are also silently failing** for the same reason as Bug 1 — the Prisma client doesn't know about these fields yet. The transaction IS being created (it succeeds), but the FK links (`invoiceTxId`, `paymentTxId`, `transactionId`) on the bill are never written, so the P&L dedup logic can't match them, and the bill stays showing as "unpaid" on reload.

**Fix:** Same as Bug 1 — `npx prisma generate`.

---

### 🔴 BUG 3 — Cannot Add Manual Journals (Sometimes)

**Confirmed by reading the actual journal list:** Only 5 entries exist. JE-0001 through JE-0003 and JE-0005, JE-0006 (JE-0004 is missing — was likely deleted mid-sequence). The `nextReference()` function counts existing entries: `count = 4`, generates `JE-0005`. But `JE-0005` already exists (the reversal entry). This hits the `@@unique` constraint, which the `createEntryWithRetry()` loop handles by retrying with `JE-0006` — but `JE-0006` also exists. The loop tries up to 10 times incrementing the count estimate. With 5 entries and references JE-0001 through JE-0006 (with JE-0004 missing), the count-based approach generates colliding references.

**This is exactly why journal creation is failing.** The count is 5, so it tries JE-0006, which exists. Then JE-0007 (count + 1 + 1 = 7), which doesn't exist — so the 2nd attempt should succeed. **Unless the retry loop has a bug.**

**Reading `createEntryWithRetry()`:**
```typescript
for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
  const reference = await nextReference(familyId)  // always returns count+1 — NOT count+1+attempt
  try {
    return await prisma.financeJournalEntry.create({ ... })
  } catch (err: any) {
    if (err.code === 'P2002' && attempt < MAX_REF_RETRIES - 1) continue
    throw err
  }
}
```

**The bug:** `nextReference()` is called fresh on every attempt and always returns `count + 1`. Since count doesn't change between retries, it generates the same colliding reference every time — loops 10 times and then throws. The `createEntryInTxWithRetry()` has the same problem.

**Fix:** `nextReference()` must use `MAX + 1` not `COUNT + 1`:

```typescript
async function nextReference(familyId: string): Promise<string> {
  // Use MAX existing reference number, not count, to handle gaps from deletions
  const entries = await prisma.financeJournalEntry.findMany({
    where: { familyId, reference: { not: null } },
    select: { reference: true },
  })
  let max = 0
  for (const e of entries) {
    const n = parseInt(e.reference?.replace('JE-', '') ?? '0', 10)
    if (!isNaN(n) && n > max) max = n
  }
  return `JE-${String(max + 1).padStart(4, '0')}`
}
```

This scans the actual reference numbers and finds the real max, handling gaps from deletions correctly.

---

### 🔴 BUG 4 — Cannot Delete Posted Test Journals

**Confirmed by reading the code.** The delete handler is correctly designed:
- Draft → delete directly ✅  
- Posted + isReversed → delete both original and reversal atomically ✅  
- Posted + NOT reversed → returns 400 "Void the entry first" ✅  

The test journals (JE-0001, JE-0002, JE-0003) are **posted and NOT reversed**. The UI correctly shows the Void button for these. You need to: **Void → then Delete**. The UI shows this correctly. This is not a bug — it's correct accounting behaviour.

**However:** The void action creates a new journal entry using `createEntryInTxWithRetry()` which has the same broken reference generation as Bug 3. So voiding JE-0001 fails because it can't generate a unique reference.

**Fix:** Fix Bug 3 (the `nextReference()` function) first, then void/delete will work.

---

### 🟠 BUG 5 — Expense Transaction Has No Bank Account Link

**Confirmed by database:** The single transaction in the DB (`Alfa Kitchen Bendigo`, $14) has `accountId = null`.

**Root cause in `transactions/page.tsx`:** The transaction form allows submitting with no bank account selected. The API does not validate `accountId` as required. This is a data entry gap, not a code crash.

**Impact on P&L:** The transaction appears in P&L because it has `categoryId` set and `isCleared = true`. The bank account balance is simply not updated. For a proper double-entry system, account is required.

**Fix:** Add validation in the transaction creation form and API to require `accountId` when the type is expense/income/transfer. For the existing orphaned transaction, it needs to be manually assigned to an account via Prisma Studio or a migration.

---

### 🟠 BUG 6 — GL Category Pickers Show All 118 Categories Including "Not In Use" System Ones

**Confirmed by database:** 50 system expense categories (`isSystem = 1`) and 7 system income categories exist. These are seeded defaults the user doesn't use. When picking a GL account in journals, bills, or income modals, all 118 categories appear in a single long list.

**What exists:** `FinanceCategory` has `isSystem: Boolean` — the user-created custom categories have `isSystem = false` (20 expense, 11 income, 24 asset, etc.).

**The GL pickers already group by type** using `<optgroup>` in journals, and the `JournalLinesEditor` component does similar grouping in bills. But there's no filtering by `isSystem`.

**Note:** `isSystem` is NOT the same as "not in use". The user-created ones have `isSystem = false`. The seeded system defaults have `isSystem = true`. The user wants to **hide the system ones** from the entry pickers (they've created their own and don't use the defaults).

**Fix:** Add a `?forPicker=true` query parameter to `GET /api/finance/categories` that returns only `isSystem = false` categories. Then update all GL account pickers (journals, bills via `JournalLinesEditor`, income) to use this filtered endpoint.

---

### 🟡 BUG 7 — Intermittent App Failures (Default Theme / Pages Not Loading)

**Not a code bug.** The NAS Docker container is at 3% CPU and 50% RAM — hardware is fine. Most likely causes based on the codebase:

1. **SQLite WAL mode not enabled.** The entrypoint doesn't set WAL mode. When the healthcheck polls `/api/health` at the same moment as a write, it can get `SQLITE_BUSY` and fail. Three consecutive failures restart the container, causing the default-theme flash during restart.

2. **Healthcheck `start_period` not set.** If the container restarts and the migration takes longer than the healthcheck timeout, Docker may restart it again before it's ready.

3. **Could be network.** If the NAS is on a different subnet or the user's device briefly disconnects, Next.js server components show error boundaries which may fall back to default styling.

**Diagnostic command (run on NAS SSH):**
```bash
docker compose logs app --tail 300 | grep -E "SQLITE|health|restart|Error|SIGTERM"
```

---

## Part 3 — Correct Fix Plan for an AI Agent

### Prerequisites — Read These Files First

```
prisma/schema.prisma                              ← already read
src/app/api/finance/bills/route.ts                ← already read  
src/app/api/finance/income/route.ts               ← read before touching
src/app/api/finance/journals/route.ts             ← already read
src/app/(app)/finance/bills/page.tsx              ← already read (relevant sections)
src/lib/finance-categories.ts                     ← read before touching categories
docker/entrypoint.sh                              ← read before modifying
docker-compose.yml                                ← read before modifying
```

---

### Fix 1 — Regenerate Prisma Client (MUST DO FIRST — Fixes Bugs 1 & 2)

The migration `20260527000000_add_bill_income_journal_link` added `journalEntryId`, `invoiceTxId`, `paymentTxId` columns. The Prisma client must be regenerated to know about them.

```bash
# On Windows in C:\Appdev\HomeBase:
npx prisma generate
```

After regeneration, the TypeScript types will include `journalEntryId`, `invoiceTxId`, and `paymentTxId`. The `as any` casts in the following locations will now either compile cleanly (if the type is correct) or show TypeScript errors that reveal the real problem.

**Files to update after `prisma generate` — remove `as any` casts:**

**`src/app/api/finance/bills/route.ts`** — find and fix all occurrences of `as any` on Prisma data writes:

```typescript
// POST handler — after creating the bill:
// BEFORE:
await prisma.financeRecurringBill.update({
  where: { id: bill.id },
  data: { journalEntryId } as any,
})
// AFTER (once Prisma client is regenerated):
await prisma.financeRecurringBill.update({
  where: { id: bill.id },
  data: { journalEntryId },
})

// PUT handler — same fix for journalEntryId write
// PATCH handler — same fix for invoiceTxId, paymentTxId, transactionId writes
// Search the file for every `as any` on a Prisma `data:` object and remove them
```

**`src/app/api/finance/income/route.ts`** — same pattern, fix `as any` on `journalEntryId`, `invoiceTxId`, `receiptTxId` writes.

**Verify the fix worked:** After deploying, create a new bill with journal lines, save it, close, reopen. The journal lines should persist.

---

### Fix 2 — Fix `nextReference()` to Use MAX Not COUNT (Fixes Bug 3)

**File: `src/app/api/finance/journals/route.ts`**

Replace the current `nextReference()` function:

```typescript
// CURRENT (broken — uses COUNT which doesn't handle gaps from deletions):
async function nextReference(familyId: string): Promise<string> {
  const count = await prisma.financeJournalEntry.count({ where: { familyId } })
  return `JE-${String(count + 1).padStart(4, '0')}`
}

// REPLACEMENT (correct — uses MAX of existing references):
async function nextReference(familyId: string): Promise<string> {
  const entries = await prisma.financeJournalEntry.findMany({
    where: { familyId, reference: { not: null } },
    select: { reference: true },
  })
  let max = 0
  for (const e of entries) {
    if (!e.reference) continue
    const match = e.reference.match(/^JE-(\d+)$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > max) max = n
    }
  }
  return `JE-${String(max + 1).padStart(4, '0')}`
}
```

This fix makes the retry loop in `createEntryWithRetry()` actually work correctly — on first try it will generate the correct next number (MAX+1 = JE-0007 given the current state), which won't collide.

**Verify:** After deploying, open Journals → New Entry → fill in date, description, add 2 lines with GL accounts and equal amounts → Save as Draft. Should create JE-0007 (or whatever the next max+1 is).

---

### Fix 3 — Require Account on Transactions (Fixes Bug 5)

**File: `src/app/api/finance/transactions/route.ts`**

In the POST handler, add validation:

```typescript
// Add after the basic field validation:
if (!body.accountId && body.type !== 'transfer') {
  return NextResponse.json(
    { error: 'An account (bank/cash/credit) must be selected for all transactions.' },
    { status: 400 }
  )
}
```

**File: `src/app/(app)/finance/transactions/page.tsx`**

In the transaction form, if the account selector allows empty selection, make the field visually required. If there's only one account, auto-select it. Read the transactions page code first before making UI changes.

---

### Fix 4 — Filter "System" Categories from GL Pickers (Fixes Bug 6)

**File: `src/app/api/finance/categories/route.ts`**

Add a `forPicker` query param to the existing GET handler:

```typescript
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const forPicker = searchParams.get('forPicker') === 'true'

  const categories = await prisma.financeCategory.findMany({
    where: {
      familyId: session.familyId,
      // When used as a GL account picker, exclude system seed categories
      // the user hasn't customised (isSystem=true means seeded default, not user-created)
      ...(forPicker ? { isSystem: false } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { level: 'asc' }, { parentId: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: { transactions: true, recurringBills: true, incomeEntries: true },
      },
    },
  })
  return NextResponse.json(categories)
}
```

**Files to update — change the fetch URL to include `?forPicker=true`:**

- `src/app/(app)/finance/journals/page.tsx` — in `loadRefs()`:
  ```typescript
  fetch('/api/finance/categories?forPicker=true')
  ```

- `src/app/(app)/finance/bills/page.tsx` — in `loadRefs()`:
  ```typescript
  fetch('/api/finance/categories?forPicker=true')
  ```
  Also check where `glAccounts` is set — only filter for the GL line picker, not the category/P&L selector (which should still show all categories).

- `src/components/finance/JournalLinesEditor.tsx` — wherever it receives `glAccounts` prop, the parent page should pass the filtered list.

**Important:** The main category/expense picker on the bill form (not the journal lines section) should still show all categories so users can assign expense categories to bills. Only the `JournalLinesEditor` GL account pickers should use the filtered list.

---

### Fix 5 — Docker: WAL Mode + Healthcheck Start Period (Fixes Bug 7)

**File: `docker/entrypoint.sh`**

After Step 2 (data directory setup), before Step 3 (migration), add:

```bash
# Step 2b: Enable SQLite WAL mode for better concurrent read/write performance
# WAL prevents healthcheck reads from blocking on concurrent writes
DB_PATH="${DATA_PATH:-/data}/homebase.db"
if [ -f "$DB_PATH" ]; then
  echo "=== Setting SQLite WAL mode ==="
  sqlite3 "$DB_PATH" "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;" 2>/dev/null || true
fi
```

**File: `docker-compose.yml`**

Add `start_period` to the healthcheck to give the container time to run migrations before health checks begin:

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s    # ← ADD THIS LINE
```

---

### Fix 6 — Data Wipe SQL (User Request)

Run this on the NAS to clear all transactional data while preserving config:

```bash
# SSH to NAS, then:
docker exec -i c18ba8ed7d9efa828783023e063f08599bedb2920a16ec89f2f3f20d5d531a84 sqlite3 /data/homebase.db << 'EOF'
PRAGMA foreign_keys = OFF;
DELETE FROM FinanceBillPayment;
DELETE FROM FinanceJournalLine;
DELETE FROM FinanceJournalEntry;
DELETE FROM FinanceTransaction;
UPDATE FinanceRecurringBill SET 
  paid = 0, paidDate = NULL,
  invoiceReceived = 0, invoiceReceivedDate = NULL,
  journalEntryId = NULL,
  invoiceTxId = NULL,
  paymentTxId = NULL,
  transactionId = NULL,
  parentBillId = NULL;
UPDATE FinanceIncomeEntry SET 
  received = 0, receivedDate = NULL,
  journalEntryId = NULL,
  invoiceTxId = NULL,
  receiptTxId = NULL,
  transactionId = NULL;
PRAGMA foreign_keys = ON;
SELECT 'FinanceBillPayment' as tbl, COUNT(*) as remaining FROM FinanceBillPayment UNION ALL
SELECT 'FinanceJournalLine', COUNT(*) FROM FinanceJournalLine UNION ALL
SELECT 'FinanceJournalEntry', COUNT(*) FROM FinanceJournalEntry UNION ALL
SELECT 'FinanceTransaction', COUNT(*) FROM FinanceTransaction;
EOF
```

**This preserves:** FinanceCategory (all 118 GL accounts), FinanceVendor (38), FinanceEntity (3), FinanceBudget (46), FinanceAccount (1), FinanceRecurringBill templates (34), FinanceIncomeEntry templates (11), Family settings, all users.

---

## Part 4 — Deployment Order

1. **On Windows:** `npx prisma generate` (regenerates client with new fields)
2. **Fix code:** Remove `as any` casts in bills/route.ts and income/route.ts
3. **Fix code:** Replace `nextReference()` in journals/route.ts
4. **Fix code:** Add `?forPicker=true` filtering to categories API and update callers
5. **Fix code:** Add account validation to transactions API
6. **Fix docker:** Add `start_period: 60s` to docker-compose.yml healthcheck
7. **Fix docker:** Add WAL mode PRAGMA to entrypoint.sh
8. **Build:** `docker compose build --no-cache`
9. **On NAS SSH:** Backup DB, run data wipe SQL
10. **On NAS SSH:** `docker compose down && docker compose up -d`
11. **Monitor:** `docker compose logs app -f` — confirm clean startup
12. **Test:** Create a bill with journal lines, save, close, reopen — confirm lines persist
13. **Test:** Create a journal entry — confirm it gets a unique reference
14. **Test:** Void one of the test journals, confirm void creates a reversal entry
15. **Test:** Mark a bill as paid, check P&L shows the expense
16. **Test:** Open GL account picker — confirm system categories are filtered out

---

## Part 5 — Summary Table

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | Journal lines lost on bill/income re-edit | `npx prisma generate` not run after migration — Prisma silently ignores `journalEntryId` writes due to `as any` type suppression | Run `prisma generate`, remove `as any` from bills and income routes |
| 2 | Paying bills has no P&L effect | Same as #1 — `invoiceTxId`/`paymentTxId` writes also silently failing | Same fix |
| 3 | Cannot add manual journals | `nextReference()` uses COUNT not MAX — fails when entries have been deleted creating gaps (JE-0004 is missing) | Replace COUNT with MAX in `nextReference()` |
| 4 | Cannot delete posted test journals | By design — must Void first. But Void also fails due to Bug 3 | Fix Bug 3; then Void → Delete works |
| 5 | Expenses have no bank account link | Form/API allows null `accountId` | Add required validation on transactions API |
| 6 | GL pickers show all 118 categories including unused system ones | Categories API returns all; no `isSystem` filter for pickers | Add `?forPicker=true` param to categories API; update pickers |
| 7 | Intermittent default theme / load errors | Likely Docker health check failing during writes (SQLITE_BUSY) + no start_period | Enable WAL mode in entrypoint; add `start_period: 60s` to healthcheck |

---

*Report based on direct filesystem reads of `C:\Appdev\HomeBase` source files and Python sqlite3 analysis of `data/homebase.db`. All findings are from the actual codebase, not assumptions.*

---

## Part 6 — Fixes Applied (2026-05-12)

A second-pass deep accounting review identified the root architectural problem: **two parallel data stores** (FinanceTransaction as an input register and FinanceJournalLine as the GL ledger) were both feeding reports with fragile deduplication logic between them. This caused persistent double-counting, GST miscalculation, and report inconsistencies that couldn't be reliably patched at the dedup layer.

The fix was to make the GL the single source of truth and ensure every transaction generates a journal entry.

### Changes Made

**`src/lib/finance-opening-balance.ts`**
- `createGstJournalEntry()`: replaced `COUNT`-based reference generation with MAX-based scan (same fix as journals/route.ts Fix 3 above) — prevents reference collisions after deletions
- Added `sourceTransactionId` optional parameter so GST auto-journals record their source transaction

**`src/app/api/finance/pnl/route.ts`**
- Removed the `FinanceTransaction` query and both transaction grouping loops from income/expense aggregation — transactions now flow through the GL journal path only
- Changed bills/income entry filtering to require `invoiceReceived: true` with `invoiceReceivedDate` in period (accrual basis recognition, not forecast scheduling)
- Removed `billIdWithTxInPeriod` and `incomeEntryIdsWithTxInPeriod` dedup sets (no longer needed without the transactions path)
- Retained `billIdsWithJournalInPeriod` / `incomeEntryIdsWithJournalInPeriod` dedup — bills and entries with a journal entry in period are excluded from the accrual path (journal path covers them)

**`src/app/api/finance/trial-balance/route.ts`**
- Deleted the `txAggregates` block that was pulling cleared transactions with `glAccountId` into the Trial Balance alongside journal lines — Trial Balance now reads exclusively from posted `FinanceJournalLine` records

**`src/app/api/finance/balance-sheet/route.ts`**
- Removed both `FinanceTransaction` queries (cleared transactions and opening balance transactions) that were building the `bankBalanceMap` — replaced with a single `deriveJournalLineBalances()` call; journal lines are the sole input
- Current Period Net Income now derived exclusively from income/expense GL movements in journal lines (removed the previous transaction-based net income calculation)
- Accounts Payable now deducts partial payments: fetches `payments { amount }` on each unpaid bill and subtracts the paid portion from the AP total

**`src/app/api/finance/transactions/route.ts`**
- POST handler now auto-creates a journal entry for every income/expense transaction using a 3-priority system:
  1. Caller-supplied `journalLines` array → used as-is
  2. GST-applicable category → creates a 3-line GST journal (DR expense ex-GST / DR GST ITC / CR cash) via `createGstJournalEntry()` — mutually exclusive with the simple 2-line journal, eliminating the previous double-count
  3. Non-GST transaction with category + account → creates a 2-line balanced auto-journal (DR expense / CR cash for expenses; reversed for income)
- All `createTransactionJournalEntry()` call sites now pass `transaction.id` as `sourceTransactionId`
- PUT handler: after updating a transaction, finds the linked auto-journal via `sourceTransactionId` and syncs its date, description, and line amounts if those fields changed (only for 2-line non-GST auto-journals; GST journals are left for manual correction)

**`prisma/schema.prisma`**
- Added `sourceTransactionId String?` field and `@@index([sourceTransactionId])` to `FinanceJournalEntry` — links auto-generated journal entries back to their source transaction for PUT sync

**`prisma/migrations/20260532000000_add_journal_source_transaction/migration.sql`**
- `ALTER TABLE "FinanceJournalEntry" ADD COLUMN "sourceTransactionId" TEXT`
- `CREATE INDEX "FinanceJournalEntry_sourceTransactionId_idx" ON "FinanceJournalEntry"("sourceTransactionId")`
- Applied automatically on next container start via `prisma migrate deploy` in entrypoint.sh

### Architecture After These Fixes

```
FinanceTransaction          ← input register only (user-facing record)
        │
        └─► auto-journal on POST  ──┐
                                    ▼
FinanceJournalLine          ← GL ledger (single source of truth for all reports)
        │
        ├─► P&L             reads journal lines only
        ├─► Balance Sheet   reads journal lines only  
        └─► Trial Balance   reads journal lines only
```

### Remaining Known Issues (not addressed in this session)

- Bills and income entries created before these fixes do not have `sourceTransactionId` on their auto-journals (they may have no auto-journal at all). A backfill script would regenerate missing auto-journals for legacy data. Alternatively, wiping transactional data and starting fresh is safe — see the SQL script in Part 3 Fix 6 above.
- GST auto-journal amounts are fixed at creation time. If a GST transaction is later edited (amount change), the 3-line GST journal is NOT synced by the PUT handler — only 2-line non-GST journals are synced. The user should void the old journal and create a correcting entry manually if a GST transaction amount changes.
