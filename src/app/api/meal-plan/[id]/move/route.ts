import { withRouteErrors } from '@/lib/route-errors'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { MEAL_TYPES } from '@/lib/meal-types'
import { getLocalImageUrl } from '@/lib/image-cache'
import { createAuditLog } from '@/lib/audit-log'

async function _PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await _req.json()
  const { targetDate, targetMealType } = body

  if (!targetDate || !targetMealType) {
    return NextResponse.json(
      { error: 'targetDate and targetMealType are required' },
      { status: 400 }
    )
  }

  const validMealTypeIds = MEAL_TYPES.map(m => m.id)
  if (!validMealTypeIds.includes(targetMealType)) {
    return NextResponse.json(
      { error: `targetMealType must be one of: ${validMealTypeIds.join(', ')}` },
      { status: 400 }
    )
  }

  // Find the source entry
  const sourceEntry = await prisma.mealPlan.findFirst({
    where: { id, familyId: user.familyId },
    include: {
      recipes: {
        include: {
          recipe: { select: { id: true, title: true, image: true } },
        },
        orderBy: { order: 'asc' },
      },
      recipe: { select: { id: true, title: true, image: true } },
    },
  })

  if (!sourceEntry) {
    return NextResponse.json({ error: 'Source meal not found' }, { status: 404 })
  }

  // Normalize target date to midnight UTC
  const targetDateObj = new Date(targetDate)
  if (isNaN(targetDateObj.getTime())) {
    return NextResponse.json({ error: 'Invalid targetDate format' }, { status: 400 })
  }
  const normalizedTarget = new Date(
    Date.UTC(targetDateObj.getUTCFullYear(), targetDateObj.getUTCMonth(), targetDateObj.getUTCDate())
  )

  // Check if source and target are the same
  const sourceDateNormalized = new Date(
    Date.UTC(sourceEntry.date.getUTCFullYear(), sourceEntry.date.getUTCMonth(), sourceEntry.date.getUTCDate())
  )
  if (
    sourceDateNormalized.getTime() === normalizedTarget.getTime() &&
    sourceEntry.mealType === targetMealType
  ) {
    return NextResponse.json({ error: 'Source and target are the same' }, { status: 400 })
  }

  // Find or create the target entry
  let targetEntry = await prisma.mealPlan.findFirst({
    where: {
      familyId: user.familyId,
      date: normalizedTarget,
      mealType: targetMealType,
    },
    include: {
      recipes: {
        include: {
          recipe: { select: { id: true, title: true, image: true } },
        },
        orderBy: { order: 'asc' },
      },
      recipe: { select: { id: true, title: true, image: true } },
    },
  })

  if (!targetEntry) {
    // Create a new target entry
    targetEntry = await prisma.mealPlan.create({
      data: {
        date: normalizedTarget,
        mealType: targetMealType,
        familyId: user.familyId,
        note: null,
        recipeId: null,
      },
      include: {
        recipes: {
          include: {
            recipe: { select: { id: true, title: true, image: true } },
          },
          orderBy: { order: 'asc' },
        },
        recipe: { select: { id: true, title: true, image: true } },
      },
    })
  }

  // Get the next order value for the target entry
  const maxOrder = targetEntry.recipes.length > 0
    ? Math.max(...targetEntry.recipes.map(r => r.order))
    : -1

  // Move all recipes from source to target
  const sourceRecipes = await prisma.mealPlanRecipe.findMany({
    where: { mealPlanId: sourceEntry.id },
    orderBy: { order: 'asc' },
  })

  if (sourceRecipes.length > 0) {
    // Update the mealPlanId and order for each recipe
    for (let i = 0; i < sourceRecipes.length; i++) {
      await prisma.mealPlanRecipe.update({
        where: { id: sourceRecipes[i].id },
        data: {
          mealPlanId: targetEntry.id,
          order: maxOrder + 1 + i,
        },
      })
    }
  } else if (sourceEntry.recipeId) {
    // Handle legacy single-recipe entries
    // Create a MealPlanRecipe record for the legacy recipe
    await prisma.mealPlanRecipe.create({
      data: {
        mealPlanId: targetEntry.id,
        recipeId: sourceEntry.recipeId,
        order: maxOrder + 1,
      },
    })
  }

  // Delete the source entry (cascades will handle MealPlanRecipe records that weren't moved)
  // But we already moved them, so we just delete the empty source entry
  await prisma.mealPlan.delete({ where: { id: sourceEntry.id } })

  // Fetch the updated target entry
  const updatedTarget = await prisma.mealPlan.findUnique({
    where: { id: targetEntry.id },
    include: {
      recipes: {
        include: {
          recipe: { select: { id: true, title: true, image: true } },
        },
        orderBy: { order: 'asc' },
      },
      recipe: { select: { id: true, title: true, image: true } },
    },
  })

  if (!updatedTarget) {
    return NextResponse.json({ error: 'Failed to update meal plan' }, { status: 500 })
  }

  void createAuditLog(
    user,
    'update',
    'mealPlan',
    id,
    `Moved ${sourceEntry.mealType} meal from ${sourceEntry.date.toISOString().split('T')[0]} to ${normalizedTarget.toISOString().split('T')[0]} (${targetMealType})`,
    { move: { from: { date: sourceEntry.date.toISOString(), mealType: sourceEntry.mealType }, to: { date: normalizedTarget.toISOString(), mealType: targetMealType } } }
  )

  return NextResponse.json({
    target: {
      ...updatedTarget,
      date: updatedTarget.date.toISOString(),
      recipes: updatedTarget.recipes.map(r => ({
        id: r.id,
        recipeId: r.recipeId,
        order: r.order,
        courseType: r.courseType,
        recipe: { id: r.recipe.id, title: r.recipe.title, image: getLocalImageUrl(r.recipe.image) },
      })),
    },
    // Return the source date/mealType so the frontend knows what slot to clear
    sourceDate: sourceEntry.date.toISOString(),
    sourceMealType: sourceEntry.mealType,
  })
}

export const PATCH = withRouteErrors(_PATCH)
