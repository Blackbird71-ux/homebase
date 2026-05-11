# Partial Payments for Bills — Implementation Plan

> **Status: ✅ Implemented** (2026-05-11)
>
> All 10 steps completed. See [`docs/bills-partial-payments-plan.md`](docs/bills-partial-payments-plan.md) for the full plan.
>
> **Files created:**
> - [`prisma/migrations/20260528000000_add_bill_payments/migration.sql`](prisma/migrations/20260528000000_add_bill_payments/migration.sql)
> - [`src/app/api/finance/bills/[id]/payments/route.ts`](src/app/api/finance/bills/[id]/payments/route.ts)
> - [`src/app/api/finance/bills/[id]/payments/[paymentId]/route.ts`](src/app/api/finance/bills/[id]/payments/[paymentId]/route.ts)
> - [`scripts/migrate-bill-payments.ts`](scripts/migrate-bill-payments.ts)
>
> **Files modified:**
> - [`prisma/schema.prisma`](prisma/schema.prisma)
> - [`src/app/api/finance/bills/route.ts`](src/app/api/finance/bills/route.ts)
> - [`src/app/(app)/finance/bills/page.tsx`](src/app/(app)/finance/bills/page.tsx)
> - [`src/types/index.ts`](src/types/index.ts)
> - [`src/app/api/dashboard/route.ts`](src/app/api/dashboard/route.ts)
> - [`src/components/dashboard/BillsToPayCard.tsx`](src/components/dashboard/BillsToPayCard.tsx)
> - [`src/app/api/finance/pnl/route.ts`](src/app/api/finance/pnl/route.ts)
> - [`src/lib/financeReport.ts`](src/lib/financeReport.ts)
> - [`src/app/(app)/finance/paid-bills/page.tsx`](src/app/(app)/finance/paid-bills/page.tsx)

## Overview

Currently, bills operate on an all-or-nothing basis: when marked paid, the full `amount` is recorded as a single expense transaction. This plan adds the ability to pay a bill in multiple installments, with each payment tracked individually.

---

## 1. Data Model Changes

### New Model: `FinanceBillPayment`

```prisma
model FinanceBillPayment {
  id              String               @id @default(cuid())
  billId          String
  bill            FinanceRecurringBill @relation(fields: [billId], references: [id], onDelete: Cascade)
  amount          Float                // Amount paid in this installment
  paymentDate     DateTime
  accountId       String?              // Bank account the payment came from
  account         FinanceAccount?      @relation(fields: [accountId], references: [id], onDelete: SetNull)
  glAccountId     String?              // GL category for balance sheet tracking
  glAccount       FinanceCategory?     @relation(fields: [glAccountId], references: [id], onDelete: SetNull)
  transactionId   String?              @unique // FK -> FinanceTransaction created for this payment
  transaction     FinanceTransaction?  @relation(fields: [transactionId], references: [id], onDelete: SetNull)
  notes           String?
  createdBy       String
  familyId        String
  family          Family               @relation(fields: [familyId], references: [id], onDelete: Cascade)
  createdAt       DateTime             @default(now())

  @@index([billId])
  @@index([familyId])
  @@index([paymentDate(sort: Desc)])
}
```

### Changes to `FinanceRecurringBill`

- Add relation: `payments FinanceBillPayment[]`
- The `paid` field remains a database column but is **managed by the API layer**:
  - Set to `true` when `SUM(payments.amount) >= bill.amount`
  - Set to `false` when `SUM(payments.amount) < bill.amount` (or 0 payments)
- The `paidDate` is updated to the **most recent payment date** (or null if no payments)
- The `paymentTxId` field stays for backward compatibility but new payments will link to `FinanceBillPayment.transactionId`

### Migration SQL

```sql
-- Create the new bill_payments table
CREATE TABLE "FinanceBillPayment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "billId" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "paymentDate" DATETIME NOT NULL,
  "accountId" TEXT,
  "glAccountId" TEXT,
  "transactionId" TEXT,
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("billId") REFERENCES "FinanceRecurringBill"("id") ON DELETE CASCADE,
  FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL,
  FOREIGN KEY ("glAccountId") REFERENCES "FinanceCategory"("id") ON DELETE SET NULL,
  FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "FinanceBillPayment_transactionId_key" ON "FinanceBillPayment"("transactionId");
CREATE INDEX "FinanceBillPayment_billId_idx" ON "FinanceBillPayment"("billId");
CREATE INDEX "FinanceBillPayment_familyId_idx" ON "FinanceBillPayment"("familyId");
CREATE INDEX "FinanceBillPayment_paymentDate_idx" ON "FinanceBillPayment"("paymentDate" DESC);
```

### Migration of Existing Data

For existing bills where `paid = true` and a `paymentTxId` exists:
- Create a single `FinanceBillPayment` record with the full amount and existing `paidDate`
- Link it to the existing `paymentTxId`

For existing bills where `paid = true` but NO `paymentTxId`:
- Create a single `FinanceBillPayment` record with the full amount and `paidDate`
- No transaction link (legacy data)

For existing bills where `paid = false`:
- No migration needed

---

## 2. API Changes

### New Endpoints

#### `GET /api/finance/bills/[id]/payments`
Returns all payments for a bill, ordered by paymentDate desc.

Response: `FinanceBillPayment[]` with account, glAccount, transaction included.

#### `POST /api/finance/bills/[id]/payments`
Record a new partial payment.

