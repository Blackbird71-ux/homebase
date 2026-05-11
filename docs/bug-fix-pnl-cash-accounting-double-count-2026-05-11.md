# Bug Fix: P&L Cash Accounting — Missing Quick Expense & Double Counting

**Date:** 2026-05-11
**Status:** Implemented

---

## Bug 1: Quick Expense Not Appearing on P&L

### Symptom
QuickAdd expense (Cmd+K → Expense) never appears on the P&L page.

### Root Cause
[`QuickAdd.tsx`](../src/components/layout/QuickAdd.tsx:304-322) omitted `isCleared` from the POST body. The [transactions API](../src/app/api/finance/transactions/route.ts:135) defaults it to `false`. The P&L's [`loadTransactions`](../src/app/(app)/finance/profit-loss/page.tsx:149) requests `isCleared: 'true'` — so the expense was invisible.

### Fix
[`QuickAdd.tsx:311`](../src/components/layout/QuickAdd.tsx:311) — added `isCleared: true` to the expense POST body.

```diff
 body: JSON.stringify({
   type: 'expense',
   amount,
+  isCleared: true,
   ...
 }),
```

---

## Bug 2: P&L Items Double-Counted (Bills + Transactions)

### Symptom
Paid bills and received income appear twice on the P&L — once via the bill/income entry and once via the transaction created by the PATCH endpoint.

### Root Cause
The P&L page combines two separate data sources without deduplication:

```
relevantExpenses = [...billItems, ...txItems]   // ← double count!
relevantIncome   = [...entryItems, ...txItems]   // ← double count!
```

When a bill is paid via [`bills PATCH`](../src/app/api/finance/bills/route.ts:451-561), a cleared expense transaction is created with `recurringBillId`. The P&L then shows both the bill (because `b.paid = true`) AND the transaction (because it's a cleared expense). Same for income via [`income PATCH`](../src/app/api/finance/income/route.ts:433-539).

### Fix
Three interface updates + two dedup Sets + two filter additions in [`profit-loss/page.tsx`](../src/app/(app)/finance/profit-loss/page.tsx):

| Change | Location | Detail |
|--------|----------|--------|
| `Bill.paymentTxId` | [`page.tsx:27`](../src/app/(app)/finance/profit-loss/page.tsx:27) | New field on Bill interface |
| `IncomeEntry.receiptTxId` | [`page.tsx:36`](../src/app/(app)/finance/profit-loss/page.tsx:36) | New field on IncomeEntry interface |
| `Tx.recurringBillId` | [`page.tsx:44`](../src/app/(app)/finance/profit-loss/page.tsx:44) | New field on Tx interface |
| `billLinkedTxIds` Set | [`page.tsx:188-192`](../src/app/(app)/finance/profit-loss/page.tsx:188-192) | Transaction IDs linked to bills |
| `receiptLinkedTxIds` Set | [`page.tsx:193-196`](../src/app/(app)/finance/profit-loss/page.tsx:193-196) | Income transaction IDs |
| Bill dedup filter | [`page.tsx:265`](../src/app/(app)/finance/profit-loss/page.tsx:265) | Skip bill if `paymentTxId` matches a loaded tx |
| Income dedup filter | [`page.tsx:206`](../src/app/(app)/finance/profit-loss/page.tsx:206) | Skip entry if `receiptTxId` matches a loaded tx |

The dedup logic:
- Collects all loaded transaction IDs that are linked to bills (`recurringBillId`)
- Collects all loaded income transaction IDs
- When filtering bills: if `bill.paymentTxId` is in the bill-linked set, the bill is excluded (the transaction already represents the cash outflow)
- When filtering income entries: if `entry.receiptTxId` is in the receipt-linked set, the entry is excluded (the transaction already represents the cash inflow)

This means cash accounting correctly shows each cash event exactly once.

---

## Files Changed

```
modified:   src/components/layout/QuickAdd.tsx          (1 line)
modified:   src/app/(app)/finance/profit-loss/page.tsx  (~15 lines)
created:    docs/bug-fix-pnl-cash-accounting-double-count-2026-05-11.md
```

## Testing Notes

1. **QuickAdd expense**: Create a quick expense → verify it appears on P&L in Cash mode
2. **Bill paid**: Mark a bill as paid → verify amount appears **once** (one line item), not twice
3. **Income received**: Mark income as received → verify amount appears once, not twice
4. **Direct transaction**: Add expense transaction directly (not via bill) → verify it appears once
5. **Unpaid bills**: Verify unpaid bills appear in Forecast mode but NOT in Cash mode
6. **Legacy bills**: Bills paid before this fix (no `paymentTxId`) still appear in Cash mode
7. **Entity filter tabs**: Test with "All", "Personal", "Business" tabs to ensure dedup works across all
