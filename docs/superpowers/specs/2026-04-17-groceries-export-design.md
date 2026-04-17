# Groceries Export Design

## Overview

Add an "Export to Groceries" button to the Meal Plan page. It opens a modal showing all ingredients from the current week's recipes, each pre-categorised (Produce, Dairy, Meat, Bakery, Frozen, Household, Other). The user can fix any category before saving. Every correction is remembered in a per-family lookup table so the app gets smarter over time.

---

## Goals

- Let the user turn a week of meal planning into a categorised shopping list in one click
- Auto-categorise ingredients from a built-in keyword dictionary on first use
- Learn from user corrections — a fix made once applies everywhere, forever
- Append to or replace an existing Groceries list (user chooses each time)

## Out of scope

- Recipe editor UI changes (categories are managed through the export modal only)
- Multi-week export (current week only)
- Duplicate detection / quantity merging across recipes

---

## Data Model

### New model: `IngredientCategory`

```prisma
model IngredientCategory {
  id        String   @id @default(cuid())
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id])
  key       String   // normalised ingredient text (quantity stripped, lowercased)
  category  String   // one of the SHOPPING_CATEGORIES values
  updatedAt DateTime @updatedAt

  @@unique([familyId, key])
}
```

Add `ingredientCategories IngredientCategory[]` to the `Family` model.

### Normalisation (`normalizeIngredient`)

Strip leading quantity patterns and common units, then lowercase and trim:

- Input: `"500g beef mince"` → key: `"beef mince"`
- Input: `"2 cloves garlic"` → key: `"garlic"`
- Input: `"1 cos lettuce"` → key: `"cos lettuce"`

Regex: strip `^\d+[\d./]*\s*(g|kg|ml|l|oz|lb|cup|cups|tbsp|tsp|teaspoon|tablespoon|bunch|cloves?|heads?|cans?|tins?|large|small|medium|x)?\s*` then lowercase + trim.

### Auto-guess keyword dictionary (`autoGuessCategory`)

Keyword matching against the normalised key. First match wins. Falls back to `"Other"`.

| Category   | Keywords (partial list)                                                          |
|------------|----------------------------------------------------------------------------------|
| Meat       | chicken, beef, pork, lamb, fish, salmon, tuna, prawn, shrimp, mince, bacon, turkey, duck, steak, sausage, ham, chorizo |
| Dairy      | milk, cheese, cream, butter, yogurt, yoghurt, parmesan, mozzarella, cheddar, egg, eggs, ricotta, brie, feta |
| Produce    | onion, garlic, tomato, lettuce, carrot, celery, lemon, lime, herb, rosemary, basil, thyme, parsley, spinach, capsicum, mushroom, potato, zucchini, broccoli, cucumber, avocado, ginger, apple, banana |
| Bakery     | bread, flour, pasta, spaghetti, crouton, noodle, rice, couscous, pita, tortilla, bun, roll, pastry |
| Frozen     | frozen                                                                           |
| Household  | oil, vinegar, sauce, stock, dressing, salt, pepper, sugar, honey, soy, mustard, ketchup, mayo |

---

## API

### `GET /api/meal-plan/export-preview`

Query params: `from` (ISO date), `to` (ISO date) — the current week's date range.

Auth: `requireSession()` — any family member.

**Logic:**
1. Fetch all `MealPlan` entries in range that have a `recipeId`, with the full recipe (including `ingredients` JSON)
2. Parse ingredients, normalize each, look up in `IngredientCategory` for the family
3. Auto-guess anything not found in the lookup
4. Check whether a "Groceries" Shopping list exists for the family and how many uncompleted items it has

**Response:**
```json
{
  "recipes": [
    {
      "date": "2026-04-14",
      "title": "Spaghetti Bolognese",
      "ingredients": [
        { "text": "500g beef mince", "key": "beef mince", "category": "Meat", "source": "learned" },
        { "text": "1 onion", "key": "onion", "category": "Produce", "source": "guessed" }
      ]
    }
  ],
  "groceriesList": { "id": "clxxx", "itemCount": 5 } | null
}
```

