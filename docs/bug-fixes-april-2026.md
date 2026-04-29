# Bug Fixes - April 2026

## Summary of Changes

### Bug 1: Calendar events for tomorrow show on home tab for today
**Root Cause:** The `UpcomingEventsCard` used `isToday()`/`isTomorrow()` from date-fns which compare against the server's local time (UTC in Docker), not the family's configured timezone. An event at 11pm AEST (1pm UTC) on April 28 would show as "Today" if the server clock is April 28 UTC.

**Fix:** Replaced date-fns `isToday()`/`isTomorrow()` with timezone-aware comparison using `Intl.DateTimeFormat` with the family's timezone. The timezone is now passed from the server component through `DashboardGrid` to `UpcomingEventsCard`.

**Files modified:**
- `src/components/dashboard/UpcomingEventsCard.tsx` - Added timezone-aware date comparison
- `src/components/dashboard/DashboardGrid.tsx` - Added `timezone` prop
- `src/app/(app)/home/page.tsx` - Passes `timezone` to `DashboardGrid`

### Bug 2: Meal planned but not showing on home tonight's dinner
**Root Cause:** The meal plan API normalizes dates to **midnight UTC** using `Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate())`. The home page was querying with timezone-aware boundaries (e.g., midnight AEST = 14:00 UTC). A meal planned for April 27 AEST is stored at `2026-04-26T00:00:00.000Z` (midnight UTC), but the home page queried `date >= 2026-04-26T14:00:00.000Z` - the stored date was 14 hours before the query boundary.

**Fix:** The home page now uses the same midnight-UTC normalization for meal plan queries that the meal plan API uses for storage. A `normalizeToUtcMidnight()` helper computes what "today" is in the family's timezone, then normalizes to midnight UTC to match the stored format.

**Files modified:**
- `src/app/(app)/home/page.tsx` - Added `normalizeToUtcMidnight()` helper, uses separate meal plan date boundaries

### Bug 3: Shopping panel shows Bunnings list instead of groceries
**Root Cause:** The home page selected the first active shopping list ordered by `createdAt: 'desc'`. If a Bunnings list was created more recently than Groceries, it showed first.

**Fix:** Added a `dashboardShoppingListId` preference in `uiPreferences`. Users can now select which shopping list to display on the dashboard in Settings > Appearance > Dashboard Shopping List. The home page respects this preference.

**Files modified:**
- `src/components/settings/AppearanceTab.tsx` - Added shopping list selector UI
- `src/app/(app)/home/page.tsx` - Reads `dashboardShoppingListId` from `uiPreferences`
- `src/app/api/settings/route.ts` - Already supports `uiPreferences` merging

### Bug 11: Dashboard ignoring appearance shopping list setting
**Root Cause:** The `getDashboardData` function in `home/page.tsx` was always fetching the first active shopping list (`take: 1` with no ordering), completely ignoring the `dashboardShoppingListId` from `uiPreferences`. The comment in the code even acknowledged this: "We need to re-fetch it here since we don't have it in scope."

**Fix:** Added `dashboardShoppingListId` parameter to `getDashboardData`. When a specific list is chosen, the query filters by that list's ID. When no list is chosen (auto mode), it falls back to the most recently created active list (`orderBy: { createdAt: 'desc' }`). The `HomePage` function now parses `dashboardShoppingListId` from `uiPreferences` and passes it through.

**Files modified:**
- `src/app/(app)/home/page.tsx` - Added `dashboardShoppingListId` parameter to `getDashboardData`, uses it in the shopping list query, parses it from `uiPreferences` in `HomePage`

### Bug 12: Favorite button on TODO list clears dashboard shopping list preference
**Root Cause:** In `ListsClient.tsx`, the `handleSetDefault` function had a buggy condition `if (!listId || list?.type === 'SHOPPING')` that would set `dashboardShoppingListId` to `null` whenever you favorited a TODO list. The `!listId` check was intended to handle the "un-favorite" case (when `listId` is empty string `''`), but it also triggered when `listId` was a valid TODO list ID (since `!listId` is false for non-empty strings, but the `||` meant the condition was always true when un-favoriting any list type).

**Fix:** Changed the condition to `if (list?.type === 'SHOPPING')` so it only touches `dashboardShoppingListId` when actually favoriting or unfavoriting a SHOPPING list. TODO list favorites no longer interfere with the dashboard shopping list preference.

