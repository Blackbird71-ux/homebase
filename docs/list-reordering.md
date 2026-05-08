# List Re-ordering

## Overview

Users can drag-and-drop lists in the sidebar (grip handle on the left of each row) to set their preferred order. The order is stored **per-user** in `uiPreferences.listOrder` so each household member can have a different sequence. The same order is reflected in the weekly summary To-Do list dropdown on the home dashboard.

Lists that a user has never reordered fall back to the family-wide `sortOrder` default.

## Implementation

### Database

- **`prisma/schema.prisma`** — `sortOrder` field (Int, default 0) on the `List` model serves as the family-wide default order.
- **`prisma/migrations/20260426203633_add_list_sort_order/`** — Migration that added the `sortOrder` column.
- **Per-user order** — stored as `listOrder: string[]` (array of list IDs) inside the `User.uiPreferences` JSON field. No schema migration required.

### API Endpoints

- **`src/app/api/lists/reorder/route.ts`** — Batch PATCH endpoint (`{ items: [{ id, sortOrder }] }`) for updating the family-wide sort order. Not called by the UI drag-drop anymore; available for admin/bulk operations.
- **`/api/settings` PATCH** — The drag-drop handler now persists per-user order here via `{ uiPreferences: { listOrder: string[] } }`. The settings endpoint deep-merges `uiPreferences` so other preferences are not overwritten.

### Modified Components

- **`src/components/lists/ListSelector.tsx`** — Drag-and-drop UI using `@dnd-kit`. Grip handle (`GripVerticalIcon`) on each row; lists reorder independently within their Shopping and Todo sections.

- **`src/app/(app)/lists/ListsClient.tsx`** — `handleReorder` callback:
  1. Updates local state optimistically.
  2. PATCHes `/api/settings` with `{ uiPreferences: { listOrder: orderedIds } }` to persist the per-user order.

- **`src/app/(app)/lists/page.tsx`** — After fetching lists sorted by family `sortOrder`, re-sorts them by the current user's `listOrder` from `uiPreferences`. New lists not yet in `listOrder` are appended after ordered ones.

- **`src/app/(app)/home/page.tsx`** — `availableTodoLists` (passed to the weekly summary dropdown) is re-sorted by the current user's `listOrder` before being sent to the client. Falls back to `sortOrder` for unlisted entries.

## How to Test

1. Log in as two different family members in separate browsers.
2. On the Lists page, drag lists into different orders for each user.
3. Refresh — each user should see their own order preserved.
4. Navigate to Home — the To-Do list dropdown in the Weekly Summary card should reflect the same per-user order.
5. Verify that Shopping lists can only be reordered among other Shopping lists and Todo lists among Todo lists.

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | `sortOrder` on `List` (existing) |
| `prisma/migrations/20260426203633_add_list_sort_order/migration.sql` | (existing migration) |
| `src/app/api/lists/reorder/route.ts` | (existing endpoint, no longer called by drag-drop) |
| `src/components/lists/ListSelector.tsx` | Drag-and-drop UI (existing) |
| `src/app/(app)/lists/ListsClient.tsx` | `handleReorder` saves to `/api/settings` uiPreferences instead of `/api/lists/reorder` |
| `src/app/(app)/lists/page.tsx` | Re-sorts fetched lists by user's `listOrder` preference |
| `src/app/(app)/home/page.tsx` | Re-sorts `availableTodoLists` by user's `listOrder` preference |
