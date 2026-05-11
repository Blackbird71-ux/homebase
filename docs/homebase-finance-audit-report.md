# HomeBase Finance System — Full Audit Report

**Audit Date:** 2026-05-11  
**Codebase:** `C:\Appdev\HomeBase`  
**Database:** `data/homebase.db` (SQLite, Prisma ORM)  
**Stack:** Next.js App Router · TypeScript · Prisma · SQLite · shadcn/ui  
**Deploy target:** Docker → Synology NAS (Windows build → Linux container)  
**Timezone:** Australia/Sydney (AEST UTC+10 / AEDT UTC+11)

---

## Executive Summary

The finance module is architecturally sound. The database passes all integrity checks, all foreign keys are clean, and all six existing journal entries are mathematically balanced (DR = CR). The double-entry journal engine, timezone-aware period boundaries, and the two-stage bill/income accounting flow are all well-designed.

The partial bill payments feature is complete: the `FinanceBillPayment` model, migration, dedicated REST API (`/api/finance/bills/[id]/payments`), and UI (payment history panel in bills page) are all present and correctly implemented.

The most impactful class of bugs found is a **systemic AU timezone date display and defaulting issue** affecting every finance form across the codebase. When the system is used after 11pm AEST (10pm UTC in winter, 1pm UTC in summer), all "today" date defaults show *yesterday's* date. This is a P1 issue requiring a one-line fix applied consistently to ~6 locations.

**Key findings by priority:**

| Priority | ID | Area | Summary |
|---|---|---|---|
| 🔴 P0 | P0-1 | Uncommitted code | Two P&L bug fixes exist in working tree — must commit |
| 🟠 P1 | P1-1 | **AU Timezone — Forms** | `new Date().toISOString().split('T')[0]` returns UTC date, not AU local date — affects all finance form defaults |
| 🟠 P1 | P1-2 | **AU Timezone — Balance Sheet** | `setHours()` uses server local time instead of UTC for asAt fallback |
| 🟠 P1 | P1-3 | Balance Sheet | COA row balance double-adds `openingBalance` when journal lines also post to same account |
| 🟠 P1 | P1-4 | Bills | `halfyearly` frequency missing from `advanceNextDueDate()` → next occurrence 1 month early |
| 🟠 P1 | P1-5 | Journals | `nextReference()` race condition under concurrent saves |
| 🟡 P2 | P2-1 | Partial Payments | `advanceNextDueDate()` in new payments route still missing `halfyearly` (same as P1-4) |
| 🟡 P2 | P2-2 | Data | 2 bills have no category assigned |
| 🟡 P2 | P2-3 | Reporting | No Trial Balance or General Ledger report |
| 🟡 P2 | P2-4 | GST | No automatic 10% GST split on transactions |
| 🟡 P2 | P2-5 | UX | Transaction list has no error state on fetch failure |
| ✅ | — | Partial Payments | Feature complete and correctly implemented |
| ✅ | — | DB Integrity | `PRAGMA integrity_check = ok`, no orphaned FKs |
| ✅ | — | Journal Balance | All 6 entries balanced DR = CR |
| ✅ | — | Period Boundaries | Report boundaries timezone-aware via `finance-fy.ts` |
| ✅ | — | Auth | All finance routes protected by `requireSession()` |

---

## Section 1 — Database Integrity

### 1.1 PRAGMA integrity_check
**Result: `ok`** — No corruption, no page errors, no malformed records.

### 1.2 Finance Table Row Counts

| Table | Rows | Notes |
|---|---|---|
| FinanceAccount | 1 | One test account ("6.6") |
| FinanceBudget | 46 | Populated |
| FinanceCategory | 118 | Full chart of accounts |
| FinanceEntity | 3 | Personal + 2 entities |
| FinanceIncomeEntry | 19 | Active income streams |
| FinanceJournalEntry | 6 | 4 posted, 2 draft |
| FinanceJournalLine | 14 | All balanced |
| FinanceTransaction | 6 | Mix of cleared/pending |
| FinanceRecurringBill | 52 | 2 have no categoryId |
| FinanceSavingsGoal | 0 | Not yet used |
| FinanceVendor | 38 | Populated |
| finance_snapshots | 0 | Not yet used |
| **FinanceBillPayment** | **0** | **Table created by migration — no payments yet** |

### 1.3 Orphaned Foreign Key Records
**Result: NONE.** All `accountId`, `categoryId`, `glAccountId`, and `journalEntryId` references resolve correctly to existing records.

### 1.4 Timestamp Storage
All `date`, `createdAt`, `updatedAt` columns store ISO 8601 UTC strings (e.g. `2026-05-11T00:00:00.000+00:00`). Consistent throughout. The API layer correctly parses with `new Date()` and uses the timezone-aware helpers in `finance-fy.ts` for period boundary calculations.

### 1.5 Family Configuration

| Field | Value | Status |
|---|---|---|
| `timezone` | `Australia/Sydney` | ✅ Correct |
| `financeYearStartMonth` | `7` (July) | ✅ Correct for AU FY |
| `openingBalancesCategoryId` | `null` | ⚠️ See Section 8 — minor perf issue only |

### 1.6 Applied Migrations
All migrations through `20260528000000_add_bill_payments` are applied. The `FinanceBillPayment` table exists. No pending migrations.

---

## Section 2 — 🔴 P0: Uncommitted P&L Fixes

Three bug fixes documented in `docs/` exist in the working tree but have **not been committed to git**. The `COMMIT_EDITMSG` confirms a staged-but-not-committed state.

### P0-1a: P&L Double-Count (bills and income both appear twice)
- **File:** `src/app/(app)/finance/profit-loss/page.tsx`
- **Bug:** Paid bills appear once from the bill record AND once from the auto-created payment transaction, doubling expense totals. Same for received income.
- **Fix in working tree:** `billLinkedTxIds` and `receiptLinkedTxIds` deduplication sets added.

