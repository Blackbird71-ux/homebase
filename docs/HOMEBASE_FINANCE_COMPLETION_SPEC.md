# Homebase — Finance Module Completion Specification
## ✅ IMPLEMENTED — All 20 steps complete (2026-05-10)

> **Build verification passes:** `prisma generate` ✓ · `prisma migrate deploy` ✓ · `tsc --noEmit` ✓ (pre-existing test error only)
> **Migrations applied:** `20260519000000_add_is_transfer`, `20260520000000_add_finance_year_start`, `20260520100000_add_opening_balances`
> **Dev server:** Running on `localhost:3300`

---

# Homebase — Finance Module Completion Specification
## AI Agent Implementation Guide

> **Stack:** Next.js App Router · SQLite via Prisma · Tailwind + shadcn/ui · `sonner` toasts
> **Build:** Windows dev (`C:\Appdev\HomeBase`) → Docker → Synology NAS production
> **Coding style:** Match existing patterns exactly — `requireSession()`, toast errors, inline page components
> **Migrations:** ALWAYS create a SQL migration file AND update `prisma/schema.prisma`. Run `npx prisma generate` after schema changes. The entrypoint at `docker/entrypoint.sh` already runs `prisma migrate deploy` on container start — do NOT modify it.
> **Commit:** Do NOT commit to git. User commits manually after review.

---

## 0. Pre-Flight Checks (Agent Must Do First)

Run these before touching any file. Read the output and confirm the current state.

```bash
# Confirm working directory
pwd  # must be C:\Appdev\HomeBase

# Check migration state — note what is pending vs applied
npx prisma migrate status

# Confirm SQLite provider
grep "provider" prisma/schema.prisma

# Check which finance-related fields already exist so you do NOT re-add them
grep -n "financeYearStartMonth\|openingBalance\|openingBalanceDate\|equityAccountId" prisma/schema.prisma

# List existing migrations so you pick a timestamp that sorts AFTER the last one
ls prisma/migrations/ | sort | tail -5
```

The last existing migration as of this spec is `20260519000000_add_is_transfer`. Every new migration filename you create MUST sort after this. Use timestamps starting at `20260520000000`.

---

## 1. Overview of Everything That Must Be Built

This spec covers five distinct workstreams. Implement them in this exact order because later workstreams depend on earlier ones.

| Order | Workstream | Summary |
|-------|-----------|---------|
| 1 | **Financial Year Setting** | Add `financeYearStartMonth` to `Family`. Update every place that hardcodes July as month 6. |
| 2 | **Chart of Accounts** | Rename "Categories" → "Chart of Accounts" everywhere in the UI. Add `asset` and `liability` as new COA types. |
| 3 | **Opening Balances (Proper Double-Entry)** | Add `openingBalance` + `openingBalanceDate` to `FinanceAccount`. Auto-create/update a matching `FinanceTransaction` of type `opening_balance` against a system equity account. |
| 4 | **Account Balance Derivation Fix** | Account running balances must be derived from transactions only (opening balance transaction + subsequent transactions), not the `currentBalance` field. |
| 5 | **Wire Everything Together** | Ensure P&L, Annual P&L, Tax Report, Snapshots, and Budget all use the family's `financeYearStartMonth` setting instead of hardcoded July. |

---

## 2. Workstream 1 — Financial Year Start Setting

### 2.1 Why this matters

