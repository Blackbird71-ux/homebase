# Bug Fix: Recurring Bills — Next Occurrence Not Created After Payment

**Date:** 2026-05-08

## Symptoms

1. When a recurring bill (e.g. monthly Netflix) is marked as paid on the Finance → Bills page, it correctly moves to the Paid Bills view. However, **no new occurrence appears** on the Outstanding Bills page, so the bill effectively disappears from the active list until the user manually adds it again.
2. The homescreen Upcoming Bills card sometimes shows paid bills or fails to show the next unpaid occurrence.

## Root Cause

The PATCH handler in `src/app/api/finance/bills/route.ts` only set `paid: true` and `paidDate: now()` on the existing bill record. For recurring bills, this meant:

- The single record was now "paid" → removed from the active list (correct)
- **No new `FinanceRecurringBill` record was created** for the next occurrence → nothing appeared in the outstanding list (the bug)
- The homescreen query (`src/app/(app)/home/page.tsx`) also lacked a `paid: false` filter, so paid records with a `nextDueDate` within the 30-day window could still appear

## Fix

Two files were modified:

### 1. `src/app/api/finance/bills/route.ts` — PATCH handler

Added an `advanceNextDueDate()` helper that computes the next occurrence date based on frequency:

| Frequency | Advancement |
|---|---|
| `weekly` | `addWeeks(date, 1)` |
| `fortnightly` | `addWeeks(date, 2)` |
| `monthly` | `addMonths(date, 1)` |
| `quarterly` | `addMonths(date, 3)` |
| `yearly` | `addMonths(date, 12)` |

When a **recurring** bill (`billType !== 'one-off'`) is marked `paid: true`:

1. The current record is updated to `paid: true` / `paidDate: now()` — preserved for bookkeeping on the Paid Bills page
2. A **new `FinanceRecurringBill` record is created** with:
   - All fields copied from the original (name, amount, frequency, account/category/location, notes, etc.)
   - `nextDueDate` advanced by one interval
   - `paid: false`, `paidDate: null`
   - `invoiceReceived: false`, `invoiceReceivedDate: null`
   - Fresh auto-generated ID
   - Same `familyId`
3. The creation is skipped if the new due date exceeds the bill's `endDate`

One-off bills remain unchanged — they are simply marked as paid with no new occurrence.

### 2. `src/app/(app)/home/page.tsx` — `getDashboardData` bills query

Added `paid: false` to the Prisma `where` clause so the homescreen only shows unpaid upcoming bills. This is a safety filter — even with the new-occurrence fix, it ensures edge cases (e.g. a paid bill that somehow wasn't advanced) don't pollute the homescreen display.

## Files Changed

```
modified:   src/app/api/finance/bills/route.ts    (PATCH handler — create next occurrence)
modified:   src/app/(app)/home/page.tsx            (bills query — add paid: false filter)
```

## Testing Notes

- Mark a recurring bill as paid → verify it appears on Paid Bills page
- Verify a new unpaid occurrence (same name, amount, next month's date) appears on Outstanding Bills page
- Verify the homescreen Upcoming Bills card shows the new occurrence with correct due date
- Verify one-off bills still work as before (mark paid → no new occurrence)
- Verify "undo paid" on a recurring bill works correctly (PATCH with `paid: false` — no new record is created during undo)

## Lesson

When a recurring entity (bill, subscription, chore, etc.) is marked as "completed", the code must either:
- **Advance** the next due date on the existing record (for histories that don't need individual records), OR
- **Create a new occurrence record** (when each paid instance needs to be preserved for bookkeeping)

For finance bills, the latter approach was chosen because each paid occurrence is a bookkeeping record that must appear on the Paid Bills report.