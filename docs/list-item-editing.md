# List Item Editing

## Overview

Added the ability to edit list item names and categories for both Shopping Groceries and ToDo lists. Users can click on an item's name to open a modal dialog where they can edit the name and category.

Categories can also be created inline — directly from the add-item form or the edit dialog — without having to navigate to Settings.

## Implementation

### New Component

- **`src/components/lists/EditItemDialog.tsx`** - A modal dialog component that allows editing an item's name and category. Uses the existing shadcn/ui Dialog, Input, Select, Label, and Button components. Sends a PATCH request to the API to save changes.

### Modified Components

- **`src/components/lists/ListItemRow.tsx`** - Added `onEdit` prop. The item content text is now a clickable button that triggers the edit dialog (only for non-completed items). Completed items remain non-editable.

- **`src/components/lists/CategoryGroup.tsx`** - Added `onEdit` prop to both `SortableItemProps` and `CategoryGroupProps` interfaces, passing it through to `ListItemRow`.

- **`src/components/lists/DoneSection.tsx`** - Added `onEdit` prop to `DoneSectionProps`, passing it through to `ListItemRow`.

- **`src/components/lists/ShoppingList.tsx`** - Added edit state management (`editItemId`, `editItemContent`, `editItemCategory`), `handleEditItem` and `handleItemSaved` callbacks, and the `EditItemDialog` component. Passes `onEdit` to all `CategoryGroup`, `DoneSection`, and `ListItemRow` instances. Includes inline category creation in the add-item form.

- **`src/components/lists/TodoList.tsx`** - Same edit state management and callbacks as ShoppingList. Passes `onEdit` to `ListItemRow` instances and renders `EditItemDialog`. Wires up inline category creation from the edit dialog.

### API

The existing PATCH endpoint at `/api/lists/[id]/items/[itemId]` already supported `content` and `category` fields, so no API changes were needed.

New ingredient categories created inline use the existing `POST /api/ingredient-categories` endpoint.

## Inline Category Creation

Users can create new categories without leaving the list:

**Shopping list add-item form** — the category dropdown includes a "＋ New category..." option at the bottom. Selecting it reveals an inline input row; typing a name and pressing Add (or Enter) creates the category via the API, adds it to the dropdown, and selects it for the item being created.

**Edit Item dialog** — when `onCategoryAdded` is provided by the parent, a "＋ New category..." entry appears at the bottom of the category Select. Clicking it reveals an inline input inside the dialog. After adding, the new category is immediately selected and the item can be saved.

- Shopping list parents pass `handleAddShoppingCategory` (creates via `POST /api/ingredient-categories`)
- Todo list parents pass `handleEditDialogCategoryAdded` (adds to the list's local `categoryOrder` state)

## How to Test

1. Navigate to a Shopping Groceries list
2. Click on any non-completed item's name text
3. The Edit Item dialog should open with the current name and category pre-filled
4. Edit the name and/or category, then click Save
5. The item should update in-place with the new values
6. In the add-item form, open the category dropdown and choose "＋ New category..." — type a name and confirm; the new category should appear in the dropdown and be selected
7. In the Edit Item dialog, choose "＋ New category..." from the Category select — type a name and confirm; the dialog should select the new category
8. Repeat for a ToDo list (edit dialog category creation adds to the list's category tags)
9. Verify that completed items cannot be edited (clicking does nothing)
10. Verify that pressing Enter in the name/category input fields triggers the expected action
11. Verify that the dialog can be closed via the X button or Cancel/Close button

## Files Changed

| File | Change |
|------|--------|
| `src/components/lists/EditItemDialog.tsx` | Added `onCategoryAdded` prop, local category state, and inline "New category" input |
| `src/components/lists/ListItemRow.tsx` | Added `onEdit` prop, made content clickable |
| `src/components/lists/CategoryGroup.tsx` | Added `onEdit` prop passthrough |
| `src/components/lists/DoneSection.tsx` | Added `onEdit` prop passthrough |
| `src/components/lists/ShoppingList.tsx` | Added edit state, handlers, dialog, and inline category creation in form |
| `src/components/lists/TodoList.tsx` | Added edit state, handlers, dialog, and `onCategoryAdded` wiring |
