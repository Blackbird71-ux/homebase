import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { MEAL_TYPES } from '@/lib/meal-types'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 })
  }

  const fromDate = new Date(from)
  const toDate = new Date(to)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }

  const plans = await prisma.mealPlan.findMany({
    where: {
      familyId: user.familyId,
      date: { gte: fromDate, lte: toDate },
    },
    include: {
      recipes: {
        include: {
          recipe: { select: { id: true, title: true } },
        },
        orderBy: { order: 'asc' },
      },
      // Keep recipe for backward compatibility during transition
      recipe: { select: { id: true, title: true } },
    },
    orderBy: { date: 'asc' },
  })

  return NextResponse.json(
    plans.map((p) => ({
      ...p,
      date: p.date.toISOString(),
      // For backward compatibility, if there are no recipes but there's a recipeId, include it
      recipes: p.recipes.length > 0 
        ? p.recipes.map(r => ({
            id: r.id,
            recipeId: r.recipeId,
            order: r.order,
            courseType: r.courseType,
            recipe: r.recipe,
          }))
        : p.recipeId 
          ? [{
              id: 'legacy',
              recipeId: p.recipeId,
              order: 0,
              courseType: null,
              recipe: p.recipe,
            }]
          : [],
    }))
  )
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { date, mealType, recipeIds, note } = body

  if (!date || !mealType) {
    return NextResponse.json({ error: 'date and mealType are required' }, { status: 400 })
  }

  const validMealTypeIds = MEAL_TYPES.map(m => m.id)
  if (!validMealTypeIds.includes(mealType)) {
    return NextResponse.json({ error: `mealType must be one of: ${validMealTypeIds.join(', ')}` }, { status: 400 })
  }

  const dateObj = new Date(date)
  if (isNaN(dateObj.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
  }
  // Normalize to midnight UTC for consistent upsert key
  const normalized = new Date(
    Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate())
  )

  // Handle recipeIds - can be undefined, null, string, or array
  const recipeIdArray = Array.isArray(recipeIds) 
    ? recipeIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    : typeof recipeIds === 'string' && recipeIds.trim() !== ''
      ? [recipeIds]
      : []

  // For backward compatibility, also accept recipeId (singular)
  const legacyRecipeId = body.recipeId
  const finalRecipeIds = recipeIdArray.length > 0 
    ? recipeIdArray 
    : legacyRecipeId && typeof legacyRecipeId === 'string' && legacyRecipeId.trim() !== ''
      ? [legacyRecipeId]
      : []

  const plan = await prisma.mealPlan.upsert({
    where: {
      familyId_date_mealType: {
        familyId: user.familyId,
        date: normalized,
        mealType,
      },
    },
    create: {
      date: normalized,
      mealType,
      note: note ?? null,
      familyId: user.familyId,
      // For backward compatibility, keep recipeId if there's exactly one recipe
      recipeId: finalRecipeIds.length === 1 ? finalRecipeIds[0] : null,
    },
    update: {
      note: note ?? null,
      // For backward compatibility, keep recipeId if there's exactly one recipe
      recipeId: finalRecipeIds.length === 1 ? finalRecipeIds[0] : null,
    },
    include: {
      recipes: {
        include: {
          recipe: { select: { id: true, title: true } },
        },
        orderBy: { order: 'asc' },
      },
      recipe: { select: { id: true, title: true } },
    },
  })

  // Delete existing MealPlanRecipe records and create new ones
  if (plan.id) {
    await prisma.mealPlanRecipe.deleteMany({
      where: { mealPlanId: plan.id },
    })

    if (finalRecipeIds.length > 0) {
      await prisma.mealPlanRecipe.createMany({
        data: finalRecipeIds.map((recipeId, index) => ({
          mealPlanId: plan.id,
          recipeId,
          order: index,
        })),
      })
    }
  }

  // Fetch the updated plan with recipes
  const updatedPlan = await prisma.mealPlan.findUnique({
    where: { id: plan.id },
    include: {
      recipes: {
        include: {
          recipe: { select: { id: true, title: true } },
        },
        orderBy: { order: 'asc' },
      },
      recipe: { select: { id: true, title: true } },
    },
  })

  if (!updatedPlan) {
    return NextResponse.json({ error: 'Failed to create meal plan' }, { status: 500 })
  }

  return NextResponse.json(
    {
      ...updatedPlan,
      date: updatedPlan.date.toISOString(),
      recipes: updatedPlan.recipes.map(r => ({
        id: r.id,
        recipeId: r.recipeId,
        order: r.order,
        courseType: r.courseType,
        recipe: r.recipe,
      })),
    },
    { status: 201 }
  )
}
