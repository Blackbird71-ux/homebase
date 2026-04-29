# Feature Summary: Per-Meal Grocery Export & Recipe Thumbnails in Meal Planner
**Date:** 2026-04-29

## What was implemented

### 1. Per-meal "Add to Groceries" cart icon

- Each filled meal slot in the Meal Planner now shows a small shopping-cart icon.
- On mobile (compact/natural-height layout) the icon is always visible. On desktop it appears on hover alongside the existing clear (×) button.
- Tapping the cart icon opens the grocery export modal scoped to just that single meal plan entry — no need to export the whole week.
- The full-week "Groceries" button in the header continues to work as before.
- **Files:** `src/components/meal-plan/MealSlotCell.tsx`, `src/components/meal-plan/DailyMealColumn.tsx`, `src/components/meal-plan/MealPlanGrid.tsx`

### 2. Per-recipe checkboxes in the grocery export modal

- The Export Groceries modal now shows a checkbox next to each recipe title.
- All recipes are selected by default; tapping a recipe header toggles it off/on.
- When a recipe is deselected its ingredient list collapses and its items are excluded from the export.
- The subtitle dynamically reflects the current selection: "X ingredients from Y of Z recipes".
- The "Add to Groceries" button is disabled when nothing is selected.
- Works for both single-meal and full-week export flows.
- **Files:** `src/components/meal-plan/ExportGroceriesModal.tsx`

### 3. Specific-meal filtering in the export-preview API

- The `/api/meal-plan/export-preview` endpoint now accepts an optional `mealPlanIds` query param (comma-separated IDs).
- When provided, only those meal plan entries are fetched, bypassing the date-range recipe filter.
- The date-range params (`from`/`to`) remain required for backward compatibility.
- **Files:** `src/app/api/meal-plan/export-preview/route.ts`

### 4. Recipe thumbnails on meal plan slots

- Recipe images are now fetched alongside meal plan data and resolved through the local image cache/proxy (`getLocalImageUrl`).
- A 28 × 28 px rounded thumbnail appears to the left of the recipe name in each meal slot when the recipe has an image.
- Only the first recipe's image is shown when multiple recipes share a slot.
- Image resolution happens server-side in both the initial page load (`page.tsx`) and the week-navigation API route, so the client only ever receives ready-to-use URLs.
- **Files:** `src/app/(app)/meal-plan/page.tsx`, `src/app/api/meal-plan/route.ts`, `src/components/meal-plan/MealSlotCell.tsx`, `src/components/meal-plan/DailyMealColumn.tsx`, `src/components/meal-plan/MealPlanGrid.tsx`

## How to test

1. Go to **Meal Plan** — any recipe that has an image should show a small thumbnail on its meal slot card.
2. Hover (desktop) or look at (mobile) a meal slot with a recipe — confirm the cart icon is visible.
3. Tap the cart icon on a single slot — confirm the modal opens showing only that meal's recipe(s).
4. In the modal, deselect a recipe by tapping its header — confirm the ingredients collapse and the counter updates.
5. Re-open the modal via the header "Groceries" button — confirm all meals for the week are shown and all are selected by default.
6. Navigate to the next week and back — confirm images still appear on meal slots.

## NAS deployment

- No database migrations required.
- Run `docker-compose down && docker-compose up -d --build` on the NAS after copying updated files.
