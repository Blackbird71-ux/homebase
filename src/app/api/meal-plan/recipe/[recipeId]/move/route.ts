import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { MEAL_TYPES } from '@/lib/meal-types'
import { getLocalImageUrl } from '@/lib/image-cache'

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ recipeId: string }> }
) {
  const user = await requireSession()
  const { recipeId } = await params
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

  // Find the MealPlanRecipe record
  const mealPlanRecipe = await prisma.mealPlanRecipe.findUnique({
    where: { id: recipeId },
    include: {
      mealPlan: { select: { id: true, familyId: true, date: true, mealType: true } },
      recipe: { select: { id: true, title: true, image: true } },
    },
  })

  if (!mealPlanRecipe) {
    return NextResponse.json({ error: 'Recipe not found in meal plan' }, { status: 404 })
  }

  if (mealPlanRecipe.mealPlan.familyId !== user.familyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const sourceEntryId = mealPlanRecipe.mealPlanId

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
    Date.UTC(
      mealPlanRecipe.mealPlan.date.getUTCFullYear(),
      mealPlanRecipe.mealPlan.date.getUTCMonth(),
      mealPlanRecipe.mealPlan.date.getUTCDate()
    )
  )
  if (
    sourceDateNormalized.getTime() === normalizedTarget.getTime() &&
    mealPlanRecipe.mealPlan.mealType === targetMealType
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

  // Move the single recipe to the target entry
  await prisma.mealPlanRecipe.update({
    where: { id: recipeId },
    data: {
      mealPlanId: targetEntry.id,
      order: maxOrder + 1,
    },
  })

  // Check if the source entry now has any remaining recipes
  const remainingRecipes = await prisma.mealPlanRecipe.count({
    where: { mealPlanId: sourceEntryId },
  })

  // If source entry has no more recipes, delete it
  if (remainingRecipes === 0) {
    await prisma.mealPlan.delete({ where: { id: sourceEntryId } })
  }

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

  // Fetch the source entry (may have been deleted)
  const sourceEntry = remainingRecipes > 0
    ? await prisma.mealPlan.findUnique({
        where: { id: sourceEntryId },
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
    : null

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
    source: sourceEntry
      ? {
          ...sourceEntry,
          date: sourceEntry.date.toISOString(),
          recipes: sourceEntry.recipes.map(r => ({
            id: r.id,
            recipeId: r.recipeId,
            order: r.order,
            courseType: r.courseType,
            recipe: { id: r.recipe.id, title: r.recipe.title, image: getLocalImageUrl(r.recipe.image) },
          })),
        }
      : null,
  })
}