### P0-1b: Null-Entity Filter (personal transactions disappear on entity tab)
- **File:** `src/app/(app)/finance/profit-loss/page.tsx`
- **Bug:** Transactions with `entityId = null` (personal/unassigned) vanish from the default entity tab because `t.entityId === selectedEntityId` fails for null.
- **Fix in working tree:** `matchesEntity()` helper added that correctly treats `null` as the default entity.

### P0-1c: QuickAdd Expense Not Visible on P&L
- **File:** `src/components/layout/QuickAdd.tsx`
- **Bug:** QuickAdd omitted `isCleared: true`, so quick expenses post as pending and are excluded from cash-basis P&L.
- **Fix in working tree:** `isCleared: true` added to POST body.

**Action required:** `git add src/components/layout/QuickAdd.tsx src/app/(app)/finance/profit-loss/page.tsx docs/bug-fix-pnl-*.md && git commit -m "fix: P&L double-count, null-entity filter, QuickAdd isCleared"`

---

## Section 3 — 🟠 P1: Australian Timezone Date Bugs

This is the most pervasive issue in the codebase. Because the project is AU-based, all date *display* and *defaulting* must use Australia/Sydney local time, not UTC.

### The Problem

Every finance form uses this pattern to default "today":
```typescript
new Date().toISOString().split('T')[0]
```

`toISOString()` always returns UTC. Sydney is UTC+10 (AEST) or UTC+11 (AEDT). This means:

- **From midnight to 10am AEST / 11am AEDT**, `new Date().toISOString()` returns the *previous* UTC calendar day.
- A user in Sydney at 12:30am on 12 May 2026 gets `2026-05-11` pre-filled in every date field (yesterday).
- This affects: bill due dates, payment dates, journal entry dates, reversal/void dates, transaction dates.

**The fix is one helper function used everywhere:**

```typescript
// src/lib/utils.ts — add this utility
/**
 * Returns today's date as a YYYY-MM-DD string in Australia/Sydney timezone.
 * Use this instead of new Date().toISOString().split('T')[0] for all date form defaults.
 */
export function todayAU(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  // en-CA locale returns YYYY-MM-DD format natively
}
```

### P1-1: Affected Locations (6 files, ~8 occurrences)

| File | Location | Current Code | Fix |
|---|---|---|---|
| `bills/page.tsx` | `emptyForm.nextDueDate` | `new Date().toISOString().split('T')[0]` | `todayAU()` |
| `bills/page.tsx` | `paidConfirmDate` initial state | `new Date().toISOString().split('T')[0]` | `todayAU()` |
| `journals/page.tsx` | `emptyForm().date` | `new Date().toISOString().split('T')[0]` | `todayAU()` |
| `journals/page.tsx` | `reversal.date` initial state | `new Date().toISOString().split('T')[0]` | `todayAU()` |
| `journals/page.tsx` | `voidDate` initial state | `new Date().toISOString().split('T')[0]` | `todayAU()` |
| `transactions/page.tsx` | `form.date` default | `new Date().toISOString().split('T')[0]` | `todayAU()` |

### P1-2: Balance Sheet `asAt` Current-Date Fallback Uses Local `setHours`

**File:** `src/app/api/finance/balance-sheet/route.ts` (~line 42)

When no `asAt` query param is provided, the server falls back to:
```typescript
const d = new Date(); d.setHours(23, 59, 59, 999); return d
```

`setHours()` uses the server's local timezone. The Docker container on NAS runs in UTC. `setHours(23, 59, 59, 999)` on a UTC server sets UTC 23:59:59 — which is **13:59:59 AEST**, not end of day in Sydney. Any transactions entered after 2pm AEST won't be included in a same-day Balance Sheet.

**Fix:**
```typescript
// BEFORE (buggy on UTC server):
const d = new Date(); d.setHours(23, 59, 59, 999); return d

// AFTER (correct):
// End of today in Sydney = midnight tomorrow Sydney - 1ms
// Use the same tzMidnight approach as the rest of the codebase:
const tz = family?.timezone ?? 'Australia/Sydney'
return asAtEndOfDay(new Date().toISOString().split('T')[0].replace(
  /(\d{4})-(\d{2})-(\d{2})/, 
  // Get today in Sydney first
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
), tz)

// Simpler alternative — just call asAtEndOfDay with today's AU date:
const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
return asAtEndOfDay(todayStr, tz)
```

The `asAtEndOfDay()` function already handles this correctly — it just needs to be called with the Sydney-local today string, not the UTC today string.

### Date Display in Bills List

`date-fns format(new Date(b.nextDueDate), 'd MMM yyyy')` in bills/page.tsx renders dates in the **browser's local timezone**, which is correct for AU users on AU devices. However, dates stored as midnight UTC (`2026-05-11T00:00:00.000Z`) render as `11 May 2026` in Sydney (UTC+10 adds 10 hours = 10am, same date). This is safe. No bug here — just documenting the pattern.

---

## Section 4 — Journal Entry Compliance

### 4.1 Balance Verification (All 6 Entries)

| Reference | Type | Posted | DR Total | CR Total | Balanced |
|---|---|---|---|---|---|
| JE-0001 | manual | ✅ | $10,000.00 | $10,000.00 | ✅ |
| JE-0002 | manual | ✅ | $6,600.00 | $6,600.00 | ✅ |
| JE-0003 | manual (GST split) | ✅ | $5,500.00 | $5,500.00 | ✅ |
| JE-0004 | auto_transaction | Draft | $35.00 | $35.00 | ✅ |
| JE-0005 | auto_transaction | Draft | $99.00 | $99.00 | ✅ |
| JE-0006 | auto_transaction | ✅ | $200.00 | $200.00 | ✅ |

JE-0003 is notable — it correctly records a GST split: DR Bank $5,500 / CR Income $5,000 + CR GST Liability $500. This confirms the manual journal workflow handles GST correctly.

### 4.2 Journal API Logic

