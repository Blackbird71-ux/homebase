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

---

# Chores — Completion Feedback + Mobile Button Fix
**Date:** May 7, 2026

## Summary
Added satisfying visual feedback when completing a chore, richer toast notifications showing the next scheduled date, and fixed a mobile layout bug where the AI assistant button was obscured by the help button.

## Changes

### `src/app/(app)/chores/ChoresClient.tsx`
- Added `completingIds` state (`Set<string>`) to track in-flight completions
- `handleComplete` now accepts the full `Chore` object (was `choreId: string`)
- Checkbox immediately turns solid green and scales up (`scale-110`) on click; resets after 700ms
- Toast upgraded from plain "Chore completed!" to:
  - **Recurring**: "Chore completed!" with `Next scheduled: {date}` description and an **Edit** action button to jump straight to the edit dialog
  - **Final occurrence**: "All done!" with "No more occurrences — chore is now complete."
- Help content updated to describe the new completion flow

### `src/components/ai/AIAssistant.tsx`
- Moved mobile floating button from `bottom-24` (96px) to `bottom-36` (144px) to clear the help button (which occupies 80–116px from bottom)
- Chat panel adjusted from `bottom-40` to `bottom-52` on mobile correspondingly
- Desktop positions (`md:bottom-6`, `md:bottom-20`) unchanged

### `src/components/layout/HelpContent.ts`
- Updated "Completing Chores" section to describe the green flash confirmation and the reschedule toast with Edit action

## Design
- Visual feedback is immediate (optimistic) — no waiting for the API before the checkbox animates
- Toast duration: 5 s for recurring chores (time to read date + decide to edit), 4 s for final-occurrence message
- Mobile button stack (bottom → top): QuickAdd FAB (20px) → Help button (80px) → AI button (144px)