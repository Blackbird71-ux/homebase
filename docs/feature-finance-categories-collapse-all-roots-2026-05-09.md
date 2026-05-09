# Feature: Collapsible Root Categories in Finance Categories Panel

**Date:** 2026-05-09

## Overview

Extend the existing collapse/expand toggle (currently available only for the "Not In Use" root category) to **all root categories that have subcategories**. Each root category maintains its own independent collapse state so users can selectively show/hide subcategories, dramatically reducing scrolling in the categories panel.

## Current Behavior

- Only the "Not In Use" root category has a chevron toggle (`ChevronDown`/`ChevronRight`)
- A single boolean `collapsedNotInUse` state controls collapse for just that one category
- `showToggle` prop is hardcoded to `true` only when `cat.name === NOT_IN_USE_NAME`
- All other root categories always display their full subtree

## Desired Behavior

- **Every root category that has children** (`children.length > 0`) gets a chevron toggle
- Each root category has its own independent collapse state (tracked via a `Set<string>` of collapsed root IDs)
- "Not In Use" remains collapsed by default (preserving current behavior)
- All other root categories start expanded (preserving current behavior) but can be collapsed by the user
- The "(N subcategories hidden)" label appears on any collapsed root, not just "Not In Use"
- The dashed border style remains exclusive to "Not In Use" (visual distinction)

## Files Modified

**Only one file** — no API, data model, or backend changes needed.

### [`src/app/(app)/finance/categories/page.tsx`](../src/app/(app)/finance/categories/page.tsx)

## Implementation Details

### 1. Replace single boolean with a `Set<string>` state

```tsx
// Before:
const [collapsedNotInUse, setCollapsedNotInUse] = useState(true)

// After:
const [collapsedRootIds, setCollapsedRootIds] = useState<Set<string>>(
  () => new Set() // "Not In Use" will be added after load
)
```

### 2. Initialize "Not In Use" as collapsed after categories load

After the `load()` function fetches categories, find the "Not In Use" category ID and add it to the collapsed set.

```tsx
useEffect(() => {
  const notInUse = categories.find(
    c => !c.parentId && c.name.toLowerCase() === NOT_IN_USE_NAME.toLowerCase()
  )
  if (notInUse) {
    setCollapsedRootIds(prev => {
      if (prev.has(notInUse.id)) return prev
      const next = new Set(prev)
      next.add(notInUse.id)
      return next
    })
  }
}, [categories])
```

### 3. Add toggle handler

```tsx
function toggleCollapse(categoryId: string) {
  setCollapsedRootIds(prev => {
    const next = new Set(prev)
    if (next.has(categoryId)) {
      next.delete(categoryId)
    } else {
      next.add(categoryId)
    }
    return next
  })
}
```

### 4. Update `CategoryRow` rendering for root categories

In the render loop (`orderedRoots.map`), update the props passed to each `CategoryRow`:

```tsx
{orderedRoots.map(cat => {
  const hasChildren = (childMap.get(cat.id) || []).length > 0
  return (
    <CategoryRow
      key={cat.id}
      cat={cat}
      childrenMap={childMap}
      depth={0}
      onEdit={openEdit}
      onDelete={handleDelete}
      getTypeBadge={getTypeBadge}
      isCollapsed={collapsedRootIds.has(cat.id)}
      onToggleCollapse={() => toggleCollapse(cat.id)}
      showToggle={hasChildren}
    />
  )
})}
```

### 5. Update `CategoryRow` component

The `CategoryRow` component's collapse-related logic is already generic — it works based on `isCollapsed`, `onToggleCollapse`, and `showToggle` props. The only changes needed are cosmetic:

- Remove the hardcoded `cat.name === NOT_IN_USE_NAME` check from the `showToggle` prop (now handled at the parent level)
- Keep the `border-dashed` styling exclusive to "Not In Use" (line 267: `cat.name === NOT_IN_USE_NAME && 'border-dashed border-muted-foreground/30'`)
- The "(N subcategories hidden)" label already uses generic `children.length` (lines 291-295) — no changes needed

### Visual Design

| Element | All Root Categories | "Not In Use" Only |
|---------|-------------------|-------------------|
| Chevron toggle | When has children | When has children |
| Dashed border | No | Yes |
| (N subcategories) hidden label | When collapsed | When collapsed |
| Default state | Expanded | Collapsed |
| Pinned to bottom | No | Yes (already implemented) |

### Edge Cases

1. **Root category with no children** -> no chevron shown (toggle remains hidden)
2. **Root category with 0 subcategories after collapse** -> "(0 subcategories hidden)" — same as current "Not In Use" behavior
3. **Categories re-fetched (on save)** -> collapsed set is preserved (only "Not In Use" auto-added if missing)
4. **"Not In Use" is renamed** -> detection uses case-insensitive name match, same as current logic
5. **Category deleted/reassigned** -> collapsed set may contain stale IDs; `collapsedRootIds.has(cat.id)` simply returns `false` for unknown IDs

## Implementation Steps

| Step | Description | File |
|------|-------------|------|
| 1 | Replace `collapsedNotInUse` boolean with `collapsedRootIds` Set state | `categories/page.tsx` line 322 |
| 2 | Add `useEffect` to auto-collapse "Not In Use" after categories load | `categories/page.tsx` after line 332 |
| 3 | Add `toggleCollapse` handler function | `categories/page.tsx` near other handlers |
| 4 | Update root category rendering loop to pass per-category collapse props | `categories/page.tsx` lines 412-425 |
| 5 | Remove unused `collapsedNotInUse` and `setCollapsedNotInUse` references | `categories/page.tsx` |

## Test Plan

1. Open Categories page -> "Not In Use" root is collapsed (chevron pointing right, "(N subcategories hidden)" visible)
2. All other root categories with children show a `ChevronDown` icon and their subcategories are visible
3. Click chevron on any expanded root -> subcategories hide, chevron rotates to `ChevronRight`, "(N subcategories hidden)" appears
4. Click chevron again -> subcategories re-appear
5. Verify root categories without children have no chevron at all
6. Verify "Not In Use" still has dashed border
7. Create/edit a category -> verify collapsed states are preserved after reload
8. Verify the "Not In Use" remains pinned to bottom
