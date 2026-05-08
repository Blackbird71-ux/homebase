# Feature: Bills to Pay Dashboard Card

**Date:** 2026-05-08

## Overview

Adds a "Bills to Pay" card to the home page dashboard, surfacing upcoming and overdue recurring bills from the Finance module. The card is opt-in (hidden by default) and enabled via the Dashboard Customise modal.

## Behaviour

- Shows active recurring bills due within the next 30 days, ordered by due date ascending.
- Prioritises non-autopay bills — if the family has any manual-payment bills in the window, only those are shown. If all bills are set to autopay, all bills are shown.
- Up to 5 bills displayed; overflow shown as "+N more".
- Overdue bills render the due-date label in destructive red.
- Autopay bills are annotated with "(auto)" to distinguish them at a glance.
- Amounts formatted as AUD currency.
- The entire card is a link to `/finance` for full bill management.
- Empty state message shown when no bills are due in the 30-day window.

## Files Changed

### `src/types/index.ts`

- Added `BillSummaryItem` interface: `id`, `name`, `amount`, `frequency`, `nextDueDate`, `isOverdue`, `daysUntilDue`, `autoPay`.
- Added `billsToPay: BillSummaryItem[]` field to `DashboardData`.

### `src/lib/dashboard-cards.ts`

- Registered `bills-to-pay` card with label "Bills to Pay" and `defaultVisible: false`.

### `src/app/(app)/home/page.tsx`

- Added `needsBills` flag (true when `bills-to-pay` card is visible).
- Added `prisma.financeRecurringBill.findMany` to the parallel query array when `needsBills` is true; fetches active bills with `nextDueDate` within 30 days.
- Maps raw Prisma results to `BillSummaryItem[]` (computes `daysUntilDue` and `isOverdue` from today's boundary).
- Includes `billsToPay` in the returned `DashboardData`.

### `src/app/api/dashboard/route.ts`

- Same bills fetch and mapping as the home page, applied to the client-side refresh API so the card updates when the dashboard auto-refreshes.

### `src/components/dashboard/BillsToPayCard.tsx` *(new)*

- Presentational card component matching the existing card design pattern.
- Displays bill name, formatted due-date label, amount, and autopay annotation.
- Uses `Receipt` icon from lucide-react.

### `src/components/dashboard/DashboardGrid.tsx`

- Imports `BillsToPayCard`.
- Added `case 'bills-to-pay'` to `renderCard()` switch, passing `data.billsToPay`.
