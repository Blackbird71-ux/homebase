# Chores — Show Next Occurrence Date Inline
**Date:** May 8, 2026

## Summary
Added the next occurrence date next to each chore title in the list, so users can see at a glance when a chore is due next without needing to hover or open the details.

## Changes

### `src/app/(app)/chores/ChoresClient.tsx`
- Added a `whitespace-nowrap` span rendering `formatDate(chore.nextDueDate)` between the chore title (HoverCard) and the overdue badge
- Uses the existing `nextDueDate` field and `formatDate` utility — no new data fetching or dependencies

## Design
- Date is shown in `text-xs text-muted-foreground` — subtle and non-intrusive
- Only renders when `chore.nextDueDate` is present
- Does not duplicate the hover card's "Next due" line — it complements it by making the date always visible
- Works alongside the existing "Overdue" badge and completed strikethrough styling