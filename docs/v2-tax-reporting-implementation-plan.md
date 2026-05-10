# V2 Tax Reporting Implementation Plan

## Summary

Full migration from V1 tax classification schema to V2. The V1 entity-based model
(`personal|business|investment|super`) will be cleared and replaced with the V2
tax-treatment model (`tax_deduction|taxable_income|exempt_income|tax_payment`).
Existing P&L page will be enhanced (not replaced) with entity tabs and FY selector.

> ✅ **All 11 steps implemented and verified. Build passes successfully (exit code 0).**

---

## Step 1 — Prisma Migration: Add `isTransfer` + Clear V1 Data

**Files**: [`prisma/schema.prisma:591`](prisma/schema.prisma:591) | New migration SQL

### Schema change
Add to [`FinanceTransaction`](prisma/schema.prisma:591) model (after line 624):
```prisma
isTransfer  Boolean  @default(false)
```

### Migration SQL
```sql
-- Clear V1 taxClassification data (no logical mapping to V2 exists)
UPDATE FinanceTransaction SET taxClassification = NULL;
UPDATE FinanceRecurringBill SET taxClassification = NULL;
UPDATE FinanceIncomeEntry SET taxClassification = NULL;

-- Add isTransfer column
ALTER TABLE FinanceTransaction ADD COLUMN isTransfer BOOLEAN NOT NULL DEFAULT false;
```

### Commands
```bash
npx prisma migrate dev --name add_is_transfer_and_clear_v1_tax
npx prisma generate
```

---

## Step 2 — Update Transactions API (`isTransfer` + V2 logic)

**File**: [`src/app/api/finance/transactions/route.ts:51`](src/app/api/finance/transactions/route.ts:51)

### POST handler changes
- Add `isTransfer` to body destructuring (around line 57)
- In create data: `isTransfer: isTransfer ?? false`
- In create data: `taxClassification: isTransfer ? null : (taxClassification || null)`

### PUT handler changes
- Add `isTransfer` to body destructuring (around line 114)
- In update data: `isTransfer: isTransfer ?? false`
- In update data: `taxClassification: isTransfer ? null : (taxClassification || null)`

### GET handler changes
- Return `isTransfer` in transaction objects (map at lines 66-69)

---

## Step 3 — Update Bills Modal (V2 dropdown values)

**File**: [`src/app/(app)/finance/bills/page.tsx:596`](src/app/(app)/finance/bills/page.tsx:596)

### Tax Classification dropdown (lines 597-606)
Replace V1 options with V2:
```tsx
<option value="">Not classified</option>
<option value="tax_deduction">Tax Deduction</option>
<option value="tax_payment">PAYG / Tax Payment</option>
```

---

## Step 4 — Update Income Modal (V2 dropdown values)

**File**: [`src/app/(app)/finance/income/page.tsx:736`](src/app/(app)/finance/income/page.tsx:736)

### Tax Classification dropdown (lines 738-745)
Replace V1 options with V2:
```tsx
<option value="">Not classified</option>
<option value="taxable_income">Taxable Income</option>
<option value="exempt_income">Exempt Income</option>
```

---

## Step 5 — Update Transactions Modal (`isTransfer` + V2 dropdown)

**File**: [`src/app/(app)/finance/transactions/page.tsx:274`](src/app/(app)/finance/transactions/page.tsx:274)

### Changes
- **Interface** (line 22): Add `isTransfer: boolean`
- **Form state** (line 50): Add `isTransfer: false`
- **openEdit** (line 106): Add `isTransfer: t.isTransfer ?? false`
- **handleSave** payload: Add `isTransfer: form.isTransfer`

### JSX additions
1. **"Is Transfer" checkbox** — add after entity selector (after line 272), before tax classification
2. **Tax Classification dropdown** — make context-sensitive:
   - `type === 'expense'`: show `tax_deduction | tax_payment`
   - `type === 'income'`: show `taxable_income | exempt_income`
   - `type === 'transfer'` or `form.isTransfer`: hide dropdown

---

## Step 6 — Add Modal Validation (§7)

