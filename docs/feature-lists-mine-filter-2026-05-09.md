# Feature: Mine/Family Filter for Lists and Todos

Added the ability to filter lists and todo items by "Mine" (created by the current user) or "Family" (all items). Lists default to "Mine" view.

## Files Changed

### 1. `prisma/schema.prisma`
- Added `createdBy String @default("")` field to the `List` model to track which user created each list

### 2. `prisma/migrations/20260509200000_add_list_createdby/`
- New migration to add the `createdBy` column to the `List` table

### 3. `src/app/api/lists/route.ts`
- **GET** — Added support for `?filter=mine` query parameter; when present, filters lists to only those where `createdBy` matches the current user
- **POST** — Now sets `createdBy` to the current user's ID by default; accepts optional `createdBy` field to create lists on behalf of another family member

### 4. `src/app/api/lists/[id]/route.ts`
- **PATCH** — Accepts optional `createdBy` field to change list ownership; validates the target user is in the same family

### 5. `src/lib/list-helpers.ts`
- Extended `TodoFilter` type to include `'mine'` as a filter option
- Updated `filterTodoItems()` to accept an optional `currentUserId` parameter; when filter is `'mine'`, only returns items where `createdBy` matches the current user

### 6. `src/components/lists/TodoList.tsx`
- Default filter changed from `'all'` to `'mine'`
- Added filter toggle buttons ("All" / "Mine") in the todo header
- When filter is "Mine", only items created by the current user are shown
- The incomplete items count badge reflects the active filter
- Passes `currentUserId` and `members` to the filter function

### 7. `src/app/(app)/lists/ListsClient.tsx`
- Added `SerializedList.createdBy` to the interface
- Added Mine/Family filter toggle:
  - **Desktop sidebar**: Toggle buttons at the top of the list panel
  - **Mobile**: Toggle buttons above the horizontal chip bar
- Default filter is `'mine'`
- Refetches lists from the API when filter changes (with `?filter=mine` param)
- Client-side fallback filtering for instant UX: lists without a `createdBy` or lists where `createdBy === currentUserId` are shown in "Mine" view
- Passes `members` and `currentUserId` to `NewListDialog`

### 8. `src/components/lists/NewListDialog.tsx`
- Added optional `members` and `currentUserId` props
- Added Owner `<select>` dropdown (shown when there are multiple family members)
- User can choose who the list belongs to when creating, defaulting to themselves
- Sends `createdBy` in the POST body when ownership differs from the current user

### 9. `src/app/(app)/lists/page.tsx`
- No changes needed — the `createdBy` field is already passed through via the spread operator (`...l`)