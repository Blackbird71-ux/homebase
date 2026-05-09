# Homebase — Tax Reporting, Entity-Level Tax Views & Modal Validation
## AI Agent Implementation Specification

> **Stack:** Next.js App Router · SQLite via Prisma · Tailwind + shadcn/ui · `sonner` toasts  
> **Build:** Windows dev → Docker → Synology NAS production  
> **Working dir:** `C:\Appdev\HomeBase`  
> **Coding style:** Match existing patterns exactly — toast errors, `requireSession()`, inline page components  
> **Tax reference:** `Tax_Calculator.xlsx` — per-person (Mark / Michelle), joint income, deductions, PAYG, SGC, taxable total, tax payable, refund/owing  

---

## 0. Pre-Flight Checks (Agent Must Do First)

```bash
# 1. Check current migration state
npx prisma migrate status

# 2. Check git status for any uncommitted work
# (do NOT commit — user does that manually)

# 3. Confirm SQLite provider in schema.prisma
grep "provider" prisma/schema.prisma

# 4. Verify existing tax-related fields already in schema
grep -n "isTaxDeduction\|isTaxTracked\|taxRate\|taxClassification" prisma/schema.prisma
```

**Already in schema (do NOT re-add):**
- `FinanceCategory.isTaxDeduction` — Boolean, marks expense/transfer categories as tax-deductible  
- `FinanceIncomeEntry.isTaxTracked` — Boolean, marks income entries for ATO tracking  
- `FinanceIncomeEntry.taxRate` — Float?, estimated tax rate  
- `FinanceTransaction.entityId`, `FinanceRecurringBill.entityId`, `FinanceIncomeEntry.entityId` — entity FK already exists  

---

## 1. What Needs to Be Built — Summary

| # | Feature | Where |
|---|---|---|
| 1 | `taxClassification` field on bills & transactions | Schema + API + UI |
| 2 | `taxIncludeInReporting` flag on categories | Schema + API + UI |
| 3 | `taxEntityId` override on income/bills/transactions | UI only (entityId already exists) |
| 4 | **Tax Report page** — per-person, per-entity, mimics Tax Calculator | New page |
| 5 | **Modal validation** — red field highlights + inline error messages | Bills, Income, Transactions, Categories modals |
| 6 | **Prisma migration** for new schema fields | New migration file |
| 7 | **Docker entrypoint** — ensure `migrate deploy` is present | entrypoint.sh |

---

## 2. Schema Changes

### 2.1 New fields required

```prisma
// On FinanceCategory — already has isTaxDeduction; ADD:
taxIncludeInReporting  Boolean  @default(false)  // Include this category in the tax report
taxDisplayLabel        String?                    // Override label shown in tax report (e.g. "Salary")

// On FinanceTransaction — ADD:
taxClassification      String?  // "tax_deduction" | "taxable_income" | "tax_payment" | null

// On FinanceRecurringBill — ADD:
taxClassification      String?  // "tax_deduction" | "tax_payment" | null

// On FinanceIncomeEntry — isTaxTracked already exists; ADD:
taxClassification      String?  // "taxable_income" | "exempt_income" | null
```

**Valid `taxClassification` values by record type:**

| Record type | Valid values |
|---|---|
| `FinanceTransaction` (expense/transfer) | `tax_deduction`, `tax_payment`, `null` |
| `FinanceTransaction` (income) | `taxable_income`, `exempt_income`, `null` |
| `FinanceRecurringBill` | `tax_deduction`, `tax_payment`, `null` |
| `FinanceIncomeEntry` | `taxable_income`, `exempt_income`, `null` |

### 2.2 Migration file

**Create:** `prisma/migrations/20260517000000_add_tax_classification/migration.sql`

```sql
-- Add taxClassification to FinanceTransaction
ALTER TABLE "FinanceTransaction" ADD COLUMN "taxClassification" TEXT;

-- Add taxClassification to FinanceRecurringBill  
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "taxClassification" TEXT;

-- Add taxClassification to FinanceIncomeEntry
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "taxClassification" TEXT;

-- Add taxIncludeInReporting to FinanceCategory
ALTER TABLE "FinanceCategory" ADD COLUMN "taxIncludeInReporting" BOOLEAN NOT NULL DEFAULT false;

-- Add taxDisplayLabel to FinanceCategory
ALTER TABLE "FinanceCategory" ADD COLUMN "taxDisplayLabel" TEXT;
```