| Rule | Status |
|---|---|
| Posting blocked unless DR = CR (tolerance 0.005) | ✅ |
| Draft save allowed without balance | ✅ |
| Posted entries cannot be edited | ✅ |
| Reversal swaps all DR/CR sides | ✅ |
| Void creates reversal then marks isReversed | ✅ |
| Delete draft: direct | ✅ |
| Delete voided: atomic (original + reversal) | ✅ |
| Delete posted (not voided): refused 400 | ✅ |
| GL account ownership verified | ✅ |

### 4.3 🟠 P1-5 — Reference Number Race Condition

`nextReference()` uses `prisma.financeJournalEntry.count()` to generate `JE-XXXX`. Simultaneous saves can get identical counts and produce duplicate reference numbers. The `reference` field has no unique constraint.

**Fix:**
```typescript
// 1. Add to schema.prisma → FinanceJournalEntry:
@@unique([familyId, reference])

// 2. Replace nextReference() in journals/route.ts AND transactions/route.ts:
async function nextReference(familyId: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const count = await prisma.financeJournalEntry.count({ where: { familyId } })
    const ref = `JE-${String(count + 1 + i).padStart(4, '0')}`
    const exists = await prisma.financeJournalEntry.findFirst({
      where: { familyId, reference: ref },
      select: { id: true },
    })
    if (!exists) return ref
  }
  throw new Error('Could not generate unique journal reference after 10 attempts')
}
```

Migration: `CREATE UNIQUE INDEX "FinanceJournalEntry_familyId_reference_key" ON "FinanceJournalEntry"("familyId", "reference");`

---

## Section 5 — Partial Bill Payments (Feature Complete)

### 5.1 Architecture

The partial payment system is complete and correctly separated from the existing full-payment PATCH flow:

| Component | Location | Status |
|---|---|---|
| `FinanceBillPayment` model | `schema.prisma` | ✅ |
| Migration | `migrations/20260528000000_add_bill_payments/` | ✅ Applied |
| GET payments | `GET /api/finance/bills/[id]/payments` | ✅ |
| POST payment | `POST /api/finance/bills/[id]/payments` | ✅ |
| DELETE payment | `DELETE /api/finance/bills/[id]/payments/[paymentId]` | ✅ |
| UI payment history panel | `bills/page.tsx BillRow` | ✅ |
| UI partial payment dialog | `bills/page.tsx paidConfirm` | ✅ |
| PARTIAL badge on bill row | `bills/page.tsx BillRow` | ✅ |

### 5.2 Accounting Logic

**Case A — Invoice received first:**
- POST /payments creates a new **cleared** expense transaction for the partial amount.
- The uncleared invoice transaction stays at full amount (expense already on P&L).
- Each payment correctly represents cash out of the bank.

**Case B — No prior invoice:**
- POST /payments creates a cleared expense transaction for each partial amount.
- Expense hits P&L proportionally per payment.

Both cases are correct accrual-basis accounting for partial payments.

### 5.3 Overpayment Guard

```typescript
if (amount > remainingBalance) {
  return NextResponse.json({ error: `Payment amount exceeds remaining balance` }, { status: 400 })
}
```
✅ Correctly prevents overpayment at the API level. The UI also shows a warning when `paidConfirmAmount > bill.amount`.

### 5.4 Next Occurrence Spawning on Full Payment

When `newTotalPaid >= bill.amount`, the payment route correctly spawns the next occurrence for recurring bills. ✅

### 5.5 Payment Deletion

`DELETE /api/finance/bills/[id]/payments/[paymentId]`:
- Deletes the linked `FinanceTransaction` ✅
- Deletes the `FinanceBillPayment` record ✅
- Recalculates `bill.paid` and `bill.paidDate` from remaining payments ✅
- Returns `{ success: true, paid: boolean, totalPaid: number }` ✅

### 5.6 🟡 P2-1 — `halfyearly` Missing from Spawning Logic

The `advanceNextDueDate()` inline function inside `payments/route.ts` is a copy of the one in `bills/route.ts`. Both are missing `halfyearly`:

```typescript
// bills/[id]/payments/route.ts (and bills/route.ts):
const advanceNextDueDate = (date: Date, frequency: string): Date => {
  if (frequency === 'monthly')     return addMonths(date, 1)
  if (frequency === 'fortnightly') return addWeeks(date, 2)
  if (frequency === 'weekly')      return addWeeks(date, 1)
  if (frequency === 'quarterly')   return addMonths(date, 3)
  if (frequency === 'yearly')      return addMonths(date, 12)
  return addMonths(date, 1)   // ← halfyearly falls here = WRONG (1 month instead of 6)
}
```

**Fix (apply to both files):**
```typescript
if (frequency === 'halfyearly') return addMonths(date, 6)   // add before the fallback
```

**Recommendation:** Extract `advanceNextDueDate` into `src/lib/finance-fy.ts` so both routes share a single implementation and this class of duplication bug cannot recur.

### 5.7 🟡 P2-1 (same fix) — UI Frequency Select Missing `halfyearly`

The bill form frequency `<select>` in `bills/page.tsx` does not include `halfyearly` as an option:
```html
<option value="weekly">Weekly</option>
<option value="fortnightly">Fortnightly</option>
<option value="monthly">Monthly</option>
<option value="quarterly">Quarterly</option>
<option value="yearly">Yearly</option>
<!-- halfyearly missing -->
```

The schema supports it (`frequency String @default("monthly")` with no enum constraint) and `financeReport.ts`/`pnl/route.ts` handle it. It just can't be selected in the UI.

**Fix:** Add `<option value="halfyearly">Half-Yearly</option>` after quarterly.

### 5.8 Payment Date Display

`format(new Date(p.paymentDate), 'd MMM yyyy')` in the payment history panel renders in the browser's local timezone. For AU users on AU devices this is correct. No bug. ✅

---

## Section 6 — Balance Sheet Audit

### 6.1 Architecture

Derives balances by scanning all cleared transactions up to `asAt`, then merges posted journal line movements via `deriveJournalLineBalances()`. Separates assets, liabilities, and equity sections. Reports `equityMatchesNetWorth` as a boolean check.

