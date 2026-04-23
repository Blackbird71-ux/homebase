# Multi-Recipe Meal Planner Implementation Plan

## Current State Analysis

### Data Model (prisma/schema.prisma)
```prisma
model MealPlan {
  id        String   @id @default(cuid())
  date      DateTime
  mealType  String   @default("dinner")
  recipeId  String?
  recipe    Recipe?  @relation(fields: [recipeId], references: [id])
  note      String?
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id])

  @@unique([familyId, date, mealType])
}
```

### Key Constraints
1. One recipe per meal (single `recipeId` field)
2. Unique constraint: `[familyId, date, mealType]` - only one meal per type per day
3. Meal types: "breakfast", "lunch", "dinner" (default)

### UI Components
- `MealPlanGrid`: Main grid view
- `DailyMealColumn`: Column for each day
- `MealSlotCell`: Individual meal slot
- `AssignMealModal`: Modal for assigning recipes
- `ExportGroceriesModal`: Grocery list export

### API Endpoints
- `GET /api/meal-plan`: Get meal plans
- `POST /api/meal-plan`: Create meal plan
- `PUT /api/meal-plan/[id]`: Update meal plan
- `DELETE /api/meal-plan/[id]`: Delete meal plan
- `POST /api/meal-plan/bulk`: Bulk operations
- `POST /api/meal-plan/export-groceries`: Export groceries
- `POST /api/meal-plan/export-preview`: Preview export

## Requirements
1. Support multiple recipes per meal (e.g., dinner with entree, main course, dessert)
2. Maintain backward compatibility with existing data
3. Update UI to display and manage multiple recipes
4. Update grocery export to aggregate ingredients from multiple recipes
5. Support reordering of recipes within a meal
6. **Shopping list should be ordered by ingredient category order from settings by default**

## Design Decision: Option 1 - Join Table

### Schema Changes
```prisma
model MealPlan {
  id        String   @id @default(cuid())
  date      DateTime
  mealType  String   @default("dinner")
  note      String?
  familyId  String
  family    Family   @relation(fields: [familyId], references: [id])
  recipes   MealPlanRecipe[]

  @@unique([familyId, date, mealType])
}

model MealPlanRecipe {
  id         String   @id @default(cuid())
  mealPlanId String
  mealPlan   MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
  recipeId   String
  recipe     Recipe   @relation(fields: [recipeId], references: [id])
  order      Int      @default(0)  // For sorting recipes within a meal
  courseType String?               // Optional: "entree", "main", "dessert", etc.
  createdAt  DateTime @default(now())

  @@unique([mealPlanId, recipeId])
  @@index([mealPlanId, order])
}
```

### Migration Strategy
1. Create new `MealPlanRecipe` table
2. Migrate existing `MealPlan.recipeId` to `MealPlanRecipe` records
3. Keep `recipeId` field temporarily for backward compatibility during transition
4. Remove `recipeId` field after migration is complete

## Implementation Phases

### Phase 1: Database Schema & Migration
1. Update Prisma schema with new models
2. Generate migration: `npx prisma migrate dev --name add-meal-plan-recipes`
3. Create data migration script:
   - Copy existing `MealPlan.recipeId` to `MealPlanRecipe` records
   - Set `order = 0` for all migrated records
4. Test migration on development database

### Phase 2: API Layer Updates
1. Update `GET /api/meal-plan`:
   - Include `recipes` with `recipe` relation
   - Return array of recipes instead of single recipe
   - Maintain backward compatibility: include `recipe` field for migrated data
2. Update `POST /api/meal-plan`:
   - Accept `recipeIds` array instead of `recipeId`
   - Create `MealPlanRecipe` records
3. Update `PUT /api/meal-plan/[id]`:
   - Update `MealPlanRecipe` records (delete old, create new)
   - Support partial updates
4. Update `DELETE /api/meal-plan/[id]`:
   - Cascade delete will handle `MealPlanRecipe` records
5. Update bulk operations API
6. Update types in `src/types/index.ts`

### Phase 3: UI Components
1. Update `MealSlotCell`:
   - Display multiple recipes with titles
   - Show course types if specified
   - Add "Add another recipe" button