**Request body:**
```typescript
{
  amount: number           // Required. Amount paid in this installment
  paymentDate: string      // Required. ISO date string
  accountId?: string       // Bank account the payment came from
  glAccountId?: string     // GL category for balance sheet
  notes?: string
}
```

**Backend logic:**
1. Validate the bill exists and belongs to the family
2. Check that `amount` is positive and <= remaining balance
3. Create a `FinanceBillPayment` record
4. Create a `FinanceTransaction` for the payment:
   - If bill has an invoice transaction (`invoiceTxId`): create a new cleared expense tx, link to payment
   - If no prior invoice: create a cleared expense transaction for the partial amount
5. Update `bill.paid` and `bill.paidDate` based on sum of payments

#### `DELETE /api/finance/bills/[id]/payments/[paymentId]`
Undo a specific payment installment.

**Backend logic:**
1. Validate the payment exists
2. Delete the linked `FinanceTransaction`
3. Delete the `FinanceBillPayment` record
4. Recalculate `bill.paid` and `bill.paidDate`

### Modified Endpoints

#### `PATCH /api/finance/bills` — Updated mark-paid flow
Current: takes `{ id, paid: true, paidDate, payFromGlAccountId }`

**Change:** Accept optional `paymentAmount` field. If provided, create a partial payment record. If omitted, default to full remaining balance. This keeps the existing UI working while adding partial payment support.

---

## 3. UI Changes

### 3.1 Bills Page — Mark Paid Dialog

Add an **Amount** field to the confirmation dialog:
- Pre-filled with the remaining balance
- Editable to any amount up to the remaining balance
- Shows "Remaining: $X.XX" below the field
- Validation: amount > 0 and amount <= remaining balance

### 3.2 Bills Page — Payment Progress on Bill Rows

For partially paid bills, show progress in the amount column:
- Format: `$200 / $1,000`
- Optional progress bar visual
- A small "Paid $X · date" subtitle

### 3.3 Bills Page — Payment History Panel

New expandable section on each bill row (similar to attachments):
- Button: `[💳 Payments]` or `[Show Payments]`
- Expanded panel shows:
  - Each payment: amount, date, account name, [Undo] button
  - Summary: "Total paid: $X / $Y · Remaining: $Z"
  - "Make Payment" button that opens the mark-paid dialog with pre-filled remaining balance

### 3.4 Dashboard

- `BillSummaryItem` type: add `remainingBalance` field
- `BillsToPayCard`: show `remainingBalance` instead of `amount` for partially paid bills
- Dashboard query: include partially paid bills (they already match `paid: false`)

### 3.5 P&L and Reports

Cash accounting mode needs to use individual payment records instead of a single `paidDate`/`amount`:
- For bills with payment records, use each payment's `paymentDate` and `amount` for cash-basis slotting
- This spreads a bill's expense across multiple reporting periods proportional to payments
- Fall back to legacy `paidDate`/`amount` for pre-migration bills with no payment records

---

## 4. Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `FinanceBillPayment` model + relation on `FinanceRecurringBill` |
| (new migration) | Create `FinanceBillPayment` table |
| `src/app/api/finance/bills/route.ts` | PATCH: accept `paymentAmount`, delegate to payment creation |
| `src/app/api/finance/bills/[id]/payments/route.ts` | NEW: GET + POST payments |
| `src/app/api/finance/bills/[id]/payments/[paymentId]/route.ts` | NEW: DELETE payment |
| `src/app/(app)/finance/bills/page.tsx` | Update mark-paid dialog, add payment progress + history panel |
| `src/app/(app)/finance/paid-bills/page.tsx` | Minor: show payment info |
| `src/app/api/dashboard/route.ts` | Add `remainingBalance` to bills data |
| `src/types/index.ts` | Add `remainingBalance` to `BillSummaryItem` |
| `src/components/dashboard/BillsToPayCard.tsx` | Show remaining balance |
| `src/app/(app)/finance/profit-loss/page.tsx` | Cash mode: use payment records |
| `src/app/(app)/finance/reports/page.tsx` | Cash mode: use payment records |
| `src/app/(app)/finance/annual-pnl/page.tsx` | Cash mode: use payment records |
| `src/app/api/finance/pnl/route.ts` | Cash mode: use payment records |
| `src/lib/financeReport.ts` | Cash mode: use payment records |

---

## 5. Implementation Order

1. **Prisma schema + migration** — Add `FinanceBillPayment` model
2. **Payment API endpoints** — Create GET/POST/DELETE for payments  
3. **Modify existing PATCH** — Update mark-paid to support partial amounts
4. **UI: Mark Paid dialog** — Add amount field
5. **UI: Payment history panel + progress** — Show payments on bill rows
6. **Dashboard update** — Add `remainingBalance` and update card
7. **P&L/Reports update** — Use individual payment records for cash accounting
8. **Paid Bills page** — Minor payment info display
9. **Data migration** — Script existing paid bills to payment records

---

## 6. Edge Cases

- **Overpayments**: Prevented by API validation (amount <= remaining balance)
- **Zero payments**: Prevented by API validation
- **Recurring bills**: Each new spawned occurrence starts fresh with 0 payments
- **Undo behavior**: Per-installment undo, replaces global "unmark paid"
- **Concurrent payments**: Each creates its own transaction, no conflict
- **Narrow screens**: Payment progress collapses gracefully on mobile