### 2.3 Update `prisma/schema.prisma`

Add the five fields above to their respective models. Match the existing comment and formatting style.  
Run `npx prisma generate` after editing (NOT `migrate dev` — use the SQL file above).

### 2.4 Update `docker-entrypoint.sh` (or `entrypoint.sh`)

Verify it contains exactly this (add if missing):
```sh
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Migrations done."
```
Prompt user to copy updated `entrypoint.sh` to NAS after build.

---

## 3. API Changes

### 3.1 Categories API — `src/app/api/finance/categories/route.ts`

In `POST` and `PUT` handlers, destructure and persist:
```typescript
const { ..., taxIncludeInReporting, taxDisplayLabel } = json
// add to prisma create/update:
taxIncludeInReporting: taxIncludeInReporting ?? false,
taxDisplayLabel: taxDisplayLabel ?? null,
```

### 3.2 Bills API — `src/app/api/finance/bills/route.ts`

In `POST` and `PUT` handlers, add:
```typescript
const { ..., taxClassification } = json
// persist:
taxClassification: taxClassification ?? null,
```
Return `taxClassification` in all `select`/`findMany` responses.

### 3.3 Income API — `src/app/api/finance/income/route.ts`

Same pattern — add `taxClassification` to POST/PUT and return it.

### 3.4 Transactions API — `src/app/api/finance/transactions/route.ts`

Same pattern.

### 3.5 New Tax Report API — `src/app/api/finance/tax-report/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET /api/finance/tax-report?year=2025-26&entityId=optional
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year') // e.g. "2025-26"
  const entityId  = searchParams.get('entityId') // optional filter

  // Parse FY: "2025-26" → Jul 2025 – Jun 2026
  const [startYStr] = (yearParam ?? '').split('-')
  const startYear = parseInt(startYStr) || new Date().getFullYear()
  const fyStart = new Date(`${startYear}-07-01T00:00:00.000Z`)
  const fyEnd   = new Date(`${startYear + 1}-06-30T23:59:59.999Z`)

  const familyId = session.familyId
  const where = (extra: object) => ({
    familyId,
    date: { gte: fyStart, lte: fyEnd },
    ...(entityId ? { entityId } : {}),
    ...extra,
  })

  // ── Income items flagged as taxable ──────────────────────────────────────
  const taxableIncomeEntries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId,
      isTaxTracked: true,
      nextExpectedDate: { gte: fyStart, lte: fyEnd },
      ...(entityId ? { entityId } : {}),
    },
    include: { entity: true, member: true, category: true },
  })

  // ── Transactions classified as taxable_income ─────────────────────────────
  const taxableTransactions = await prisma.financeTransaction.findMany({
    where: where({ taxClassification: 'taxable_income' }),
    include: { entity: true, category: true },
  })

  // ── Tax deduction transactions ────────────────────────────────────────────
  const deductionTransactions = await prisma.financeTransaction.findMany({
    where: where({
      OR: [
        { taxClassification: 'tax_deduction' },
        { category: { isTaxDeduction: true } },
      ],
    }),
    include: { entity: true, category: true },
  })

  // ── Tax payment transactions (PAYG installments etc) ─────────────────────
  const taxPaymentTransactions = await prisma.financeTransaction.findMany({
    where: where({ taxClassification: 'tax_payment' }),
    include: { entity: true, category: true },
  })

  // ── Bill-level deductions (recurring bills with taxClassification set) ────
  const deductionBills = await prisma.financeRecurringBill.findMany({
    where: {
      familyId,
      taxClassification: 'tax_deduction',
      nextDueDate: { gte: fyStart, lte: fyEnd },
      ...(entityId ? { entityId } : {}),
    },
    include: { entity: true, category: true },
  })

  // ── SGC amounts from income entries (employer super contributions) ─────────
  const sgcEntries = await prisma.financeIncomeEntry.findMany({
    where: {
      familyId,
      category: { name: { contains: 'SGC' } },
      nextExpectedDate: { gte: fyStart, lte: fyEnd },
      ...(entityId ? { entityId } : {}),
    },
    include: { entity: true, category: true },
  })

  return NextResponse.json({
    financialYear: yearParam,
    period: { start: fyStart, end: fyEnd },
    taxableIncome: {
      entries: taxableIncomeEntries,
      transactions: taxableTransactions,
      total: [
        ...taxableIncomeEntries.map(e => e.amount),
        ...taxableTransactions.map(t => t.amount),
      ].reduce((a, b) => a + b, 0),
    },
    deductions: {
      transactions: deductionTransactions,
      bills: deductionBills,
      total: [
        ...deductionTransactions.map(t => t.amount),
        ...deductionBills.map(b => b.amount),
      ].reduce((a, b) => a + b, 0),
    },
    taxPayments: {
      transactions: taxPaymentTransactions,
      total: taxPaymentTransactions.reduce((a, t) => a + t.amount, 0),
    },
    sgc: {
      entries: sgcEntries,
      total: sgcEntries.reduce((a, e) => a + e.amount, 0),
    },
  })
}
```

---

## 4. UI Changes

### 4.1 Categories Modal — Add Tax Reporting Fields

**File:** `src/app/(app)/finance/categories/page.tsx`

In `CategoryDialog`, the form state already has `isTaxDeduction`. Add:
```typescript
// to form state:
taxIncludeInReporting: false,
taxDisplayLabel: '',
```

In the editing `useEffect`, populate from `editing.taxIncludeInReporting` and `editing.taxDisplayLabel`.

In the flags section of the form JSX, after the `isTaxDeduction` checkbox, add:

```tsx
{/* Tax reporting checkbox — show for all types */}
<label className="flex items-center gap-1.5 text-sm cursor-pointer">
  <input
    type="checkbox"
    checked={form.taxIncludeInReporting}
    onChange={e => setForm(p => ({ ...p, taxIncludeInReporting: e.target.checked }))}
    disabled={saving}
  />
  <span className="text-amber-600 dark:text-amber-400 font-medium">Include in Tax Report</span>