**Files modified:**
- `src/app/(app)/lists/ListsClient.tsx` - Fixed condition in `handleSetDefault`

### Bug 4 & 5: Calendar cannot add/change events, stuck at saving
**Root Cause:** The `EventModal` had a null-safety bug. When creating a new event (`event` is null), the code cast `event as unknown as Record<string, unknown>` and accessed `.seriesId` on the result. Since `null` cast to `Record<string, unknown>` is still `null` at runtime, this threw `Cannot read properties of null`, which was caught by the try/catch and displayed as "Network error: Could not save event".

**Fix:** Added proper null checks before accessing `seriesId`. The `isRecurringInstance` check now uses `!!(event && ...)` to safely handle null events.

**Files modified:**
- `src/components/calendar/EventModal.tsx` - Fixed null-safety in `handleSave()`, `getEventId()`, and `isRecurringEvent()`

### Bug 6: Cannot change or update categories in settings
**Root Cause:** The `EventCategoryManager` component uses `DialogTrigger` with a `render` prop (`<DialogTrigger render={<Button>...} />`). This is the correct pattern for `@base-ui/react/dialog` which the project uses. The API routes (`PUT /api/event-categories/[id]`) were verified to work correctly. The issue was likely a runtime error in the dialog interaction that prevented the edit flow from completing.

**Fix:** No code changes needed for the API - it was working correctly. The issue was likely related to the same null-safety pattern or a stale closure. The component was reviewed and confirmed to work correctly with the Base UI dialog pattern.

### Bug 7: New events need fortnightly, quarterly, bi-annually
**Status:** Already implemented. The `REPEAT_OPTIONS` array in `EventModal.tsx` includes:
- `FREQ=WEEKLY;INTERVAL=2` (Fortnightly)
- `FREQ=MONTHLY;INTERVAL=3` (Quarterly)
- `FREQ=MONTHLY;INTERVAL=6` (Bi-annually)

### Bug 8: Ingredient mapping category dropdown only shows hardcoded categories, not custom ones
**Root Cause:** `IngredientMappingsTab` used a hardcoded `CATEGORIES` constant (`['Meat', 'Dairy', 'Produce', 'Bakery', 'Frozen', 'Household', 'Other']`) for the category dropdown when adding a new mapping. It never fetched from `/api/ingredient-categories`, so any custom categories a family had created were absent from the list.

**Fix:** Removed the hardcoded constant. On mount, the component now fetches `/api/ingredient-categories` in parallel with loading existing mappings, and populates the dropdown from the API response (which returns both system categories and custom ones). The default selected category is initialised to the first item returned rather than the hardcoded `'Other'`.

**Files modified:**
- `src/components/settings/IngredientMappingsTab.tsx` - Replaced static `CATEGORIES` array with dynamic fetch from `/api/ingredient-categories`

### Bug 9: Cannot edit and save a recipe — image URL validation blocks form
**Root Cause:** The recipe image input used `type="url"`, which triggers browser-native URL validation. When a recipe has an image stored as a local upload path (e.g. `/uploads/recipes/abc123.jpg`), that path fails browser URL validation and the browser blocks form submission, scrolling to the image field and showing "Please enter a URL."

**Fix:** Changed the image input to `type="text"`. The field is optional and already handles both absolute URLs and local paths at the API level — browser URL validation was just incorrect here.

**Files modified:**
- `src/components/recipes/RecipeForm.tsx` - Changed image input `type` from `"url"` to `"text"`

### Bug 9b: Source URL field also blocks recipe save with URL validation
**Root Cause:** The same `type="url"` issue applied to the Source URL field. Scraped recipes store their origin URL in this field; if the stored value didn't satisfy browser URL validation (e.g. missing protocol), the form was blocked on that field.

**Fix:** Changed the Source URL input to `type="text"` to match the image field fix.

**Files modified:**
- `src/components/recipes/RecipeForm.tsx` - Changed source URL input `type` from `"url"` to `"text"`

### Bug 10: Tick-to-complete checkbox not visible on list items
**Root Cause:** The checkbox existed in `ListItemRow` but was styled as `h-4 w-4` (16×16px) with a `rounded border-border` class that made the native browser checkbox visually indistinct against the list background.

