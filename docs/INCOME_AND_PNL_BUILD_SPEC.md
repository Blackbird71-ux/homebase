# HomeBase – Income Tracking & Profit/Loss Report: Agent Build Specification

**Project:** `C:\Appdev\HomeBase`
**Stack:** Next.js 15 (App Router), TypeScript, Prisma + SQLite, Tailwind, shadcn/ui
**Deploy:** Windows dev → Docker → Synology NAS via `entrypoint.sh` (migrations auto-run at container start)
**Commit gate:** Only after code confirmed solid locally

---

## Overview

Add two new capabilities to the Finance module:

1. **Income page** (`/finance/income`) — mirror of the Bills page but for recording income items as they arrive. Recurring income streams (salary, rent) and one-off income (tax return, sale proceeds) can be logged, confirmed when received, and tracked over time.
2. **P&L Report page** (`/finance/profit-loss`) — a new tab in the Finance nav showing income vs expenses side-by-side with a simple Profit / Loss bottom line, navigable by month / quarter / year.

The existing **Reports page** (`/finance/reports`) currently shows bills/expenses only. The new P&L page is a separate tab, not a modification of the existing reports page (don't break the existing reports page).

---

## 1 — Database: New Prisma Model `FinanceIncomeEntry`

### 1.1 Add model to `prisma/schema.prisma`

Add the following model **after** `FinanceRecurringBill` in the Finance section:

```prisma
model FinanceIncomeEntry {
  id              String               @id @default(cuid())
  name            String               // e.g. "Salary – May", "Rental Income", "Tax Refund"
  amount          Float                // Amount received (positive)
  frequency       String               @default("monthly") // weekly | fortnightly | monthly | quarterly | yearly | one-off
  incomeType      String               @default("recurring") // recurring | one-off
  nextExpectedDate DateTime            // When next income is expected
  endDate         DateTime?
  isActive        Boolean              @default(true)
  received        Boolean              @default(false)  // Has this occurrence been received?
  receivedDate    DateTime?
  notes           String?
  memberId        String?              // Which family member earns this
  accountId       String?
  account         FinanceAccount?      @relation(fields: [accountId], references: [id], onDelete: SetNull)
  categoryId      String?
  category        FinanceCategory?     @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  entityId        String?
  entity          FinanceEntity?       @relation(fields: [entityId], references: [id], onDelete: SetNull)
  locationId      String?
  location        FinanceLocation?     @relation(fields: [locationId], references: [id], onDelete: Cascade)
  parentIncomeId  String?
  parentIncome    FinanceIncomeEntry?  @relation("IncomeOccurrences", fields: [parentIncomeId], references: [id], onDelete: SetNull)
  childEntries    FinanceIncomeEntry[] @relation("IncomeOccurrences")
  familyId        String
  family          Family               @relation(fields: [familyId], references: [id], onDelete: Cascade)
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  @@index([familyId])
  @@index([familyId, isActive])
  @@index([familyId, nextExpectedDate])
  @@index([familyId, received])
  @@index([memberId])
  @@index([parentIncomeId])
  @@index([entityId])
}
```

### 1.2 Add back-relations to existing models

In `FinanceAccount`, add:
```prisma
  incomeEntries   FinanceIncomeEntry[]
```

In `FinanceCategory`, add:
```prisma
  incomeEntries   FinanceIncomeEntry[]
```

In `FinanceEntity`, add:
```prisma
  incomeEntries   FinanceIncomeEntry[]
```

In `FinanceLocation`, add:
```prisma
  incomeEntries   FinanceIncomeEntry[]
```

In `Family`, add:
```prisma
  financeIncomeEntries   FinanceIncomeEntry[]
```

### 1.3 Create Prisma migration

**Name the migration:** `20260512000000_add_income_entries`

Run on Windows dev:
```bash
npx prisma migrate dev --name add_income_entries
```

The migration will be picked up by `entrypoint.sh` at next NAS deploy (`prisma migrate deploy` runs automatically on container start — no extra steps needed for NAS).

**Commit the generated migration folder** to git along with the code changes.

---

## 2 — API: `/api/finance/income`

Create file: `src/app/api/finance/income/route.ts`

Pattern: copy from `src/app/api/finance/bills/route.ts` and adapt. Key differences:
- Model: `prisma.financeIncomeEntry` instead of `prisma.financeRecurringBill`
- Field `received` (bool) replaces `paid`
- Field `receivedDate` replaces `paidDate`
- Field `incomeType` replaces `billType` (values: `'recurring'` | `'one-off'`)
- No `autoPay`, `emailReminder`, `reminderDays`, `invoiceReceived`, `invoiceReceivedDate` fields
- No `attachments`
- No `budgetRules` relation

### INCLUDE constant
```typescript
const INCOME_INCLUDE = {
  account:  { select: { id: true, name: true } },
  category: true,
  location: { select: { id: true, name: true } },
  entity:   { select: { id: true, name: true, color: true, type: true } },
}
```

### GET
Return all income entries for the family, ordered by `nextExpectedDate asc`.

```typescript
export async function GET() {
  const session = await requireSession()
  const entries = await prisma.financeIncomeEntry.findMany({
    where: { familyId: session.familyId },
    include: INCOME_INCLUDE,
    orderBy: { nextExpectedDate: 'asc' },
  })
  return NextResponse.json(entries)
}
```

### POST (create)
Required fields: `name`, `amount`. Defaults: `frequency = 'monthly'`, `incomeType = 'recurring'`, `nextExpectedDate = today`.

### PUT (update)
Required: `id`. Partial update all other fields.

### DELETE
Query param `?id=`. Hard delete.

### PATCH (mark received)
Body: `{ id, received: true }`. When `received = true`:
- Set `receivedDate = now()`
- If `incomeType !== 'one-off'`, create a new child `FinanceIncomeEntry` with the next occurrence's date (using the same `advanceNextExpectedDate` helper below), `received = false`, `parentIncomeId = existing.id`.

```typescript
function advanceNextExpectedDate(date: Date, frequency: string): Date {
  if (frequency === 'weekly')      return addWeeks(date, 1)
  if (frequency === 'fortnightly') return addWeeks(date, 2)
  if (frequency === 'quarterly')   return addMonths(date, 3)
  if (frequency === 'yearly')      return addMonths(date, 12)
  return addMonths(date, 1) // monthly default
}
```

---

## 3 — Paid Income History API: `/api/finance/income/received`

Create file: `src/app/api/finance/income/received/route.ts`

### GET
Return all income entries where `received = true`, ordered by `receivedDate desc`. Include same `INCOME_INCLUDE`. This mirrors `/api/finance/bills?paid=true` (the paid-bills endpoint).

---

## 4 — Income Page: `/finance/income`

Create file: `src/app/app/(app)/finance/income/page.tsx`

**This page is a close mirror of the Bills page** (`src/app/(app)/finance/bills/page.tsx`). Use it as the structural template. Key differences and adaptations:

### Differences from Bills page

| Bills page | Income page |
|---|---|
| `bill.paid` / `handleMarkPaid` | `entry.received` / `handleMarkReceived` |
| `bill.billType` | `entry.incomeType` |
| `bill.autoPay`, `emailReminder`, etc. | Not present — remove these fields |
| `bill.invoiceReceived` / `invoiceReceivedDate` | Not present |
| `bill.attachments` + attachment panel | Not present |
| "Add to Budget" checkbox | Not present |
| `budgetBillIds` state | Not present |
| Overdue styling: red | Overdue styling: amber (income not yet received is a softer alert) |
| Icon: `RefreshCw` / `Layers` | Icon: `TrendingUp` for recurring, `DollarSign` for one-off |
| "Mark as paid" = green checkCircle | "Mark as received" = green checkCircle (same icon, different label) |
| Link to `/finance/paid-bills` | Link to `/finance/income/received` |
| Page title: "Bills & Recurring" | Page title: "Income" |

### Header

```tsx
<h1 className="text-2xl font-bold">Income</h1>
<div className="flex items-center gap-3">
  <Link href="/finance/income/received" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
    <CheckCircle2 className="h-3.5 w-3.5" /> Received Income
  </Link>
  <button onClick={openNew} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
    <Plus className="h-4 w-4" /> Add Income
  </button>
</div>
```

### Overdue / Upcoming logic

Same date-range filter and `dateRange` state as bills page. "Overdue" means an income entry where `nextExpectedDate` is in the past and `received = false`. Use amber styling (`border-amber-500/30 bg-amber-500/5 text-amber-600`) instead of red — it's income not yet received, not a missed payment.

### Form fields (in the Add/Edit dialog)

```
incomeType    radio: "recurring" | "one-off"
name          text input (required)
amount        number input (required)
frequency     select (weekly / fortnightly / monthly / quarterly / yearly) — only when recurring
nextExpectedDate  date input (label: "Next Expected Date" for recurring, "Expected Date" for one-off)
endDate       date input (optional, only for recurring)
categoryId    select (finance categories)
accountId     select (finance accounts — "Credit to account")
memberId      select (family members — "Who earns this")
entityId      select (entities)
locationId    select (locations)
notes         textarea
```

Do NOT include: autoPay, emailReminder, reminderDays, invoiceReceived, addToBudget.

### IncomeRow component

Same structure as `BillRow` minus the attachment panel. When `received = true`:
- Row gets `border-green-500/30 bg-green-500/5` styling (received = good)
- Shows a "RECEIVED" badge in green

Action buttons per row: Edit | Mark Received | Delete

### Amount summary footer

Same pattern as bills page — show total expected income for the visible period.

---

## 5 — Received Income History Page: `/finance/income/received`

Create file: `src/app/(app)/finance/income/received/page.tsx`

Pattern: mirror of `src/app/(app)/finance/paid-bills/page.tsx`. Look at that file for structure. Key differences:
- Fetches from `/api/finance/income/received`
- Title: "Received Income"
- Sorted by `receivedDate desc`
- Shows receivedDate instead of paidDate
- Back link to `/finance/income`

---

## 6 — P&L Report Page: `/finance/profit-loss`

Create file: `src/app/(app)/finance/profit-loss/page.tsx`

This is a **new page** — do not modify the existing `reports/page.tsx`.

### Data sources

The P&L page fetches from two endpoints:
- `GET /api/finance/bills?includeAll=true` — expenses (same as existing reports page)
- `GET /api/finance/income` — income entries

### Period controls

Same period navigation as the existing reports page: Month / Quarter / Year toggle with `< label >` navigator.

### Layout

Three sections stacked vertically:

**Section 1 — Summary bar (3 cards)**

```
[ Total Income (green)  ]  [ Total Expenses (red) ]  [ Net P&L (green if +, red if –) ]
```

**Section 2 — Income breakdown** (collapsible, default open)

Header: "Income" with total on the right and a chevron toggle.

Same grouped-bar chart as the existing reports page, but using income entries grouped by category. Clicking a group drills into the individual income items (same drill-down pattern as reports page).

**Section 3 — Expenses breakdown** (collapsible, default open)

Header: "Expenses" with total on the right and a chevron toggle.

Identical to the existing reports page group list. Clicking a group drills into individual bills.

### Period amount helpers

For income (equivalent to `toPeriodAmount` in reports page):

```typescript
function toIncomePeriodAmount(amount: number, frequency: string, periodMonths: number): number {
  let timesPerMonth: number
  if (frequency === 'weekly')          timesPerMonth = 52 / 12
  else if (frequency === 'fortnightly') timesPerMonth = 26 / 12
  else if (frequency === 'quarterly')   timesPerMonth = 1 / 3
  else if (frequency === 'yearly')      timesPerMonth = 1 / 12
  else                                  timesPerMonth = 1  // monthly
  return amount * timesPerMonth * periodMonths
}
```

One-off income: include its full amount only if `nextExpectedDate` falls within `[start, end]`.

### Colour coding

- Income amounts: green (`text-green-600`)
- Expense amounts: red (`text-red-600`)
- Net positive: green with `TrendingUp` icon
- Net negative: red with `TrendingDown` icon

### Drill-down

Both income and expense sections support drill-down (click a group row → see individual items). Use the same `drillKey` pattern as the existing reports page. Each section has its own drill state (`incomeDrillKey` and `expenseDrillKey`).

---

## 7 — API: P&L Summary endpoint (optional, for future use)

Create file: `src/app/api/finance/reports/profit-loss/route.ts`

### GET (query params: `start=YYYY-MM-DD&end=YYYY-MM-DD`)

Returns:
```json
{
  "totalIncome": 12000,
  "totalExpenses": 8500,
  "netProfitLoss": 3500,
  "incomeByCategory": [{ "categoryId": "...", "categoryName": "Salary", "total": 10000 }],
  "expensesByCategory": [{ "categoryId": "...", "categoryName": "Utilities", "total": 500 }]
}
```

This endpoint can be used by the Overview page in future — for now the P&L page computes everything client-side from the two existing fetch calls, so this endpoint is **optional but recommended**.

---

## 8 — Navigation: Add "Income" and "P&L" tabs

Edit `src/app/(app)/finance/layout.tsx`:

```typescript
const tabs = [
  { href: '/finance',              label: 'Overview',    exact: true  },
  { href: '/finance/accounts',     label: 'Accounts',    exact: false },
  { href: '/finance/transactions', label: 'Transactions',exact: false },
  { href: '/finance/bills',        label: 'Bills',       exact: false },
  { href: '/finance/income',       label: 'Income',      exact: false },  // ← ADD
  { href: '/finance/budget',       label: 'Budget',      exact: false },
  { href: '/finance/goals',        label: 'Goals',       exact: false },
  { href: '/finance/reports',      label: 'Reports',     exact: false },
  { href: '/finance/profit-loss',  label: 'P&L',         exact: false },  // ← ADD
  { href: '/finance/vendors',      label: 'Vendors',     exact: false },
  { href: '/finance/entities',     label: 'Entities',    exact: false },
  { href: '/finance/members',      label: 'Members',     exact: false },
  { href: '/finance/locations',    label: 'Locations',   exact: false },
  { href: '/finance/categories',   label: 'Categories',  exact: false },
]
```

---

## 9 — File Checklist

All files to create or modify:

### New files
```
prisma/migrations/20260512000000_add_income_entries/migration.sql   (auto-generated by prisma migrate dev)
src/app/api/finance/income/route.ts
src/app/api/finance/income/received/route.ts
src/app/api/finance/reports/profit-loss/route.ts                    (optional)
src/app/(app)/finance/income/page.tsx
src/app/(app)/finance/income/received/page.tsx
src/app/(app)/finance/profit-loss/page.tsx
```

### Modified files
```
prisma/schema.prisma                                    (add model + back-relations)
src/app/(app)/finance/layout.tsx                        (add Income and P&L tabs)
```

---

## 10 — Migration & Deployment Notes

### Development (Windows)
```bash
# After editing schema.prisma:
npx prisma migrate dev --name add_income_entries
# Generates: prisma/migrations/20260512000000_add_income_entries/migration.sql
```

### Production (NAS via Docker)
No manual steps needed. `entrypoint.sh` already runs `npx prisma migrate deploy` before starting the app on every container start. Once you deploy the new image, the migration runs automatically against `/data/homebase.db`.

**Commit to git after local testing is confirmed solid.** Include:
- `prisma/schema.prisma` changes
- `prisma/migrations/20260512000000_add_income_entries/` folder
- All new/modified `src/` files

---

## 11 — Implementation Notes for Agent

### Pattern consistency
The Bills page is the primary reference implementation. Replicate its patterns exactly for the Income page — state management, form open/close, enrichBills→enrichEntries helper, sessionStorage persistence for dateRange and category filters.

### TypeScript interface for IncomeEntry
```typescript
export interface IncomeEntry {
  id: string
  name: string
  amount: number
  frequency: string
  incomeType: string
  nextExpectedDate: string
  endDate: string | null
  isActive: boolean
  received: boolean
  receivedDate: string | null
  notes: string | null
  memberId: string | null
  account:  { id: string; name: string } | null
  category: { id: string; name: string; color: string | null } | null
  entity:   { id: string; name: string; color: string | null; type: string } | null
  location: { id: string; name: string } | null
  member:   { id: string; name: string; email: string } | null
}
```

### Do NOT modify
- `src/app/(app)/finance/reports/page.tsx` — leave the existing expense-only report alone
- `src/app/api/finance/bills/route.ts` — no changes needed
- Any existing migration files

### Prisma client regeneration
After schema changes, `prisma generate` runs automatically as part of `npm run build` in the Dockerfile (see `RUN npx prisma generate` in Stage 2). No extra steps needed.

### sessionStorage keys
Use `'income-dateRange'` and `'income-selectedCatIds'` to avoid collisions with the bills page keys.