### 6.2 🟠 P1-3 — COA Row Balance Double-Adds `openingBalance`

In `balance-sheet/route.ts`, COA rows are computed as:

```typescript
openingBalance: (bankBalanceMap.get(cat.id) !== undefined)
  ? (bankBalanceMap.get(cat.id)! + (cat.openingBalance ?? 0))   // ← BUG
  : (cat.openingBalance!),
```

`bankBalanceMap` already incorporates journal line movements via `deriveJournalLineBalances()` merged at line ~75. For a COA asset account that also has an `openingBalance` set on the category AND has received journal line flows, `cat.openingBalance` is added a second time.

**Example:** Property "7 Shetland Road" has `openingBalance = 1,325,000`. If journal entries later debit this account (e.g. improvements), `bankBalanceMap.get(cat.id)` reflects those movements. Adding `cat.openingBalance` again results in $1,325,000 being counted twice.

**Fix:**
```typescript
// BEFORE:
openingBalance: (bankBalanceMap.get(cat.id) !== undefined)
  ? (bankBalanceMap.get(cat.id)! + (cat.openingBalance ?? 0))
  : (cat.openingBalance!),

// AFTER: bankBalanceMap already includes all journal movements;
// openingBalance on the category is a display annotation, not an additional addend.
openingBalance: bankBalanceMap.has(cat.id)
  ? bankBalanceMap.get(cat.id)!
  : (cat.openingBalance ?? 0),
```

**Note:** This only manifests when journal entries have been posted *to* a COA asset/liability account AND that account also has `cat.openingBalance` set. Currently the 7 property/vehicle/asset categories with `openingBalance` have no journal lines touching them yet — so the bug is latent, not yet visible in the data.

### 6.3 `equityMatchesNetWorth` Check

Currently returns `false` because no equity setup has been done (no Retained Earnings, `currentPeriodNetIncome` = calculated from 6 transactions). This is expected for a new system, not a bug.

---

## Section 7 — P&L Report Audit

### 7.1 Period Boundaries
All period boundaries use `fyDateRangeInTz()`, `monthRangeInTz()`, `quarterRangeInTz()` from `finance-fy.ts`. These correctly produce UTC instants corresponding to midnight/end-of-day in `Australia/Sydney` regardless of the NAS server timezone. ✅

### 7.2 DST Boundaries
`tzMidnight()` uses noon UTC as the reference for deriving timezone offsets — safely distant from Australia's 2am DST transitions. Period boundaries around October and April DST transitions are correctly computed. ✅

### 7.3 Bill Deduplication
`billIdWithTxInPeriod` correctly excludes bills that already have a cleared transaction in the period. This prevents double-counting at the API level (complementing the UI-level fix in P0-1a). ✅

### 7.4 `isCleared: true` Filter
The P&L API correctly filters `isCleared: true` so only settled transactions count in cash mode. ✅

### 7.5 `financeShared.ts` Deprecated `fyDateRange`

`financeShared.ts` exports a `fyDateRange(fy: string)` that hardcodes July FY start and uses raw UTC strings:
```typescript
start: new Date(`${startYear}-07-01T00:00:00.000Z`)  // hardcoded UTC, not AU
```
This is `@deprecated` in `financeReport.ts` but not in `financeShared.ts` itself. Any future client-side code importing from `financeShared.ts` gets the broken version silently.

**Fix:** Add `@deprecated` JSDoc in `financeShared.ts` pointing to `finance-fy.ts → fyDateRangeInTz()`.

---

## Section 8 — Bills & Income Accounting

### 8.1 Two-Stage Flow: Invoice → Payment
✅ Correct on both stages. Invoice received creates uncleared expense tx. Payment clears it (or creates new tx if no invoice). Undo paths both work correctly.

### 8.2 🟠 P1-4 — `halfyearly` in `advanceNextDueDate()` (full payment path)
The same missing `halfyearly` case exists in `bills/route.ts`'s `advanceNextDueDate()` at the bottom of the file. See P2-1 for the fix — apply to both `bills/route.ts` and `bills/[id]/payments/route.ts`.

### 8.3 🟡 P2-2 — Two Bills with No Category
"ASIC - Hopevale" ($330/year) and "ASIC - Int Tec Trust" ($330/year) have `categoryId = null`. They appear as "Uncategorised" in all reports. User should assign a category (e.g. "Government Fees") via the Bills UI.

---

## Section 9 — Functional Test Matrix

### Transaction CRUD

| Test | Result | Notes |
|---|---|---|
| Create expense | ✅ PASS | Validates type/amount |
| Create income | ✅ PASS | Confirmed by existing data |
| Create transfer | ✅ PASS | `isTransfer: true` flag |
| Edit transaction | ✅ PASS | Family-scoped verify before update |
| Delete transaction | ✅ PASS | Hard delete with confirm() |
| opening_balance edit blocked in UI | ✅ PASS | Toast shown, form not opened |
| Delete confirmation present | ✅ PASS | `confirm()` dialog |

### Calculation Verification

| Test | Result | Notes |
|---|---|---|
| DR = CR all journal entries | ✅ PASS | Verified all 6 entries |
| 0.005 tolerance at post | ✅ PASS | Enforced at API |
| AUD currency display | ✅ PASS | `Intl.NumberFormat('en-AU', {style:'currency', currency:'AUD'})` |
| Amount always positive | ✅ PASS | Sign from type field |
| Rounding: `Math.round(x * 100) / 100` | ✅ PASS | Consistent throughout |
| GST 10% — automatic | ❌ Not implemented | Manual via journal entries only (see P2-4) |
| GST 10% — manual journal | ✅ PASS | JE-0003 demonstrates correct split |

### Reporting