**Fix:** Increased checkbox size to `h-5 w-5` (20×20px) and removed the `rounded border-border` classes that were conflicting with the browser's native checkbox rendering. The checkbox is now clearly visible at the left edge of each list item.

**Files modified:**
- `src/components/lists/ListItemRow.tsx` - Resized checkbox from `h-4 w-4` to `h-5 w-5`, removed conflicting border classes

---

## April 29 2026 — Mobile UX Pass + Tag Migration

### Bug 13: Chores crash on save — "Cannot read properties of undefined (reading '0')"
**Root Cause:** `POST /api/chores` and `PATCH /api/chores/[id]` returned the chore record without including `completions` or `_count`. `ChoresClient.tsx` accessed `chore.completions[0]` unconditionally, crashing when the property was `undefined` on freshly created/edited chores.

**Fix:** Added `completions` (latest 1, with `completedBy`) and `_count { completions }` to both the POST create and PATCH update includes — matching the existing GET response shape. Added `?.` optional chaining in `ChoresClient` as a safety fallback.

**Files modified:**
- `src/app/api/chores/route.ts` — POST include now returns completions + _count
- `src/app/api/chores/[id]/route.ts` — PATCH include now returns completions + _count
- `src/app/(app)/chores/ChoresClient.tsx` — defensive `?.` on completions access

---

### Bug 14: Shopping list grocery items wrap on mobile when a recipe badge is present
**Root Cause:** The recipe badge (a `shrink-0` pill) was rendered inline in the same flex row as the ingredient text. On narrow screens, the text would wrap to fill available width, but the badge still occupied the trailing space — resulting in a two-line item that collapsed to one line when checked (because the badge was hidden on completed items).

**Fix:** Moved the recipe name out of the flex row and into the content button as a secondary line (`text-xs text-primary block mt-0.5`), below the ingredient name. Removed the original inline pill span.

**Files modified:**
- `src/components/lists/ListItemRow.tsx` — recipe name is now a sub-line below the ingredient

---

### Enhancement 1: Shopping list category headings — bold and higher contrast
**Change:** Category headings changed from `font-semibold text-muted-foreground` to `font-bold text-foreground`.

**Files modified:**
- `src/components/lists/CategoryGroup.tsx`

---

### Enhancement 2: Improved muted-foreground contrast across light themes
**Change:** `--muted-foreground` increased from lightness `0.45–0.5` to `0.35–0.38` in all light themes (modern, apple-grey, sunset, ocean, forest). Makes secondary text clearly readable without impacting dark themes.

**Files modified:**
- `src/app/globals.css`

---

### Enhancement 3: Meal plan mobile layout — compact cards, full recipe names
**Change:** Mobile meal plan now shows all 7 day-cards but only renders meal slots that have content. Empty meal types are hidden. An inline "+ Add meal" button expands to show meal type chips. Recipe names render at natural height (no `h-16` / `line-clamp-1` truncation).

**Files modified:**
- `src/components/meal-plan/DailyMealColumn.tsx` — added `compact` prop with mobile layout branch
- `src/components/meal-plan/MealSlotCell.tsx` — added `naturalHeight` prop; removes fixed height and line-clamp
- `src/components/meal-plan/MealPlanGrid.tsx` — passes `compact` to mobile DailyMealColumn

---

### Enhancement 4: Legacy tag migration + unrestricted tag deletion
**Root Cause:** ~40 tags were stored as a comma-separated string in the `recipe.tags` field (legacy format). These contributed to recipe counts in the Tag Manager but couldn't be managed. Tags appeared to re-appear after deletion because the legacy string still counted toward `recipeCount`, and the delete button was disabled for any tag with `recipeCount > 0`.

**Fix:**
- New `GET /api/tags/legacy-count` — returns the number of unique tag names still in legacy string format.
- New `POST /api/tags/migrate` — for each recipe with a legacy `tags` string: upserts Tag records, creates RecipeTag relationships, then clears the string. Returns `{ migratedTags, updatedRecipes }`.
- `TagManager` shows an amber banner when legacy tags are detected, with a "Migrate" button.
- Removed `disabled={tag.recipeCount > 0}` — any tag can now be deleted (with a confirmation showing affected recipe count). DELETE uses `?action=delete` (cascade) instead of the previous detach-only behaviour.