</label>

{/* Display label override — only shown when taxIncludeInReporting is true */}
{form.taxIncludeInReporting && (
  <div className="sm:col-span-2 mt-1">
    <label className="text-xs text-muted-foreground">
      Tax Report Label <span className="text-muted-foreground/60">(optional — overrides category name)</span>
    </label>
    <input
      value={form.taxDisplayLabel}
      onChange={e => setForm(p => ({ ...p, taxDisplayLabel: e.target.value }))}
      placeholder={form.name || 'e.g. Wages, Bank Interest, Super Contributions'}
      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      disabled={saving}
    />
  </div>
)}
```

Include `taxIncludeInReporting` and `taxDisplayLabel` in the POST/PUT payload in `handleSave()`.

**Also update the category list display** — show a small amber badge `TAX RPT` next to categories where `taxIncludeInReporting` is true, similar to the existing `TAX DED` badge for `isTaxDeduction`.

### 4.2 Bills Modal — Add Tax Classification Field

**File:** `src/app/(app)/finance/bills/page.tsx`

Add to `emptyForm`:
```typescript
taxClassification: '',
```

In `openEdit(b: Bill)`:
```typescript
taxClassification: b.taxClassification ?? '',
```

In `getFormPayload()`:
```typescript
taxClassification: form.taxClassification || null,
```

In the bill form JSX (inside `<Dialog>`), add a Tax Classification row after the Entity field:

```tsx
{/* Tax classification — for ATO/tax purposes */}
<div className="sm:col-span-2">
  <label className="text-xs text-muted-foreground">Tax Classification</label>
  <select
    value={form.taxClassification}
    onChange={e => setForm(p => ({ ...p, taxClassification: e.target.value }))}
    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
    disabled={saving}
  >
    <option value="">None</option>
    <option value="tax_deduction">Tax Deduction (ATO deductible expense)</option>
    <option value="tax_payment">Tax Payment (PAYG, BAS, etc.)</option>
  </select>
  {form.taxClassification && (
    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
      This bill will appear in the Tax Report under{' '}
      {form.taxClassification === 'tax_deduction' ? 'Deductions' : 'Tax Payments'}
      {form.entityId ? ` for the selected entity` : ''}.
    </p>
  )}
