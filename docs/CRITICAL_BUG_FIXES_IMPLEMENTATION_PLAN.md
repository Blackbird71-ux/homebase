# Critical Bug Fixes Implementation Plan

## Overview
This document outlines the implementation plan for fixing critical bugs identified in the HomeBase application, focusing on database persistence, recipe editing duplication, and missing API endpoints.

## Critical Bugs to Fix

### 1. Recipe Editing Duplicates Instead of Updates
- **Root Cause:** `RecipeDetail.tsx` calls `RecipeForm` without `editMode` prop
- **Fix:** Add `editMode={{ recipeId: recipe.id }}` to RecipeForm call
- **File:** `src/app/(app)/recipes/[id]/RecipeDetail.tsx`
- **Status:** ✅ **COMPLETED**

### 2. Missing Duplicate Recipe API Endpoint
- **Issue:** UI calls `POST /api/recipes/{id}/duplicate` but endpoint doesn't exist
- **Fix:** Create new API endpoint at `src/app/api/recipes/[id]/duplicate/route.ts`
- **Implementation:** Clone recipe with new ID, preserve all relationships
- **Status:** 🔄 **IN PROGRESS**

### 3. Database Persistence Issues
- **Issue:** Data loss on container rebuilds
- **Root Cause:** Potential volume mount configuration issues
- **Fix:** 
  1. Verify Docker volume configuration
  2. Add database backup in entrypoint.sh
  3. Enhance health check endpoint
- **Status:** 🔄 **PENDING**

### 4. Notes Page Server Error
- **Issue:** `https://homebase.liddleapps.com/notes` returns server error
- **Investigation Needed:** Authentication, database connection, environment variables
- **Status:** 🔄 **PENDING**

## Implementation Details

### Phase 1: Recipe Editing Fix (COMPLETED)
```typescript
// File: src/app/(app)/recipes/[id]/RecipeDetail.tsx
<RecipeForm
  editMode={{ recipeId: recipe.id }}  // ADDED THIS LINE
  open={editDialogOpen}
  onOpenChange={setEditDialogOpen}
  // ... other props
/>
```

### Phase 2: Duplicate Recipe API Endpoint
**Endpoint:** `POST /api/recipes/{id}/duplicate`

**Business Logic:**
1. Validate user session and permissions
2. Fetch source recipe with all relations (recipeTags, etc.)
3. Create new recipe with cloned data (new ID)
4. Copy recipeTags relationships to new recipe
5. Return new recipe object for UI navigation

**Response Format:**
```json
{
  "id": "new-recipe-id",
  "title": "Recipe Title (Copy)",
  "description": "...",
  "ingredients": [...],
  "instructions": [...],
  "tags": [...],
  "createdAt": "2026-04-20T12:00:00.000Z"
}
```

### Phase 3: Database Persistence Enhancement
**File:** `docker/entrypoint.sh`
```bash
# Add database backup before migrations
if [ -f /data/homebase.db ]; then
  BACKUP_FILE="/data/homebase.db.backup.$(date +%Y%m%d_%H%M%S)"
  cp /data/homebase.db "$BACKUP_FILE"
  echo "Database backed up to: $BACKUP_FILE"
fi
```

**File:** `src/app/api/health/route.ts`
```typescript
// Enhanced health check
export async function GET() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    const dbSize = await getDatabaseSize();
    
    return NextResponse.json({
      status: 'healthy',
      database: {
        connected: true,
        size: dbSize,
        path: process.env.DATABASE_URL
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      database: { connected: false, error: error.message },
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
```

### Phase 4: Testing Strategy
1. **Unit Tests:**
   - Recipe duplication API
   - RecipeForm edit mode behavior
   - Database health checks

2. **Integration Tests:**
   - End-to-end recipe editing flow
   - Database persistence across container restarts
   - Volume mount functionality

3. **User Acceptance Tests:**
   - Verify recipe editing updates existing recipe
   - Test duplicate recipe functionality
   - Confirm data persists after rebuild

## Timeline
- **Day 1:** Recipe editing fix + Duplicate API endpoint
- **Day 2:** Database persistence enhancements
- **Day 3:** Testing + Documentation

## Success Criteria
1. ✅ Recipe editing updates existing recipes (no duplication)
2. ✅ Duplicate recipe functionality works end-to-end
3. ✅ Database persists data across container rebuilds
4. ✅ No regression in existing functionality
5. ✅ All TypeScript compilation passes
6. ✅ Production build succeeds

## Risk Mitigation
- **Backward Compatibility:** Maintain existing API contracts
- **Data Safety:** Backup before any destructive operations
- **Rollback Plan:** Git commits with descriptive messages
- **Monitoring:** Enhanced logging for production debugging

## Files to Modify
1. `src/app/(app)/recipes/[id]/RecipeDetail.tsx` - ✅ COMPLETED
2. `src/app/api/recipes/[id]/duplicate/route.ts` - New file
3. `docker/entrypoint.sh` - Add database backup
4. `src/app/api/health/route.ts` - Enhanced health check
5. `docs/` - Implementation documentation

## Next Steps
1. Create duplicate recipe API endpoint
2. Verify database persistence configuration
3. Test all fixes comprehensively
4. Update worktrees and documentation
5. Final validation and deployment