**Files**: All 4 modal dialogs:
- [`src/app/(app)/finance/categories/page.tsx:38`](src/app/(app)/finance/categories/page.tsx:38) (CategoryDialog)
- [`src/app/(app)/finance/bills/page.tsx:500`](src/app/(app)/finance/bills/page.tsx:500) (Dialog form)
- [`src/app/(app)/finance/income/page.tsx:527`](src/app/(app)/finance/income/page.tsx:527) (Dialog form)
- [`src/app/(app)/finance/transactions/page.tsx:200`](src/app/(app)/finance/transactions/page.tsx:200) (Dialog form)

### Per-modal validation rules

| Modal | Required Fields |
|---|---|
| Categories | `name` non-empty, `type` selected |
| Bills | `name` non-empty, `amount > 0`, `categoryId` selected, `frequency` selected |
| Income | `name` non-empty, `amount > 0`, `categoryId` selected, `frequency` selected |
| Transactions | `amount > 0`, `date` non-empty |

### Implementation pattern (same for all 4 modals)
1. Add `errors` state: `const [errors, setErrors] = useState<Record<string, string>>({})`
2. Add `validate()` function returning boolean, called before `handleSave()` — abort if false
3. Show inline errors: `{errors.fieldName && <p className="text-xs text-red-500 mt-1">{errors.fieldName}</p>}`
4. Add error summary banner at top of DialogContent when errors exist
5. Clear errors on dialog open/close

---

## Step 7 — Create P&L API

**New file**: [`src/app/api/finance/pnl/route.ts`](src/app/api/finance/pnl/route.ts)

### GET handler
Query params: `entityId` (optional), `from`, `to`, `period` (month|quarter|year)

### Logic
1. Authenticate via `requireSession()`
2. Fetch bills in date range — exclude transfers, exclude income-type categories
3. Fetch income entries in date range
4. Aggregate into `incomeByCategory[]` and `deductionByCategory[]`
5. Calculate totals: `totalIncome`, `totalDeductions`, `netProfit`
6. Return JSON response

### Response shape
```ts
{
  period: { from: string, to: string, label: string, mode: string },
  totalIncome: number,
  totalDeductions: number,
  netProfit: number,
  incomeByCategory: { categoryId, categoryName, color, total, count, items: [...] }[],
  deductionByCategory: { categoryId, categoryName, color, total, count, items: [...] }[],
}
```

---

## Step 8 — Enhance P&L Page

**File**: [`src/app/(app)/finance/profit-loss/page.tsx:83`](src/app/(app)/finance/profit-loss/page.tsx:83)

### Additions
1. **Entity filter tabs** — reuse pattern from tax-report page (lines 179-207)
2. **Financial Year selector** — toggle between FY (July-June) and calendar periods
3. **Switch to new P&L API** for data fetching instead of direct bills/income calls

### Keep existing
- Period mode toggle (month/quarter/year)
- Cash/Forecast view toggle
- Period navigator (previous/next)
- Summary cards (income, expenses, net profit)
- Drill-down panel
- Income/Expense group rendering

### Update data logic
- Apply tax classification filtering (exclude transfers, exempt income)
- Pass `entityId` when entity filter is active

---

## Step 9 — Update Tax Report API (V2 values)

**File**: [`src/app/api/finance/tax-report/route.ts:143`](src/app/api/finance/tax-report/route.ts:143)

### Changes
1. Update `classificationOrder` (line 143):
   ```ts
   ['tax_deduction', 'taxable_income', 'exempt_income', 'tax_payment']
   ```

2. Update `classificationDisplay` (line 144):
   ```ts
   {
     tax_deduction: 'Tax Deductions',
     taxable_income: 'Taxable Income',
     exempt_income: 'Exempt Income',
     tax_payment: 'PAYG / Tax Payments',
   }
   ```

3. Update `getClassification()` — use new values, remove V1 fallback to 'personal'

4. Add transfer exclusion to transaction query: `isTransfer: false`

---

## Step 10 — Update Tax Report Page (V2 values)