</div>
```

Update the `Bill` interface to include `taxClassification: string | null`.

### 4.3 Income Modal — Add Tax Classification Field

**File:** `src/app/(app)/finance/income/page.tsx`

The income form already has `isTaxTracked` and `taxRate`. Add `taxClassification` to the form state and emptyForm:
```typescript
taxClassification: '',
```

In the income modal JSX, add after the existing Tax Tracked checkbox group:

```tsx
{/* Tax classification dropdown */}
{form.isTaxTracked && (
  <div className="sm:col-span-2">
    <label className="text-xs text-muted-foreground">Tax Classification</label>
    <select
      value={form.taxClassification}
      onChange={e => setForm(p => ({ ...p, taxClassification: e.target.value }))}
      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      disabled={saving}
    >
      <option value="">Not specified</option>
      <option value="taxable_income">Taxable Income (included in assessable income)</option>
      <option value="exempt_income">Exempt Income (not assessable)</option>
    </select>
  </div>
)}
```

Also add a **member (person) selector for tax purposes** — this is different from `memberId` (who earns it). The `memberId` field already exists on `FinanceIncomeEntry`. In the form, ensure the member selector is always visible when `isTaxTracked` is true, even if the category doesn't have `isPersonal` set, with a note "Required for individual tax reporting":

```tsx
{form.isTaxTracked && !form.memberId && (
  <p className="text-xs text-amber-600 dark:text-amber-400 sm:col-span-2">
    ⚠ Select a person so this income appears in the correct individual tax summary.
  </p>
)}
```

### 4.4 Transactions Modal — Add Tax Classification Field

**File:** `src/app/(app)/finance/transactions/page.tsx`

Add `taxClassification: ''` to the form state.

In the transaction form JSX, add after the entity selector:

```tsx
<div className="sm:col-span-2">
  <label className="text-xs text-muted-foreground">Tax Classification</label>
  <select
    value={form.taxClassification}
    onChange={e => setForm(p => ({ ...p, taxClassification: e.target.value }))}
    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
  >
    <option value="">None</option>
    {(form.type === 'expense' || form.type === 'transfer') && (
      <>
        <option value="tax_deduction">Tax Deduction</option>
        <option value="tax_payment">Tax Payment (PAYG, BAS)</option>
      </>
    )}
    {form.type === 'income' && (
      <>
        <option value="taxable_income">Taxable Income</option>
        <option value="exempt_income">Exempt Income</option>
      </>
    )}
  </select>
