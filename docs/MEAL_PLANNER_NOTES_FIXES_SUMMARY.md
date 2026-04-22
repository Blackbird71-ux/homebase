# Meal Planner & Notes Critical Bug Fixes Summary

## Issues Identified and Fixed

### 1. Theme Provider JSON Parsing Error (Notes Page Broken)
**Root Cause**: `ThemeProvider.tsx` line 20 tried to parse already-parsed JSON
- `/api/settings` endpoint already parses `uiPreferences` at line 37
- Theme provider received an object but tried to parse it as a string
- Caused server component render error: `SyntaxError: '[object Object]' is not valid JSON`

**Fix**: Updated `src/components/providers/ThemeProvider.tsx`
```typescript
// Before: const uiPrefs = JSON.parse(data.uiPreferences)
// After: Check if data.uiPreferences is already parsed
const uiPrefs = typeof data.uiPreferences === 'string' 
  ? JSON.parse(data.uiPreferences) 
  : data.uiPreferences
```

### 2. Meal Planner Timezone Mismatch (Data Not Saving/Displaying Correctly)
**Root Cause**: Server-client date inconsistency causing meals to save for wrong dates
- Server used UTC dates, client used local dates
- Australian timezone (UTC+10) caused date shifts
- Meals appeared to not save or displayed on wrong days

**Fixes Implemented**:

#### a) Server Component Fix (`src/app/(app)/meal-plan/page.tsx`)
- Added `toYMDLocal()` function to format dates in local time
- Changed `initialWeekStart={toYMD(weekStart)}` to `initialWeekStart={toYMDLocal(weekStart)}`
- Ensures local date strings are passed to client, not UTC dates

#### b) Client Component UTC Conversion (`src/components/meal-plan/MealPlanGrid.tsx`)
- Updated `navWeek()` and `goToday()` functions to convert local dates to UTC for API queries
- Added proper UTC date normalization for API calls
- Fixed date calculations to handle timezone differences

#### c) API Endpoint Consistency (`src/app/api/meal-plan/route.ts`)
- Already correctly normalizes dates to UTC midnight for storage
- Uses `upsert` with unique constraint `familyId_date_mealType`

### 3. Notes Page JSON Parsing Error
**Root Cause**: Invalid JSON in database `tags` field causing server errors
- Database stored malformed JSON strings in `note.tags`
- API tried to parse invalid JSON, causing server errors

**Fix**: Added `parseTags()` helper with try-catch in:
- `src/app/api/notes/route.ts`
- `src/app/(app)/notes/page.tsx`
```typescript
function parseTags(tags: string | null): string[] {
  if (!tags) return []
  try {
    return JSON.parse(tags) as string[]
  } catch {
    return []
  }
}
```

### 4. Recipe Editing Duplication Bug
**Root Cause**: Missing `editMode` prop in `RecipeDetail.tsx`
- Recipe form created new recipe instead of updating existing one

**Fix**: Added `editMode={{ recipeId: recipe.id }}` prop to RecipeForm call

### 5. Missing Duplicate Recipe API Endpoint
**Created**: `src/app/api/recipes/[id]/duplicate/route.ts`
- Implements recipe duplication with tag preservation
- Adds "(Copy)" suffix to duplicated recipe title

### 6. Database Persistence Enhancements
**Updated**: `docker/entrypoint.sh`
- Added database backup on container startup
- Improved error handling for migrations
- Better permission management for `/data` directory

**Docker Configuration**: Already correctly mounts database outside container
```yaml
volumes:
  - /volume1/docker/homebase/Data:/data
environment:
  - DATABASE_URL=file:/data/homebase.db
```

## Technical Details

### Timezone Handling Strategy
1. **Storage**: All dates stored as UTC midnight in database
2. **Server Processing**: Convert local dates to UTC for queries
3. **Client Display**: Use local dates for UI, convert to UTC for API calls
4. **Date Format**: YYYY-MM-DD strings represent local dates (not UTC)

### JSON Parsing Safety
- All JSON parsing now wrapped in try-catch blocks
- Default to empty array/object on parse failure
- Prevents server crashes from malformed database data

### Error Handling Improvements
- Added better error logging in meal planner API calls
- Toast notifications for network errors
- Console error logging for debugging

## Validation Steps

1. **Notes Page**: Should load without server errors
2. **Meal Planner**: 
   - Meals should save immediately when assigned
   - Should persist across page reloads
   - Should display correct dates for Australian timezone
3. **Recipe Editing**: Should update existing recipe, not create duplicate
4. **Recipe Duplication**: Should create copy with "(Copy)" suffix
5. **Database**: Should persist across container rebuilds via volume mount

## Files Modified

1. `src/components/providers/ThemeProvider.tsx` - JSON parsing fix
2. `src/app/(app)/meal-plan/page.tsx` - Local date formatting
3. `src/components/meal-plan/DailyMealColumn.tsx` - Date display fix
4. `src/components/meal-plan/MealPlanGrid.tsx` - UTC conversion fixes
5. `src/app/api/notes/route.ts` - JSON parsing safety
6. `src/app/(app)/notes/page.tsx` - JSON parsing safety
7. `src/app/(app)/recipes/[id]/RecipeDetail.tsx` - Edit mode prop
8. `src/app/api/recipes/[id]/duplicate/route.ts` - New file
9. `docker/entrypoint.sh` - Database persistence enhancements

## Expected Outcomes

- Notes page at `https://homebase.liddleapps.com/notes` should load without errors
- Meal planner entries should save correctly and persist
- Dates should display correctly for Australian users (local time)
- Recipe editing should update existing recipes, not create duplicates
- Database should survive container rebuilds via external volume mount