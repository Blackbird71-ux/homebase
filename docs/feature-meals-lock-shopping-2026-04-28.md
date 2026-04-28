# Feature Summary: Meals Description, Tomorrow's Meals, List Lock, Shopping Favourite, Recipe Notes
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

### 5. Recipe notes
- New `notes String?` field on `Recipe` (migration: `20260428081221_add_recipe_notes`).
- A "Notes" textarea appears in the recipe form (below Description), with placeholder text for substitutions, tips, and variations.
- Notes are displayed on the recipe detail page in a shaded block between the Instructions section and the source link.
- Notes are preserved when duplicating a recipe (the duplicate API copies all fields).
- **Files:** `prisma/schema.prisma`, `src/components/recipes/RecipeForm.tsx`, `src/app/(app)/recipes/[id]/RecipeDetail.tsx`, `src/app/(app)/recipes/[id]/page.tsx`, `src/app/api/recipes/[id]/route.ts`, `src/app/api/recipes/route.ts`

## How to test
1. Go to **Home** — confirm recipe descriptions appear under each planned meal, and Tomorrow's Meals card is visible.
2. Go to **Lists** — hover a list item and click the lock icon (open padlock). Confirm the delete button disappears and the lock icon turns yellow. Click again to unlock.
3. Star a shopping list in the Lists sidebar — go to Home and confirm that shopping list is now shown on the dashboard.
4. Log in as a different family member — confirm they see their own starred shopping list, not yours.
5. Edit any recipe — confirm the Notes textarea appears below Description. Save, then view the recipe to see the Notes section.

## NAS deployment
- Run `docker-compose down && docker-compose up -d --build` on the NAS after copying updated files.
- Both migrations will run automatically on container start via `prisma migrate deploy` in `docker/entrypoint.sh`:
  - `20260428080051_add_list_item_lock` — adds `isLocked` to `ListItem`
  - `20260428081221_add_recipe_notes` — adds `notes` to `Recipe`
- No manual SQL or schema changes needed on the NAS.

## Known limitations
- Recipe description on the Home dashboard is only shown for the primary (first) recipe when a meal has multiple recipes assigned.
- The `dashboardShoppingListId` set via Appearance settings and the star button in the Lists page share the same preference key — starring a list in the Lists page will override any prior selection made in Appearance settings, and vice versa.
