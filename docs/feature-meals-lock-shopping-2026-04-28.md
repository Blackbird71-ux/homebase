# Feature Summary: Meals Description, Tomorrow's Meals, List Lock, Shopping Favourite
**Date:** 2026-04-28

## What was implemented

### 1. Recipe description under Today's Meals (Home)
- The recipe's `description` field is now fetched alongside each meal plan entry.
- Each meal row on the Home dashboard shows the description in a smaller muted line directly below the recipe name, if one exists.
- **Files:** `src/app/(app)/home/page.tsx`, `src/components/dashboard/TonightsDinnerCard.tsx`, `src/types/index.ts`, `src/app/api/dashboard/route.ts`

### 2. Tomorrow's Meals on Home
- A second meals card "Tomorrow's Meals" now appears on the Home dashboard, showing the same format as Today's Meals (with description).
- The home page wrapper changed from `overflow-hidden` to `overflow-y-auto` and the grid lost its `h-full` constraint so the 5th card scrolls in naturally.
- **Files:** `src/app/(app)/home/page.tsx`, `src/components/dashboard/TonightsDinnerCard.tsx` (title prop), `src/components/dashboard/DashboardGrid.tsx`, `src/types/index.ts`, `src/app/api/dashboard/route.ts`

### 3. Lock list items
- New `isLocked Boolean @default(false)` field on `ListItem` (migration: `20260428080051_add_list_item_lock`).
- A lock/unlock button appears on hover for each list item (yellow lock icon when locked, grey open-lock when unlocked).
- Locked items: delete button is hidden, edit is disabled. Checkbox (completion) still works.
- The server blocks DELETE requests on locked items (403). `clear-completed` skips locked items.
- **Files:** `prisma/schema.prisma`, `src/lib/list-helpers.ts`, `src/app/api/lists/[id]/items/[itemId]/route.ts`, `src/app/api/lists/[id]/clear-completed/route.ts`, `src/components/lists/ListItemRow.tsx`, `src/components/lists/CategoryGroup.tsx`, `src/components/lists/DoneSection.tsx`, `src/components/lists/ShoppingList.tsx`, `src/components/lists/TodoList.tsx`, `src/app/(app)/lists/ListsClient.tsx`

### 4. Shopping favourite list per user (Home dashboard)
- The starred (default) shopping list on the Lists page now also sets `dashboardShoppingListId` in the user's `uiPreferences`, so the home dashboard shows the same list the user starred.
- This is fully per-user (stored in `User.uiPreferences`, not on the Family model).
- When a user clears the star, the home dashboard reverts to auto (most recent active list).
- **Files:** `src/app/(app)/lists/ListsClient.tsx`

## How to test
1. Go to **Home** — confirm recipe descriptions appear under each planned meal, and Tomorrow's Meals card is visible.
2. Go to **Lists** — hover a list item and click the lock icon (open padlock). Confirm the delete button disappears and the lock icon turns yellow.  Click again to unlock.
3. Star a shopping list in the Lists sidebar — go to Home and confirm that shopping list is now shown on the dashboard.
4. Log in as a different family member — confirm they see their own starred shopping list, not yours.

## NAS deployment
- Run `docker-compose down && docker-compose up -d --build` on the NAS after copying updated files.
- The migration SQL is at `prisma/migrations/20260428080051_add_list_item_lock/migration.sql` and will run automatically via `docker-entrypoint.sh` if it calls `prisma migrate deploy`.
- Verify `docker-entrypoint.sh` includes `npx prisma migrate deploy` before starting the app.

## Known limitations
- Recipe description is only shown for the primary (first) recipe when a meal has multiple recipes assigned.
- The `dashboardShoppingListId` set via AppearanceTab settings and the star in the Lists page are both stored in the same preference key — starring a shopping list in Lists will override a selection made in AppearanceTab settings, and vice versa.
