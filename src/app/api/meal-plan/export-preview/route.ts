import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { normalizeIngredient, autoGuessCategory } from '@/lib/ingredient-helpers'

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const mealPlanIdsParam = searchParams.get('mealPlanIds')
  const mealPlanIds = mealPlanIdsParam ? mealPlanIdsParam.split(',').filter(Boolean) : null

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }

  const fromDate = new Date(from)
  const toDate = new Date(to)
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: 'from and to must be valid ISO dates' }, { status: 400 })
  }

  // For full-week export (no specific IDs), skip meals from past dates
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const effectiveFrom = (!mealPlanIds && fromDate < today) ? today : fromDate

  const entries = await prisma.mealPlan.findMany({
    where: mealPlanIds
      ? { familyId: user.familyId, id: { in: mealPlanIds } }
      : {
          familyId: user.familyId,
          date: { gte: effectiveFrom, lte: toDate },
          OR: [
            { recipeId: { not: null } },
            { recipes: { some: {} } },
          ],
        },
    include: { 
      recipe: true,
      recipes: {
        include: { recipe: true },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { date: 'asc' },
  })

  // Load custom ingredient mappings (user-defined overrides)
  const customMappings = await prisma.ingredientMapping.findMany({
    where: { familyId: user.familyId },
  })
  const customMap = new Map(customMappings.map((m) => [m.ingredient.toLowerCase().trim(), m.category]))

  // Collect ingredients from all recipes (primary recipe + join table recipes)
  const allKeys = entries.flatMap((e) => {
    const recipeIngredients: string[] = []
    
    // Include primary recipe if exists
    if (e.recipe) {
      recipeIngredients.push(...safeParseArray(e.recipe.ingredients))
    }
    
    // Include all recipes from join table
    const mealPlanRecipes = e.recipes as any[]
    if (mealPlanRecipes && mealPlanRecipes.length > 0) {
      mealPlanRecipes.forEach((mealPlanRecipe: { recipe?: { ingredients: string } }) => {
        if (mealPlanRecipe.recipe) {
          recipeIngredients.push(...safeParseArray(mealPlanRecipe.recipe.ingredients))
        }
      })
    }
    
    return recipeIngredients.map((text) => normalizeIngredient(text))
  })
  const uniqueKeys = [...new Set(allKeys)]

  const learned = await prisma.ingredientCategory.findMany({
    where: { familyId: user.familyId, key: { in: uniqueKeys } },
  })
  const learnedMap = new Map(learned.map((l) => [l.key, l.category]))

  function resolveCategory(text: string, key: string): { category: string; source: 'learned' | 'custom' | 'guessed' } {
    // 1. Learned: exact previous override saved by the user
    const learnedCat = learnedMap.get(key)
    if (learnedCat) return { category: learnedCat, source: 'learned' }
    // 2. Custom mapping: family-defined keyword→category rule
    const customCat = customMap.get(key) ?? customMap.get(text.toLowerCase().trim())
    if (customCat) return { category: customCat, source: 'custom' }
    // 3. Auto-guess: built-in keyword matching
    return { category: autoGuessCategory(key), source: 'guessed' }
  }

  // Generate recipe previews for all recipes (primary + join table)
  const recipes = entries.flatMap((e) => {
    const recipePreviews = []
    
    // Include primary recipe if exists
    if (e.recipe) {
      recipePreviews.push({
        date: e.date.toISOString().slice(0, 10),
        title: e.recipe.title,
        mealType: e.mealType,
        ingredients: safeParseArray(e.recipe.ingredients).map((text) => {
          const key = normalizeIngredient(text)
          const resolved = resolveCategory(text, key)
          return { text, key, category: resolved.category, source: resolved.source }
        }),
      })
    }
    
    // Include all recipes from join table
    const mealPlanRecipes2 = e.recipes as any[]
    if (mealPlanRecipes2 && mealPlanRecipes2.length > 0) {
      mealPlanRecipes2.forEach((mealPlanRecipe: { recipe?: { title: string; ingredients: string } }) => {
        if (mealPlanRecipe.recipe) {
          recipePreviews.push({
            date: e.date.toISOString().slice(0, 10),
            title: mealPlanRecipe.recipe.title,
            mealType: e.mealType,
            ingredients: safeParseArray(mealPlanRecipe.recipe.ingredients).map((text) => {
              const key = normalizeIngredient(text)
              const resolved = resolveCategory(text, key)
              return { text, key, category: resolved.category, source: resolved.source }
            }),
          })
        }
      })
    }
    
    return recipePreviews
  })

  const groceriesList = await prisma.list.findFirst({
    where: { familyId: user.familyId, name: 'Groceries', type: 'SHOPPING', isActive: true },
    include: { _count: { select: { items: { where: { isCompleted: false } } } } },
  })

  return NextResponse.json({
    recipes,
    groceriesList: groceriesList
      ? { id: groceriesList.id, itemCount: groceriesList._count.items }
      : null,
  })
}
