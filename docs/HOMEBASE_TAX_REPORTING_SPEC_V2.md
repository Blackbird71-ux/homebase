# Homebase — Tax Reporting & P&L Implementation Specification V2
## AI Agent Implementation Guide

> **Stack:** Next.js App Router · SQLite via Prisma · Tailwind + shadcn/ui · `sonner` toasts
> **Build:** Windows dev → Docker → Synology NAS production
> **Working dir:** `C:\Appdev\HomeBase`
> **Coding style:** Match existing patterns exactly — `requireSession()`, toast errors, inline page components
> **Reference year:** 2025-26 (Tax_Calculator.xlsx + 2027_BUDGET.xlsx)
> **Migrations:** SQL file → `npx prisma generate` → `migrate deploy` in entrypoint.sh (NAS + Windows)

---

## WHY V1 WAS WRONG — READ THIS FIRST

V1 made fundamental accounting errors. Do not implement V1's tax logic. Understand this before writing any code.

**Tax is NOT a flat rate on gross income.**
Taxable income = Gross income − Deductions (voluntary super, charity, work expenses).
Tax brackets are then applied to taxable income only.

**PAYG withheld is NOT an expense — it is a tax credit.**
Your employer withholds PAYG from wages during the year. At tax time:
- Calculate actual tax payable on taxable income using the brackets.
- Subtract PAYG already withheld (the credit).
- Result is the refund (negative) or amount owing (positive).

**SGC (employer super) is NOT personal income.**
SGC contributions go into the Super entity's accounts. They are income of the Super fund, NOT included in the individual's personal taxable income.

**Each entity has its own tax rate and its own P&L:**
- Personal (Mark / Michelle individually) — progressive ATO brackets + 2% Medicare levy
- Super fund — flat 15% on taxable income (fund income minus fund operating expenses)
- Unitrak (company) — flat 30% on taxable income
- Hopevale — income flows to personal marginal rates (included in personal section)

**Transfers between entities are EXCLUDED from P&L and Tax.**
A transfer from personal savings to super is a movement of funds — not an expense of personal, not income of super for P&L purposes. Tag these with `isTransfer = true` and exclude them everywhere.

**Joint income (bank interest) is split 50/50** between Mark and Michelle when calculating individual tax. The Tax_Calculator.xlsx shows this explicitly with formula `=SUM(C3/2)`.

