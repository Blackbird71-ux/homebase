# Feature: Finance Categories — Modal Editor, Collapse All Roots & Pin "Not In Use"

**Date:** 2026-05-09 (Extended 2026-05-09)

## Overview

UX improvements to the Finance Categories page:

1. **Modal pop-up editor** — replaces the old inline form with a centered dialog, matching the project's established modal pattern (`EditItemDialog`).
2. **Collapse ANY root category** — every root category with children gets a chevron toggle to show/hide its subcategories independently. "Not In Use" is collapsed by default; all others start expanded.
3. **"(N subcategories hidden)" label** — shown on any collapsed root category.
4. **Pin "Not In Use" to bottom** — the "Not In Use" root category always sorts last, keeping active categories at the top of the list.

## Changes

### Files Modified

**1. [`src/app/(app)/finance/categories/page.tsx`](../../src/app/(app)/finance/categories/page.tsx)**

- Extracted inline form into a dedicated `CategoryDialog` component using `@base-ui/react/dialog` primitives ([`Dialog`](../../src/components/ui/dialog.tsx))
- Added `collapsedRootIds: Set<string>` state — tracks collapsed root category IDs independently
- Added `useEffect` to auto-collapse "Not In Use" root after categories load
- Added generic `toggleCollapse(id)` handler to add/remove IDs from the Set
- Added `hasChildren` computation per root category in the render loop
- Replaced single-flag `collapsedNotInUse` with per-category `collapsedRootIds.has(cat.id)`
- Replaced `showToggle={cat.name === NOT_IN_USE_NAME}` with `showToggle={hasChildren}` — toggle shown on any root with children
- Added client-side sorting logic — "Not In Use" root category is always placed last in the render array
- Added dashed border style and hidden subcategory count label for collapsed root rows

**2. [`src/app/api/finance/categories/route.ts`](../../src/app/api/finance/categories/route.ts)**

- Updated `GET` handler `orderBy` to include `sortOrder` first: `orderBy: [{ sortOrder: 'asc' }, { level: 'asc' }, { parentId: 'asc' }, { name: 'asc' }]`

### Key Implementation Details

| Change | Approach |
|--------|----------|
| Modal editor | Controlled `CategoryDialog` with `open`/`onOpenChange` props; form state reset via `useEffect`; save/cancel in `DialogFooter` |
| Per-category collapse | `collapsedRootIds: Set<string>` keyed by root category ID; independent toggle per root |
| Auto-collapse "Not In Use" | `useEffect` on `[categories]` — finds "Not In Use" by case-insensitive name match, adds its ID to the Set on load |
| Toggle handler | `toggleCollapse(id)` — adds ID to Set if expanded, removes if collapsed (immutable Set update) |
| Show toggle condition | `hasChildren` — any root category with children gets a chevron; roots without children show a colored dot |
| Pin to bottom | Split root categories into `regularRoots` and `notInUseCategory`; concatenate with "Not In Use" last |
| Dashed border | Exclusive to "Not In Use" category for visual distinction |

### Usage

- **Add category**: Click "Add Category" button → modal opens with empty form → fill fields → Save
- **Edit category**: Click pencil icon on any category row → modal opens pre-filled → Save
- **Collapse/Expand any root**: Click chevron icon next to any root category with children to toggle its subcategories
- **Default state**: "Not In Use" subcategories hidden on page load; all other roots expanded
- **Hidden count**: "(N subcategories hidden)" label appears on any collapsed root

### Related Files

- [`Dialog` component](../../src/components/ui/dialog.tsx) — modal primitives used
- [`EditItemDialog`](../../src/components/lists/EditItemDialog.tsx) — established modal pattern followed
