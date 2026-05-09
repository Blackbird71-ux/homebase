# Add 6-Monthly (Half-Yearly) Frequency for Recurring Income

## Overview

Add a `halfyearly` frequency option to recurring income items across the entire stack — schema, API, UI, and calculation helpers.

## Naming Convention

Use **`halfyearly`** as the database/API value — consistent with the existing `halfyearly` frequency already used in the [`Chore`](prisma/schema.prisma:404) model. Display as **"6 Monthly / Half-Yearly"** in the UI dropdown.

## Files to Modify

### 1. Prisma Schema — [`prisma/schema.prisma`](prisma/schema.prisma:698)

**Change:** Update the comment on `FinanceIncomeEntry.frequency` to document the new value.

```prisma
// Before:
frequency  String  @default("monthly") // weekly | fortnightly | monthly | quarterly | yearly | one-off

// After:
frequency  String  @default("monthly") // weekly | fortnightly | monthly | quarterly | halfyearly | yearly | one-off
```

> **Note:** SQLite stores strings, so no actual column change is needed. This is a documentation-only update.

---

### 2. Income Streams API — [`src/app/api/finance/income-streams/route.ts`](src/app/api/finance/income-streams/route.ts)

Three changes needed:

**a) Type definition** (line 14) — add `'halfyearly'` to the union type:

```typescript
frequency: 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom'
```

**b) `streamToMonthly()` function** (line 30) — add switch case:

```typescript
case 'halfyearly': return amount * 2 / 12   // same as amount / 6
```

**c) `mapFrequency()` function** (line 50) — add to valid array:

```typescript
const valid = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'halfyearly', 'yearly']
```

---

### 3. Income API — [`src/app/api/finance/income/route.ts`](src/app/api/finance/income/route.ts)

**Change:** `advanceNextExpectedDate()` function (line 150) — add case:

```typescript
if (frequency === 'halfyearly') return addMonths(date, 6)
```

---

### 4. Income Page UI — [`src/app/(app)/finance/income/page.tsx`](src/app/(app)/finance/income/page.tsx)

Four changes needed:

**a) `toMonthlyAmount()` function** (line 55) — add:

```typescript
if (frequency === 'halfyearly') return amount / 6
```

**b) `getNextExpected()` function** (line 326) — add:

```typescript
if (entry.frequency === 'halfyearly') return addMonths(due, 6)
```

**c) `cycleMs()` function** (line 378) — add:

```typescript
if (frequency === 'halfyearly') return 183 * day
```
(183 days = 366/2, consistent with the yearly value of 366 days)

**d) Frequency dropdown** (line 556 area) — add option:

```tsx
<option value="halfyearly">6 Monthly / Half-Yearly</option>
```

---

### 5. Budget Page — [`src/app/(app)/finance/budget/page.tsx`](src/app/(app)/finance/budget/page.tsx)

Two changes needed:

**a) `streamToMonthly()` function** (line 50) — add case:

```typescript
case 'halfyearly': return amount * 2 / 12
```

**b) `toMonthly()` function** (line 62) — add:

```typescript
if (period === 'halfyearly') return amount * 2 / 12
```

---

### 6. Profit & Loss Page — [`src/app/(app)/finance/profit-loss/page.tsx`](src/app/(app)/finance/profit-loss/page.tsx)

**Change:** `toPeriodAmount()` function (line 50) — add:

```typescript
else if (frequency === 'halfyearly') timesPerMonth = 1 / 6
```

---

## Files NOT Requiring Changes (verified)

| File | Reason |
|------|--------|
| [`src/app/api/finance/income/received/route.ts`](src/app/api/finance/income/received/route.ts) | No frequency-specific logic — just fetches and returns data |
| [`src/app/(app)/finance/income/received/page.tsx`](src/app/(app)/finance/income/received/page.tsx) | Only displays frequency string — no calculations |
| [`src/app/(app)/finance/reports/page.tsx`](src/app/(app)/finance/reports/page.tsx) | `toPeriodAmount()` only handles bills (expenses), not income |
| [`src/app/api/finance/bills/route.ts`](src/app/api/finance/bills/route.ts) | Only handles bills, not income |
| [`src/app/(app)/finance/bills/page.tsx`](src/app/(app)/finance/bills/page.tsx) | Only handles bills, not income |

## Migration Strategy

Since SQLite stores the `frequency` as a plain text string (not an enum column), existing data is unaffected. New entries with `frequency: 'halfyearly'` will be stored and read correctly without any schema migration. A no-op migration is not required but could be created for documentation if desired.

## Acceptance Criteria

1. User can select "6 Monthly / Half-Yearly" in the income form frequency dropdown
2. Creating/editing income with `halfyearly` frequency persists correctly
3. Marking a half-yearly income as received advances `nextExpectedDate` by 6 months
4. Budget planner correctly converts half-yearly income to monthly equivalents (`amount / 6`)
5. Profit & Loss report correctly calculates period-appropriate amounts for half-yearly income
6. Overdue detection (`cycleMs`) correctly handles half-yearly frequency
7. Income streams endpoint returns correct data for half-yearly income entries