2. Update `AssignMealModal`:
   - Allow selecting multiple recipes
   - Add course type selection (optional)
   - Support reordering with drag-and-drop
3. Update `MealPlanGrid` and `DailyMealColumn`:
   - Handle new data structure
   - Update prop types
4. Add recipe reordering UI (drag handles or up/down buttons)

### Phase 4: Grocery Export
1. Update `export-groceries` API:
   - Aggregate ingredients from all recipes in a meal
   - Handle duplicate ingredients across recipes
2. Update `ExportGroceriesModal`:
   - Show recipes included in each meal
   - Update preview display
3. Update ingredient categorization logic

### Phase 5: Shopping List Category Ordering
1. Update `groupByCategory` function in `src/lib/list-helpers.ts`:
   - Fetch custom category order from database (sorted by `sortOrder`)
   - Use custom order instead of `DEFAULT_SHOPPING_CATEGORIES`
   - Fall back to default order if no custom categories exist
2. Update shopping list components to pass custom category order
3. Update grocery export to use same ordering
4. Add API endpoint to fetch categories in order (if not already exists)

### Phase 6: Backward Compatibility & Testing
1. Ensure existing meal plans still work
2. Test migration script with production-like data
3. Update all existing queries to use new structure
4. Add feature flag if needed for gradual rollout
5. Update documentation
6. Test shopping list ordering with custom categories

## Files to Modify

### Database
- `prisma/schema.prisma` - Add new models
- `prisma/migrations/` - Migration files
- `scripts/migrate-meal-plan-recipes.ts` - Data migration script

### API
- `src/app/api/meal-plan/route.ts`
- `src/app/api/meal-plan/[id]/route.ts`
- `src/app/api/meal-plan/bulk/route.ts`
- `src/app/api/meal-plan/export-groceries/route.ts`
- `src/app/api/meal-plan/export-preview/route.ts`

### Types
- `src/types/index.ts` - Update MealPlan type

### UI Components
- `src/components/meal-plan/MealPlanGrid.tsx`
- `src/components/meal-plan/DailyMealColumn.tsx`
- `src/components/meal-plan/MealSlotCell.tsx`
- `src/components/meal-plan/AssignMealModal.tsx`
- `src/components/meal-plan/ExportGroceriesModal.tsx`

### Utilities
- `src/lib/meal-plan-helpers.ts` (new) - Helper functions
- `src/lib/ingredient-helpers.ts` - Update for multiple recipes

## Testing Strategy

### Unit Tests
1. Migration script tests
2. API endpoint tests
3. UI component tests

### Integration Tests
1. End-to-end meal planning flow
2. Grocery export with multiple recipes
3. Bulk operations

### Manual Testing
1. Create meal with multiple recipes
2. Reorder recipes within a meal
3. Update meal with new recipes
4. Delete meal with multiple recipes
5. Export groceries with multiple recipes

## Rollback Plan
1. Keep `recipeId` field during transition period
2. Feature flag for new multi-recipe UI
3. Backup database before migration
4. Document rollback SQL commands

## Timeline Estimate
- Phase 1: 2-3 hours (Database Schema & Migration)
- Phase 2: 3-4 hours (API Layer Updates)  
- Phase 3: 4-5 hours (UI Components)
- Phase 4: 2-3 hours (Grocery Export)
- Phase 5: 1-2 hours (Shopping List Category Ordering)
- Phase 6: 2-3 hours (Backward Compatibility & Testing)
- **Total: 14-20 hours**

## Risks & Mitigations
1. **Data loss during migration**: Test migration script thoroughly, create backups
2. **Performance with many recipes**: Add indexes, pagination if needed
3. **UI complexity**: Start with simple list, add advanced features later
4. **Backward compatibility**: Maintain old API format during transition

## Success Criteria
1. Users can add multiple recipes to a single meal
2. Recipes can be reordered within a meal
3. Grocery export includes all recipes
4. Existing meal plans continue to work
5. Performance remains acceptable

## Next Steps
1. Review and approve this plan
2. Begin with Phase 1 (database schema)
3. Implement incrementally with thorough testing
4. Deploy to staging for user testing
5. Gather feedback and iterate