**File**: [`src/app/(app)/finance/tax-report/page.tsx:58`](src/app/(app)/finance/tax-report/page.tsx:58)

### Changes
1. Update `CLASSIFICATION_COLORS` for V2:
   ```ts
   {
     tax_deduction: 'bg-red-500/10 text-red-600 border-red-500/20',
     taxable_income: 'bg-green-500/10 text-green-600 border-green-500/20',
     exempt_income: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
     tax_payment: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
   }
   ```

2. Update `CLASSIFICATION_ICONS` for V2:
   ```ts
   {
     tax_deduction: <TrendingDown />,
     taxable_income: <TrendingUp />,
     exempt_income: <DollarSign />,
     tax_payment: <Receipt />,
   }
   ```

3. Update auto-expand defaults to V2 values

---

## Step 11 — Verify & Build

```bash
npx prisma generate
npm run build
```

Fix any compilation errors. Verify:
- [x] P&L page renders at `/finance/profit-loss`
- [x] Tax Report page renders at `/finance/tax-report`
- [x] All 4 modals have correct V2 dropdown values
- [x] Transactions modal has `isTransfer` checkbox
- [x] Modal validation works on all 4 modals
- [x] Migration SQL applied cleanly
- [x] V1 data cleared, `isTransfer` column added

---

## File Change Summary

| Status | File | Description |
|--------|------|-------------|
| ✅ MODIFY | `prisma/schema.prisma:591` | Add `isTransfer` to FinanceTransaction; update V2 taxClassification comment |
| ✅ MODIFY (existing) | `prisma/migrations/.../migration.sql` | Add isTransfer column + clear V1 data |
| ✅ MODIFY | `src/app/api/finance/transactions/route.ts:51` | Add isTransfer to POST/PUT |
| ✅ NEW | `src/app/api/finance/pnl/route.ts` | Create P&L API endpoint |
| ✅ MODIFY | `src/app/api/finance/tax-report/route.ts:143` | Update to V2 classification values |
| ✅ MODIFY | `src/app/(app)/finance/bills/page.tsx:596` | V2 dropdown values + validation |
| ✅ MODIFY | `src/app/(app)/finance/income/page.tsx:736` | V2 dropdown values + validation |
| ✅ MODIFY | `src/app/(app)/finance/transactions/page.tsx:274` | Add isTransfer + V2 dropdown + validation |
| ✅ MODIFY | `src/app/(app)/finance/categories/page.tsx:38` | Add validation |
| ✅ MODIFY | `src/app/(app)/finance/profit-loss/page.tsx:83` | Add entity tabs + entityId filtering |
| ✅ MODIFY | `src/app/(app)/finance/tax-report/page.tsx:58` | Update to V2 colors/icons/super cap check |

---

## Architecture Diagram

```mermaid
flowchart TB
    subgraph "Database"
        FC[FinanceCategory<br/>taxIncludeInReporting<br/>taxDisplayLabel<br/>isTaxDeduction]
        FT[FinanceTransaction<br/>taxClassification NEW<br/>isTransfer NEW]
        FB[FinanceRecurringBill<br/>taxClassification]
        FI[FinanceIncomeEntry<br/>taxClassification]
    end

    subgraph "API Layer"
        TC_API[/api/finance/transactions]
        PNL_API[/api/finance/pnl NEW]
        TR_API[/api/finance/tax-report MODIFY]
    end

    subgraph "UI Pages"
        PNL_PAGE[/finance/profit-loss MODIFY]
        TR_PAGE[/finance/tax-report MODIFY]
        MODALS[Categories<br/>Bills<br/>Income<br/>Transactions MODIFY]
    end

    FT --> TC_API
    FC --> TC_API
    FB --> TC_API
    FI --> TC_API

    FT --> PNL_API
    FB --> PNL_API
    FI --> PNL_API

    FT --> TR_API
    FB --> TR_API
    FI --> TR_API
    FC --> TR_API

    TC_API --> MODALS
    PNL_API --> PNL_PAGE
    TR_API --> TR_PAGE
```