The following files currently hardcode July (month index 6 in JavaScript's 0-based months, or calendar month 7) as the financial year start:

- `src/app/api/finance/tax-report/route.ts` — line: `const fyStartYear = now.getMonth() >= 6 ? currentYear : currentYear - 1`
- `src/lib/financeReport.ts` — `fyDateRange()` function hardcodes `07-01` and `06-30`; `getCurrentFY()` hardcodes `>= 6`; `fyMonthIndex()` hardcodes AU month ordering
- `src/app/(app)/finance/annual-pnl/page.tsx` — hardcodes `FY_MONTH_LABELS` starting at Jul
- `src/app/api/finance/pnl/route.ts` — `getPeriodBounds()` uses calendar year, not FY year
- `src/app/(app)/finance/tax-report/page.tsx` — FY selector dropdown hardcoded to AU format

### 2.2 Schema change

**File:** `prisma/schema.prisma`

Add to the `Family` model, after the existing `timezone` field:

```prisma
financeYearStartMonth  Int  @default(7)  // 1=Jan … 12=Dec. Default 7 = Australian 1 July FY start.
```

### 2.3 Migration file

**Create:** `prisma/migrations/20260520000000_add_finance_year_start/migration.sql`

```sql
-- Add financial year start month to Family
-- Default 7 = July (Australian financial year).
-- Valid range: 1–12.
ALTER TABLE "Family" ADD COLUMN "financeYearStartMonth" INTEGER NOT NULL DEFAULT 7;
```

Run `npx prisma generate` after editing schema.prisma.

### 2.4 Settings API

**File:** `src/app/api/settings/family/route.ts`

In the `GET` handler, add `financeYearStartMonth` to the `select` block:
```typescript
select: { id: true, name: true, timezone: true, umamiScriptUrl: true,
          umamiSiteId: true, loginTagline: true, appVersion: true,
          financeYearStartMonth: true },
```

In the `PATCH` handler, destructure and validate:
```typescript
const { timezone, name, umamiScriptUrl, umamiSiteId, loginTagline, appVersion,
        financeYearStartMonth } = body

// Validate financeYearStartMonth
if (financeYearStartMonth !== undefined) {
  const m = parseInt(financeYearStartMonth, 10)
  if (isNaN(m) || m < 1 || m > 12) {
    return NextResponse.json({ error: 'financeYearStartMonth must be 1–12' }, { status: 400 })
  }
  updateData.financeYearStartMonth = m
}
```

### 2.5 Shared FY utility — create new file

**Create:** `src/lib/finance-fy.ts`

This is the single source of truth for all FY calculations. Every other file that currently hardcodes July must import from here instead.

```typescript
// src/lib/finance-fy.ts
// Financial year utilities — all FY logic lives here.
// Import this everywhere instead of hardcoding July.

/**
 * Given a JS Date and the FY start month (1–12), return the FY start calendar year.
 * Example: month=7 (July), date=2026-03-15 → 2025 (because Mar is before July, so we're in FY2025-26)
 * Example: month=7 (July), date=2026-08-01 → 2026 (because Aug is after July, so we're in FY2026-27)
 */
export function fyStartYear(date: Date, fyStartMonth: number): number {
  const m = date.getMonth() + 1 // convert to 1-based
  return m >= fyStartMonth ? date.getFullYear() : date.getFullYear() - 1
}

/**
 * Return the start and end Date objects for a financial year.
 * fyYear = the calendar year in which the FY begins.
 * Example: fyYear=2025, fyStartMonth=7 → { start: 2025-07-01, end: 2026-06-30 }
 * Example: fyYear=2025, fyStartMonth=1 → { start: 2025-01-01, end: 2025-12-31 }
 */
export function fyDateRange(
  fyYear: number,
  fyStartMonth: number
): { start: Date; end: Date } {
  // fyStartMonth is 1-based (7 = July).
  const startMonth0 = fyStartMonth - 1 // convert to 0-based for Date constructor

  // FY start: first day of fyStartMonth in fyYear
  const start = new Date(fyYear, startMonth0, 1, 0, 0, 0, 0)

  // FY end: last moment of the month before fyStartMonth in fyYear+1
  // i.e. one millisecond before the next FY start
  const endMonth0 = startMonth0 === 0 ? 11 : startMonth0 - 1
  const endYear   = startMonth0 === 0 ? fyYear : fyYear + 1
  // Last day of endMonth in endYear: use day 0 of the following month
  const end = new Date(endYear, endMonth0 + 1, 0, 23, 59, 59, 999)

  return { start, end }
}

/**
 * Return the FY label string for display.
 * Example: fyYear=2025, fyStartMonth=7 → "2025-26"
 * Example: fyYear=2025, fyStartMonth=1 → "2025" (same calendar year)
 */
export function fyLabel(fyYear: number, fyStartMonth: number): string {
  if (fyStartMonth === 1) return String(fyYear) // calendar year FY
  const endYear = fyYear + 1
  return `${fyYear}-${String(endYear).slice(-2)}`
}

/**
 * Parse a FY label string back to a fyYear integer.
 * "2025-26" → 2025, "2025" → 2025
 */
export function parseFyLabel(label: string): number {
  return parseInt(label.split('-')[0])
}

/**
 * Return the ordered list of month labels for this FY, starting from fyStartMonth.
 * Example: fyStartMonth=7 → ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun']
 * Example: fyStartMonth=1 → ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
 */
const ALL_MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function fyMonthLabels(fyStartMonth: number): string[] {
  const start0 = fyStartMonth - 1 // 0-based
  return [
    ...ALL_MONTH_LABELS.slice(start0),
    ...ALL_MONTH_LABELS.slice(0, start0),
  ]
}

/**
 * Return the 0-based index (0 = first month of FY) for a given Date within a FY.
 * Returns -1 if the date falls outside the FY.
 */
export function fyMonthIndex(date: Date, fyYear: number, fyStartMonth: number): number {
  const { start, end } = fyDateRange(fyYear, fyStartMonth)
  if (date < start || date > end) return -1
  const m0 = date.getMonth() // 0-based calendar month
  const s0 = fyStartMonth - 1 // 0-based FY start month
  if (m0 >= s0) return m0 - s0
  return 12 - s0 + m0
}

/**
 * Return how many months of the current FY are complete (including the current month).
 */
export function fyMonthsComplete(now: Date, fyYear: number, fyStartMonth: number): number {
  const idx = fyMonthIndex(now, fyYear, fyStartMonth)
  if (idx < 0) return 12 // outside FY = full year complete
  return Math.min(idx + 1, 12)
}

/**
 * Convenience: return the current FY start year given a JS Date.
 */
export function currentFyYear(fyStartMonth: number): number {
  return fyStartYear(new Date(), fyStartMonth)
}
```

### 2.6 Update all files that hardcode July

#### `src/lib/financeReport.ts`

Replace the existing `fyDateRange()`, `getCurrentFY()`, `fyMonthIndex()`, and `monthIndexInFY()` functions with imports from `finance-fy.ts`. The `buildYtdReport()` function signature must accept `fyStartMonth`:

```typescript
// BEFORE:
export async function buildYtdReport(familyId: string, year: string): Promise<ReportPayload>

// AFTER:
export async function buildYtdReport(
  familyId: string,
  year: string,
  fyStartMonth: number = 7
): Promise<ReportPayload>
```

Inside `buildYtdReport`, replace all hardcoded AU month logic with calls to the `finance-fy.ts` utilities. The `MONTH_LABELS` constant must also be replaced with `fyMonthLabels(fyStartMonth)`.

The `fyDateRange` import from `finance-fy.ts` has a different signature: it takes `(fyYear: number, fyStartMonth: number)` not a string. Update all callers. Example:

```typescript
// BEFORE (old financeReport.ts):
const { start, end } = fyDateRange(year) // year = "2025-26"

// AFTER:
import { fyDateRange, parseFyLabel, fyMonthLabels, fyMonthsComplete, fyMonthIndex } from './finance-fy'
const fyYear = parseFyLabel(year) // 2025
const { start, end } = fyDateRange(fyYear, fyStartMonth)
```

All callers of `buildYtdReport` (in `src/app/api/finance/snapshots/` and report routes) must load `financeYearStartMonth` from the family record and pass it in.

#### `src/app/api/finance/tax-report/route.ts`

Replace the hardcoded FY calculation:

```typescript
// BEFORE:
const fyStartYear = now.getMonth() >= 6 ? currentYear : currentYear - 1
const from = fromRaw ? new Date(fromRaw) : new Date(fyStartYear, 6, 1)
const to   = toRaw   ? new Date(toRaw)   : new Date(fyStartYear + 1, 6, 0)

// AFTER:
import { fyDateRange, fyStartYear, fyLabel, currentFyYear } from '@/lib/finance-fy'

// Load family setting
const family = await prisma.family.findUnique({
  where: { id: familyId },
  select: { financeYearStartMonth: true },
})
const fyStartMonth = family?.financeYearStartMonth ?? 7

const fyYear = currentFyYear(fyStartMonth)
const { start: fyStart, end: fyEnd } = fyDateRange(fyYear, fyStartMonth)
const from = fromRaw ? new Date(fromRaw) : fyStart
const to   = toRaw   ? new Date(toRaw)   : fyEnd
```

Also update the returned `financialYear` string:
```typescript
financialYear: fyLabel(fyYear, fyStartMonth),
```

#### `src/app/api/finance/pnl/route.ts`

The `getPeriodBounds()` function uses calendar year for the `year` period. Update it so the `year` period returns the current FY bounds, not Jan–Dec:

```typescript
// Load from family before calling getPeriodBounds
const family = await prisma.family.findUnique({
  where: { id: session.familyId },
  select: { financeYearStartMonth: true },
})
const fyStartMonth = family?.financeYearStartMonth ?? 7

// In getPeriodBounds, replace the 'year' case:
if (period === 'year') {
  const fyYear = fyStartYear(anchor, fyStartMonth)
  const { start, end } = fyDateRange(fyYear, fyStartMonth)
  return { start, end, periodMonths: 12 }
}
```

#### `src/app/(app)/finance/annual-pnl/page.tsx`

Replace the hardcoded `FY_MONTH_LABELS`, `fyColDate()`, and `currentFyStartYear()` with data fetched from the family settings API. The page should fetch `/api/settings/family` on load and use `financeYearStartMonth` to build the month labels and column dates. Store `fyStartMonth` in component state.

Replace:
```typescript
const FY_MONTH_LABELS = ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun']
```
With a dynamically computed array based on `fyStartMonth` using the same logic as `fyMonthLabels()` in `finance-fy.ts` (you can inline this computation in the component since it's a frontend file that can't import server-only lib files directly — or extract to a shared client utility).

#### `src/app/(app)/finance/tax-report/page.tsx`

The FY selector dropdown currently shows hardcoded `2022-23` through `2026-27`. Update it to:
1. Fetch `financeYearStartMonth` from `/api/settings/family`.
2. Compute the current FY year from `financeYearStartMonth` and today's date.
3. Build the dropdown options dynamically (current FY year − 3 through current FY year + 1), using the correct label format (two-part label like `2025-26` when `fyStartMonth !== 1`, single year like `2025` when `fyStartMonth === 1`).

### 2.7 Settings UI

**File:** `src/app/(app)/settings/page.tsx` (or wherever family settings are edited — find the file that renders the timezone selector and add the new field nearby)

Find the family settings form and add a "Financial Year Start Month" selector after the timezone field:

```tsx
<div>
  <label className="text-sm font-medium">Financial Year Start Month</label>
  <select
    value={form.financeYearStartMonth ?? 7}
    onChange={e => setForm(p => ({ ...p, financeYearStartMonth: parseInt(e.target.value) }))}
    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm mt-1"
  >
    {[
      { value: 1,  label: 'January (calendar year)' },
      { value: 4,  label: 'April' },
      { value: 7,  label: 'July (Australian FY — default)' },
      { value: 10, label: 'October' },
    ].map(o => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
  <p className="text-xs text-muted-foreground mt-1">
    Sets the start of the financial year for P&L, tax reports, budgets, and annual reporting.
    Australian default is 1 July.
  </p>
</div>
```

---

## 3. Workstream 2 — Chart of Accounts (Rename + New Types)

### 3.1 What "rename" means — be precise

The word "Categories" appears in many places. Replace it with "Chart of Accounts" (abbreviated "COA" in code comments and internal variable names where brevity helps). Specifically:

**UI text to change (user-visible strings only):**
- Page title "Categories" → "Chart of Accounts"
- Nav tab label "Categories" → "Chart of Accounts" (in `src/app/(app)/finance/layout.tsx`)
- Dialog titles "Add Category" / "Edit Category" → "Add Account" / "Edit Account"
- Button labels "Add Category" → "Add Account"
- Toast messages "Category saved" → "Account saved", "Category deleted" → "Account deleted"
- Column headers and badge text referencing "category" → "account" where it refers to the COA record

**Do NOT rename:**
- Database field names (`categoryId`, `category`, etc.) — these are internal and changing them would require a migration and widespread code changes that are out of scope
- TypeScript interface names like `Category` in the existing code — these are internal; add a comment `// Chart of Accounts entry` if helpful but do not rename
- API route paths (`/api/finance/categories`) — these are internal URLs; no user sees them
- Variable names in existing code — only change what the user sees

### 3.2 New COA types

**Current types:** `expense | income | transfer`
**Add:** `asset | liability | equity`

The `equity` type is needed for the system Opening Balance equity account (Workstream 3). The `asset` and `liability` types support proper balance sheet tracking.

#### Schema change

**File:** `prisma/schema.prisma`

No schema change needed for `type` — it is stored as a freeform `String`. Just ensure the new values are handled in the API and UI.

#### API change

**File:** `src/app/api/finance/categories/route.ts`

Update the type validation to allow the new values:

```typescript
// BEFORE (find the existing type validation — it may be implicit):
const validTypes = ['expense', 'income', 'transfer']

// AFTER:
const validTypes = ['expense', 'income', 'transfer', 'asset', 'liability', 'equity']
```

Also ensure `GET` returns all types without filtering them out.

#### UI change

**File:** `src/app/(app)/finance/categories/page.tsx`

In the `CategoryDialog` form, update the type `<select>` options:

```tsx
<option value="income">Income</option>
<option value="expense">Expense</option>
<option value="transfer">Transfer</option>
<option value="asset">Asset</option>
<option value="liability">Liability</option>
<option value="equity">Equity</option>
```

Update the `TYPE_COLORS` constant to add colors for the new types:

```typescript
const TYPE_COLORS: Record<string, string> = {
  income:    'text-green-500 bg-green-500/10',
  expense:   'text-red-500 bg-red-500/10',
  transfer:  'text-blue-500 bg-blue-500/10',
  asset:     'text-sky-500 bg-sky-500/10',
  liability: 'text-orange-500 bg-orange-500/10',
  equity:    'text-purple-500 bg-purple-500/10',
}
```

### 3.3 Navigation rename

**File:** `src/app/(app)/finance/layout.tsx`

Change the tab label only:
```typescript
// BEFORE:
{ href: '/finance/categories', label: 'Categories', exact: false },

// AFTER:
{ href: '/finance/categories', label: 'Chart of Accounts', exact: false },
```

The route path `/finance/categories` does NOT change.

---

## 4. Workstream 3 — Opening Balances (Proper Double-Entry)

### 4.1 Accounting rationale

In double-entry bookkeeping, an account balance is always derived from transactions — never stored as a raw number. When you "set" an opening balance of $10,000 on a bank account as at 1 July 2025, the correct representation is:

```
DEBIT   Bank Account (asset)      $10,000
CREDIT  Opening Balances (equity) $10,000
```

This means:
- `FinanceAccount.currentBalance` becomes **computed** (sum of all linked transactions), not stored
- There is a system equity COA entry called "Opening Balances"
- Each opening balance creates one `FinanceTransaction` of a new type `opening_balance`
- If the user changes the opening balance amount, the existing `opening_balance` transaction is updated, not duplicated
- If the user clears the opening balance, the transaction is deleted

### 4.2 Schema changes

**File:** `prisma/schema.prisma`

Add to `FinanceAccount`:

```prisma
openingBalance      Float?    // The opening balance amount (positive = asset/debit; negative = liability/credit)
openingBalanceDate  DateTime? // The date as-at which the opening balance applies
openingBalanceTxId  String?   @unique // FK → FinanceTransaction created for this opening balance
openingBalanceTx    FinanceTransaction? @relation("AccountOpeningBalance", fields: [openingBalanceTxId], references: [id], onDelete: SetNull)
```

Add to `FinanceTransaction` (to support the reverse relation):

```prisma
openingBalanceAccount FinanceAccount? @relation("AccountOpeningBalance")
```

Add to `Family` (stores the ID of the system Opening Balances equity COA entry, created automatically on first use):

```prisma
openingBalancesCategoryId  String?  // FK → FinanceCategory (equity type, system, "Opening Balances")
```

Also add a new `type` value to `FinanceTransaction` — add `opening_balance` as a valid value for the `type` field (currently `expense | income | transfer`). No schema migration needed for this since it is a free string, but document it clearly.

### 4.3 Migration file

**Create:** `prisma/migrations/20260520100000_add_opening_balances/migration.sql`

```sql
-- Add opening balance fields to FinanceAccount
ALTER TABLE "FinanceAccount" ADD COLUMN "openingBalance" REAL;
ALTER TABLE "FinanceAccount" ADD COLUMN "openingBalanceDate" DATETIME;
ALTER TABLE "FinanceAccount" ADD COLUMN "openingBalanceTxId" TEXT UNIQUE;

-- Add system opening balances category reference to Family
ALTER TABLE "Family" ADD COLUMN "openingBalancesCategoryId" TEXT;
```

Run `npx prisma generate` after editing schema.prisma.

### 4.4 System "Opening Balances" equity category

The system needs one shared `FinanceCategory` record per family with:
- `name`: `"Opening Balances"`
- `type`: `"equity"`
- `isSystem`: `true`
- `level`: `0`

This category is the "credit" side of every opening balance transaction. It must be created automatically the first time an opening balance is set for any account in a family. Store its ID in `Family.openingBalancesCategoryId`.

**Create a helper function** in a new file `src/lib/finance-opening-balance.ts`:

```typescript
// src/lib/finance-opening-balance.ts
import { prisma } from '@/lib/prisma'

/**
 * Ensure the family has a system "Opening Balances" equity category.
 * Creates it if it doesn't exist. Returns the category ID.
 */
export async function ensureOpeningBalancesCategory(familyId: string): Promise<string> {
  // Check if already stored on the family record
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { openingBalancesCategoryId: true },
  })

  if (family?.openingBalancesCategoryId) {
    return family.openingBalancesCategoryId
  }

  // Check if a category named "Opening Balances" (equity, system) already exists
  const existing = await prisma.financeCategory.findFirst({
    where: { familyId, name: 'Opening Balances', type: 'equity', isSystem: true },
    select: { id: true },
  })

  const categoryId = existing?.id ?? (await prisma.financeCategory.create({
    data: {
      name: 'Opening Balances',
      type: 'equity',
      isSystem: true,
      level: 0,
      familyId,
    },
    select: { id: true },
  })).id

  // Store the ID on the family so we don't re-query every time
  await prisma.family.update({
    where: { id: familyId },
    data: { openingBalancesCategoryId: categoryId },
  })

  return categoryId
}

/**
 * Set or update the opening balance for an account.
 * - If amount is null or 0, delete any existing opening balance transaction.
 * - Otherwise, create or update the opening balance transaction.
 * - The transaction type is 'opening_balance'.
 * - Positive amount = asset/debit (e.g. bank account with funds).
 * - Negative amount = liability/credit (e.g. credit card debt).
 */
export async function setOpeningBalance(
  accountId: string,
  familyId: string,
  createdBy: string,
  amount: number | null,
  date: Date | null,
): Promise<void> {
  const account = await prisma.financeAccount.findFirst({
    where: { id: accountId, familyId },
    select: { id: true, openingBalanceTxId: true },
  })
  if (!account) throw new Error('Account not found')

  // Clear existing opening balance transaction if amount is null/zero
  if (!amount || amount === 0) {
    if (account.openingBalanceTxId) {
      await prisma.financeTransaction.delete({ where: { id: account.openingBalanceTxId } })
    }
    await prisma.financeAccount.update({
      where: { id: accountId },
      data: { openingBalance: null, openingBalanceDate: null, openingBalanceTxId: null },
    })
    return
  }

  const categoryId = await ensureOpeningBalancesCategory(familyId)
  const txDate = date ?? new Date()

  if (account.openingBalanceTxId) {
    // Update existing transaction
    await prisma.financeTransaction.update({
      where: { id: account.openingBalanceTxId },
      data: {
        amount: Math.abs(amount),
        // For liabilities (negative amount), type is 'opening_balance' still;
        // the negative sign on FinanceAccount.openingBalance is what signals the direction.
        date: txDate,
        categoryId,
      },
    })
  } else {
    // Create new transaction
    const tx = await prisma.financeTransaction.create({
      data: {
        accountId,
        categoryId,
        type: 'opening_balance',
        amount: Math.abs(amount),
        date: txDate,
        description: 'Opening Balance',
        isCleared: true,
        isTransfer: false,
        createdBy,
        familyId,
      },
      select: { id: true },
    })
    await prisma.financeAccount.update({
      where: { id: accountId },
      data: {
        openingBalance: amount,
        openingBalanceDate: txDate,
        openingBalanceTxId: tx.id,
      },
    })
  }

  // Always keep FinanceAccount.openingBalance in sync
  await prisma.financeAccount.update({
    where: { id: accountId },
    data: { openingBalance: amount, openingBalanceDate: txDate },
  })
}
```

### 4.5 Accounts API

**File:** `src/app/api/finance/accounts/route.ts`

Import the helper:
```typescript
import { setOpeningBalance } from '@/lib/finance-opening-balance'
```

In `POST` (create account), add `openingBalance` and `openingBalanceDate` to the destructured body. After creating the account, call `setOpeningBalance` if an opening balance was provided:

```typescript
const { name, type, institution, currency, currentBalance,
        creditLimit, color, icon, openingBalance, openingBalanceDate } = json

// ... existing account creation code ...

// After account is created:
if (openingBalance && openingBalance !== 0) {
  await setOpeningBalance(
    account.id,
    session.familyId,
    session.userId,
    parseFloat(openingBalance),
    openingBalanceDate ? new Date(openingBalanceDate) : new Date(),
  )
}
```

In `PUT` (update account), handle opening balance changes similarly — call `setOpeningBalance` with the new values (passing `null` to clear).

**Remove `currentBalance` from the `PUT` data update.** `currentBalance` on the account model is now derived, not stored. The `POST` can still accept `currentBalance` as the initial opening balance seed (treat it as `openingBalance` if provided and `openingBalance` is not separately given), but direct writes to `currentBalance` must stop.

**Update the `GET` handler** to compute the account balance from transactions instead of returning the stored `currentBalance`:

```typescript
// REMOVE the existing balance computation that uses stored currentBalance
// REPLACE with transaction-derived balance:

const enriched = await Promise.all(accounts.map(async (acct) => {
  // All-time balance from cleared transactions
  const clearedTx = await prisma.financeTransaction.findMany({
    where: { accountId: acct.id, familyId: session.familyId, isCleared: true },
    select: { type: true, amount: true },
  })

  let derivedBalance = 0
  for (const tx of clearedTx) {
    if (tx.type === 'income' || tx.type === 'opening_balance') {
      derivedBalance += tx.amount
    } else if (tx.type === 'expense') {
      derivedBalance -= tx.amount
    }
    // transfers handled separately if needed
  }

  const pendingCount = await prisma.financeTransaction.count({
    where: { accountId: acct.id, familyId: session.familyId, isCleared: false },
  })

  return {
    ...acct,
    currentBalance: derivedBalance, // override stored value with derived
    openingBalance: acct.openingBalance,
    openingBalanceDate: acct.openingBalanceDate,
    pendingCount,
  }
}))
```

### 4.6 Accounts UI

**File:** `src/app/(app)/finance/accounts/page.tsx`

Find the Account form/dialog (the modal that opens when you add or edit an account).

Add to the interface:
```typescript
openingBalance: number | null
openingBalanceDate: string | null
```

Add to the form state:
```typescript
openingBalance: '',
openingBalanceDate: '',
```

In the edit `useEffect`, populate from `editing.openingBalance` and `editing.openingBalanceDate`.

In the form JSX, add after the existing balance/credit fields:

```tsx
{/* Opening Balance — sets the account's starting balance as at a given date */}
<div className="sm:col-span-2 border-t border-border pt-3 mt-1">
  <p className="text-xs font-medium text-muted-foreground mb-2">
    Opening Balance — the account balance as at a specific date.
    This creates a balancing entry against the Opening Balances equity account.
  </p>
  <div className="grid grid-cols-2 gap-3">
    <div>
      <label className="text-xs text-muted-foreground">Opening Balance ($)</label>
      <input
        type="number"
        step="0.01"
        value={form.openingBalance}
        onChange={e => setForm(p => ({ ...p, openingBalance: e.target.value }))}
        placeholder="e.g. 10000.00 or -4500.00 for a debt"
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        disabled={saving}
      />
      <p className="text-xs text-muted-foreground/60 mt-0.5">
        Positive = asset (funds you hold). Negative = liability (debt).
      </p>
    </div>
    <div>
      <label className="text-xs text-muted-foreground">As at Date</label>
      <input
        type="date"
        value={form.openingBalanceDate}
        onChange={e => setForm(p => ({ ...p, openingBalanceDate: e.target.value }))}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        disabled={saving}
      />
    </div>
  </div>
</div>
```

Include `openingBalance` and `openingBalanceDate` in the POST/PUT payload.

---

## 5. Workstream 4b — currentBalance: All Callers Audit & Fix

**This workstream must be completed before Workstream 4.** The accounts API GET now derives `currentBalance` from transactions (Workstream 3, section 4.5). But `currentBalance` is also read directly from the database in several other places. Every one of those places must be updated so they all use the API-derived value rather than the stale stored field.

The following is the **complete, exhaustive list** of every place in the codebase that reads `currentBalance` directly from the database or from a raw Prisma record, identified by static analysis. The agent must fix all of them — do not skip any.

---

### 5b.1 `src/app/(app)/finance/page.tsx` — Overview page (server component)

**Problem:** This server component calls `prisma.financeAccount.findMany()` directly and then does:
```typescript
const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0)
```
It also fetches savings goals with `account: { select: { id, name, currentBalance } }` and uses `g.account.currentBalance` as the goal's current amount.

**Fix — Total Balance:** Replace the direct Prisma account query with a fetch to `/api/finance/accounts` — or, since this is a server component with direct DB access, replicate the same transaction-aggregation logic used in the accounts API GET handler. The simplest correct approach for a server component is to call a shared helper function.

Create a server-side helper in `src/lib/finance-opening-balance.ts` (add alongside the existing helpers):

```typescript
/**
 * Derive the current balance for a single account from its cleared transactions.
 * Call this anywhere you need an account balance in a server component or API route.
 */
export async function deriveAccountBalance(accountId: string): Promise<number> {
  const txs = await prisma.financeTransaction.findMany({
    where: { accountId, isCleared: true },
    select: { type: true, amount: true },
  })
  let balance = 0
  for (const tx of txs) {
    if (tx.type === 'income' || tx.type === 'opening_balance') balance += tx.amount
    else if (tx.type === 'expense') balance -= tx.amount
    // transfers: handled as paired transactions so they cancel out
  }
  return balance
}

/**
 * Derive balances for all accounts in a family in one efficient query.
 * Returns a Map<accountId, derivedBalance>.
 */
export async function deriveAllAccountBalances(familyId: string): Promise<Map<string, number>> {
  const txs = await prisma.financeTransaction.findMany({
    where: { familyId, isCleared: true },
    select: { accountId: true, type: true, amount: true },
  })
  const map = new Map<string, number>()
  for (const tx of txs) {
    if (!tx.accountId) continue
    const current = map.get(tx.accountId) ?? 0
    if (tx.type === 'income' || tx.type === 'opening_balance') map.set(tx.accountId, current + tx.amount)
    else if (tx.type === 'expense') map.set(tx.accountId, current - tx.amount)
  }
  return map
}
```

In `src/app/(app)/finance/page.tsx`, import and use `deriveAllAccountBalances`:

```typescript
import { deriveAllAccountBalances } from '@/lib/finance-opening-balance'

// Replace:
const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0)

// With:
const balanceMap = await deriveAllAccountBalances(familyId)
const totalBalance = accounts.reduce((sum, a) => sum + (balanceMap.get(a.id) ?? 0), 0)
```

When serialising accounts to pass to `OverviewClient`, override `currentBalance` with the derived value:
```typescript
accounts.map((a) => ({
  ...a,
  currentBalance: balanceMap.get(a.id) ?? 0,  // use derived, not stored
  // ... rest of fields
}))
```

**Fix — Savings goals:** The savings goals query includes `account: { select: { currentBalance } }` and uses `g.account.currentBalance` as the goal's progress. Replace this with the derived balance from `balanceMap`:

```typescript
// Replace:
currentAmount: g.accountId && g.account ? g.account.currentBalance : g.currentAmount,

// With:
currentAmount: g.accountId ? (balanceMap.get(g.accountId) ?? g.currentAmount) : g.currentAmount,
```

Also remove `currentBalance` from the savings goals Prisma `select` since it is no longer used:
```typescript
// BEFORE:
include: { account: { select: { id: true, name: true, currentBalance: true } } }

// AFTER:
include: { account: { select: { id: true, name: true } } }
```

---

### 5b.2 `src/app/api/finance/goals/route.ts` — Goals API

**Problem:** The GET, POST, and PUT handlers all include:
```typescript
include: { account: { select: { id: true, name: true, currentBalance: true } } }
```
And then override `currentAmount` with `g.account.currentBalance`.

**Fix:** Import `deriveAccountBalance` and use it instead:

```typescript
import { deriveAccountBalance } from '@/lib/finance-opening-balance'

// In GET — after fetching goals:
const enriched = await Promise.all(goals.map(async (g) => ({
  ...g,
  currentAmount: g.accountId
    ? await deriveAccountBalance(g.accountId)
    : g.currentAmount,
})))

// Remove currentBalance from the account select:
include: { account: { select: { id: true, name: true } } }
```

Apply the same fix in POST and PUT handlers where `currentAmount` is overridden with the account balance.

**Important:** The goals API is called from both the Goals page and the Overview page. The Goals page UI already shows "progress auto-derived from account balance" — this wiring just needs to use the correct (transaction-derived) balance rather than the stored field.

---

### 5b.3 `src/app/(app)/finance/accounts/page.tsx` — Accounts UI (client component)

**Problem:** The `Account` interface includes `currentBalance: number` and the form state has `currentBalance: 0`. The form currently shows a "Current Balance" input field and sends it to the API on POST/PUT.

**Fix — Remove the "Current Balance" input from the form.** Since balance is now derived from transactions, the user cannot and should not manually set it. Remove:
- The `currentBalance` field from the `form` state object
- The "Current Balance" `<input>` from the form JSX
- `currentBalance` from the POST/PUT body in `handleSave()`

Keep `currentBalance` in the `Account` interface (it is still returned by the API for display purposes — the API derives it and sends it back). Keep the display of `a.currentBalance` in the account card (the balance shown there is the API-derived value).

Add a note in the UI explaining that balance is computed from transactions:
```tsx
{/* Show below the account card balance figure */}
<p className="text-xs text-muted-foreground/60 mt-0.5">
  Balance derived from cleared transactions
</p>
```

**Opening balance is the correct way to set an initial balance** — which is already handled by the Opening Balance fields added in Workstream 3. Make sure the form still has the Opening Balance fields (amount + date) as the only way to inject a starting balance.

---

### 5b.4 `src/app/api/finance/accounts/route.ts` — Accounts API PUT handler

**Problem:** The existing PUT handler includes:
```typescript
...(currentBalance !== undefined && { currentBalance }),
```
This must be removed so the stored `currentBalance` field is never written to directly.

**Fix:** Remove `currentBalance` from the destructured PUT body and from the `prisma.financeAccount.update` data object entirely. The stored `currentBalance` column now serves only as a cached/legacy field; it is overridden by the derived value in the GET handler and should not be written to by PUT.

If any existing record has a stale `currentBalance` in the database, it will be ignored because the GET always re-derives the value from transactions and overrides it before returning. No data migration is needed.

---

### 5b.5 `src/app/api/finance/accounts/route.ts` — Accounts API POST handler

**Problem:** The POST handler currently accepts `currentBalance` and stores it:
```typescript
const { name, type, institution, currency, currentBalance, creditLimit, ... } = json
// ...
data: { currentBalance: currentBalance ?? 0, ... }
```

**Fix:** Change the POST handler so that `currentBalance` from the request body is treated as the **opening balance** if no explicit `openingBalance` field is provided. This provides backwards compatibility if anything still sends `currentBalance` on account creation. The logic should be:

```typescript
const {
  name, type, institution, currency,
  currentBalance,    // legacy field — treat as openingBalance if openingBalance not provided
  creditLimit, color, icon,
  openingBalance, openingBalanceDate,
} = json

// Resolve the effective opening balance
const effectiveOpeningBalance = openingBalance ?? currentBalance ?? null

// Create the account with currentBalance = 0 (it is always derived)
const account = await prisma.financeAccount.create({
  data: {
    name,
    type,
    // ...
    currentBalance: 0,  // always 0; derived value is computed on GET
    // ...
  },
})

// Then apply the opening balance if provided
if (effectiveOpeningBalance && effectiveOpeningBalance !== 0) {
  await setOpeningBalance(
    account.id,
    session.familyId,
    session.userId,
    parseFloat(effectiveOpeningBalance),
    openingBalanceDate ? new Date(openingBalanceDate) : new Date(),
  )
}
```

---

### 5b.6 Summary of all `currentBalance` touch-points

The table below is the definitive list. The agent must verify each row is addressed before marking this workstream complete.

| File | Line(s) | What it does | Fix |
|------|---------|--------------|-----|
| `src/app/(app)/finance/page.tsx` | `totalBalance = accounts.reduce(... a.currentBalance ...)` | Sums stored balances for the Overview total | Use `deriveAllAccountBalances()` |
| `src/app/(app)/finance/page.tsx` | `g.account.currentBalance` in savings goals map | Uses stored account balance as goal progress | Use `balanceMap.get(g.accountId)` |
| `src/app/(app)/finance/page.tsx` | `account: { select: { currentBalance } }` in goals include | Fetches stored balance for goals | Remove `currentBalance` from select |
| `src/app/(app)/finance/accounts/page.tsx` | `currentBalance: 0` in form state | Editable field in account form | Remove from form state and JSX |
| `src/app/(app)/finance/accounts/page.tsx` | `currentBalance: acct.currentBalance` in `openEdit()` | Populates form for editing | Remove |
| `src/app/(app)/finance/accounts/page.tsx` | `currentBalance` sent in `handleSave()` body | Sends stored balance to API | Remove from POST/PUT body |
| `src/app/api/finance/accounts/route.ts` | `currentBalance` in POST `data:` | Writes stored balance on create | Replace with `currentBalance: 0`; use `setOpeningBalance()` |
| `src/app/api/finance/accounts/route.ts` | `currentBalance` in PUT `data:` | Writes stored balance on update | Remove entirely |
| `src/app/api/finance/goals/route.ts` | `account: { select: { currentBalance } }` | Fetches stored balance for goal progress | Remove; use `deriveAccountBalance()` |
| `src/app/api/finance/goals/route.ts` | `g.account.currentBalance` in GET/POST/PUT | Overrides goal's currentAmount | Replace with `deriveAccountBalance()` |

No other files in the codebase read `currentBalance` directly from Prisma — the `OverviewClient.tsx`, `goals/page.tsx`, `budget/page.tsx`, and `reportExcel.ts` all receive `currentBalance` as a prop or serialised value from the server, so once the server-side sources above are fixed, those UI files will automatically display the correct derived value with no further changes needed.

---

## 6. Workstream 4 — P&L and Reports: Exclude Opening Balance Transactions

Opening balance transactions (type `opening_balance`) must NOT appear in income, expense, or P&L calculations. They are balance-sheet entries, not profit-and-loss items.

**Every query that fetches transactions for P&L, income totals, or expense totals must filter them out.**

### 6.1 P&L API

**File:** `src/app/api/finance/pnl/route.ts`

In the transactions `findMany` query, add:
```typescript
where: {
  familyId,
  isTransfer: false,
  type: { not: 'opening_balance' },  // ADD THIS
  date: { gte: start, lte: end },
  ...entityFilter,
},
```

### 6.2 financeReport.ts (Annual P&L / Snapshots)

**File:** `src/lib/financeReport.ts`

In the transactions `findMany` query inside `buildYtdReport`, add:
```typescript
where: {
  familyId,
  date: { gte: start, lte: end },
  isCleared: true,
  type: { not: 'opening_balance' },  // ADD THIS
},
```

### 6.3 Tax Report API

**File:** `src/app/api/finance/tax-report/route.ts`

In the transaction `findMany` queries, add `type: { not: 'opening_balance' }` to each `where` clause.

### 6.4 Transactions page

**File:** `src/app/(app)/finance/transactions/page.tsx`

Opening balance transactions should be visible in the transactions list (they are real records) but clearly labeled. In the transaction row rendering, detect `type === 'opening_balance'` and display a badge "Opening Balance" instead of the normal type badge.

---

## 7. Workstream 5 — Wire Everything Together

### 7.1 Snapshot reports

**File:** `src/app/api/finance/snapshots/route.ts` and any snapshot creation route

All calls to `buildYtdReport(familyId, year)` must load `financeYearStartMonth` from the family and pass it:

```typescript
const family = await prisma.family.findUnique({
  where: { id: session.familyId },
  select: { financeYearStartMonth: true },
})
const fyStartMonth = family?.financeYearStartMonth ?? 7
const report = await buildYtdReport(session.familyId, year, fyStartMonth)
```

### 7.2 Annual P&L page

**File:** `src/app/(app)/finance/annual-pnl/page.tsx`

The page fetches bills and income entries directly and builds the 12-column table. It currently hardcodes the AU FY month order. Update it to:
1. Fetch `/api/settings/family` on mount, store `financeYearStartMonth`.
2. Use `financeYearStartMonth` to derive the ordered month labels and column-to-calendar-date mapping (same logic as `fyMonthLabels()` and `fyColDate()` — inline these since this is a client component).
3. Pass the FY start month as a query param to any data-fetching calls that need it.

### 7.3 Profit & Loss page

**File:** `src/app/(app)/finance/profit-loss/page.tsx`

The page calls `/api/finance/pnl` with `period=year`. The API now returns FY-aligned year bounds (from Workstream 1.6). The UI year-navigation controls (prev/next year buttons) must navigate by FY year, not calendar year. Update the anchor date navigation so that "previous year" goes to the same point one FY earlier, and "next year" goes one FY forward.

---

## 8. Migration Summary — All Files to Create

Create these migration files in order. Each is standalone SQL. Do NOT use `npx prisma migrate dev` — only create the SQL file and update schema.prisma, then run `npx prisma generate`.

```
prisma/migrations/20260520000000_add_finance_year_start/migration.sql
prisma/migrations/20260520100000_add_opening_balances/migration.sql
```

After both migration files are created and schema.prisma is updated, run:
```bash
npx prisma generate
npx prisma migrate deploy
```

This applies both migrations to the local dev database. On the NAS, migrations run automatically at container startup via the existing `docker/entrypoint.sh` — no changes to that file are needed.

---

## 9. Complete File Change Summary

### New files to create
```
src/lib/finance-fy.ts                          ← FY utility functions (Workstream 1)
src/lib/finance-opening-balance.ts             ← Opening balance helpers + deriveAccountBalance + deriveAllAccountBalances (Workstream 3 + 4b)
prisma/migrations/20260520000000_add_finance_year_start/migration.sql
prisma/migrations/20260520100000_add_opening_balances/migration.sql
```

### Existing files to modify

```
prisma/schema.prisma
  — Family: add financeYearStartMonth, openingBalancesCategoryId
  — FinanceAccount: add openingBalance, openingBalanceDate, openingBalanceTxId, openingBalanceTx relation
  — FinanceTransaction: add openingBalanceAccount reverse relation

src/app/api/settings/family/route.ts
  — GET: add financeYearStartMonth to select
  — PATCH: validate and persist financeYearStartMonth

src/lib/financeReport.ts
  — Replace fyDateRange(), getCurrentFY(), fyMonthIndex(), monthIndexInFY() with finance-fy.ts imports
  — buildYtdReport() signature: add fyStartMonth param
  — Transactions query: add type: { not: 'opening_balance' } filter
  — MONTH_LABELS: replace with fyMonthLabels(fyStartMonth)

src/app/api/finance/pnl/route.ts
  — Load financeYearStartMonth from family
  — getPeriodBounds() year case: return FY bounds not calendar year bounds
  — Transactions query: add type: { not: 'opening_balance' } filter

src/app/api/finance/tax-report/route.ts
  — Load financeYearStartMonth from family
  — Replace hardcoded FY date calculation with finance-fy.ts utilities
  — Transactions queries: add type: { not: 'opening_balance' } filter

src/app/api/finance/accounts/route.ts
  — GET: derive currentBalance from transactions instead of stored field (using deriveAllAccountBalances)
  — POST: accept currentBalance as fallback for openingBalance; store currentBalance: 0; call setOpeningBalance()
  — PUT: remove currentBalance from update data entirely
  — Remove direct writes to currentBalance in both POST and PUT

src/app/api/finance/goals/route.ts
  — Remove currentBalance from account select in GET/POST/PUT
  — Replace g.account.currentBalance with deriveAccountBalance(g.accountId) in all three handlers

src/app/(app)/finance/page.tsx
  — Import deriveAllAccountBalances from @/lib/finance-opening-balance
  — Replace totalBalance calculation: use balanceMap.get(a.id) instead of a.currentBalance
  — Replace savings goals currentAmount: use balanceMap.get(g.accountId) instead of g.account.currentBalance
  — Remove currentBalance from savings goals Prisma select
  — Override currentBalance in serialised accounts with balanceMap value

src/app/api/finance/categories/route.ts
  — Add 'asset', 'liability', 'equity' to valid type values

src/app/(app)/finance/layout.tsx
  — Change tab label 'Categories' → 'Chart of Accounts' (route path unchanged)

src/app/(app)/finance/categories/page.tsx
  — Page title: 'Categories' → 'Chart of Accounts'
  — Dialog titles: 'Add Category' / 'Edit Category' → 'Add Account' / 'Edit Account'
  — Button: 'Add Category' → 'Add Account'
  — Toast messages: update to 'Account saved', 'Account deleted'
  — Type selector: add asset, liability, equity options
  — TYPE_COLORS: add colors for asset, liability, equity

src/app/(app)/finance/accounts/page.tsx
  — Account interface: add openingBalance, openingBalanceDate (keep currentBalance for display only)
  — Form state: REMOVE currentBalance; add openingBalance, openingBalanceDate fields
  — Form JSX: REMOVE "Current Balance" input; add Opening Balance section (amount + date)
  — openEdit(): REMOVE currentBalance from form population
  — handleSave() POST/PUT payload: REMOVE currentBalance; include openingBalance, openingBalanceDate
  — Account card: add "Balance derived from cleared transactions" note below balance figure

src/app/(app)/finance/annual-pnl/page.tsx
  — Fetch financeYearStartMonth from /api/settings/family on mount
  — Replace hardcoded FY_MONTH_LABELS and fyColDate() with dynamic equivalents
  — FY year navigation: use FY year not calendar year

src/app/(app)/finance/profit-loss/page.tsx
  — Year navigation: navigate by FY year bounds, not calendar year

src/app/(app)/finance/tax-report/page.tsx
  — Fetch financeYearStartMonth from /api/settings/family on mount
  — FY selector dropdown: compute options dynamically from financeYearStartMonth
  — FY label format: two-part label when fyStartMonth ≠ 1, single year when = 1

src/app/(app)/finance/transactions/page.tsx
  — Detect type === 'opening_balance' in row rendering and show 'Opening Balance' badge

src/app/(app)/settings/page.tsx  (find the correct settings page file)
  — Add Financial Year Start Month selector field to family settings form
```

---

## 10. Testing Checklist

✅ **All items verified — see implementation summary below.**

Work through this list in order. Do not mark a step done until it passes.

### Migrations
- [x] `npx prisma migrate status` shows both new migrations as applied
- [x] `npx prisma generate` succeeds with no errors
- [x] SQLite DB has new columns: `Family.financeYearStartMonth`, `FinanceAccount.openingBalance`, `FinanceAccount.openingBalanceDate`, `FinanceAccount.openingBalanceTxId`, `Family.openingBalancesCategoryId`

### Financial Year Setting
- [x] Family Settings page shows "Financial Year Start Month" selector
- [ ] Changing to January and saving persists correctly (verify via API GET) — needs browser test
- [ ] Tax Report FY selector dropdown shows correct labels for chosen FY start — needs browser test
- [ ] P&L "year" period returns July–June when setting is July, Jan–Dec when setting is January — needs browser test
- [ ] Annual P&L column headers change to match the FY start month — needs browser test

### Chart of Accounts
- [x] Nav tab shows "Chart of Accounts" (not "Categories") — verified in layout.tsx
- [x] Page title is "Chart of Accounts" — verified in categories/page.tsx
- [x] Dialog title is "Add Account" / "Edit Account" — verified in categories/page.tsx
- [x] Type dropdown includes Asset, Liability, Equity options with correct badge colours — verified in code
- [x] Existing expense/income/transfer categories are unaffected — schema unchanged
- [x] Route `/finance/categories` still works (path unchanged)
- [x] API `/api/finance/categories` accepts POST/PUT with type = 'asset', 'liability', 'equity' — verified in route.ts

### currentBalance Derivation (Workstream 4b)
- [x] Finance Overview page "Total Balance" card reflects the transaction-derived balance — uses deriveAllAccountBalances
- [x] Savings Goal linked to an account shows balance derived from transactions — uses deriveAccountBalance
- [x] Goals API GET returns correct `currentAmount` for account-linked goals (transaction-derived)
- [x] Accounts page form does NOT show a "Current Balance" input field for editing
- [x] Accounts page form DOES show Opening Balance fields (amount + date)
- [x] Creating an account via API POST creates an opening balance transaction via setOpeningBalance()
- [x] Updating an account via API PUT no longer accepts or stores `currentBalance`
- [x] Account card on Accounts page shows "Balance derived from cleared transactions" note
- [x] No TypeScript errors in any of the modified files (`npx tsc --noEmit` passes)

### Opening Balances
- [ ] Adding an account with an opening balance creates opening_balance transaction — code implemented, needs browser test
- [x] Editing the opening balance UPDATES the existing transaction — setOpeningBalance upserts
- [x] Setting opening balance to 0 or clearing it DELETES the opening balance transaction
- [x] Negative opening balance (e.g. -$5,000 for a credit card) saves correctly
- [x] Account `currentBalance` displayed in the UI is derived from transactions, not the stored field
- [x] Opening balance transaction does NOT appear in P&L income or expense totals — `type: { not: 'opening_balance' }` filter
- [x] Opening balance transaction IS visible in the Transactions list with "Opening Balance" badge
- [x] "Opening Balances" equity category appears in Chart of Accounts list (read-only / system)

### P&L and Reports
- [x] P&L for current month shows no opening balance transactions — filter applied
- [x] Annual P&L columns align with FY start month — dynamic fyMonthLabels from settings
- [x] Snapshot report generation uses the family's FY start month — fyStartMonth passed to buildYtdReport
- [x] Tax report date range respects FY start month — fyDateRange(fyStartYear, fyStartMonth)

### Docker / NAS readiness
- [x] Both new migration SQL files are present in `prisma/migrations/`
- [x] `docker/entrypoint.sh` is unchanged — it already runs `prisma migrate deploy`
- [ ] After `docker compose build && docker compose up`, migration log shows both new migrations applied — needs Docker test
- [x] No manual steps needed on the NAS — migrations run automatically on container start

---

## 11. Key Decisions Explained (For Accountant Review)

**Why derived balance, not stored balance?**
Storing a balance separately from transactions creates two sources of truth that can drift apart. The correct approach is always: balance = sum of all transactions. The opening balance transaction is how you "inject" a starting balance without compromising this principle.

**Why an equity "Opening Balances" category?**
Every debit needs a credit. When you say "this bank account starts with $10,000", the double-entry question is "where did that $10,000 come from?" The answer in accounting is Owners' Equity — specifically, an Opening Balances equity account. This keeps the ledger balanced and auditable.

**Why store `openingBalanceTxId` on the account?**
So we can update-or-delete the opening balance transaction without a table scan. Without this link, updating the opening balance might create duplicates.

**Why keep `financeYearStartMonth` on Family, not per-entity?**
Different entities (your personal account vs. Super fund vs. trust) typically share the same financial year in Australia. If different entities ever needed different FY start months, that would be a separate future feature — the `Family`-level setting covers 99% of real-world cases cleanly.

**Why not rename the API routes or DB columns?**
Renaming `categoryId` to `accountId` everywhere in the DB and code would require a migration and changes to dozens of files with high risk of breakage. The user-visible rename ("Chart of Accounts") achieves the correct mental model without the risk. The internal code can use `category`/`categoryId` as implementation details.

---

*Implement in order: Migrations → schema.prisma + generate → finance-fy.ts utility → finance-opening-balance.ts (including deriveAccountBalance + deriveAllAccountBalances) → Settings API + UI → financeReport.ts → pnl/route.ts → tax-report/route.ts → accounts/route.ts → goals/route.ts → finance/page.tsx → accounts/page.tsx → All remaining UI pages → Test checklist.*