</div>
```

Include `taxClassification: form.taxClassification || null` in the POST/PUT payload.

---

## 5. Modal Validation — Red Field Highlights

This applies to **all four modals**: Bills, Income, Transactions, Categories.

### 5.1 Validation pattern to implement

Add a `errors` state object to each modal component:

```typescript
const [errors, setErrors] = useState<Record<string, string>>({})
```

Create a `validate()` function that returns `true` if valid, `false` if not, and populates `errors`:

```typescript
function validate(): boolean {
  const e: Record<string, string> = {}
  
  // Bills modal required fields:
  if (!form.name.trim()) e.name = 'Bill name is required'
  if (!form.amount || form.amount <= 0) e.amount = 'Amount must be greater than 0'
  if (!form.nextDueDate) e.nextDueDate = 'Due date is required'
  if (!form.categoryId) e.categoryId = 'Category is required'
  
  setErrors(e)
  return Object.keys(e).length === 0
}
```

At the top of `handleSave()`, call:
```typescript
if (!validate()) return
```

Clear field errors on change:
```typescript
onChange={e => {
  setForm(p => ({ ...p, name: e.target.value }))
  if (errors.name) setErrors(p => ({ ...p, name: '' }))
}}
```

### 5.2 Required fields per modal

**Bills modal:**
- `name` — Bill name (non-empty string)
- `amount` — must be > 0
- `nextDueDate` — must be a valid date
- `categoryId` — must be selected

**Income modal:**
- `name` — Income name (non-empty string)
- `amount` — must be > 0
- `nextExpectedDate` — must be a valid date
- `memberId` — required when `isTaxTracked === true` (warn, not block)

**Transactions modal:**
- `amount` — must be > 0
- `date` — must be a valid date
- `type` — must be set

**Categories modal:**
- `name` — non-empty string (already validated, just add visual highlight)

### 5.3 Visual treatment for invalid fields

Apply these CSS classes conditionally to each field's `<input>` / `<select>`:

```typescript
// Helper
function fieldClass(fieldName: string, base = '') {
  return cn(
    base || 'w-full rounded-md border bg-background px-3 py-1.5 text-sm',
    errors[fieldName]
      ? 'border-red-500 ring-1 ring-red-500 focus:ring-red-500'
      : 'border-input',
  )
}
```

Below each invalid field, render:
```tsx
{errors.name && (
  <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>
)}
```

Also show a summary at the top of the dialog if there are errors:
```tsx
{Object.keys(errors).length > 0 && (
  <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-600 dark:text-red-400 mb-2">
    Please fill in the highlighted fields before saving.
  </div>
)}
```

**Reset errors when the dialog opens/closes:**
```typescript
useEffect(() => {
  if (open) setErrors({})
}, [open])
```

---

## 6. Tax Report Page

### 6.1 New page: `src/app/(app)/finance/tax-report/page.tsx`

This replaces the manual Tax_Calculator.xlsx. It shows:
- Per-person view (Mark / Michelle tabs, matching the spreadsheet's side-by-side layout)
- Per-entity view (Personal, Super, Unitrak, Hopevale)
- Australian financial year selector (2022-23 through current FY + 1)
- All figures computed from actual Homebase data

### 6.2 Page structure

```
┌─────────────────────────────────────────────────────────┐
│  Tax Report   FY [2025-26 ▼]   Entity [All ▼]           │
│  ─────────────────────────────────────────────────────  │
│  TABS: [All] [Mark] [Michelle] [Super] [Unitrak] [...]  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ INCOME                               $188,003   │   │
│  │   Me Salary                           $69,293   │   │
│  │   Mark Salary                         $51,405   │   │
│  │   Bank Interest                       $49,306   │   │
│  │   SGC                                  $8,155   │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ DEDUCTIONS                            $40,000   │   │
│  │   Super Contributions (voluntary)     $20,000   │   │
│  │   Work expenses                        $2,500   │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ TOTAL TAXABLE INCOME                 $148,003   │   │
│  │   (Per week: $2,846)                            │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ ESTIMATED TAX PAYABLE                 $38,651   │   │
│  │ PAYG WITHHELD                        -$34,142   │   │
│  │ TAX PAYMENT INSTALLMENTS                  $0   │   │
│  ├═════════════════════════════════════════════════╡   │
│  │ ESTIMATED REFUND / (OWING)            $4,509    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Super Contributions Cap: $30,000  Used: $28,245  ✓    │
│  [Export Excel]  [Print]                                │
└─────────────────────────────────────────────────────────┘
```

### 6.3 Australian tax brackets (2025-26)

Implement `calculateAustralianTax(taxableIncome: number, fy: string): number`:

```typescript
function calculateAustralianTax(income: number, fy: string): number {
  // 2025-26 and 2026-27 brackets (Stage 3 cuts in effect)
  // $0–$18,200: 0%
  // $18,201–$45,000: 16c for each $1 over $18,200
  // $45,001–$135,000: $4,288 + 30c for each $1 over $45,000
  // $135,001–$190,000: $31,288 + 37c for each $1 over $135,000
  // $190,001+: $51,638 + 45c for each $1 over $190,000
  // Plus 2% Medicare Levy on income > $26,000 (approx threshold)
  
  const brackets = [
    { limit: 18200,  base: 0,      rate: 0 },
    { limit: 45000,  base: 0,      rate: 0.16 },
    { limit: 135000, base: 4288,   rate: 0.30 },
    { limit: 190000, base: 31288,  rate: 0.37 },
    { limit: Infinity, base: 51638, rate: 0.45 },
  ]
  
  let tax = 0
  let prev = 0
  for (const b of brackets) {
    if (income <= prev) break
    const taxable = Math.min(income, b.limit) - prev
    if (taxable <= 0) { prev = b.limit; continue }
    tax = b.base + (income - prev) * b.rate
    prev = b.limit
  }
  
  // Medicare Levy (simplified: 2% above low income threshold)
  const medicareThreshold = 26000
  if (income > medicareThreshold) {
    tax += income * 0.02
  }
  
  return Math.round(tax)
}
```

Note: Display a disclaimer: "Estimated only — based on 2025-26 tax brackets. Consult your accountant for exact figures."

### 6.4 Data aggregation logic

```typescript
// Per-person totals (using memberId on income entries and transactions)
// -- Wages: income entries where category name contains "Salary" or "Wages", filtered by memberId
// -- Bank interest: income entries in "Interest" category
// -- SGC: income entries in SGC category
// -- Deductions: transactions with taxClassification = 'tax_deduction', filtered by memberId
// -- Super contributions (voluntary): bills/transactions in super category with tax_deduction flag
// -- PAYG: transactions with taxClassification = 'tax_payment', filtered by memberId