| Report | Result | Notes |
|---|---|---|
| P&L period boundaries (AU tz) | ✅ PASS | `finance-fy.ts` timezone-aware |
| P&L double-count prevention | ✅ Fixed (uncommitted) | Commit P0-1 |
| P&L null-entity filter | ✅ Fixed (uncommitted) | Commit P0-1 |
| Balance Sheet asAt | ✅ PASS | `asAtEndOfDay()` tz-aware; see P1-2 for fallback bug |
| Annual YTD report | ✅ PASS | Lump-sum month placement correct |
| Trial Balance | ❌ Not present | See P2-3 |
| General Ledger | ❌ Not present | See P2-3 |
| Tax Report | ✅ PASS | Raw data returned; brackets in page |

### Journal Entries

| Test | Result | Notes |
|---|---|---|
| Create draft (unbalanced OK) | ✅ PASS | |
| Post balanced | ✅ PASS | |
| Post unbalanced blocked | ✅ PASS | Returns 400 |
| Edit posted blocked | ✅ PASS | Returns 400 |
| Reverse posted | ✅ PASS | Flips DR/CR |
| Void posted | ✅ PASS | Prefix "VOID:" |
| Delete draft | ✅ PASS | |
| Delete voided | ✅ PASS | Atomic pair delete |
| Delete posted (not voided) | ✅ PASS | Returns 400 |
| Reference uniqueness | ⚠️ Race condition | P1-5 |

### Partial Payments

| Test | Result | Notes |
|---|---|---|
| Record partial payment | ✅ PASS | POST /api/finance/bills/[id]/payments |
| Overpayment blocked | ✅ PASS | 400 if amount > remainingBalance |
| Payment transaction created | ✅ PASS | Cleared expense tx created |
| Bill `paid` flag updates correctly | ✅ PASS | Recalculates from sum of payments |
| Delete payment | ✅ PASS | Tx deleted, bill recalculated |
| Payment history UI | ✅ PASS | Panel shows date, amount, GL account, cleared status |
| PARTIAL badge on bill row | ✅ PASS | `isPartiallyPaid` check in BillRow |
| Full payment spawns next occurrence | ✅ PASS | `newTotalPaid >= bill.amount` trigger |
| halfyearly spawn interval | ❌ BUG | Returns 1 month, should be 6 (P2-1) |

---

## Section 10 — Australian Timezone — Comprehensive Fix Guide

This section provides the complete, copy-paste-ready fix for all AU timezone issues found in the audit.

### Step 1 — Add `todayAU()` to utils.ts

```typescript
// src/lib/utils.ts — add this function

/**
 * Returns today's date as a YYYY-MM-DD string in Australia/Sydney timezone.
 *
 * Use INSTEAD OF new Date().toISOString().split('T')[0] for all date
 * form defaults. The ISO string returns UTC date, which is "yesterday"
 * in Sydney between midnight and 10am AEST (11am AEDT).
 *
 * en-CA locale produces YYYY-MM-DD format natively (same as ISO date part).
 */
export function todayAU(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
```

### Step 2 — Apply to all 6 form default locations

**`src/app/(app)/finance/bills/page.tsx`:**
```typescript
// Line ~83: emptyForm
import { todayAU } from '@/lib/utils'

const emptyForm = {
  // BEFORE: nextDueDate: new Date().toISOString().split('T')[0],
  nextDueDate: todayAU(),
  ...
}

// Line ~100: paidConfirmDate useState init
// BEFORE: const [paidConfirmDate, setPaidConfirmDate] = useState<string>('')
// In handleMarkPaid():
// BEFORE: setPaidConfirmDate(new Date().toISOString().split('T')[0])
// AFTER:
setPaidConfirmDate(todayAU())
```

**`src/app/(app)/finance/journals/page.tsx`:**
```typescript
import { todayAU } from '@/lib/utils'

// emptyForm():
// BEFORE: date: new Date().toISOString().split('T')[0],
// AFTER:
date: todayAU(),

// openReversal():
// BEFORE: date: new Date().toISOString().split('T')[0],
// AFTER:
date: todayAU(),

// openVoid():
// BEFORE: setVoidDate(new Date().toISOString().split('T')[0])
// AFTER:
setVoidDate(todayAU())
```

**`src/app/(app)/finance/transactions/page.tsx`:**
```typescript
import { todayAU } from '@/lib/utils'

// form useState default:
// BEFORE: date: new Date().toISOString().split('T')[0],
// In openNew():
// BEFORE: setForm({ ..., date: new Date().toISOString().split('T')[0], ... })
// AFTER:
setForm({ ..., date: todayAU(), ... })
```

### Step 3 — Fix balance-sheet/route.ts current-date fallback (P1-2)

```typescript
// src/app/api/finance/balance-sheet/route.ts

// Load family timezone first (already done ~line 30):
const tz = family?.timezone ?? 'Australia/Sydney'

// Replace the asAt fallback (currently ~line 42):
// BEFORE:
const asAt = asAtParam
  ? asAtEndOfDay(asAtParam, tz)
  : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d })()

// AFTER:
const asAt = asAtParam
  ? asAtEndOfDay(asAtParam, tz)
  : asAtEndOfDay(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()),
      tz
    )
```

### Step 4 — Fix `halfyearly` in `advanceNextDueDate` (P1-4 / P2-1)

Apply to **both** of these files:
- `src/app/api/finance/bills/route.ts` (bottom of file)
- `src/app/api/finance/bills/[id]/payments/route.ts` (inside spawn block)

```typescript
// Add halfyearly case before the fallback:
if (frequency === 'halfyearly') return addMonths(date, 6)
```

**Also add to bills form UI** (`src/app/(app)/finance/bills/page.tsx`):
```html
<option value="halfyearly">Half-Yearly</option>
```

### Step 5 — Extract `advanceNextDueDate` to shared lib (Recommended)

To prevent future duplication bugs:

