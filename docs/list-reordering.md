# List Re-ordering

## Overview

Added the ability to reorder shopping and todo lists in the sidebar via drag-and-drop. Users can grab the grip handle (6 dots icon) on any list and drag it to a new position within its section (Shopping or Todo). The order is persisted to the database and survives page reloads.

## Implementation

### Database

- **`prisma/schema.prisma`** - Added `sortOrder` field (Int, default 0) to the `List` model
- **`prisma/migrations/20260426203633_add_list_sort_order/`** - Migration to add the `sortOrder` column to the existing SQLite database

### New API Endpoint

- **`src/app/api/lists/reorder/route.ts`** - Batch PATCH endpoint that accepts `{ items: [{ id, sortOrder }] }` and updates all list sort orders in a single transaction. Returns 200 on success.

### Modified Components

- **`src/components/lists/ListSelector.tsx`** - Major update to support drag-and-drop:
  - Added `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` dependencies
  - Wrapped list sections in `<DndContext>` and `<SortableContext>` components
  - Added `SortableListRow` component that wraps each list row with `useSortable` hook
  - Added grip handle (`GripVerticalIcon`) on the left of each list row for dragging
  - Added `onReorder` prop to `ListSelectorProps`
  - Lists are reordered independently within their Shopping and Todo sections
  - Uses `arrayMove` from `@dnd-kit/sortable` for smooth reordering

- **`src/app/(app)/lists/ListsClient.tsx`** - Added `handleReorder` callback that:
  1. Updates local state optimistically using the new ordered IDs
  2. Calls the `/api/lists/reorder` endpoint to persist the new order
  3. Passes `onReorder` to `ListSelector`

- **`src/app/api/lists/route.ts`** - Lists are now fetched ordered by `sortOrder: 'asc'` instead of `createdAt: 'desc'`

- **`src/app/(app)/lists/page.tsx`** - Server-side list fetching also ordered by `sortOrder: 'asc'`

## How to Test

1. Navigate to the Lists page
2. In the sidebar, hover over any list row to see the grip handle (6 dots icon) on the left
3. Click and drag the grip handle to move the list up or down within its section
4. The list should smoothly animate to its new position
5. Release the drag to confirm the new position
6. Refresh the page - the order should be preserved
7. Verify that Shopping lists can only be reordered among other Shopping lists
8. Verify that Todo lists can only be reordered among other Todo lists
9. Verify that the default list star and delete buttons still work correctly

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `sortOrder` field to `List` model |
| `prisma/migrations/20260426203633_add_list_sort_order/migration.sql` | **New** - Migration to add sortOrder column |
| `src/app/api/lists/reorder/route.ts` | **New** - Batch reorder API endpoint |
| `src/components/lists/ListSelector.tsx` | Added drag-and-drop reordering with @dnd-kit |
| `src/app/(app)/lists/ListsClient.tsx` | Added `handleReorder` callback |
| `src/app/api/lists/route.ts` | Order lists by `sortOrder` |
| `src/app/(app)/lists/page.tsx` | Order lists by `sortOrder` |