**Franking credits (input credits) on dividends** are grossed up into assessable income AND then credited against tax payable (Australia's dividend imputation system).

---

## 0. PRE-FLIGHT CHECKS — AGENT MUST RUN FIRST

```bash
# From C:\Appdev\HomeBase

# 1. Check migration state
npx prisma migrate status

# 2. Check git — do NOT commit, user does this manually
git status

# 3. Verify SQLite provider
grep "provider" prisma/schema.prisma

# 4. Check which tax fields already exist — do NOT re-add these
grep -n "isTaxDeduction\|isTaxTracked\|taxRate\|taxClassification\|taxIncludeInReporting\|taxDisplayLabel\|isTransfer" prisma/schema.prisma

# 5. Check entrypoint for migrate deploy
cat entrypoint.sh 2>/dev/null || cat docker-entrypoint.sh 2>/dev/null
```

**Fields confirmed already in schema — do NOT add again:**
- `FinanceCategory.isTaxDeduction` — marks expense categories as ATO deductible
- `FinanceIncomeEntry.isTaxTracked` — marks income for tax tracking
- `FinanceIncomeEntry.taxRate` — estimated tax rate (Float?)
- `FinanceTransaction.entityId`, `FinanceRecurringBill.entityId`, `FinanceIncomeEntry.entityId` — entity FK

**Read the actual schema file before writing any code to understand current model shapes.**

---

## 1. WHAT NEEDS TO BE BUILT

| # | Feature | Type | Section |
|---|---|---|---|
| 1 | `taxClassification` on transactions, bills, income entries | Schema + Migration + API + UI | §2, §3, §4 |
| 2 | `taxIncludeInReporting` + `taxDisplayLabel` on categories | Schema + Migration + API + UI | §2, §3, §4 |
| 3 | `isTransfer` flag on transactions | Schema + Migration + API + UI | §2, §3, §4 |
| 4 | **P&L Report page** — per-entity, monthly columns | New page + API | §5 |
| 5 | **Tax Report page** — exact Tax_Calculator.xlsx workings | New page + API | §6 |
| 6 | Modal validation — red highlights + inline errors | All four modals | §7 |
| 7 | Prisma migration + generate | Migration SQL file | §2 |
| 8 | Docker entrypoint — `migrate deploy` present | entrypoint.sh | §2.4 |

**Implement in this exact order:**
Migration SQL → schema.prisma + generate → API changes → Modal validation → Category UI → Bills UI → Income UI → Transactions UI → P&L page + API → Tax Report page + API → nav links → test → docker check.

---

## 2. SCHEMA CHANGES

### 2.1 New fields to add

```prisma
// FinanceCategory — already has isTaxDeduction; ADD these two:
taxIncludeInReporting  Boolean  @default(false)
// When true, all transactions/bills in this category auto-include in the tax report.
taxDisplayLabel        String?
// Override label shown in tax report rows (e.g. "Salary", "Bank Interest").

// FinanceTransaction — ADD these two:
taxClassification      String?
// Valid values: "tax_deduction" | "taxable_income" | "exempt_income" | "tax_payment" | null
// tax_deduction and tax_payment valid for expense/transfer type transactions.
// taxable_income and exempt_income valid for income type transactions.
isTransfer             Boolean  @default(false)
// True = this transaction moves funds between entities.
// MUST be excluded from P&L totals and tax calculations to avoid double-counting.

// FinanceRecurringBill — ADD:
taxClassification      String?
// Valid values: "tax_deduction" | "tax_payment" | null

// FinanceIncomeEntry — already has isTaxTracked; ADD:
taxClassification      String?
// Valid values: "taxable_income" | "exempt_income" | null
```

### 2.2 Migration SQL file

Create this file at exactly this path:
`prisma/migrations/20260517000000_add_tax_fields_v2/migration.sql`

```sql
-- Add taxClassification to FinanceTransaction
ALTER TABLE "FinanceTransaction" ADD COLUMN "taxClassification" TEXT;

-- Add isTransfer to FinanceTransaction
ALTER TABLE "FinanceTransaction" ADD COLUMN "isTransfer" BOOLEAN NOT NULL DEFAULT false;

-- Add taxClassification to FinanceRecurringBill
ALTER TABLE "FinanceRecurringBill" ADD COLUMN "taxClassification" TEXT;

-- Add taxClassification to FinanceIncomeEntry
ALTER TABLE "FinanceIncomeEntry" ADD COLUMN "taxClassification" TEXT;

-- Add taxIncludeInReporting to FinanceCategory
ALTER TABLE "FinanceCategory" ADD COLUMN "taxIncludeInReporting" BOOLEAN NOT NULL DEFAULT false;

-- Add taxDisplayLabel to FinanceCategory
ALTER TABLE "FinanceCategory" ADD COLUMN "taxDisplayLabel" TEXT;
```

### 2.3 Update prisma/schema.prisma

After creating the migration SQL, add the six fields above to the matching models in the schema file. Match the formatting and comment style of the existing file exactly. Do NOT change or remove any existing fields.

Then run — do NOT skip this:
```bash
npx prisma generate
```

Do NOT run `npx prisma migrate dev`. The SQL file above is the migration. `migrate dev` would create a duplicate.

### 2.4 Docker entrypoint

Open `entrypoint.sh` (or `docker-entrypoint.sh` — check which one exists using the pre-flight grep). Verify it contains the following block. If missing, add it immediately before the `node server.js` or `npm start` line:

```sh
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Migrations complete."
```

After making this change, remind the user at the end of the session:
**"Copy the updated entrypoint.sh to the NAS before the next deploy so migrations apply in production."**

---

## 3. API CHANGES

### 3.1 Categories API — `src/app/api/finance/categories/route.ts`

In both the POST handler and the PUT handler, add to the destructured body and to the Prisma create/update data object:

```typescript
// Destructure from body:
const { name, type, isTaxDeduction, taxIncludeInReporting, taxDisplayLabel } = body

// In prisma.financeCategory.create / update data:
taxIncludeInReporting: taxIncludeInReporting ?? false,
taxDisplayLabel: taxDisplayLabel ?? null,
```

In the GET handler's `select` or `findMany`, include `taxIncludeInReporting` and `taxDisplayLabel` in the returned fields.

### 3.2 Bills API — `src/app/api/finance/bills/route.ts`

In POST and PUT handlers:
```typescript
// Destructure from body:
const { ..., taxClassification } = body

// In prisma data:
taxClassification: taxClassification || null,
```

Return `taxClassification` in all `select`/`findMany` responses.

### 3.3 Income API — `src/app/api/finance/income/route.ts`

Same pattern as bills — add `taxClassification` to POST/PUT body destructuring, Prisma data, and GET response.

### 3.4 Transactions API — `src/app/api/finance/transactions/route.ts`

```typescript
// Destructure from body:
const { ..., taxClassification, isTransfer } = body

// In prisma data:
taxClassification: isTransfer ? null : (taxClassification || null),
isTransfer: isTransfer ?? false,
```

Return both `taxClassification` and `isTransfer` in all responses.

### 3.5 New P&L API — `src/app/api/finance/pnl/route.ts`

Create this file. Follow the `requireSession` + `NextResponse.json` pattern used in other finance APIs.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET /api/finance/pnl?year=2025-26&entityId=optional
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year') ?? '2025-26'
  const entityId = searchParams.get('entityId') ?? null

  const [startYStr] = yearParam.split('-')
  const startYear = parseInt(startYStr)
  const fyStart = new Date(`${startYear}-07-01T00:00:00.000Z`)
  const fyEnd = new Date(`${startYear + 1}-06-30T23:59:59.999Z`)
  const familyId = session.familyId

  const entityFilter = entityId ? { entityId } : {}

  // Income entries for the FY — all entities or filtered
  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: { familyId, ...entityFilter, nextExpectedDate: { gte: fyStart, lte: fyEnd } },
    include: { category: true, entity: true, member: true },
    orderBy: { nextExpectedDate: 'asc' },
  })

  // Transactions — EXCLUDE transfers
  const transactions = await prisma.financeTransaction.findMany({
    where: {
      familyId,
      ...entityFilter,
      date: { gte: fyStart, lte: fyEnd },
      isTransfer: false,
    },
    include: { category: true, entity: true, member: true },
    orderBy: { date: 'asc' },
  })

  // Recurring bills
  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId, ...entityFilter, nextDueDate: { gte: fyStart, lte: fyEnd } },
    include: { category: true, entity: true },
    orderBy: { nextDueDate: 'asc' },
  })

  // All entities for this family (for tabs)
  const entities = await prisma.financeEntity.findMany({
    where: { familyId },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    financialYear: yearParam,
    period: { start: fyStart, end: fyEnd },
    incomeEntries,
    transactions,
    bills,
    entities,
  })
}
```

### 3.6 New Tax Report API — `src/app/api/finance/tax-report/route.ts`

Create this file. It returns all raw data — the page component does all calculations.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'

// GET /api/finance/tax-report?year=2025-26
export async function GET(request: NextRequest) {
  const session = await requireSession()
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year') ?? '2025-26'

  const [startYStr] = yearParam.split('-')
  const startYear = parseInt(startYStr)
  const fyStart = new Date(`${startYear}-07-01T00:00:00.000Z`)
  const fyEnd = new Date(`${startYear + 1}-06-30T23:59:59.999Z`)
  const familyId = session.familyId

  // All income entries for the FY across all entities
  const incomeEntries = await prisma.financeIncomeEntry.findMany({
    where: { familyId, nextExpectedDate: { gte: fyStart, lte: fyEnd } },
    include: { category: true, entity: true, member: true },
  })

  // ALL transactions — transfers included (they are separated in the page)
  const transactions = await prisma.financeTransaction.findMany({
    where: { familyId, date: { gte: fyStart, lte: fyEnd } },
    include: { category: true, entity: true, member: true },
  })

  // All recurring bills
  const bills = await prisma.financeRecurringBill.findMany({
    where: { familyId, nextDueDate: { gte: fyStart, lte: fyEnd } },
    include: { category: true, entity: true },
  })

  // Entities and members
  const entities = await prisma.financeEntity.findMany({ where: { familyId } })
  const members = await prisma.familyMember.findMany({ where: { familyId } })

  return NextResponse.json({
    financialYear: yearParam,
    period: { start: fyStart, end: fyEnd },
    incomeEntries,
    transactions,
    bills,
    entities,
    members,
  })
}
```

---

## 4. UI CHANGES — EXISTING MODALS