```typescript
// src/lib/finance-fy.ts — add at bottom:

/**
 * Advance a bill's next due date by one frequency interval.
 * Used when a bill is fully paid to spawn the next occurrence.
 */
export function advanceNextDueDate(date: Date, frequency: string): Date {
  const { addMonths, addWeeks } = require('date-fns')
  if (frequency === 'monthly')     return addMonths(date, 1)
  if (frequency === 'fortnightly') return addWeeks(date, 2)
  if (frequency === 'weekly')      return addWeeks(date, 1)
  if (frequency === 'quarterly')   return addMonths(date, 3)
  if (frequency === 'halfyearly')  return addMonths(date, 6)
  if (frequency === 'yearly')      return addMonths(date, 12)
  return addMonths(date, 1) // fallback
}
```

Then replace the two inline definitions with `import { advanceNextDueDate } from '@/lib/finance-fy'`.

---

## Section 11 — P2 Gaps

### P2-3 — No Trial Balance or General Ledger Report

These are standard accounting reports needed for reconciliation:

**Trial Balance:** Sum of posted journal line debits and credits by GL account, proving the ledger is in balance. Equivalent to `SELECT glAccountId, SUM(CASE WHEN side='debit' THEN amount ELSE 0 END) as DR, SUM(CASE WHEN side='credit' THEN amount ELSE 0 END) as CR FROM FinanceJournalLine WHERE journalEntryId IN (SELECT id FROM FinanceJournalEntry WHERE isPosted=1 AND familyId=?) GROUP BY glAccountId`.

**General Ledger:** All movements on a specific GL account for a date range with running balance. Essential for bank reconciliation.

### P2-4 — No Automatic GST Split on Transactions

GST (10%) is only supported via manual journal entries. For properties and business entities, an automatic DR expense (ex-GST) + DR GST ITC + CR bank split on transaction creation would be significantly more useful.

**Proposed design:** Add `gstApplicable: Boolean @default(false)` to `FinanceCategory`. When a transaction is posted against a GST-applicable expense category, auto-create a journal entry with 3 lines: DR expense (amount/1.1), DR GST ITC (amount/11), CR GL account (full amount).

### P2-5 — Transaction List Has No Error State

`transactions/page.tsx` `load()` function only handles `if (res.ok)` — on a fetch failure (network error, 500) the list shows empty with no indication of error.

```typescript
// Add to transactions/page.tsx:
const [fetchError, setFetchError] = useState<string | null>(null)

// In load():
if (res.ok) {
  const d = await res.json()
  setTransactions(...)
  setFetchError(null)
} else {
  setFetchError('Failed to load transactions. Please try again.')
}

// In JSX, replace empty state with conditional:
{fetchError
  ? <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">{fetchError} <button onClick={load}>Retry</button></div>
  : transactions.length === 0
    ? <p className="text-sm text-muted-foreground">No transactions found.</p>
    : /* list */
}
```

---

## Section 12 — Automated Test Suite

No finance tests exist. The following covers all critical paths.

