# Income Tracking & P&L Report — Implementation Plan

**Source spec:** [`docs/INCOME_AND_PNL_BUILD_SPEC.md`](INCOME_AND_PNL_BUILD_SPEC.md)
**Base project:** Next.js 15 (App Router), TypeScript, Prisma + SQLite, Tailwind, shadcn/ui

---

## Overview

Add two new capabilities to the Finance module:

1. **Income page** (`/finance/income`) — mirror of Bills page for recording income items
2. **P&L Report page** (`/finance/profit-loss`) — income vs expenses side-by-side with profit/loss bottom line

---

## Step-by-step plan

### Step 1: Update Prisma schema [`prisma/schema.prisma`](../prisma/schema.prisma)

**1a. Add `FinanceIncomeEntry` model** after `FinanceRecurringBill` (after line ~682):

```prisma
model FinanceIncomeEntry {
  id              String               @id @default(cuid())
  name            String
  amount          Float
  frequency       String               @default("monthly") // weekly | fortnightly | monthly | quarterly | yearly | one-off
  incomeType      String               @default("recurring") // recurring | one-off
  nextExpectedDate DateTime
  endDate         DateTime?
  isActive        Boolean              @default(true)
  received        Boolean              @default(false)
  receivedDate    DateTime?
  notes           String?
  memberId        String?
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

**1b. Add back-relations** to existing models:
- [`prisma/schema.prisma`](../prisma/schema.prisma) `FinanceAccount` (after line ~545): add `incomeEntries FinanceIncomeEntry[]`
- [`prisma/schema.prisma`](../prisma/schema.prisma) `FinanceCategory` (after line ~575): add `incomeEntries FinanceIncomeEntry[]`
- [`prisma/schema.prisma`](../prisma/schema.prisma) `FinanceEntity` (after line ~802): add `incomeEntries FinanceIncomeEntry[]`
- [`prisma/schema.prisma`](../prisma/schema.prisma) `FinanceLocation` (after line ~743): add `incomeEntries FinanceIncomeEntry[]`
- [`prisma/schema.prisma`](../prisma/schema.prisma) `Family` (after line ~45): add `financeIncomeEntries FinanceIncomeEntry[]`

### Step 2: Run Prisma migration

```bash
npx prisma migrate dev --name add_income_entries
```

This auto-generates `prisma/migrations/20260512000000_add_income_entries/migration.sql`.

### Step 3: Create Income API route [`src/app/api/finance/income/route.ts`](../src/app/api/finance/income/route.ts)

Copy from [`src/app/api/finance/bills/route.ts`](../src/app/api/finance/bills/route.ts) and adapt:
- Use `prisma.financeIncomeEntry` instead of `prisma.financeRecurringBill`
- `INCOME_INCLUDE` constant with account, category, location, entity (no vendor, no attachments)
- **GET** — return all entries for family ordered by `nextExpectedDate asc`
- **POST** — create entry (required: `name`, `amount`; defaults: frequency='monthly', incomeType='recurring')
- **PUT** — partial update by `id`
- **DELETE** — hard delete by query param `?id=`
- **PATCH** — mark received: set `received=true`, `receivedDate=now()`. If not one-off, create child entry with next occurrence date using `advanceNextExpectedDate` helper.

### Step 4: Create Received Income API route [`src/app/api/finance/income/received/route.ts`](../src/app/api/finance/income/received/route.ts)

- **GET** — return all entries where `received=true`, ordered by `receivedDate desc`, using `INCOME_INCLUDE`

### Step 5: Create P&L Summary API route (optional) [`src/app/api/finance/reports/profit-loss/route.ts`](../src/app/api/finance/reports/profit-loss/route.ts)

- **GET** with query params `start` and `end`
- Returns `{ totalIncome, totalExpenses, netProfitLoss, incomeByCategory[], expensesByCategory[] }`

### Step 6: Create Income page [`src/app/(app)/finance/income/page.tsx`](../src/app/(app)/finance/income/page.tsx)

Mirror of [`src/app/(app)/finance/bills/page.tsx`](../src/app/(app)/finance/bills/page.tsx). Key adaptations:
- Title: "Income" instead of "Bills & Recurring"
- `entry.received` / `handleMarkReceived` instead of `bill.paid` / `handleMarkPaid`
- `entry.incomeType` instead of `bill.billType`
- Remove: autoPay, emailReminder, invoiceReceived, attachments, addToBudget, budgetBillIds, vendor
- Remove: dayOfMonth, monthOfYear fields (income uses nextExpectedDate, not dayOfMonth)
- Icons: `TrendingUp` for recurring, `DollarSign` for one-off (instead of `RefreshCw`/`Layers`)
- Overdue styling: amber (`border-amber-500/30 bg-amber-500/5 text-amber-600`) instead of red
- Link to `/finance/income/received` instead of `/finance/paid-bills`
- sessionStorage keys: `'income-dateRange'` and `'income-selectedCatIds'`
- Form fields: incomeType radio, name, amount, frequency (only when recurring), nextExpectedDate, endDate (only when recurring), categoryId, accountId, memberId, entityId, locationId, notes
- `enrichEntries` helper instead of `enrichBills`
- `IncomeEntry` interface with `IncomeRow` sub-component
- `toMonthlyAmount` helper same as bills (for scaling income by frequency)

### Step 7: Create Received Income page [`src/app/(app)/finance/income/received/page.tsx`](../src/app/(app)/finance/income/received/page.tsx)

Mirror of [`src/app/(app)/finance/paid-bills/page.tsx`](../src/app/(app)/finance/paid-bills/page.tsx):
- Fetch from `/api/finance/income/received`
- Title: "Received Income"
- Sort by `receivedDate desc`
- Back link to `/finance/income`
- Show receivedDate instead of paidDate
- Undo button calls PATCH on `/api/finance/income` with `received: false`
- Filter by month range (1/3/6/12 months) via sessionStorage key `'received-income-monthRange'`

### Step 8: Create P&L Report page [`src/app/(app)/finance/profit-loss/page.tsx`](../src/app/(app)/finance/profit-loss/page.tsx)

**New page** — do NOT modify [`src/app/(app)/finance/reports/page.tsx`](../src/app/(app)/finance/reports/page.tsx).

- Fetch from `/api/finance/bills?includeAll=true` (expenses) and `/api/finance/income` (income)
- Period controls: Month/Quarter/Year toggle with navigator (same pattern as reports page)
- **Section 1 — Summary bar (3 cards):** Total Income (green), Total Expenses (red), Net P&L (green if +, red if -)
- **Section 2 — Income breakdown** (collapsible, default open): grouped by category, drill-down to individual items
- **Section 3 — Expenses breakdown** (collapsible, default open): same pattern as reports page group list
- `toIncomePeriodAmount` helper for income scaling (mirror of `toPeriodAmount` in reports)
- Income amounts: green (`text-green-600`); Expense amounts: red (`text-red-600`)
- Net positive: green with `TrendingUp` icon; Net negative: red with `TrendingDown` icon
- Separate drill states: `incomeDrillKey` and `expenseDrillKey`
- `getPeriodBounds` and `navigateAnchor` helpers same pattern as reports

### Step 9: Update finance navigation [`src/app/(app)/finance/layout.tsx`](../src/app/(app)/finance/layout.tsx)

Add two new tabs to the `tabs` array after the Bills entry:
```typescript
{ href: '/finance/income',      label: 'Income',   exact: false },
```
And after the Reports entry:
```typescript
{ href: '/finance/profit-loss',  label: 'P&L',      exact: false },
```

### Step 10: Build and commit

```bash
npm run build
git add -A
git commit -m "feat: add income tracking and P&L report pages"
```

---

## Files to create (6 new files)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/app/api/finance/income/route.ts` | Income CRUD API |
| 2 | `src/app/api/finance/income/received/route.ts` | Received income history API |
| 3 | `src/app/api/finance/reports/profit-loss/route.ts` | P&L summary API (optional) |
| 4 | `src/app/(app)/finance/income/page.tsx` | Income page |
| 5 | `src/app/(app)/finance/income/received/page.tsx` | Received income history page |
| 6 | `src/app/(app)/finance/profit-loss/page.tsx` | P&L report page |