### 4.1 Categories Modal — `src/app/(app)/finance/categories/page.tsx`

**Step 1 — Update the TypeScript interface:**
```typescript
interface Category {
  // ... all existing fields unchanged ...
  taxIncludeInReporting: boolean
  taxDisplayLabel: string | null
}
```

**Step 2 — Add to form state initialiser and emptyForm object:**
```typescript
taxIncludeInReporting: false,
taxDisplayLabel: '',
```

**Step 3 — In the editing useEffect, populate from the existing record:**
```typescript
taxIncludeInReporting: editing.taxIncludeInReporting ?? false,
taxDisplayLabel: editing.taxDisplayLabel ?? '',
```

**Step 4 — In the JSX form, after the existing `isTaxDeduction` checkbox, add:**
```tsx
{/* Include in Tax Report checkbox */}
<label className="flex items-center gap-1.5 text-sm cursor-pointer">
  <input
    type="checkbox"
    checked={form.taxIncludeInReporting}
    onChange={e => setForm(p => ({ ...p, taxIncludeInReporting: e.target.checked }))}
    disabled={saving}
  />
  <span className="text-amber-600 dark:text-amber-400 font-medium">
    Include in Tax Report
  </span>
</label>

{/* Tax Display Label — only shown when Include in Tax Report is checked */}
{form.taxIncludeInReporting && (
  <div className="sm:col-span-2 mt-1">
    <label className="text-xs text-muted-foreground">
      Tax Report Label{' '}
      <span className="text-muted-foreground/60">
        (optional — overrides category name in report)
      </span>
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

**Step 5 — Include in `handleSave()` POST/PUT payload:**
```typescript
taxIncludeInReporting: form.taxIncludeInReporting,
taxDisplayLabel: form.taxDisplayLabel || null,
```

**Step 6 — Add TAX RPT badge in the category list rows**, immediately after the existing `TAX DED` badge:
```tsx
{cat.taxIncludeInReporting && (
  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
    TAX RPT
  </span>
)}
```

### 4.2 Bills Modal — `src/app/(app)/finance/bills/page.tsx`

**Step 1 — Update interface:**
```typescript
interface Bill {
  // ... existing fields ...
  taxClassification: string | null
}
```

**Step 2 — Add to emptyForm:**
```typescript
taxClassification: '',
```

**Step 3 — In `openEdit(b)`:**
```typescript
taxClassification: b.taxClassification ?? '',
```

**Step 4 — In `getFormPayload()`:**
```typescript
taxClassification: form.taxClassification || null,
```

**Step 5 — In the form JSX, after the entity selector, add:**
```tsx
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
    <option value="tax_payment">Tax Payment (PAYG instalment, BAS, etc.)</option>
  </select>
  {form.taxClassification && (
    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
      This bill will appear in the Tax Report under{' '}
      {form.taxClassification === 'tax_deduction' ? 'Deductions' : 'Tax Payments'}.
    </p>
  )}