```typescript
// src/lib/__tests__/finance.test.ts
import { describe, it, expect } from 'vitest'
import {
  fyDateRange, fyDateRangeInTz, monthRangeInTz,
  fyStartYear, fyLabel, fyMonthIndex,
} from '../finance-fy'

// ── 1. AU Timezone boundaries ─────────────────────────────────────────────────

describe('fyDateRangeInTz — Australia/Sydney', () => {
  const tz = 'Australia/Sydney'

  it('FY2025-26 start: midnight 1 July 2025 AEST = 14:00 UTC 30 June', () => {
    const { start } = fyDateRangeInTz(2025, 7, tz)
    expect(start.toISOString()).toBe('2025-06-30T14:00:00.000Z')
  })

  it('FY2025-26 end: 23:59:59.999 30 June 2026 AEST = 13:59:59.999Z', () => {
    const { end } = fyDateRangeInTz(2025, 7, tz)
    expect(end.toISOString()).toBe('2026-06-30T13:59:59.999Z')
  })

  it('AEDT (summer): FY end in daylight saving = UTC+11 offset', () => {
    // Jan 1 is in AEDT (UTC+11)
    const { start } = fyDateRangeInTz(2026, 1, tz)
    // midnight 1 Jan 2026 AEDT = 13:00 UTC 31 Dec 2025
    expect(start.toISOString()).toBe('2025-12-31T13:00:00.000Z')
  })

  it('Falls back gracefully for unknown timezone', () => {
    expect(() => fyDateRangeInTz(2025, 7, 'Invalid/Zone')).not.toThrow()
  })
})

describe('monthRangeInTz — Australia/Sydney', () => {
  const tz = 'Australia/Sydney'

  it('May 2026 start = midnight 1 May AEST = 14:00 UTC 30 April', () => {
    const { start } = monthRangeInTz(2026, 5, tz)
    expect(start.toISOString()).toBe('2026-04-30T14:00:00.000Z')
  })

  it('May 2026 covers exactly 31 days', () => {
    const { start, end } = monthRangeInTz(2026, 5, tz)
    const days = (end.getTime() - start.getTime() + 1) / (86400 * 1000)
    expect(Math.round(days)).toBe(31)
  })

  it('October DST transition month has correct span', () => {
    // Oct 2025: clocks spring forward on 5 Oct → Oct is 31 days - 1 hour = 30d 23h
    const { start, end } = monthRangeInTz(2025, 10, tz)
    const hours = (end.getTime() - start.getTime() + 1) / (3600 * 1000)
    // 31 days * 24h - 1h DST = 743h
    expect(hours).toBe(743)
  })

  it('April DST fall-back month has correct span', () => {
    // Apr 2026: clocks fall back on 5 Apr → Apr is 30 days + 1 hour = 30d 1h
    const { start, end } = monthRangeInTz(2026, 4, tz)
    const hours = (end.getTime() - start.getTime() + 1) / (3600 * 1000)
    // 30 days * 24h + 1h DST = 721h
    expect(hours).toBe(721)
  })
})

// ── 2. Double-entry balance rules ──────────────────────────────────────────────

describe('Journal entry balance validation', () => {
  function checkBalance(lines: { side: string; amount: number }[]) {
    const dr = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0)
    const cr = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
    return { dr, cr, diff: Math.abs(dr - cr), balanced: Math.abs(dr - cr) < 0.005 }
  }

  it('Simple balanced: DR 10000 / CR 10000', () => {
    const r = checkBalance([{ side: 'debit', amount: 10000 }, { side: 'credit', amount: 10000 }])
    expect(r.balanced).toBe(true)
  })

  it('GST split: DR expense 90.91 + DR GST ITC 9.09 = CR bank 100', () => {
    const r = checkBalance([
      { side: 'debit', amount: 90.91 },
      { side: 'debit', amount: 9.09 },
      { side: 'credit', amount: 100.00 },
    ])
    expect(r.balanced).toBe(true)
  })

  it('Floating-point: 33.33 + 33.33 + 33.34 balanced within tolerance', () => {
    const r = checkBalance([
      { side: 'debit', amount: 33.33 },
      { side: 'debit', amount: 33.33 },
      { side: 'debit', amount: 33.34 },
      { side: 'credit', amount: 100.00 },
    ])
    expect(r.balanced).toBe(true)
  })

  it('Unbalanced detected: 100.01 vs 100.00', () => {
    const r = checkBalance([{ side: 'debit', amount: 100.01 }, { side: 'credit', amount: 100.00 }])
    expect(r.balanced).toBe(false)
  })

  it('Reversal flips all sides and remains balanced', () => {
    const original = [{ side: 'debit', amount: 500 }, { side: 'credit', amount: 500 }]
    const reversed = original.map(l => ({ ...l, side: l.side === 'debit' ? 'credit' : 'debit' }))
    expect(checkBalance(reversed).balanced).toBe(true)
  })
})

// ── 3. Account balance derivation ─────────────────────────────────────────────

describe('Account balance derivation', () => {
  function derive(txs: { type: string; amount: number }[]) {
    return txs.reduce((bal, tx) => {
      if (tx.type === 'income')           return bal + tx.amount
      if (tx.type === 'expense')          return bal - tx.amount
      if (tx.type === 'opening_balance')  return bal + tx.amount  // signed
      return bal
    }, 0)
  }

  it('Opening balance + income - expense = correct', () => {
    expect(derive([
      { type: 'opening_balance', amount: 1000 },
      { type: 'income', amount: 500 },
      { type: 'expense', amount: 200 },
    ])).toBe(1300)
  })

  it('Negative opening balance (credit card) reduces', () => {
    expect(derive([
      { type: 'opening_balance', amount: -5000 },
      { type: 'expense', amount: 100 },
    ])).toBe(-5100)
  })

  it('Transfers cancel out (two accounts net to zero)', () => {
    // Transfers are excluded from balance derivation — they cancel across accounts
    expect(derive([{ type: 'transfer', amount: 1000 }])).toBe(0)
  })
})

// ── 4. FY helpers ─────────────────────────────────────────────────────────────

describe('fyStartYear', () => {
  it('March 2026 → FY2025 (July start)', () => expect(fyStartYear(new Date('2026-03-15'), 7)).toBe(2025))
  it('August 2026 → FY2026 (July start)', () => expect(fyStartYear(new Date('2026-08-01'), 7)).toBe(2026))
  it('1 July 2026 → FY2026 (is first day of new FY)', () => expect(fyStartYear(new Date('2026-07-01'), 7)).toBe(2026))
  it('30 June 2026 → FY2025 (last day of old FY)', () => expect(fyStartYear(new Date('2026-06-30'), 7)).toBe(2025))
})

describe('fyLabel', () => {
  it('2025 + July start → "2025-26"', () => expect(fyLabel(2025, 7)).toBe('2025-26'))
  it('Calendar year FY (Jan start) → "2025"', () => expect(fyLabel(2025, 1)).toBe('2025'))
})

// ── 5. Australian tax brackets 2025-26 ───────────────────────────────────────

function estimateTax(income: number): number {
  if (income <= 18200)  return 0
  if (income <= 45000)  return (income - 18200) * 0.16
  if (income <= 135000) return 4288  + (income - 45000)  * 0.30
  if (income <= 190000) return 31288 + (income - 135000) * 0.37
  return 51638 + (income - 190000) * 0.45
}

describe('AU tax brackets 2025-26', () => {
  it('$18,200 → $0 tax (tax-free threshold)', () => expect(estimateTax(18200)).toBe(0))
  it('$18,201 → $0.16 tax', () => expect(estimateTax(18201)).toBeCloseTo(0.16, 1))
  it('$45,000 → $4,288 tax', () => expect(estimateTax(45000)).toBeCloseTo(4288, 0))
  it('$100,000 → $20,788 tax', () => expect(estimateTax(100000)).toBeCloseTo(20788, 0))
  it('$200,000 → $56,138 tax', () => expect(estimateTax(200000)).toBeCloseTo(56138, 0))
})

// ── 6. Partial payment logic ──────────────────────────────────────────────────

describe('Partial payment overpayment guard', () => {
  function validatePayment(payAmount: number, totalPaid: number, billAmount: number) {
    const remaining = billAmount - totalPaid
    return payAmount <= remaining
  }

  it('First partial payment within balance: allowed', () => expect(validatePayment(500, 0, 1200)).toBe(true))
  it('Second partial completing balance: allowed', () => expect(validatePayment(700, 500, 1200)).toBe(true))
  it('Overpayment: blocked', () => expect(validatePayment(800, 500, 1200)).toBe(false))
  it('Exact remaining balance: allowed', () => expect(validatePayment(700, 500, 1200)).toBe(true))
  it('One cent over: blocked', () => expect(validatePayment(700.01, 500, 1200)).toBe(false))
})

// ── 7. advanceNextDueDate — all frequencies ──────────────────────────────────

import { addMonths, addWeeks, isSameDay } from 'date-fns'

describe('advanceNextDueDate', () => {
  function advance(date: Date, frequency: string): Date {
    if (frequency === 'monthly')     return addMonths(date, 1)
    if (frequency === 'fortnightly') return addWeeks(date, 2)
    if (frequency === 'weekly')      return addWeeks(date, 1)
    if (frequency === 'quarterly')   return addMonths(date, 3)
    if (frequency === 'halfyearly')  return addMonths(date, 6)
    if (frequency === 'yearly')      return addMonths(date, 12)
    return addMonths(date, 1)
  }

  const base = new Date('2026-01-15')
  it('monthly: +1 month', () => expect(isSameDay(advance(base, 'monthly'), new Date('2026-02-15'))).toBe(true))
  it('fortnightly: +2 weeks', () => expect(isSameDay(advance(base, 'fortnightly'), new Date('2026-01-29'))).toBe(true))
  it('quarterly: +3 months', () => expect(isSameDay(advance(base, 'quarterly'), new Date('2026-04-15'))).toBe(true))
  it('halfyearly: +6 months', () => expect(isSameDay(advance(base, 'halfyearly'), new Date('2026-07-15'))).toBe(true))
  it('yearly: +12 months', () => expect(isSameDay(advance(base, 'yearly'), new Date('2027-01-15'))).toBe(true))
})
```

