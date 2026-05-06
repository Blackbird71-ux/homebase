# Chores — Compact Single-Row Layout with Hover Details
**Date:** May 6, 2026

## Summary
Redesigned the chores list from a card-based layout to a compact single-row layout inspired by Notion's weekly to-do list template. All detailed chore information is now shown in a HoverCard popover on hover, keeping the list clean and space-efficient.

## Changes

### `src/app/(app)/chores/ChoresClient.tsx`
- Complete rewrite from card-based layout to compact single-row design
- Each chore is now a single flex row: `[checkbox] [title with HoverCard] [overdue badge] [assignee] [actions on hover]`
- New `HoverDetails` component renders all chore metadata in a HoverCard popover:
  - Description, schedule, next due date, assignee, times done
  - End date, rotation interval, auto-rotate setting, email reminder settings
  - Last completion info (who and when)
- Actions (rotate, delete) are hidden by default and appear on row hover (`opacity-0 group-hover:opacity-100`)
- Mobile: InfoIcon button triggers the HoverCard
- Clicking the title opens the ChoreDialog for editing (unchanged)
- Removed unused `currentUserId` prop

### `src/app/(app)/chores/page.tsx`
- Removed `currentUserId` prop from `ChoresClient` (no longer needed)

## Design
- Compact rows with `py-2.5` padding, `gap-2` spacing
- Overdue chores get an amber left border and "Overdue" badge
- Assignee shown with 👤 icon, truncated to 100px on desktop, hidden on mobile
- Clean border/divide styling matching the app's design system
- All existing functionality preserved: complete, rotate, delete, edit, add

## Files Modified
- `src/app/(app)/chores/ChoresClient.tsx`
- `src/app/(app)/chores/page.tsx`

## Verification
- ✅ Build passes with no errors
- ✅ Linter passes with no warnings
- ✅ ChoreDialog editor untouched
- ✅ All existing functionality retained