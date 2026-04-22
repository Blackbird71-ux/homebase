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
- `flex` containers without `flex-wrap` can cause overflow clipping (already partially fixed)
- `group-hover:` may not trigger reliably on nested `<Link>` elements in Edge
- Scrollbar styling differs between browsers

### Issue 3: Layout Not Full-Screen
Several pages use `space-y-6` or `p-6` containers that don't fill the available height:
- [`NoteDetail.tsx`](src/app/(app)/notes/[id]/NoteDetail.tsx:90): `<div className="space-y-6">` - not full height
- [`NotesClient.tsx`](src/app/(app)/notes/NotesClient.tsx:187): `<div className="space-y-6">` - not full height
- [`RecipeDetail.tsx`](src/app/(app)/recipes/[id]/RecipeDetail.tsx:93): `max-w-2xl mx-auto p-6` - constrained width, not full screen