</div>
```

### 4.3 Income Modal — `src/app/(app)/finance/income/page.tsx`

**Step 1 — Update interface and add to form state:**
```typescript
// In interface:
taxClassification: string | null
// In emptyForm / form state initialiser:
taxClassification: '',
// In openEdit:
taxClassification: editing.taxClassification ?? '',
// In POST/PUT payload:
taxClassification: form.taxClassification || null,
```

**Step 2 — In the modal JSX, after the existing isTaxTracked section, add:**
```tsx
{/* Tax Classification — only when isTaxTracked is on */}
{form.isTaxTracked && (
  <div className="sm:col-span-2">
    <label className="text-xs text-muted-foreground">Tax Classification</label>
    <select
      value={form.taxClassification ?? ''}
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

{/* Warn if isTaxTracked but no member selected */}
{form.isTaxTracked && !form.memberId && (
  <p className="text-xs text-amber-600 dark:text-amber-400 sm:col-span-2">
    ⚠ Select a person so this income appears in the correct individual tax summary.
  </p>
)}
```

### 4.4 Transactions Modal — `src/app/(app)/finance/transactions/page.tsx`

**Step 1 — Update interface and form state:**
```typescript
// In interface:
taxClassification: string | null
isTransfer: boolean
// In emptyForm:
taxClassification: '',
isTransfer: false,
// In openEdit:
taxClassification: editing.taxClassification ?? '',
isTransfer: editing.isTransfer ?? false,
// In POST/PUT payload:
isTransfer: form.isTransfer ?? false,
taxClassification: form.isTransfer ? null : (form.taxClassification || null),
```

**Step 2 — In the form JSX, after the entity selector, add:**
```tsx
{/* Transfer flag */}
<label className="flex items-center gap-1.5 text-sm cursor-pointer sm:col-span-2">
  <input
    type="checkbox"
    checked={form.isTransfer ?? false}
    onChange={e => setForm(p => ({ ...p, isTransfer: e.target.checked, taxClassification: '' }))}
    disabled={saving}
  />
  <span className="text-muted-foreground">
    This is a transfer between entities (excluded from P&amp;L and tax)
  </span>
</label>

{/* Tax Classification — hidden when isTransfer is true */}
{!form.isTransfer && (
  <div className="sm:col-span-2">
    <label className="text-xs text-muted-foreground">Tax Classification</label>
    <select
      value={form.taxClassification ?? ''}
      onChange={e => setForm(p => ({ ...p, taxClassification: e.target.value }))}
      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      disabled={saving}
    >
      <option value="">None</option>
      {form.type === 'expense' && (
        <>
          <option value="tax_deduction">Tax Deduction (ATO deductible)</option>
          <option value="tax_payment">Tax Payment (PAYG, BAS instalment)</option>
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
)}
```

---

## 5. P&L REPORT PAGE

### 5.1 Files

```
src/app/(app)/finance/pnl/page.tsx       ← new page component
src/app/api/finance/pnl/route.ts         ← new API (built in §3.5)
```

### 5.2 What this page shows

This mirrors the NETT sheet of 2027_BUDGET.xlsx. For each entity, it shows income and expenses by category with a column for each month of the financial year (Jul–Jun) plus an annual total column. A NET row shows income minus expenses for each month and for the year.

The user selects a financial year and optionally filters by entity tab.

### 5.3 Page structure

```
┌─────────────────────────────────────────────────────────────┐
│  P&L Report   FY [2025-26 ▼]                                │
│  ──────────────────────────────────────────────────────────  │
│  [All] [Personal] [Super] [Unitrak] [Hopevale]               │
│                                                              │
│  PERSONAL                                                    │
│  ┌────────────────┬───┬───┬───┬───┬───┬───┬───┬───┬───┬─── │
│  │                │JUL│AUG│SEP│OCT│NOV│DEC│JAN│FEB│MAR│TOTAL│
│  ├ INCOME ────────┼───┼───┼───┼───┼───┼───┼───┼───┼───┼─── │
│  │ Me Salary      │5,330│6,663│...                   │69,293│
│  │ Mark Salary    │3,672│3,672│...                   │51,405│
│  │ NAB Term Dep.  │  — │8,083│...                   │49,306│
│  │ Savings Int    │1,500│1,500│...                   │18,000│
│  │ Total Income   │10,502│19,918│...                │188,004│
│  ├ EXPENSES ──────┼───┼───┼───┼───┼───┼───┼───┼───┼───┼─── │
│  │ PAYG - Me      │1,392│1,392│...                   │20,816│
│  │ PAYG - Mark    │  958│1,052│...                   │13,326│
│  │ House Insurance│  311│  311│...                    │3,732│
│  │ ... all rows   │                                         │
│  │ Total Expenses │14,085│15,530│...                │170,245│
│  ├ NET ───────────┼───┼───┼───┼───┼───┼───┼───┼───┼───┼─── │
│  │ NET            │-3,583│4,388│... [green/red]      │17,759│
│  └────────────────┴───┴───┴───┴───┴───┴───┴───┴───┴───┴─── │
│                                                              │
│  SUPER                                                       │
│  [same table]                                                │
│                                                              │
│  UNITRAK / HOPEVALE                                          │
│  [same table]                                                │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Data aggregation rules

All aggregation happens in the page component, not the API.

**Monthly buckets:** Create 12 buckets, one per month Jul–Jun. Key by `YYYY-MM` string (e.g. `"2025-07"`).

**Income rows:** From `incomeEntries`. Group records by `category.taxDisplayLabel ?? category.name`. Place each record's `amount` into the bucket matching its `nextExpectedDate` month. One row per unique category label.

**Expense rows:** From `transactions` (where `type = 'expense'` and `isTransfer = false`) and `bills`. Group by `category.taxDisplayLabel ?? category.name`. Place into bucket matching `date` (transactions) or `nextDueDate` (bills).

**Exclude:** Any `transaction` where `isTransfer = true`. Do not show these anywhere in the P&L.

**Entity filter:** When an entity tab is selected, only include records where `entityId` matches. The "All" tab shows each entity as a separate named section stacked vertically.

**Totals:**
- `Total Income` row = sum of all income rows for that month
- `Total Expenses` row = sum of all expense rows for that month
- `NET` row = Total Income − Total Expenses
- Annual total column = sum of the 12 monthly values for each row

### 5.5 Display rules

- Currency: whole dollars, formatted `$#,##0`. Use `—` (em dash) for months with no value — never show `$0`.
- NET row: green text if positive (`text-green-600 dark:text-green-400`), red if negative (`text-red-600 dark:text-red-400`).
- Total column: bold.
- Table must be horizontally scrollable — wrap in `<div className="overflow-x-auto">`.
- Month header abbreviations: JUL AUG SEP OCT NOV DEC JAN FEB MAR APR MAY JUN.
- Row labels: left-aligned. Amounts: right-aligned (`text-right`).
- Section headers (INCOME, EXPENSES, NET): slightly larger or bold, visually separated.

---

## 6. TAX REPORT PAGE

### 6.1 Files

```
src/app/(app)/finance/tax-report/page.tsx    ← new page component
src/app/api/finance/tax-report/route.ts      ← new API (built in §3.6)
```

### 6.2 What this page shows

This replaces Tax_Calculator.xlsx. It shows the complete tax workings for the financial year — every line item visible, nothing hidden in a total. The structure exactly mirrors the spreadsheet the user already understands.

Sections, in order:
1. Joint Income (bank interest, Hopevale distributions) — split 50/50
2. Mark individual panel (gross income, deductions, taxable, tax payable, credits, refund/owing)
3. Michelle individual panel (same structure, side by side with Mark)
4. Combined refund/owing
5. Super fund P&L and tax (15% rate, PAYG instalments, BAS estimates)
6. Unitrak P&L and tax (30% rate)
7. Super contributions cap tracker per person

### 6.3 Tax calculation functions — implement exactly as follows

All functions live in the page component file. The API returns raw data only.

```typescript
// ── 2025-26 ATO income tax brackets (Stage 3 cuts in effect) ─────────────
// $0–$18,200: 0%
// $18,201–$45,000: 16c per $1 over $18,200
// $45,001–$135,000: $4,288 + 30c per $1 over $45,000
// $135,001–$190,000: $31,288 + 37c per $1 over $135,000
// $190,001+: $51,638 + 45c per $1 over $190,000
function calculateIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0
  if (taxableIncome <= 18200) return 0
  if (taxableIncome <= 45000) return (taxableIncome - 18200) * 0.16
  if (taxableIncome <= 135000) return 4288 + (taxableIncome - 45000) * 0.30
  if (taxableIncome <= 190000) return 31288 + (taxableIncome - 135000) * 0.37
  return 51638 + (taxableIncome - 190000) * 0.45
}

// ── Medicare levy ─────────────────────────────────────────────────────────
// 2% on income above ~$26,000 (simplified, matching Tax_Calculator.xlsx)
function calculateMedicareLevy(taxableIncome: number): number {
  if (taxableIncome <= 26000) return 0
  return taxableIncome * 0.02
}

// ── Total personal tax payable ────────────────────────────────────────────
function calculatePersonalTax(taxableIncome: number): number {
  return Math.round(calculateIncomeTax(taxableIncome) + calculateMedicareLevy(taxableIncome))
}

// ── Super contributions cap by FY ────────────────────────────────────────
const SUPER_CAP: Record<string, number> = {
  '2022-23': 27500,
  '2023-24': 27500,
  '2024-25': 29932,
  '2025-26': 30000,
  '2026-27': 30000,
}
```

### 6.4 Data aggregation rules — how to classify raw API records

The API returns all income entries, transactions, and bills. Classify them as follows. Use `category.name` (case-insensitive contains) and `taxClassification` field and `memberId` / `entityId` to sort records into the right buckets.

**Identifying entities:** The `entities` array from the API has `name` fields. Find entities by name containing "Super", "Unitrak", "Hopevale". Records with `entityId = null` or the personal entity belong to Personal.

**Identifying members:** The `members` array has `name` fields. Match "Mark" and "Michelle" by name.

---

**JOINT INCOME bucket** — records that belong to both people equally:
- `FinanceIncomeEntry` where `memberId = null` AND (`entityId = null` OR entity is Personal)
- `FinanceTransaction` where `type = 'income'` AND `memberId = null` AND entity is Personal AND `isTransfer = false`
- Total joint income is split 50/50 and added to each person's gross income.
- Display each line item (Bank interest NAB, Bank interest savings, Hopevale, etc.) separately.

**MARK GROSS INCOME** — sum of:
1. Wages: `FinanceIncomeEntry` where `member.name` contains "Mark" and `category.name` contains "Salary" or "Wages"
2. Joint bank interest ÷ 2
3. Hopevale income: income entries/transactions where entity is Hopevale and `memberId = mark`
4. Unitrak dividends: transactions where entity is Unitrak and `taxClassification = 'taxable_income'` and `memberId = mark`
5. Franking credits: `FinanceIncomeEntry` where `category.name` contains "Input Credits" or "Franking" and `memberId = mark`
6. Any other `FinanceIncomeEntry` or transaction with `taxClassification = 'taxable_income'` and `memberId = mark`

Display every line as a separate row. Mark each row's source clearly.

**MARK DEDUCTIONS** — sum of:
1. Voluntary super: `FinanceTransaction` or `FinanceRecurringBill` where `taxClassification = 'tax_deduction'` AND `memberId = mark` AND `category.name` contains "Super"
2. Charity/gifts: `taxClassification = 'tax_deduction'` AND `memberId = mark` AND category contains "Charity" or "Gift"
3. Other deductions: all remaining `taxClassification = 'tax_deduction'` for mark AND `category.isTaxDeduction = true` for mark

Display every line as a separate row with category name and amount.

**MARK TOTAL TAXABLE** = Mark gross income − Mark total deductions
**Mark per week** = Mark total taxable ÷ 52

**MARK TAX PAYABLE** = calculatePersonalTax(Mark total taxable)
Show sub-lines:
- Income tax (brackets): calculateIncomeTax(taxable)
- Medicare levy: calculateMedicareLevy(taxable)
- Less: franking credits (negative number)
- Total tax payable

**MARK CREDITS (tax already paid)**:
1. PAYG withheld: `FinanceTransaction` where `taxClassification = 'tax_payment'` AND `memberId = mark` AND category contains "PAYG" (but NOT "PAYG instalment" for entities — only personal PAYG)
2. Extra PAYG: transactions where `taxClassification = 'tax_payment'` AND `memberId = mark` AND category does NOT contain a bill-type label (user-entered extra withholding)
3. PAYGW instalments: transactions marked as tax_payment and memberId = mark but not withheld at source
4. Tax credit for dividends: same value as franking credits added to income above

**MARK REFUND / (OWING)** = Total credits − Tax payable
- Negative result = amount owing → show in red with "OWING"
- Positive result = refund → show in green with "REFUND"

Note: The Tax_Calculator.xlsx formula is `=SUM(C32-C38)` where C32 is tax payable and C38 is total credits. If credits exceed payable, result is negative = refund. Apply same sign convention.

Same structure for Michelle using `memberId = michelle`.

**COMBINED** = Mark refund/owing + Michelle refund/owing. Display at the bottom of the personal section.

---

**SUPER FUND SECTION:**

Income:
- All `FinanceIncomeEntry` where `entityId = superEntity` — rental income (37 Ninth, 39 Ninth), reimbursements, term deposits (NAB, MQ), savings interest, SGC Me, SGC Mark
- Display each line separately with category label

Expenses (operating costs only — NOT PAYG instalments, NOT transfers):
- `FinanceTransaction` where `entityId = superEntity` AND `isTransfer = false` AND `taxClassification != 'tax_payment'`
- `FinanceRecurringBill` where `entityId = superEntity` AND `taxClassification != 'tax_payment'`
- Items from budget: Accounting, ASIC, Auditor, Admin (Wendy), Property rates, Property water, Property insurance, Property tax (land tax), Xero

Taxable income = Super income − Super operating expenses

Tax @ 15% = taxable income × 0.15

PAYG instalments paid:
- `FinanceTransaction` where `entityId = superEntity` AND `taxClassification = 'tax_payment'`
- From budget: $6,078 paid quarterly = $24,312 annually

Super tax owing / (refund) = Tax payable − PAYG instalments
Quarterly BAS estimate = annual tax ÷ 4

**UNITRAK SECTION:**

Income:
- `FinanceIncomeEntry` where `entityId = unitrakEntity`
- From budget: Term deposit interest, Bank interest

Expenses:
- `FinanceTransaction` or `FinanceRecurringBill` where `entityId = unitrakEntity` AND `taxClassification != 'tax_payment'`
- From budget: Accountants, ASIC

Taxable income = Unitrak income − Unitrak expenses
Tax @ 30% = taxable income × 0.30
PAYG instalments: transactions where `entityId = unitrakEntity` AND `taxClassification = 'tax_payment'`
Quarterly BAS = annual tax ÷ 4

---

### 6.5 Super contributions cap display

For each person, calculate and display:
```
Super contributions cap: $30,000                     [from SUPER_CAP constant]
  Employer SGC (Me):           $8,155
  Employer SGC (Mark):         $6,169
  Voluntary contributions:    $20,000
  ─────────────────────────────────
  Total contributed (Me):     $28,155   ← colour coded
  Remaining cap (Me):          $1,845

Colour rules:
  < 90% of cap → green
  90%–100% of cap → amber with ⚠
  > cap → red with ✗ "Exceeds concessional cap"
```

SGC amounts come from `incomeEntries` where `entityId = superEntity` and `category.name` contains "SGC" and the appropriate memberId.

Voluntary contributions come from `transactions` or `bills` where `taxClassification = 'tax_deduction'` AND `memberId = person` AND `category.name` contains "Super" AND entity is personal (the member's voluntary top-up, not within the fund itself).

### 6.6 Full page layout wireframe

```
TAX REPORT   FY [2025-26 ▼]
Estimated only. Based on 2025-26 ATO tax brackets. Consult your accountant.
────────────────────────────────────────────────────────────────────────────

JOINT INCOME
  Bank interest (NAB + savings)                               $67,306
  Hopevale distributions                                         ($731)
  ─────────────────────────────────────────────────────────────────────
  Total joint income                                          $65,000 *
  * Split equally: Mark $32,500 · Michelle $32,500

┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│ MARK                             │  │ MICHELLE                         │
│ ─────────────────────────────    │  │ ─────────────────────────────    │
│ GROSS INCOME                     │  │ GROSS INCOME                     │
│   Wages                 $52,284  │  │   Wages                 $75,751  │
│   Bank interest (joint) $32,500  │  │   Bank interest (joint) $32,500  │
│   Hopevale income            $0  │  │   Hopevale income            $0  │
│   Unitrak dividends          $0  │  │   Unitrak dividends          $0  │
│   Franking credits           $0  │  │   Franking credits           $0  │
│   Total gross income    $84,784  │  │   Total gross income   $108,251  │
│                                  │  │                                  │
│ DEDUCTIONS                       │  │ DEDUCTIONS                       │
│   Voluntary super       $20,000  │  │   Voluntary super       $20,000  │
│   Charity / gifts            $0  │  │   Charity / gifts          $550  │
│   Other deductions           $0  │  │   Other deductions           $0  │
│   Total deductions      $20,000  │  │   Total deductions      $20,550  │
│                                  │  │                                  │
│ TOTAL TAXABLE           $64,784  │  │ TOTAL TAXABLE           $87,701  │
│ Per week                 $1,246  │  │ Per week                 $1,687  │
│                                  │  │                                  │
│ TAX CALCULATION                  │  │ TAX CALCULATION                  │
│   Income tax (brackets) $10,264  │  │   Income tax (brackets) $17,202  │
│   Medicare levy (2%)     $1,296  │  │   Medicare levy (2%)     $1,754  │
│   Less: franking credits     $0  │  │   Less: franking credits     $0  │
│   Tax payable           $11,560  │  │   Tax payable           $18,956  │
│                                  │  │                                  │
│ TAX ALREADY PAID                 │  │ TAX ALREADY PAID                 │
│   PAYG withheld        ($13,326) │  │   PAYG withheld        ($20,816) │
│   Extra PAYG                 $0  │  │   Extra PAYG                 $0  │
│   PAYGW instalments          $0  │  │   PAYGW instalments          $0  │
│   Tax credit (divs)          $0  │  │   Tax credit (divs)          $0  │
│   Total credits        ($13,326) │  │   Total credits        ($20,816) │
│                                  │  │                                  │
│ ════════════════════════════════  │  │ ════════════════════════════════  │
│ REFUND / (OWING)        ($1,766) │  │ REFUND / (OWING)        ($1,860) │
│                  ← REFUND (green)│  │                  ← REFUND (green)│
└──────────────────────────────────┘  └──────────────────────────────────┘

COMBINED REFUND / (OWING)                                      ($3,626)

════════════════════════════════════════════════════════════════════════════

SUPER FUND (15% tax rate)
  INCOME
    Rent — 37 Ninth                                            $31,640
    Rent — 39 Ninth                                            $72,000
    Reimbursements — 37 Ninth                                   $5,279
    Reimbursements — 39 Ninth                                   $6,837
    Term deposits (NAB)                                        $41,533
    Term deposits (MQ)                                         $13,437
    Savings interest                                            $3,480
    SGC — Me                                                    $8,155
    SGC — Mark                                                  $6,169
  Total income                                               $188,530

  OPERATING EXPENSES
    Accounting                                                  $4,800
    ASIC                                                           $67
    Auditor                                                        $850
    Admin (Wendy)                                               $2,100
    Property rates (37+39)                                     $10,340
    Property water                                              $1,760
    Property insurance                                          $2,685
    Property tax                                                $1,815
    Xero                                                           $391
  Total expenses                                              ($24,808)

  ─────────────────────────────────────────────────────────────────────
  Taxable income                                              $163,722
  Tax @ 15%                                                  ($24,558)
  Less: PAYG instalments paid                                ($24,312)
  ═════════════════════════════════════════════════════════════════════
  TAX OWING / (REFUND)                                          ($246)

  Quarterly BAS instalment estimate: $6,140

  SUPER CONTRIBUTIONS CAP ($30,000)
    Me — SGC: $8,155 + Voluntary: $20,000 = Total: $28,155 ✓ ($1,845 remaining)
    Mark — SGC: $6,169 + Voluntary: $20,000 = Total: $26,169 ✓ ($3,831 remaining)

════════════════════════════════════════════════════════════════════════════

UNITRAK (30% company tax rate)
  INCOME
    Term deposit interest                                      $16,689
    Bank interest                                                 $960
  Total income                                                $17,649

  EXPENSES
    Accountants                                                 $6,600
    ASIC                                                           $320
  Total expenses                                              ($6,920)

  ─────────────────────────────────────────────────────────────────────
  Taxable income                                               $10,729
  Tax @ 30%                                                   ($3,219)
  Less: PAYG instalments paid                                  ($1,744)
  ═════════════════════════════════════════════════════════════════════
  TAX OWING / (REFUND)                                         $1,475   ← OWING (red)

  Quarterly BAS instalment estimate: $805
```

### 6.7 Navigation

Add both links to `src/app/(app)/finance/layout.tsx`. Match existing nav item format exactly:
- Label: "P&L" — href: `/finance/pnl`
- Label: "Tax Report" — href: `/finance/tax-report`

---

## 7. MODAL VALIDATION

Applies to all four modals: Bills, Income, Transactions, Categories.

### 7.1 State and reset pattern

Add to each modal component at the top of the function body:
```typescript
const [errors, setErrors] = useState<Record<string, string>>({})
```

Reset when the dialog opens or closes:
```typescript
useEffect(() => {
  if (open) setErrors({})
}, [open])
```

### 7.2 validate() function — required fields per modal

Call `validate()` at the very top of `handleSave()`. If it returns `false`, return immediately without making the API call.

**Bills modal:**
```typescript
function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.name?.trim())                    e.name = 'Bill name is required'
  if (!form.amount || Number(form.amount) <= 0) e.amount = 'Amount must be greater than 0'
  if (!form.nextDueDate)                     e.nextDueDate = 'Due date is required'
  if (!form.categoryId)                      e.categoryId = 'Category is required'
  setErrors(e)
  return Object.keys(e).length === 0
}
```

**Income modal:**
```typescript
function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.name?.trim())                       e.name = 'Income name is required'
  if (!form.amount || Number(form.amount) <= 0) e.amount = 'Amount must be greater than 0'
  if (!form.nextExpectedDate)                   e.nextExpectedDate = 'Expected date is required'
  setErrors(e)
  return Object.keys(e).length === 0
}
// Note: memberId is warned (amber) but does NOT block save
```

**Transactions modal:**
```typescript
function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.amount || Number(form.amount) <= 0) e.amount = 'Amount must be greater than 0'
  if (!form.date)                               e.date = 'Date is required'
  if (!form.type)                               e.type = 'Transaction type is required'
  setErrors(e)
  return Object.keys(e).length === 0
}
```

**Categories modal:**
```typescript
function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.name?.trim()) e.name = 'Category name is required'
  setErrors(e)
  return Object.keys(e).length === 0
}
```

### 7.3 CSS helper and field classes

Add this helper to each modal component:
```typescript
function fieldClass(fieldName: string, base?: string): string {
  const baseClasses = base ?? 'w-full rounded-md border bg-background px-3 py-1.5 text-sm'
  return errors[fieldName]
    ? `${baseClasses} border-red-500 ring-1 ring-red-500`
    : `${baseClasses} border-input`
}
```

Apply to validated fields:
```tsx
<input className={fieldClass('name')} ... />
<select className={fieldClass('categoryId')} ... />
```

Clear the error on change — do this for every validated field:
```tsx
onChange={e => {
  setForm(p => ({ ...p, name: e.target.value }))
  if (errors.name) setErrors(p => ({ ...p, name: '' }))
}}
```

### 7.4 Inline error messages under each field

```tsx
{errors.name && (
  <p className="text-xs text-red-500 mt-0.5">{errors.name}</p>
)}
```

Add this below every `<input>` and `<select>` that has a validation rule.

### 7.5 Summary banner at top of dialog content

Add this immediately inside the dialog content, before the first form field, in each modal:
```tsx
{Object.keys(errors).length > 0 && (
  <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-600 dark:text-red-400 mb-3">
    Please fill in the highlighted fields before saving.
  </div>
)}
```

---

## 8. FILE CHANGE SUMMARY

### New files — create from scratch

```
prisma/migrations/20260517000000_add_tax_fields_v2/migration.sql
src/app/api/finance/pnl/route.ts
src/app/api/finance/tax-report/route.ts
src/app/(app)/finance/pnl/page.tsx
src/app/(app)/finance/tax-report/page.tsx
```

### Existing files — what changes in each

```
prisma/schema.prisma
  FinanceTransaction:   + taxClassification String?
                        + isTransfer Boolean @default(false)
  FinanceRecurringBill: + taxClassification String?
  FinanceIncomeEntry:   + taxClassification String?
  FinanceCategory:      + taxIncludeInReporting Boolean @default(false)
                        + taxDisplayLabel String?

src/app/api/finance/categories/route.ts
  POST + PUT body:  add taxIncludeInReporting, taxDisplayLabel
  Prisma data:      taxIncludeInReporting ?? false, taxDisplayLabel ?? null
  GET response:     include both new fields

src/app/api/finance/bills/route.ts
  POST + PUT body:  add taxClassification
  Prisma data:      taxClassification || null
  GET response:     include taxClassification

src/app/api/finance/income/route.ts
  POST + PUT body:  add taxClassification
  Prisma data:      taxClassification || null
  GET response:     include taxClassification

src/app/api/finance/transactions/route.ts
  POST + PUT body:  add taxClassification, isTransfer
  Prisma data:      taxClassification (null when isTransfer), isTransfer ?? false
  GET response:     include both fields

src/app/(app)/finance/categories/page.tsx
  Category interface:   + taxIncludeInReporting: boolean, taxDisplayLabel: string | null
  Form state:           + taxIncludeInReporting, taxDisplayLabel
  openEdit useEffect:   populate both fields
  handleSave payload:   include both fields
  Form JSX:             + taxIncludeInReporting checkbox + conditional taxDisplayLabel input
  Category list rows:   + TAX RPT badge
  Validation:           + errors state, validate(), fieldClass(), error messages, banner

src/app/(app)/finance/bills/page.tsx
  Bill interface:     + taxClassification: string | null
  emptyForm:          + taxClassification: ''
  openEdit:           + taxClassification: b.taxClassification ?? ''
  getFormPayload:     + taxClassification: form.taxClassification || null
  Form JSX:           + Tax Classification dropdown (after entity selector)
  Validation:         + errors state, validate(), fieldClass(), error messages, banner

src/app/(app)/finance/income/page.tsx
  IncomeEntry interface: + taxClassification: string | null
  Form state:            + taxClassification: ''
  openEdit:              + taxClassification
  POST/PUT payload:      + taxClassification: form.taxClassification || null
  Form JSX:              + taxClassification dropdown (when isTaxTracked), member warning
  Validation:            + errors state, validate(), fieldClass(), error messages, banner

src/app/(app)/finance/transactions/page.tsx
  Transaction interface: + taxClassification: string | null, isTransfer: boolean
  Form state:            + taxClassification: '', isTransfer: false
  openEdit:              + both fields
  POST/PUT payload:      + both fields (taxClassification null when isTransfer)
  Form JSX:              + isTransfer checkbox, conditional taxClassification dropdown
  Validation:            + errors state, validate(), fieldClass(), error messages, banner

src/app/(app)/finance/layout.tsx
  Nav:  + "P&L" link to /finance/pnl
        + "Tax Report" link to /finance/tax-report

entrypoint.sh (or docker-entrypoint.sh)
  Add before start command:
    echo "Running Prisma migrations..."
    npx prisma migrate deploy
    echo "Migrations complete."
```

---

## 9. TESTING CHECKLIST

### Migration and schema
- [ ] `npx prisma migrate status` shows the new migration as pending before running
- [ ] After running, status shows migration as applied
- [ ] `npx prisma generate` succeeds with no type errors
- [ ] SQLite DB has 6 new columns visible

### Categories modal
- [ ] "Include in Tax Report" checkbox saves and reloads correctly
- [ ] Tax Display Label input appears only when checkbox is checked
- [ ] Saving with Tax Display Label populated saves the value
- [ ] TAX RPT badge appears next to category in the list
- [ ] Saving with empty name blocks save, shows red border, shows error message below field

### Bills modal
- [ ] Tax Classification dropdown saves correctly: tax_deduction / tax_payment / null (empty)
- [ ] Helper text appears below dropdown when a value is selected
- [ ] Validation: empty name → red border + error, save blocked
- [ ] Validation: amount = 0 → red border + error, save blocked
- [ ] Validation: no due date → red border + error, save blocked
- [ ] Validation: no category → red border + error, save blocked
- [ ] Fixing a field clears its red state immediately
- [ ] Red banner appears at top when any field fails validation

### Income modal
- [ ] Tax Classification dropdown only appears when isTaxTracked is checked
- [ ] Amber ⚠ warning shows when isTaxTracked but no member selected
- [ ] Warning does NOT block save (only warns)
- [ ] Validation: name, amount, date all required

### Transactions modal
- [ ] isTransfer checkbox saves correctly and marks transaction
- [ ] When isTransfer is checked, Tax Classification dropdown disappears
- [ ] Correct classification options shown for expense type vs income type
- [ ] Validation: amount, date, type all required

### P&L page
- [ ] Page loads at /finance/pnl without errors
- [ ] FY selector changes data displayed
- [ ] All entity tabs present and filter correctly
- [ ] Income rows grouped by category, amounts in correct monthly columns
- [ ] Expense rows grouped by category, amounts in correct monthly columns
- [ ] Transactions with isTransfer = true do NOT appear anywhere in P&L
- [ ] Annual Total column = sum of 12 monthly columns for each row
- [ ] Total Income / Total Expenses / NET rows correct
- [ ] NET row is green when positive, red when negative
- [ ] Zero months show — not $0
- [ ] Table scrolls horizontally on narrow screens

### Tax Report page
- [ ] Page loads at /finance/tax-report without errors
- [ ] FY selector defaults to 2025-26
- [ ] Disclaimer "Estimated only — consult your accountant" visible at top
- [ ] Joint income section shows each line item separately
- [ ] Joint income split 50/50 note shown
- [ ] Mark and Michelle panels display side by side
- [ ] Both panels show all rows: wages, bank interest, dividends, franking credits
- [ ] Deductions show as separate rows (voluntary super, charity, other)
- [ ] TOTAL TAXABLE = Gross − Deductions for each person
- [ ] Per week = Taxable ÷ 52 shown below total taxable
- [ ] Tax payable uses correct 2025-26 ATO brackets
- [ ] Income tax and Medicare levy shown as separate sub-lines
- [ ] PAYG withheld, extra PAYG, PAYGW instalments, franking credits shown separately
- [ ] REFUND / (OWING) = Tax payable − Credits. Green = refund, Red = owing
- [ ] Combined refund/owing displayed below both panels
- [ ] Super section shows full income breakdown (rental, interest, SGC by name)
- [ ] Super operating expenses shown line by line
- [ ] Super taxable income = income − expenses
- [ ] Super tax @ 15% calculated correctly
- [ ] Super PAYG instalments deducted, final owing/refund shown
- [ ] Quarterly BAS estimate shown for Super
- [ ] Super cap tracker shows SGC + voluntary + total per person, correct colour
- [ ] Unitrak section shows income, expenses, 30% tax, PAYG offset, quarterly BAS
- [ ] Nav links for P&L and Tax Report appear in finance layout

### Docker / NAS
- [ ] `entrypoint.sh` contains `npx prisma migrate deploy`
- [ ] After `docker compose up` on NAS, log shows "Migrations complete."
- [ ] All 6 new columns present in NAS production database
- [ ] **Tell the user:** "Copy the updated entrypoint.sh to the NAS before the next deploy."

---

## 10. ACCOUNTING RATIONALE — WHY THESE DECISIONS

**Why `isTransfer` on transactions?**
The Budget spreadsheet explicitly excludes inter-entity movements from income and expenses. A personal-to-super transfer inflates both sides if included — it isn't income to the super fund for P&L purposes and isn't an expense of personal. Without this flag, every P&L total is wrong.

**Why split joint bank interest 50/50?**
The Tax_Calculator.xlsx does this explicitly (`=SUM(C3/2)`). Under Australian tax law, jointly held accounts are assessed equally to each owner. The split must happen before applying individual tax brackets because each person's bracket position differs.

**Why is PAYG withheld a credit, not an expense?**
PAYG withheld is a prepayment of tax to the ATO. It appears in the budget cashflow (you receive net wages) but is NOT an expense in the P&L — it's money you already paid towards a tax liability. In the tax calculation it offsets tax payable. The Tax_Calculator.xlsx puts it in "TAX ALREADY PAID" credits, not in deductions.

**Why is SGC excluded from personal taxable income?**
SGC goes straight to the super fund — the individual never receives it. It is income of the super fund and is taxed there at 15%. If you included SGC in personal income it would be taxed twice, which is wrong.

**Why does Super have its own full P&L?**
The super fund is a separate legal entity that lodges its own tax return (SMSF annual return). Its taxable income is rental income + investment income + SGC received, minus fund operating expenses. It pays 15% on that net figure. The PAYG instalments (paid quarterly) offset the annual liability.

**Why franking credits appear in both income and credits?**
Australia's imputation system requires grossing up dividends by the attached franking credit — this is assessable income. The same credit then reduces tax payable dollar-for-dollar. A company paying 30% tax on $100 profit and distributing $70 dividend with $30 franking credit means the shareholder's assessable income is $100, they pay tax at their marginal rate on $100, and subtract the $30 already paid. The net effect is the shareholder pays only the difference between their rate and 30%.

**Why show per-week taxable income?**
The Tax_Calculator.xlsx shows this for cashflow planning. Taxable income ÷ 52 tells the user what each week of income is actually worth after all deductions are accounted for — useful for understanding real take-home capacity versus gross figures.

**Why separate P&L from Tax Report?**
P&L answers: "Am I spending more than I earn each month, by entity?" Tax Report answers: "What do I owe the ATO, and why?" They use the same underlying data but present it differently. The user already maintained these as two separate spreadsheets (2027_BUDGET.xlsx and Tax_Calculator.xlsx) — the app replicates that separation rather than forcing them into one view.

**Why keep tax bracket calculations in the page component, not the API?**
Brackets change each July with the federal budget. Keeping them in a typed constant in the page component means updating them requires editing one file, not a DB migration or API deployment. The API returns raw financial figures; the page applies the year-specific rules.

---

*End of specification.*
*Implement in order: Migration SQL → schema.prisma + generate → API routes → Modal validation → Category UI → Bills UI → Income UI → Transactions UI → P&L page → Tax Report page → Nav links → Test checklist → Docker/NAS check → Remind user to copy entrypoint.sh to NAS.*
