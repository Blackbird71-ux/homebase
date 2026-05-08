# Bug Fix: Bills to Pay — UTC Date, One Off Frequency, Dashboard Resize

**Date:** 2026-05-08

## Problems

1. **UTC time error on Bills to Pay card** — Bills due "today" displayed as "Due tomorrow" (or similarly off by one day).

2. **No "One Off" frequency option** — The bill entry form only offered recurring frequencies (Monthly, Fortnightly, Weekly, Quarterly, Yearly). There was no way to enter a non-recurring, one-time bill.

3. **Cannot resize dashboard card height** — Dragging the south/north resize handles on dashboard cards had no effect, making it impossible to adjust card height.

## Root Causes

1. Bill due dates are stored as UTC midnight (e.g., `2026-05-08T00:00:00Z` when the user enters `2026-05-08`). The dashboard compared these against `todayStart` from `todayBoundsInTz()`, which returns local midnight expressed as UTC (e.g., `2026-05-07T14:00:00Z` for Australia/Sydney UTC+10). That 10-hour gap caused `Math.ceil(diffMs / 86400000)` to round "0.41 days" up to 1, showing "Due tomorrow" instead of "Due today".

2. The frequency `<select>` in `src/app/(app)/finance/bills/page.tsx` only had 5 recurring options.

3. Dashboard cards initialise with `height: 'auto'`. The resize move handler in `useCardLayout.ts` skipped vertical resize with `if (edge.includes('s') && resize.startLayout.height !== 'auto')`, so when height was `'auto'` the south/north handles were silently no-ops.

## Fix

**`src/app/api/dashboard/route.ts`**
- Changed the bills query 30-day window from `todayStart` to `mealPlanTodayStart` (UTC midnight of today's local date string, already computed for meal plan queries).
- Changed `daysUntilDue` calculation to also use `mealPlanTodayStart` and `Math.round` instead of `Math.ceil`, so a bill due exactly on today's UTC midnight date gives `daysUntilDue = 0`.

**`src/app/(app)/finance/bills/page.tsx`**
- Added `<option value="one_off">One Off</option>` to the frequency dropdown.
- No additional logic needed: `getNextDue()` already falls through for unknown frequencies, keeping the stored due date unchanged. One-off bills appear as overdue until deleted or deactivated.

**`src/lib/hooks/useCardLayout.ts`**
- In `handleResizeStart`, when the resize edge includes `'s'` or `'n'` and the card's current `height` is `'auto'`, the actual rendered pixel height is read from the DOM via `e.currentTarget.parentElement.getBoundingClientRect().height` and used as `startLayout.height`. This gives the resize move handler a real pixel baseline so vertical resize works immediately on first drag.