// Joint income: income entries/transactions with no memberId, or entityId = joint entity
```

### 6.5 Entity tabs

The page shows tabs for each active `FinanceEntity`. Clicking a tab filters all income/deductions/payments to that entity only. An "All" tab shows combined across all entities.

Match the Tax Calculator layout:
- Joint income section (no entity filter or shared entity)
- Mark individual section
- Michelle individual section
- Each entity section (Super, Unitrak, Hopevale)

### 6.6 Super contributions cap indicator

```typescript
const SUPER_CAP_BY_FY: Record<string, number> = {
  '2022-23': 27500,
  '2023-24': 27500,
  '2024-25': 29932,
  '2025-26': 30000,
  '2026-27': 30000,
}
```

Display: "Super cap: $30,000 · Contributed: $28,245 · Remaining: $1,755 ✓"
Show in amber if over 90% used, red if over cap.

### 6.7 Navigation

Add "Tax Report" to the finance navigation. Find the finance layout at `src/app/(app)/finance/layout.tsx` and add the link there, matching the existing nav items.

### 6.8 File list for Tax Report page

```
src/app/(app)/finance/tax-report/page.tsx     ← new
src/app/api/finance/tax-report/route.ts       ← new
src/app/(app)/finance/layout.tsx              ← modify (add nav link)
```

---

## 7. Category List Updates — Tax Reporting Badge

**File:** `src/app/(app)/finance/categories/page.tsx`

In the category row rendering, add a `TAX RPT` badge alongside the existing `TAX DED` badge:

```tsx
{cat.taxIncludeInReporting && (
  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
    TAX RPT
  </span>
)}
```

Update the `Category` interface to include:
```typescript
taxIncludeInReporting: boolean
taxDisplayLabel: string | null
```

---

## 8. File Change Summary

### New files to create
```
prisma/migrations/20260517000000_add_tax_classification/migration.sql
src/app/(app)/finance/tax-report/page.tsx
src/app/api/finance/tax-report/route.ts
```

### Existing files to modify
```
prisma/schema.prisma
  — add taxClassification to FinanceTransaction, FinanceRecurringBill, FinanceIncomeEntry
  — add taxIncludeInReporting, taxDisplayLabel to FinanceCategory

src/app/api/finance/categories/route.ts
  — add taxIncludeInReporting, taxDisplayLabel to POST/PUT/GET

src/app/api/finance/bills/route.ts
  — add taxClassification to POST/PUT/GET

src/app/api/finance/income/route.ts
  — add taxClassification to POST/PUT/GET

src/app/api/finance/transactions/route.ts
  — add taxClassification to POST/PUT/GET

src/app/(app)/finance/categories/page.tsx
  — Category interface: add taxIncludeInReporting, taxDisplayLabel
  — CategoryDialog form: add taxIncludeInReporting, taxDisplayLabel fields
  — Category list: add TAX RPT badge
  — Add validation error state + red highlight pattern

src/app/(app)/finance/bills/page.tsx
  — Bill interface: add taxClassification
  — emptyForm + openEdit: add taxClassification
  — getFormPayload: include taxClassification
  — BillForm JSX: add Tax Classification dropdown after Entity
  — Add full validation: name, amount, nextDueDate, categoryId

src/app/(app)/finance/income/page.tsx
  — IncomeEntry interface: add taxClassification
  — Form state: add taxClassification
  — Modal JSX: add taxClassification dropdown (conditional on isTaxTracked)
  — Warn if isTaxTracked && !memberId
  — Add validation: name, amount, nextExpectedDate

