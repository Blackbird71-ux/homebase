# Edge Compatibility & Full-Screen Responsive Layout Plan

## Problem Analysis

### Issue 1: Edit/Delete Buttons Not Showing in Edge on Recipe Detail
The user reports that when opening a recipe from the recipes page in Edge, the Edit and Delete buttons don't show. Looking at the code:

- [`RecipeDetail.tsx`](src/app/(app)/recipes/[id]/RecipeDetail.tsx:49): `canEdit = isAdmin || recipe.createdBy === currentUserId`
- The Edit and Delete buttons are wrapped in `{canEdit && (...)}` (line 134)
- If the user is neither admin nor the recipe creator, the buttons are hidden

**Root cause**: The permission check is too restrictive. The user wants these buttons to show for all users.

### Issue 2: Edge-Specific CSS Rendering Differences
Edge handles certain CSS patterns differently:
- `flex` containers without `flex-wrap` can cause overflow clipping
- `group-hover:` may not trigger reliably on nested `<Link>` elements in Edge
- Scrollbar styling differs between browsers

### Issue 3: Layout Not Full-Screen
Several pages use `space-y-6` or `p-6` containers that don't fill the available height:
- [`NoteDetail.tsx`](src/app/(app)/notes/[id]/NoteDetail.tsx:90): `<div className="space-y-6">` - not full height
- [`NotesClient.tsx`](src/app/(app)/notes/NotesClient.tsx:187): `<div className="space-y-6">` - not full height
- [`RecipeDetail.tsx`](src/app/(app)/recipes/[id]/RecipeDetail.tsx:93): `max-w-2xl mx-auto p-6` - constrained width, not full screen
- [`MealPlanGrid.tsx`](src/components/meal-plan/MealPlanGrid.tsx:248): `p-4 md:p-6 h-full overflow-hidden` - already full height, good
- [`CalendarView.tsx`](src/components/calendar/CalendarView.tsx:56): `flex flex-col h-full p-3 md:p-4` - already full height, good
- [`Settings page`](src/app/(app)/settings/page.tsx:56): `flex flex-col h-full overflow-y-auto` - already full height, good
- [`Home page`](src/app/(app)/home/page.tsx:83): `flex flex-col h-full p-6 overflow-hidden` - already full height, good
- [`RecipesClient.tsx`](src/app/(app)/recipes/RecipesClient.tsx:115): `flex-1 flex flex-col gap-4 p-4 md:p-6 overflow-auto` - already full height, good

### Issue 4: Scrollbar Styling
The default browser scrollbar is "ugly" - need custom scrollbar styling that works across browsers including Edge.

## Architecture

### 1. Global Scrollbar Styling
Add custom scrollbar CSS to [`globals.css`](src/app/globals.css) that works in Edge (uses `-ms-` prefixes and standard `scrollbar-width`).

### 2. RecipeDetail.tsx - Button Visibility Fix
Remove the `canEdit` gate from Edit and Delete buttons so they always show. The API route already handles authorization server-side, so removing the client-side gate is safe.

### 3. RecipeDetail.tsx - Full-Screen Layout
Change from `max-w-2xl mx-auto p-6` to a full-height flex layout that fills the available space.

### 4. NoteDetail.tsx - Full-Screen Layout
Change from `space-y-6` to `flex flex-col h-full overflow-y-auto p-6`.

### 5. NotesClient.tsx - Full-Screen Layout
Change from `space-y-6` to `flex flex-col h-full overflow-y-auto p-6`.

### 6. RecipeCard.tsx - Edge Hover Fix
The delete button uses `group-hover:opacity-100` which may not work reliably in Edge on nested Link elements. Already has `focus-visible:opacity-100` - but need to ensure the `group` class is on the right parent.

### 7. NoteCard.tsx - Edge Hover Fix
Already has `focus-within:opacity-100` as fallback - good.

### 8. MealSlotCell.tsx - Edge Hover Fix
Already has `focus-visible:opacity-100` as fallback - good.

### 9. Responsive Audit
Ensure all pages have proper responsive behavior at various viewport widths.

## Files to Modify

| # | File | Changes |
|---|------|---------|
| 1 | [`src/app/globals.css`](src/app/globals.css) | Add custom scrollbar styles (Edge-compatible) |
| 2 | [`src/app/(app)/recipes/[id]/RecipeDetail.tsx`](src/app/(app)/recipes/[id]/RecipeDetail.tsx) | Remove `canEdit` gate from Edit/Delete; full-screen layout |
| 3 | [`src/app/(app)/notes/[id]/NoteDetail.tsx`](src/app/(app)/notes/[id]/NoteDetail.tsx) | Full-screen layout |
| 4 | [`src/app/(app)/notes/NotesClient.tsx`](src/app/(app)/notes/NotesClient.tsx) | Full-screen layout |
| 5 | [`src/components/recipes/RecipeCard.tsx`](src/components/recipes/RecipeCard.tsx) | Ensure Edge hover works on delete button |

## Detailed Implementation Steps

### Step 1: Global Scrollbar Styling
Add to end of `globals.css`:
```css
/* Custom scrollbar - cross-browser */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--muted-foreground);
  border-radius: 4px;
  opacity: 0.5;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--foreground);
}
/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--muted-foreground) transparent;
}
/* Edge/IE */
body {
  -ms-overflow-style: -ms-autohiding-scrollbar;
}
```

### Step 2: RecipeDetail.tsx - Button Visibility
- Remove `{canEdit && (...)}` wrapper from Edit and Delete buttons
- Always show Edit and Delete buttons
- The API route (`/api/recipes/[id]`) already validates authorization server-side

### Step 3: RecipeDetail.tsx - Full-Screen Layout
- Change outer container from `max-w-2xl mx-auto p-6 flex flex-col gap-6 overflow-y-auto h-full min-h-0` to `flex flex-col gap-6 overflow-y-auto h-full min-h-0 p-6`
- Remove the max-width constraint so it fills the available space
- Keep the content readable by adding `max-w-3xl` to the inner content sections

### Step 4: NoteDetail.tsx - Full-Screen Layout
- Change outer container from `space-y-6` to `flex flex-col h-full overflow-y-auto p-6 gap-6`
- Ensure the content fills the available height

### Step 5: NotesClient.tsx - Full-Screen Layout
- Change outer container from `space-y-6` to `flex flex-col h-full overflow-y-auto p-6 gap-6`
- Ensure the notes grid fills available space

### Step 6: RecipeCard.tsx - Edge Hover
- The delete button already has `focus-visible:opacity-100` which is good
- Ensure the `group` class is on the outermost div (it is: `relative group h-full`)
- No changes needed - already correct

## Testing Checklist
- [ ] Open recipe detail in Edge - Edit and Delete buttons visible
- [ ] Open recipe detail in Opera - buttons still work
- [ ] Recipe detail fills full screen width
- [ ] Note detail fills full screen
- [ ] Notes list fills full screen
- [ ] Scrollbar is thin and styled in Edge
- [ ] Scrollbar is thin and styled in Chrome/Opera
- [ ] All pages responsive at 1024px, 768px, 375px widths
- [ ] No regressions on existing functionality
- [ ] Build passes with `npx tsc --noEmit`
