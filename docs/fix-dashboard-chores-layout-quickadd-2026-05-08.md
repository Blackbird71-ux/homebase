# Dashboard Fixes: Chore Card, Layout Stability, Quick-Add Buttons

**Date:** 2026-05-08

---

## Fix 1: Chore Schedule Card Never Hides (Empty State)

### Problem

The chore card used `return null` when there were no chores to display. Combined with:

- `showOnlyMine` defaulting to `true` (so the card would be empty for any user with no assigned chores)
- The card disappearing entirely when the Mine filter was toggled and returned no results

This caused the card panel to vanish from the dashboard, leaving a gap and triggering overlap issues with other cards.

### Fix

- Changed `showOnlyMine` default to `false` so the card shows all family chores on first load
- Removed all `return null` branches — the card always renders
- When there are no chores in the selected period, an inline empty state is shown: green check icon, "You're all caught up!", "No outstanding chores in this period."

### Files Changed

- `src/components/dashboard/ChoreScheduleCard.tsx` — removed `return null`; added empty state UI; changed `showOnlyMine` default to `false`

---

## Fix 2: Drag / Resize Causes Cards to Accumulate Downward

### Problem

During a drag or resize gesture, `resolveCollisions` ran on every `pointermove` event using `prev` (the current React state) as the base layout. Because each frame's result was fed back as the next frame's input, any small push applied to a card compounded across frames — cards would drift progressively downward even during a short drag.

### Fix

Added a `startLayouts` snapshot to both `DragState` and `ResizeState`, captured once at gesture start (`onStart`). Each `onMove` frame now uses `startLayouts` (the immutable pre-gesture state) as the base for collision resolution, discarding the accumulated intermediate state.

Also reduced `AUTO_HEIGHT_EST_PX` from `400` to `280` to better match real card heights in collision math.

### Files Changed

- `src/lib/hooks/useCardLayout.ts` — added `startLayouts` to `DragState` / `ResizeState` interfaces; snapshot on `onStart`; drag and resize `onMove` use `drag.startLayouts` / `resize.startLayouts` as base; `AUTO_HEIGHT_EST_PX` 400 → 280

---

## Fix 3: Auto-Correct Layout Overlaps on Load

### Problem

Saved card positions could become stale — e.g. a card that was previously hidden (due to empty state) had a saved `y` that overlapped another card when it reappeared. Users had to manually click "Reset Layout" to fix this.

### Fix

Added `compactLayouts()` to `useCardLayout`, called at the end of `buildDefaultLayouts`. It sorts cards by `y`, then for each card checks all previously-placed cards for horizontal overlap and pushes the current card down if needed. This is a single-pass correction that runs once on load.

### Files Changed

- `src/lib/hooks/useCardLayout.ts` — new `compactLayouts(layouts, containerW)` function; called from `buildDefaultLayouts` before returning

---

## Feature: Quick-Add Buttons on All Dashboard Panels

### Overview

Added a `+` button to the header of every dashboard card that opens an inline dialog for adding a new item without leaving the dashboard.

Supported types:

| Card | Quick-Add |
|---|---|
| Chore Schedule | Add chore (title → POST `/api/chores`, frequency defaults to `weekly`) |
| Upcoming Events | Add event (title + date → POST `/api/events`, all-day) |
| Today's Meals | Add meal (date + meal type selector + note → POST `/api/meal-plan`) |
| To-Do | Add task (content → POST `/api/lists/${listId}/items`) |

On success: green check state for 700ms, then dialog closes and `router.refresh()` reloads dashboard data.

The `+` button uses `e.stopPropagation()` / `e.preventDefault()` to avoid triggering parent `<Link>` navigation.

### Files Changed

- `src/components/dashboard/CardQuickAdd.tsx` — new reusable client component
- `src/components/dashboard/ChoreScheduleCard.tsx` — `<CardQuickAdd type="chore" />`
- `src/components/dashboard/UpcomingEventsCard.tsx` — card `<Link>` wrapper removed; title and individual events are now Links; `<CardQuickAdd type="event" />`
- `src/components/dashboard/TonightsDinnerCard.tsx` — `<CardQuickAdd type="meal" />`
- `src/components/dashboard/TodoCard.tsx` — card `<Link>` wrapper removed; title is now a Link; `<CardQuickAdd type="todo-item" listId={todo.listId} />`