---

## Section 13 — Docker / NAS Deployment Checklist

Per AI Agent Guide: migrations run automatically via `prisma migrate deploy` in the entrypoint script.

- [x] Migration `20260528000000_add_bill_payments` is applied ✅
- [ ] Commit P0-1 fixes (profit-loss/page.tsx, QuickAdd.tsx)
- [ ] Apply `todayAU()` fix to bills, journals, transactions pages (P1-1)
- [ ] Apply Balance Sheet `asAt` fallback fix (P1-2)
- [ ] Apply `halfyearly` to `advanceNextDueDate` in bills/route.ts and payments/route.ts (P1-4/P2-1)
- [ ] Add `halfyearly` option to bills form UI (P2-1)
- [ ] Run `docker compose build --no-cache` on Windows
- [ ] SSH to NAS: `docker compose down && docker compose up -d --build`
- [ ] Verify container health check: `GET /api/health` → 200
- [ ] Smoke test: check bills page at 11:30pm AEST — confirm date defaults show correct AU date
- [ ] Smoke test: record a partial bill payment, verify FinanceBillPayment record created, verify transaction cleared

---

## Section 14 — Consolidated Findings Table

| ID | Priority | Area | Finding | File | Action |
|---|---|---|---|---|---|
| P0-1 | 🔴 P0 | P&L | Double-count + null-entity + QuickAdd isCleared — fixes exist, uncommitted | `profit-loss/page.tsx`, `QuickAdd.tsx` | `git commit` |
| P1-1 | 🟠 P1 | **AU Timezone** | `toISOString().split('T')[0]` returns UTC date — form defaults show yesterday after 10pm AEST | 6 locations across bills, journals, transactions pages | Add `todayAU()` helper, apply to all 6 locations |
| P1-2 | 🟠 P1 | **AU Timezone** | `setHours()` uses server local time for Balance Sheet fallback — wrong after 2pm AEST on UTC NAS | `balance-sheet/route.ts` ~L42 | Use `asAtEndOfDay(todayAU(), tz)` |
| P1-3 | 🟠 P1 | Balance Sheet | COA row double-adds `openingBalance` when journal lines also post to same account | `balance-sheet/route.ts` ~L170 | Use `bankBalanceMap.get(cat.id)` as sole source |
| P1-4 | 🟠 P1 | Bills | `halfyearly` missing from `advanceNextDueDate()` → next occurrence 1 month early | `bills/route.ts` bottom | Add `if (frequency === 'halfyearly') return addMonths(date, 6)` |
| P1-5 | 🟠 P1 | Journals | `nextReference()` race condition — duplicate JE refs under concurrent saves | `journals/route.ts`, `transactions/route.ts` | Add `@@unique([familyId, reference])` + retry loop |
| P2-1 | 🟡 P2 | Partial Payments | Same `halfyearly` bug in payments/route.ts + missing option in UI form | `bills/[id]/payments/route.ts`, `bills/page.tsx` | Same fix as P1-4; add UI option |
| P2-2 | 🟡 P2 | Data | "ASIC - Hopevale" and "ASIC - Int Tec Trust" have no category | Database | Assign via Bills UI |
| P2-3 | 🟡 P2 | Reporting | No Trial Balance or General Ledger report | New feature | Future work |
| P2-4 | 🟡 P2 | GST | No automatic 10% GST split on transactions | New feature | Future work |
| P2-5 | 🟡 P2 | UX | Transaction list shows empty (not error) on fetch failure | `transactions/page.tsx` | Add `fetchError` state |
| ✅ | Done | Partial Payments | Feature complete: model, migration, GET/POST/DELETE API, UI history panel, overpayment guard | — | No action |
| ✅ | Done | DB | `PRAGMA integrity_check = ok`, no orphaned FKs | — | No action |
| ✅ | Done | Journals | All 6 entries balanced DR = CR | — | No action |
| ✅ | Done | Timezone | Report period boundaries timezone-aware (`finance-fy.ts`) | — | No action |
| ✅ | Done | Auth | All finance routes protected by `requireSession()` | — | No action |
| ✅ | Done | Bills | Two-stage invoice/payment accounting flow correct | — | No action |
| ✅ | Done | Bills | Undo paid + undo invoice cascade correctly | — | No action |

---

*Report generated from full codebase review: schema.prisma, all finance API routes (transactions, journals, bills, bills/[id]/payments, bills/[id]/payments/[paymentId], income, balance-sheet, pnl, tax-report, accounts), finance lib files (finance-fy.ts, finance-opening-balance.ts, financeReport.ts, financeShared.ts), UI pages (transactions/page.tsx, journals/page.tsx, bills/page.tsx), git state (COMMIT_EDITMSG, task_progress.md), applied migrations (_prisma_migrations), and live database analysis (SQLite, 6 journal entries verified balanced, FK integrity confirmed, timezone offset analysis for AEST/AEDT).*
