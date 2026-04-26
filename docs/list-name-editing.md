# List Name Editing

## Overview

Added the ability to rename lists inline from the sidebar. Users can double-click a list name to enter edit mode, type a new name, and press Enter to save.

## Implementation

### Modified Components

- **`src/components/lists/ListSelector.tsx`** - Added `EditableListName` sub-component that handles the inline rename UI. The list name button now has `onDoubleClick` to enter edit mode. When editing, an input field replaces the name with Save (checkmark) and Cancel (X) buttons. Enter saves, Escape cancels. Added `onRename` prop to `ListSelectorProps`.

- **`src/app/(app)/lists/ListsClient.tsx`** - Added `onRename` handler that updates the parent `lists` state so both the sidebar entry and the main page heading (`<h1>{activeList.name}</h1>`) update immediately after a rename.

### API

The existing PATCH endpoint at `/api/lists/[id]` already supported the `name` field, so no API changes were needed.

## How to Test

1. Navigate to the Lists page
2. In the sidebar, double-click any list name
3. The name should turn into an editable input field
4. Type a new name and press Enter (or click the checkmark button)
5. Both the sidebar entry and the main page heading should update immediately with the new name
6. Press Escape (or click the X button) to cancel without saving
7. Single-click still selects the list as before

## Files Changed

| File | Change |
|------|--------|
| `src/components/lists/ListSelector.tsx` | Added `EditableListName` component, `onRename` prop, double-click to edit |
| `src/app/(app)/lists/ListsClient.tsx` | Added `onRename` handler to propagate name changes to parent state |