## Files to modify (3 files)

| # | File | Change |
|---|------|--------|
| 1 | `prisma/schema.prisma` | Add `FinanceIncomeEntry` model + back-relations |
| 2 | `src/app/(app)/finance/layout.tsx` | Add Income and P&L tabs |
| 3 | `prisma/migrations/20260512000000_add_income_entries/migration.sql` | Auto-generated |

## Files to NOT modify

- `src/app/(app)/finance/reports/page.tsx` — leave existing expense-only report untouched
- `src/app/api/finance/bills/route.ts` — no changes needed
- Any existing migration files

## Architecture diagram

```mermaid
flowchart TD
    subgraph Database["Database Prisma + SQLite"]
        IE[FinanceIncomeEntry] ---|belongs to| F[Family]
        IE ---|optional| AC[FinanceAccount]
        IE ---|optional| CA[FinanceCategory]
        IE ---|optional| EN[FinanceEntity]
        IE ---|optional| LO[FinanceLocation]
        IE -.->|self-ref| IE2[parentIncome / childEntries]
    end

    subgraph API["API Routes"]
        INC[/api/finance/income/] --> GET_INC[GET: list all]
        INC --> POST_INC[POST: create]
        INC --> PUT_INC[PUT: update]
        INC --> DEL_INC[DELETE: remove]
        INC --> PATCH_INC[PATCH: mark received]
        REC[/api/finance/income/received/] --> GET_REC[GET: list received]
        PL[/api/finance/reports/profit-loss/] --> GET_PL[GET: P&L summary]
    end

    subgraph Pages["Client Pages"]
        IP[/finance/income/] --> INCPAGE[IncomePage]
        IR[/finance/income/received/] --> RECPAGE[ReceivedIncomePage]
        PLP[/finance/profit-loss/] --> PLPAGE[ProfitLossPage]
    end

    IP --> INC
    IR --> REC
    PLP --> PLPAGE_API[fetches /api/finance/bills + /api/finance/income]
    PLPAGE_API --> INC
    PLPAGE_API --> BILLS[/api/finance/bills]
```

## Key patterns to follow

1. **Bills page is the primary template** — replicate useState patterns, form open/close, `enrichBills` to `enrichEntries`, sessionStorage persistence, date range filters, category column picker, amount summary footer, `BillRow` to `IncomeRow` component
2. **No vendor, no attachments** — the income model has no vendor relation and no attachment support
3. **Amber for overdue income** — missed income is a softer alert than missed bills
4. **`TrendingUp`/`DollarSign` icons** — instead of `RefreshCw`/`Layers`
5. **`income-dateRange` and `income-selectedCatIds`** — sessionStorage keys to avoid collisions with bills
6. **P&L page is standalone** — it fetches both bills and income data client-side; don't modify the existing reports page
7. **Migration runs automatically on NAS** — `entrypoint.sh` runs `prisma migrate deploy` at container start, no extra deploy steps
