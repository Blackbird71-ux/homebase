# Bug Fix: Recipe Delete Failure

**Date:** 2026-05-08

## Problem

Deleting a recipe from the recipe detail page always showed "Failed to delete recipe. Please try again." even though the API route and frontend handler looked correct.

## Root Cause

`MealPlanRecipe.recipeId` had no `onDelete` directive in `schema.prisma`, which defaults to `RESTRICT` in SQLite. Any recipe that had been added to a meal plan could not be deleted — the database rejected the delete with a foreign key violation, returning a 500.

`MealPlan.recipeId` had the same missing annotation (the underlying DB was already correct from the init migration, but the schema was out of sync).

## Fix

- `prisma/schema.prisma`: Added `onDelete: Cascade` to `MealPlanRecipe.recipe` and `onDelete: SetNull` to `MealPlan.recipe`
- `prisma/migrations/20260508400000_fix_recipe_delete_cascade/migration.sql`: Recreates the `MealPlanRecipe` table with the corrected FK action

When a recipe is deleted, any `MealPlanRecipe` rows referencing it are now automatically removed. `MealPlan` rows that reference the recipe have their `recipeId` set to null (preserving the date/meal slot with a blank entry).