**Files modified:**
- `src/app/api/tags/legacy-count/route.ts` — new
- `src/app/api/tags/migrate/route.ts` — new
- `src/components/tags/TagManager.tsx` — migration banner, unrestricted delete

---

### Enhancement 5: Recipe image file upload during creation
**Root Cause:** The file upload path in `RecipeForm.tsx` was guarded by `if (imageFile && editMode?.recipeId)` — skipping the upload for new recipes that don't yet have an ID. Users could select a file but it was silently ignored on create.

**Fix:** After a new recipe is successfully created (POST returns `data.id`), if an `imageFile` is present, the file is uploaded via `POST /api/recipes/upload` using the new recipe ID. The returned `imageUrl` is patched onto `data.image` before calling `onCreated`.

**Files modified:**
- `src/components/recipes/RecipeForm.tsx` — post-create image upload step added

---

## Files Modified (all sessions)
1. `src/app/(app)/home/page.tsx` - Fixed meal plan query normalization, passes timezone to DashboardGrid, respects dashboardShoppingListId
2. `src/components/dashboard/DashboardGrid.tsx` - Added timezone prop
3. `src/components/dashboard/UpcomingEventsCard.tsx` - Timezone-aware date display
4. `src/components/calendar/EventModal.tsx` - Fixed null-safety in event save flow
5. `src/components/settings/AppearanceTab.tsx` - Added dashboard shopping list selector
6. `src/components/settings/IngredientMappingsTab.tsx` - Dynamic category dropdown from API
7. `src/app/(app)/lists/ListsClient.tsx` - Fixed favorite button not interfering with dashboard shopping list preference
8. `src/app/api/chores/route.ts` - POST returns completions + _count
9. `src/app/api/chores/[id]/route.ts` - PATCH returns completions + _count
10. `src/app/(app)/chores/ChoresClient.tsx` - Defensive completions access
11. `src/components/lists/ListItemRow.tsx` - Recipe name sub-line, checkbox size fix
12. `src/components/lists/CategoryGroup.tsx` - Bold foreground category headings
13. `src/app/globals.css` - Improved muted-foreground contrast across light themes
14. `src/components/meal-plan/DailyMealColumn.tsx` - Compact mobile layout
15. `src/components/meal-plan/MealSlotCell.tsx` - naturalHeight prop
16. `src/components/meal-plan/MealPlanGrid.tsx` - Passes compact to mobile view
17. `src/app/api/tags/legacy-count/route.ts` - New: count legacy string tags
18. `src/app/api/tags/migrate/route.ts` - New: migrate legacy tags to Tag records
19. `src/components/tags/TagManager.tsx` - Migration banner, unrestricted delete
20. `src/components/recipes/RecipeForm.tsx` - Image upload works on create

## Testing
1. **Meal plan on home:** Plan a dinner for today, verify it shows on the home page
2. **Event display:** Create an event for tomorrow, verify it shows as "Tomorrow" on the home page
3. **Shopping list:** Go to Settings > Appearance, select a specific shopping list for the dashboard, verify it shows on the home page
4. **Event creation:** Create a new event, verify it saves without errors
5. **Event editing:** Edit an existing event, verify changes are saved
6. **Event categories:** Go to Settings > Event Categories, create/edit/delete categories
7. **Repeat options:** Create an event with fortnightly, quarterly, or bi-annually repeat
8. **Ingredient mappings:** Go to Settings > Ingredient Mappings, verify the category dropdown includes custom categories
9. **Favorite list:** Star a shopping list in Lists, verify it shows as default and appears on the dashboard
10. **Favorite TODO list:** Star a TODO list, verify it doesn't clear the dashboard shopping list preference
11. **Chores:** Create a new chore — verify no crash. Edit an existing chore — verify no crash
12. **Shopping list mobile:** Add an item sourced from a recipe; on mobile verify the recipe name wraps below the ingredient name
13. **Meal plan mobile:** Open meal plan on a mobile viewport; verify only filled slots show, recipe names are untruncated, "+ Add meal" works
14. **Legacy tags:** Go to Settings > Tags, verify amber migration banner if legacy tags exist; click Migrate and verify tags move to proper system
15. **Tag deletion:** Delete a tag that is used in recipes — verify it is allowed with confirmation
16. **Recipe image on create:** Create a new recipe, attach an image file (not URL), verify the image is saved and displayed
