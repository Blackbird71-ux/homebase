# Database Schema Migration: Tag and Category Management

## Overview
This migration enhances the Homebase application's database schema to improve tag and category management:

1. **Tag System Enhancement**: Converts comma-separated recipe tags into a proper relational structure
2. **Category System Enhancement**: Adds `sortOrder` and `isCustom` fields to ingredient categories

## Changes Made

### 1. Schema Updates (`prisma/schema.prisma`)
- Added `Tag` model with fields: `id`, `name`, `familyId`, `createdAt`
- Added `RecipeTag` junction table with: `recipeId`, `tagId`, `createdAt`
- Updated `IngredientCategory` model to add:
  - `sortOrder` (Int, default: 0)
  - `isCustom` (Boolean, default: false)
- Added relation fields:
  - `Family.tags: Tag[]`
  - `Recipe.recipeTags: RecipeTag[]`

### 2. Database Migration (`prisma/migrations/20260419101620_add_tag_and_category_enhancements/`)
- Created `Tag` table with unique constraint on (`familyId`, `name`)
- Created `RecipeTag` table with composite primary key (`recipeId`, `tagId`)
- Added `sortOrder` and `isCustom` columns to `IngredientCategory` table
- All foreign key constraints properly configured with `ON DELETE CASCADE` for `RecipeTag`

### 3. Data Migration Script (`scripts/migrate-tags.ts`)
- Script to convert existing comma-separated tags to new relational structure
- Parses `Recipe.tags` string field
- Creates unique `Tag` records per family
- Creates `RecipeTag` relationships
- Idempotent: won't create duplicate tags or relationships
- Includes verification and progress reporting

### 4. Verification Script (`scripts/verify-migration.ts`)
- Checks database state before/after migration
- Reports on recipes with tags, tag counts, and migration readiness
- Useful for testing and validation

## Migration Steps

### Phase 1: Schema Migration (Completed)
1. Update `prisma/schema.prisma` with new models and fields
2. Generate Prisma client: `npx prisma generate`
3. Create and apply migration: `npx prisma migrate deploy`

### Phase 2: Data Migration (To be executed when ready)
1. Ensure DATABASE_URL is set in environment
2. Run data migration script:
   ```bash
   DATABASE_URL="file:./homebase.db" npx tsx scripts/migrate-tags.ts
   ```
3. Verify migration results:
   ```bash
   DATABASE_URL="file:./homebase.db" npx tsx scripts/verify-migration.ts
   ```

### Phase 3: Application Updates (Future)
1. Update API routes to use new tag structure
2. Update UI components to support tag management
3. Remove `tags` field from `Recipe` model (optional cleanup)

## Rollback Plan

### If migration fails:
1. **Schema rollback**: Use Prisma migration rollback
   ```bash
   npx prisma migrate resolve --rolled-back <migration_name>
   ```
2. **Data preservation**: The `tags` field remains in `Recipe` table during migration
3. **Backup**: Always backup database before migration

### Manual rollback steps:
1. Drop new tables if needed:
   ```sql
   DROP TABLE IF EXISTS RecipeTag;
   DROP TABLE IF EXISTS Tag;
   ```
2. Remove new columns from IngredientCategory:
   ```sql
   -- Would require creating a new table and copying data
   ```

## Testing

### Pre-migration checks:
- Run verification script to assess migration impact
- Test with sample data if available
- Ensure no active database connections during migration

### Post-migration validation:
1. Verify tag counts match expected values
2. Check that all recipe-tag relationships are preserved
3. Test basic CRUD operations on new tables
4. Verify backward compatibility (old `tags` field still readable)

## Important Notes

1. **Backward Compatibility**: The `Recipe.tags` string field remains for now to maintain compatibility with existing code
2. **Performance**: The migration script processes recipes in batches (could be optimized for large datasets)
3. **Idempotency**: The migration script can be safely re-run
4. **Data Integrity**: Foreign key constraints ensure referential integrity
5. **SQLite Compatibility**: All changes are compatible with SQLite database

## Files Created/Modified

- `prisma/schema.prisma` - Updated schema definition
- `prisma/migrations/20260419101620_add_tag_and_category_enhancements/migration.sql` - Database migration
- `scripts/migrate-tags.ts` - Data migration script
- `scripts/verify-migration.ts` - Verification script
- `scripts/MIGRATION-README.md` - This documentation

## Next Steps

1. Update API routes (`/api/recipes/*`) to use new tag structure
2. Update RecipeForm component to support tag selection/creation
3. Update RecipeCard and RecipeDetail to display tags from new structure
4. Consider removing `tags` field from Recipe model once migration is complete
