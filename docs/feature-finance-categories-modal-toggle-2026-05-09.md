# Feature: Finance Categories — Modal Editor, Collapse & Pin "Not In Use"

**Date:** 2026-05-09

## Overview

Three UX improvements to the Finance Categories page:

1. **Modal pop-up editor** — replaces the old inline form with a centered dialog, matching the project's established modal pattern (`EditItemDialog`).
2. **Collapse "Not In Use" subcategories** — the root-level "Not In Use" category is collapsed by default, with a chevron toggle to show/hide its children. A "(N subcategories hidden)" label is shown when collapsed.
3. **Pin "Not In Use" to bottom** — the "Not In Use" root category always sorts last, keeping active categories at the top of the list.

## Changes

### Files Modified

**1. [`src/app/(app)/finance/categories/page.tsx`](../../src/app/(app)/finance/categories/page.tsx)**

- Extracted inline form into a dedicated `CategoryDialog` component using `@base-ui/react/dialog` primitives ([`Dialog`](../../src/components/ui/dialog.tsx))
- Added `collapsedNotInUse` state (default `true`) and chevron toggle in `CategoryRow`
- Added client-side sorting logic — "Not In Use" root category is always placed last in the render array
- Added dashed border style and hidden subcategory count label for the "Not In Use" row

**2. [`src/app/api/finance/categories/route.ts`](../../src/app/api/finance/categories/route.ts)**

- Updated `GET` handler `orderBy` to include `sortOrder` first: `orderBy: [{ sortOrder: 'asc' }, { level: 'asc' }, { parentId: 'asc' }, { name: 'asc' }]`

### Key Implementation Details

| Change | Approach |
|--------|----------|
| Modal editor | Controlled `CategoryDialog` with `open`/`onOpenChange` props; form state reset via `useEffect`; save/cancel in `DialogFooter` |
| Collapse toggle | `ChevronDown`/`ChevronRight` icons; children hidden when `isCollapsed` is true; per-session state only |
| Pin to bottom | Split root categories into `regularRoots` and `notInUseCategory`; concatenate with "Not In Use" last |
| "Not In Use" detection | Case-insensitive name match against `"Not In Use"` constant |

### Usage

- **Add category**: Click "Add Category" button → modal opens with empty form → fill fields → Save
- **Edit category**: Click pencil icon on any category row → modal opens pre-filled → Save
- **Collapse/Expand**: Click chevron icon next to "Not In Use" category to toggle its subcategories
- **Default state**: "Not In Use" subcategories are hidden on page load

### Related Files

- [`Dialog` component](../../src/components/ui/dialog.tsx) — modal primitives used
- [`EditItemDialog`](../../src/components/lists/EditItemDialog.tsx) — established modal pattern followed