src/app/(app)/finance/transactions/page.tsx
  — Transaction interface: add taxClassification
  — Form state: add taxClassification
  — Modal JSX: add taxClassification dropdown
  — Add validation: amount, date, type

src/app/(app)/finance/layout.tsx
  — Add "Tax Report" nav link

entrypoint.sh (or docker-entrypoint.sh)
  — Verify/add `npx prisma migrate deploy`
```

---

## 9. Testing Checklist

### Schema & Migration
- [ ] `npx prisma migrate status` shows new migration as pending, then applied
- [ ] `npx prisma generate` succeeds after schema edit
- [ ] All new columns visible in SQLite DB browser

### Categories
- [ ] "Include in Tax Report" checkbox saves and loads correctly
- [ ] "Tax Display Label" field appears/hides based on checkbox
- [ ] `TAX RPT` badge visible on category list for flagged categories
- [ ] Saving a category without name shows red highlight + error message

### Bills Modal
- [ ] Tax Classification dropdown appears and saves `tax_deduction` / `tax_payment` / null
- [ ] Saving without name → name field turns red, error message shown
- [ ] Saving with amount = 0 → amount field turns red
- [ ] Saving without category → category select turns red
- [ ] Errors clear when user fixes the field
- [ ] Red summary banner appears at top when any field is invalid

### Income Modal
- [ ] Tax Classification dropdown appears when "Include in Tax Tracking" is checked
- [ ] Amber warning shown when isTaxTracked and no member selected
- [ ] Required field validation works the same as bills

### Transactions Modal
- [ ] Tax Classification dropdown shows correct options for expense vs income type
- [ ] Validation works on amount and date

### Tax Report Page
- [ ] Page loads at `/finance/tax-report`
- [ ] FY selector changes the report period
- [ ] Tabs for each entity filter correctly
- [ ] Income entries with `isTaxTracked=true` appear in income section
- [ ] Transactions with `taxClassification='tax_deduction'` appear in deductions
- [ ] Categories with `taxIncludeInReporting=true` aggregate correctly
- [ ] Tax payable calculation uses correct Australian brackets
- [ ] Refund/owing = PAYG withheld − Tax payable shows correctly
- [ ] Super cap indicator shows correct amount and colour
- [ ] Disclaimer text visible: "Estimated only"

### Docker / NAS
- [ ] `entrypoint.sh` includes `npx prisma migrate deploy`
- [ ] Migration applies cleanly on NAS (run `docker compose up` and check logs)
- [ ] Prompt user: "Copy updated entrypoint.sh to NAS before next deploy"

---

## 10. Key Design Decisions (Accountant Thinking)

**Why `taxClassification` on individual records, not just the category?**  
Some bills span both deductible and non-deductible spending — e.g. a phone bill that's 50% work. Tagging the individual transaction allows exact control rather than forcing the category to be all-or-nothing.

**Why `isTaxTracked` on income entries AND `taxClassification` on transactions?**  
Income entries model recurring expected income (salary, rent). Transactions model one-off actual receipts. Both need tax treatment flags for complete coverage.

**Why `taxIncludeInReporting` on categories?**  
This is the "coarse" control — flip a switch on a category and all items in it flow through to the tax report automatically, without touching each individual bill/transaction. The `taxClassification` override on individual records is for exceptions.

**Why separate the entity selector from the tax person selector?**  
`entityId` = which business entity owns the record (Unitrak, Super, etc.).  
`memberId` = which individual person (Mark or Michelle) it belongs to for income tax.  
These are orthogonal. A Super fund income entry has `entityId=superEntity` and `memberId=mark` (Mark's super). The tax report needs both dimensions.

**Why keep the tax bracket calculations in the frontend?**  
They're read-only estimates and change annually. Keeping them in the page component makes them easy to update each July without a DB migration. The API returns raw figures; the page applies the brackets. Store the brackets in a typed constant object keyed by FY string.

---

*End of specification. Implement in order:*  
*Migration → schema.prisma + generate → API changes → Modal validation → Category UI → Bills UI → Income UI → Transactions UI → Tax Report page + API → nav link → test → docker check.*
