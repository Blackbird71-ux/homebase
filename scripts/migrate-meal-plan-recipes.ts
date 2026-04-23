#!/usr/bin/env tsx
/**
 * Data migration script to copy existing MealPlan.recipeId values to MealPlanRecipe table.
 * Run this after the schema migration has been applied.
 */

import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

function getDbPath(): string {
  const url = process.env.DATABASE_URL ?? 'file:./homebase.db'
  // Strip "file:" prefix to get the filesystem path
  return url.replace(/^file:/, '')
}

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({ url: getDbPath() })
  return new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  })
}

const prisma = createPrismaClient()

async function main() {
  console.log('Starting meal plan recipes migration...')
  
  // Get all meal plans that have a recipeId
  const mealPlans = await prisma.mealPlan.findMany({
    where: {
      recipeId: {
        not: null,
      },
    },
    select: {
      id: true,
      recipeId: true,
    },
  })

  console.log(`Found ${mealPlans.length} meal plans with recipes to migrate`)

  let migratedCount = 0
  let errorCount = 0

  for (const mealPlan of mealPlans) {
    try {
      // Check if this meal plan already has MealPlanRecipe records
      const existing = await prisma.mealPlanRecipe.findFirst({
        where: {
          mealPlanId: mealPlan.id,
        },
      })

      if (existing) {
        console.log(`Meal plan ${mealPlan.id} already has MealPlanRecipe records, skipping`)
        continue
      }

      // Create MealPlanRecipe record
      await prisma.mealPlanRecipe.create({
        data: {
          mealPlanId: mealPlan.id,
          recipeId: mealPlan.recipeId!,
          order: 0, // First/only recipe
          // courseType: null (default)
        },
      })

      migratedCount++
      
      if (migratedCount % 100 === 0) {
        console.log(`Migrated ${migratedCount} meal plans...`)
      }
    } catch (error) {
      console.error(`Error migrating meal plan ${mealPlan.id}:`, error)
      errorCount++
    }
  }

  console.log(`Migration completed!`)
  console.log(`Successfully migrated: ${migratedCount}`)
  console.log(`Errors: ${errorCount}`)
  console.log(`Total meal plans processed: ${mealPlans.length}`)
  
  // Also log meal plans without recipes for completeness
  const mealPlansWithoutRecipes = await prisma.mealPlan.count({
    where: {
      recipeId: null,
    },
  })
  
  console.log(`Meal plans without recipes: ${mealPlansWithoutRecipes}`)
}

main()
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })