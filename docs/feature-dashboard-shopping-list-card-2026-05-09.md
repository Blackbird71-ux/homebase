# Feature: Shopping List Card — Dynamic Item Count & List Selector

**Date:** May 9, 2026

## Summary
Enhanced the Shopping List dashboard card with two improvements: (1) a ResizeObserver-based dynamic item count that adapts to the card's available height, and (2) a dropdown selector to pick which shopping list to display, with changes persisted to settings.

## Changes

### 1. Dynamic Item Count Based on Card Size
- **File:** `src/components/dashboard/ShoppingListCard.tsx`
- Added a `ResizeObserver` on the card's content area to detect height changes when the card is resized in the free-form dashboard layout.
- Calculates `maxItems` as `Math.floor(availableHeight / ITEM_ROW_HEIGHT)`, where:
  - `availableHeight = contentHeight - HEADER_HEIGHT (80px) - FOOTER_HEIGHT (24px)`
  - `ITEM_ROW_HEIGHT = 20px` (one text-xs line per item)
- Clamped between `MIN_ITEMS (1)` and `MAX_ITEMS (10)`.
- Items rendered via `list.firstItems.slice(0, itemCount)` with a "+N more" footer for overflow.
- Automatically recalculates on every resize event.

### 2. Shopping List Dropdown Selector
- **File:** `src/components/dashboard/ShoppingListCard.tsx`
- Added a `<select>` dropdown in the card header, positioned right-aligned with a chevron icon.
- Options include "Auto (recent)" as the default fallback, plus all active shopping lists for the family.
- When a list is selected, `onListChange` is called with the list ID.

### 3. Settings Persistence via Props
- **File:** `src/app/(app)/home/HomeClient.tsx`
- Added `handleShoppingListChange` callback that:
  - Updates local `currentShoppingListId` state.
  - Saves to settings via `PATCH /api/settings` with `{ uiPreferences: { dashboardShoppingListId: listId } }`.
  - Re-fetches dashboard data with `?dashboardShoppingListId=listId` to show items from the selected list.
- Props `availableShoppingLists`, `selectedShoppingListId`, `onShoppingListChange` flow from `HomeClient` → `DashboardGrid` → `ShoppingListCard`.

### 4. Server-Side: Fetch & Filter by Selected List
- **File:** `src/app/(app)/home/page.tsx`
- `HomePage` fetches all active shopping lists via `prisma.list.findMany({ where: { familyId, type: 'SHOPPING', isActive: true } })` and passes as `availableShoppingLists`.
- **File:** `src/app/api/dashboard/route.ts`
- The dashboard API now accepts `?dashboardShoppingListId=` query param.
- When specified, the shopping list query filters to that specific list ID; otherwise falls back to `take: 1` (most recent).
- `take: 10` items are fetched to support the dynamic display.

### 5. Edge Cases Handled
- **Null/empty lists:** Displays "No list selected" with a link to Settings.
- **Missing selection:** Defaults to "Auto (recent)" which shows the first available list.
- **Empty content:** Only visible items shown; remaining count displayed as "+N more".
- **Single-column (mobile):** Works via the same grid layout.

## Files Modified
- `src/components/dashboard/ShoppingListCard.tsx` — Dynamic item count, list selector dropdown, new props
- `src/app/(app)/home/HomeClient.tsx` — Shopping list change handler, new props plumbing
- `src/app/(app)/home/page.tsx` — Fetch available shopping lists, pass to HomeClient
- `src/app/api/dashboard/route.ts` — Accept `?dashboardShoppingListId=` query param