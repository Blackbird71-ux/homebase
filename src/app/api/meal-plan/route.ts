import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { MEAL_TYPES } from '@/lib/meal-types'
import { getLocalImageUrl } from '@/lib/image-cache'
import { createAuditLog } from '@/lib/audit-log'

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
          recipe: { select: { id: true, title: true, image: true } },
        },
        orderBy: { order: 'asc' },
      },
      // Keep recipe for backward compatibility during transition
      recipe: { select: { id: true, title: true, image: true } },
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
            recipe: { id: r.recipe.id, title: r.recipe.title, image: getLocalImageUrl(r.recipe.image) },
          }))
        : p.recipeId
          ? [{
              id: 'legacy',
              recipeId: p.recipeId,
              order: 0,
              courseType: null,
              recipe: p.recipe ? { id: p.recipe.id, title: p.recipe.title, image: getLocalImageUrl(p.recipe.image) } : null,
            }]
          : [],
    }))
  )
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { date, mealType, recipeIds, note, append } = body

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
  
  // If append mode, fetch existing recipes for this slot and merge
  let existingMealPlanId: string | null = null
  let existingIngredientNames: string[] = []
  if (append && finalRecipeIds.length > 0) {
    const existing = await prisma.mealPlan.findUnique({
      where: {
        familyId_date_mealType: {
          familyId: user.familyId,
          date: normalized,
          mealType,
        },
      },
      include: {
        recipes: {
          include: {
            recipe: { select: { id: true, title: true, ingredients: true } },
          },
        },
      },
    })
    if (existing) {
      existingMealPlanId = existing.id
      const existingRecipeIds = existing.recipes.map(r => r.recipeId)
      // Merge existing recipe IDs with new ones, preserving order
      const mergedRecipeIds = [...existingRecipeIds]
      for (const newId of finalRecipeIds) {
        if (!mergedRecipeIds.includes(newId)) {
          mergedRecipeIds.push(newId)
        }
      }
      // Collect existing ingredient names for deduplication
      existingIngredientNames = existing.recipes
        .flatMap(r => {
          try {
            return JSON.parse(r.recipe.ingredients || '[]') as string[]
          } catch {
            return []
          }
        })
        .map(i => i.split(',')[0]?.trim().toLowerCase() || '')
      
      // Replace finalRecipeIds with the merged list (passed via body or via reassignment)
      // We need to use the merged list for the upsert below
      // Since we can't reassign const, we'll pass it differently
    }
  }

  // Determine the final list of recipe IDs to save
  // If append mode and we found existing recipes, use the merged list
  let idsToSave: string[]
  if (append && existingMealPlanId !== null) {
    // Re-fetch to compute the merged list properly
    const existing = await prisma.mealPlan.findUnique({
      where: { id: existingMealPlanId },
      include: {
        recipes: {
          include: {
            recipe: { select: { id: true, title: true, ingredients: true } },
          },
        },
      },
    })
    if (existing) {
      const existingRecipeIds = existing.recipes.map(r => r.recipeId)
      idsToSave = [...existingRecipeIds]
      for (const newId of finalRecipeIds) {
        if (!idsToSave.includes(newId)) {
          idsToSave.push(newId)
        }
      }
    } else {
      idsToSave = finalRecipeIds
    }
  } else {
    idsToSave = finalRecipeIds
  }

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
      recipeId: idsToSave.length === 1 ? idsToSave[0] : null,
    },
    update: {
      note: note ?? null,
      // For backward compatibility, keep recipeId if there's exactly one recipe
      recipeId: idsToSave.length === 1 ? idsToSave[0] : null,
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

  // Delete existing MealPlanRecipe records and create new ones
  if (plan.id) {
    await prisma.mealPlanRecipe.deleteMany({
      where: { mealPlanId: plan.id },
    })

    if (idsToSave.length > 0) {
      await prisma.mealPlanRecipe.createMany({
        data: idsToSave.map((recipeId, index) => ({
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
          recipe: { select: { id: true, title: true, image: true } },
        },
        orderBy: { order: 'asc' },
      },
      recipe: { select: { id: true, title: true, image: true } },
    },
  })

  if (!updatedPlan) {
    return NextResponse.json({ error: 'Failed to create meal plan' }, { status: 500 })
  }

  // Get recipe titles for the audit log
  const recipeTitles = updatedPlan.recipes
    .map(r => r.recipe?.title)
    .filter(Boolean)
    .join(', ')

  void createAuditLog(
    user,
    append ? 'update' : 'create',
    'mealPlan',
    updatedPlan.id,
    `${append ? 'Updated' : 'Added'} ${mealType} meal on ${normalized.toISOString().split('T')[0]}${recipeTitles ? `: ${recipeTitles}` : ''}`,
    { mealPlan: { date: normalized.toISOString(), mealType, recipeIds: idsToSave, append: !!append } }
  )

  return NextResponse.json(
    {
      ...updatedPlan,
      date: updatedPlan.date.toISOString(),
      recipes: updatedPlan.recipes.map(r => ({
        id: r.id,
        recipeId: r.recipeId,
        order: r.order,
        courseType: r.courseType,
        recipe: { id: r.recipe.id, title: r.recipe.title, image: getLocalImageUrl(r.recipe.image) },
      })),
    },
    { status: 201 }
  )
}
