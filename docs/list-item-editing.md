# List Item Editing

## Overview

Added the ability to edit list item names and categories for both Shopping Groceries and ToDo lists. Users can click on an item's name to open a modal dialog where they can edit the name and category.

## Implementation

### New Component

- **`src/components/lists/EditItemDialog.tsx`** - A modal dialog component that allows editing an item's name and category. Uses the existing shadcn/ui Dialog, Input, Select, Label, and Button components. Sends a PATCH request to the API to save changes.

### Modified Components

- **`src/components/lists/ListItemRow.tsx`** - Added `onEdit` prop. The item content text is now a clickable button that triggers the edit dialog (only for non-completed items). Completed items remain non-editable.

- **`src/components/lists/CategoryGroup.tsx`** - Added `onEdit` prop to both `SortableItemProps` and `CategoryGroupProps` interfaces, passing it through to `ListItemRow`.

- **`src/components/lists/DoneSection.tsx`** - Added `onEdit` prop to `DoneSectionProps`, passing it through to `ListItemRow`.

- **`src/components/lists/ShoppingList.tsx`** - Added edit state management (`editItemId`, `editItemContent`, `editItemCategory`), `handleEditItem` and `handleItemSaved` callbacks, and the `EditItemDialog` component. Passes `onEdit` to all `CategoryGroup`, `DoneSection`, and `ListItemRow` instances.

- **`src/components/lists/TodoList.tsx`** - Same edit state management and callbacks as ShoppingList. Passes `onEdit` to `ListItemRow` instances and renders `EditItemDialog`.

### API

The existing PATCH endpoint at `/api/lists/[id]/items/[itemId]` already supported `content` and `category` fields, so no API changes were needed.

## How to Test

1. Navigate to a Shopping Groceries list
2. Click on any non-completed item's name text
3. The Edit Item dialog should open with the current name and category pre-filled
4. Edit the name and/or category, then click Save
5. The item should update in-place with the new values
6. Repeat for a ToDo list (category editing is hidden for ToDo items since they don't use categories)
7. Verify that completed items cannot be edited (clicking does nothing)
8. Verify that pressing Enter in the name field saves the changes
9. Verify that the dialog can be closed via the X button or Cancel/Close button

## Files Changed

| File | Change |
|------|--------|
| `src/components/lists/EditItemDialog.tsx` | **New** - Modal edit dialog |
| `src/components/lists/ListItemRow.tsx` | Added `onEdit` prop, made content clickable |
| `src/components/lists/CategoryGroup.tsx` | Added `onEdit` prop passthrough |
| `src/components/lists/DoneSection.tsx` | Added `onEdit` prop passthrough |
| `src/components/lists/ShoppingList.tsx` | Added edit state, handlers, and dialog |
| `src/components/lists/TodoList.tsx` | Added edit state, handlers, and dialog |
