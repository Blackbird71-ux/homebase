# Tag Migration Fix Summary

## Problem
When deleting all tags from a recipe and updating it, the recipe card on the recipes page would show a "legacy-tags" tag. This was a bug in the tag migration system.

## Root Cause
The system has a migration from legacy comma-separated tags to a new relational tag system (`recipeTags` relationship). When a recipe uses the new system, the legacy `tags` field is set to `'legacy-tags'` as a marker.

The bug was in the PUT handler (`/api/recipes/[id]/route.ts`):
- When updating a recipe with empty tags array `[]`, it would always set `tags: 'legacy-tags'`
- This was inconsistent with the POST handler which sets `tags: null` for empty tags
- When reading recipes, `'legacy-tags'` should be filtered out, but the UI was showing it

## Solution
Updated the PUT handler to be consistent with the POST handler:
- If tags are provided and non-empty → `tags: 'legacy-tags'`
- If tags are provided but empty array `[]` → `tags: null`
- If tags are not provided in update → keep existing value

### Code Change
In `src/app/api/recipes/[id]/route.ts`, line ~223:
```typescript
// Before:
...(tags !== undefined && { tags: 'legacy-tags' }),

// After:
...(tags !== undefined && { tags: tags && tags.length > 0 ? 'legacy-tags' : null }),
```

## How Tag System Works
1. **Legacy system**: `tags` field stores comma-separated string (e.g., "Italian,Dinner")
2. **New system**: `recipeTags` relationship with `Tag` table
3. **Migration marker**: When using new system, `tags = 'legacy-tags'`
4. **Reading**: API combines tags from both systems, filtering out `'legacy-tags'`

## Testing
To verify the fix:
1. Open a recipe with tags
2. Remove all tags (clear the tag selector)
3. Click "Update Recipe"
4. Navigate back to recipes page
5. Verify: Recipe card should show no tags (not "legacy-tags")

## Related Files
- `src/app/api/recipes/[id]/route.ts` - Individual recipe CRUD
- `src/app/api/recipes/route.ts` - Recipe list and creation
- `src/components/recipes/RecipeCard.tsx` - Recipe card display

## Date Fixed
April 23, 2026