`source` is `"learned"` (from DB) or `"guessed"` (keyword match / fallback).

---

### `POST /api/meal-plan/export-groceries`

Auth: `requireSession()` — any family member.

**Body:**
```json
{
  "items": [
    { "text": "500g beef mince", "key": "beef mince", "category": "Meat" }
  ],
  "mode": "replace" | "append"
}
```

**Logic:**
1. Upsert one `IngredientCategory` row per item (`familyId + key` as unique key) — this is how learning is persisted
2. Find or create a Shopping list named `"Groceries"` for the family
3. If `mode === "replace"`: delete all existing items from the list
4. Create one `ListItem` per ingredient: `content = item.text`, `category = item.category`, `createdBy = user.id`
5. Return `{ listId, itemCount }`

**Response:** `{ "listId": "clxxx", "itemCount": 17 }`

---

## Components

### `ExportGroceriesModal`

`src/components/meal-plan/ExportGroceriesModal.tsx` — client component.

**Props:**
```ts
interface ExportGroceriesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekFrom: string  // YYYY-MM-DD
  weekTo: string    // YYYY-MM-DD
}
```

**Internal state:**
- `status: 'idle' | 'loading' | 'ready' | 'confirming' | 'saving' | 'done'`
- `recipes`: array from preview response
- `groceriesList`: existing list info or null
- Local edits to ingredient categories (user overrides stored in a `Map<key, category>`)

**Behaviour:**
- On `open=true`: fetch `/api/meal-plan/export-preview`, set status `loading` → `ready`. If preview returns zero recipes, close the modal and show a toast: "No recipes on this week's meal plan."
- Render ingredients grouped by recipe. Each ingredient shows:
  - The ingredient text
  - A `<select>` dropdown pre-set to the current category, styled as a pill
  - A subtle indicator: green border = learned, amber border = guessed
- "Add to Groceries" button: if `groceriesList` exists and `itemCount > 0`, set status `confirming` (show inline Replace / Add to existing buttons). Otherwise go straight to saving.
- On confirm: POST to `/api/meal-plan/export-groceries`, show toast on success with link to `/lists`

### `MealPlanGrid` changes

Add "Export to Groceries" button alongside the Today / prev / next controls in the header. Button opens `ExportGroceriesModal`, passing the current `weekFrom`/`weekTo` dates.

---

## New file: `src/lib/ingredient-helpers.ts`

Exports:
- `normalizeIngredient(text: string): string`
- `autoGuessCategory(key: string): ShoppingCategory`
- `KEYWORD_MAP: Record<ShoppingCategory, string[]>`

---

## User-visible behaviour summary

1. User is on the Meal Plan page, looking at a week with 3 recipes assigned
2. Clicks **Export to Groceries** — modal opens showing all ingredients grouped by recipe
3. Green pills = app already knows the category; amber pills = auto-guessed
4. User fixes "olive oil" from Other → Household (one click on the dropdown)
5. Clicks **Add to Groceries**
6. Because Groceries already has 5 items from last week: modal asks **Replace** or **Add to existing**
7. User picks Replace → 17 items written to Groceries list, "olive oil" → Household saved to IngredientCategory
8. Toast: "17 items added to Groceries" → user navigates to Lists → sees items grouped by category, ready to tick off at the shops
9. Next week: "olive oil" shows up green — no correction needed

---

## Testing

- `ingredient-helpers.test.ts`: normalizeIngredient strips quantities correctly; autoGuessCategory returns expected categories for known and unknown inputs
- `export-preview route`: returns correct ingredients for a week with recipes; marks learned vs guessed correctly; handles week with no recipes (empty array)
- `export-groceries route`: upserts IngredientCategory; creates Groceries list if missing; replace mode clears old items; append mode keeps them; returns correct itemCount
