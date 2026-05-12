# Bug Fix — Bill Accrual Journal Entry on Invoice Receipt
**Date:** 2026-05-12

## Problem

Posted bills (invoiceReceived=true) were not appearing in the trial balance or P&L, and Accounts Payable was absent from the trial balance entirely.

### Root Cause

Three data sources were disconnected:

| Report | Data Source |
|--------|-------------|
| Balance Sheet AP | Raw bill records (`invoiceReceived:true AND paid:false`) |
| Trial Balance | Posted journal lines + cleared transactions |
| P&L | Cleared transactions only |

When `invoiceReceived=true` was set on a bill, the PATCH handler posted any *existing* draft journal entry — but only if one already existed. Journal entries are only created when the UI explicitly sends `journalLines` at bill creation time (optional). For bills created without journal lines (the common case), `journalEntryId` was null, the `if (jeId)` block was skipped, and nothing was posted to the ledger.

Result: AP never appeared in the trial balance; the expense account never appeared either. The balance sheet showed AP correctly (different code path) creating a silent inconsistency.

## Fix

**File:** `src/app/api/finance/bills/route.ts`

Added an `else if` branch to the `invoiceReceived=true` handler. When no draft journal entry exists and the bill has a category assigned, the system now auto-creates and immediately posts the accrual journal entry:

```
DR  bill.categoryId (expense account)   bill.amount
CR  Accounts Payable (system account)   bill.amount
```

This mirrors standard double-entry accounting: every vendor bill posted creates a debit to the expense account and a credit to AP. The AP system account (`isSystem: true, type: 'liability'`) is auto-created via `ensureAccountsPayableCategory()` if it doesn't exist.

The fix is in the existing `invoiceReceived=true` block alongside invoice transaction creation, so the undo path (`invoiceReceived=false`) already handles reverting the journal entry to draft.

## Behaviour After Fix

- **Trial balance:** Shows the expense account (debit) and Accounts Payable (credit) for every posted bill, whether or not the bill was created with explicit journal lines.
- **Balance sheet AP:** Unchanged — still reads raw bill records. Consistent with trial balance.
- **P&L:** Journal lines for expense accounts are picked up via `deriveJournalLineBalances()` which the P&L already calls.
- **Bills without a category:** No journal entry is created (debit account unknown). These bills still appear on the balance sheet AP but not the trial balance.
- **Bills with pre-existing draft journal entries:** Existing behaviour — the draft is posted, no new entry created.

## Retroactive Data

Bills posted before this fix have no journal entries. To appear correctly in the trial balance they would need to be un-posted (invoiceReceived=false) and re-posted (invoiceReceived=true) to trigger the new auto-create path. Alternatively, manual journal entries can be created for them via the Journals screen.
