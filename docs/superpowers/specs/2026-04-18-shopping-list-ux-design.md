# Shopping List UX Improvements — Design Spec

## Goal

Four UX improvements to the shopping list: completed items collapse to the bottom, recipe-sourced items show a pill badge with the recipe name, a view toggle switches between "By Aisle" and "By Recipe" grouping, and drag handles let users reorder both category groups and items within groups.

---

## 1. Ticked Items to Bottom

**Current behaviour:** Completed items stay within their category group, sorted last within the group.

**New behaviour:** When an item is ticked, it immediately leaves its category group and joins a "Done" section pinned to the very bottom of the list. The Done section is always last — below all active categories. Items within Done are shown in their existing `sortOrder` sequence.

The Done section is always visible (not collapsible in v1). Active categories with zero remaining items disappear from view.

This applies in both "By Aisle" and "By Recipe" view modes.

---

## 2. Recipe Labels (Pill Badges)

### Data model changes

`ListItem` gains two new optional fields:

```prisma
recipeId    String?
recipeName  String?
```

`recipeId` links to the recipe for reference. `recipeName` is a denormalised snapshot of the recipe title at the time the item was added — so the label survives if the recipe is renamed or deleted. No foreign key relation is needed.

`List` gains a `categoryOrder` field to store per-list category ordering:

```prisma
categoryOrder String?  // JSON array of category strings, e.g. ["Produce","Dairy",...]
```

Default (null) means use the standard SHOPPING_CATEGORIES order.

### "Add to shopping list" on recipe detail

A new button on the recipe detail page ("Add to shopping list") opens a small dialog:
- Dropdown to pick which shopping list (active SHOPPING lists for the family)
- Checkbox list of the recipe's ingredients (all pre-checked)
- Submit adds selected ingredients as ListItems with `recipeId` and `recipeName` set, category defaulting to "Other"

### Pill badge display

In ShoppingList, active items with a `recipeName` show a small pill badge to the right of the content text: `[Recipe Name]` styled in primary-blue. The badge is non-interactive. Items without a recipeName show no badge.

---

## 3. View Mode Toggle (By Aisle / By Recipe)

A two-segment toggle sits at the top of the ShoppingList component, above the items. State is local (not persisted) and defaults to "By Aisle".

**By Aisle** (default): existing category grouping. Category headers are shown in `categoryOrder` sequence (user-defined or default). Pill badges visible. Done section at bottom.

**By Recipe**: items grouped under their recipe name as the header. Items with no recipe go in an "Other" group. Groups are ordered alphabetically by recipe name, "Other" last. No drag reordering in this view (recipe grouping is fixed). Done section at bottom.

Drag-to-reorder is only active in By Aisle mode. Switching to By Recipe hides drag handles.

---

## 4. Drag to Reorder

Library: **@dnd-kit/core** + **@dnd-kit/sortable** (to be installed).

### What can be reordered

- **Category groups** — drag a category header to reorder the aisles. The new order is saved to `List.categoryOrder`.
- **Items within a group** — drag an item within its category. The new order updates `ListItem.sortOrder` for the affected items.

Items cannot be dragged across categories (that would change their category). The Done section cannot be reordered.

### Drag handles

A grab-handle icon (`GripVerticalIcon`) appears on the left of each draggable row. On category headers: shown always. On items: shown on hover (desktop) / always shown (touch).

### Persistence

Two PATCH endpoints:

**`PATCH /api/lists/[id]/category-order`**
```json
{ "categoryOrder": ["Dairy", "Produce", "Bakery", ...] }
```
Updates `List.categoryOrder`. Returns 200 with updated list.

**`PATCH /api/lists/[id]/items/reorder`**
```json
{ "items": [{ "id": "...", "sortOrder": 0 }, ...] }
```
Bulk-updates sortOrder for the provided items (all must belong to the list). Returns 200.

Both endpoints validate family ownership.

Reorder calls are debounced 500ms and fire after the user drops.

---

## 5. Component Architecture

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `recipeId`, `recipeName`, `categoryOrder` fields; migration |
| `src/lib/list-helpers.ts` | Update `groupByCategory` to exclude completed items from groups; add `groupByRecipe`; accept `categoryOrder` param |
| `src/components/lists/ShoppingList.tsx` | Add view toggle, drag context, Done section, pass categoryOrder |
| `src/components/lists/ListItemRow.tsx` | Add recipe pill badge, drag handle |
| `src/components/lists/CategoryGroup.tsx` | New — sortable category wrapper with drag handle header |
| `src/components/lists/DoneSection.tsx` | New — bottom section for completed items |
| `src/components/lists/AddToListDialog.tsx` | New — dialog opened from recipe detail page |
| `src/app/(app)/recipes/[id]/RecipeDetail.tsx` | Add "Add to shopping list" button |
| `src/app/api/lists/[id]/items/route.ts` | POST: accept `recipeId`, `recipeName` |
| `src/app/api/lists/[id]/category-order/route.ts` | New — PATCH endpoint |
| `src/app/api/lists/[id]/items/reorder/route.ts` | New — PATCH bulk reorder endpoint |

---

## 6. Out of Scope

- Drag items across categories (changing their category)
- Persisting the By Aisle / By Recipe view preference
- Collapsing the Done section
- Editing or removing the recipe link from an item after it's added
