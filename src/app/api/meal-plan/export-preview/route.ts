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

  // Collect ingredients from all recipes.
  // Prefer join-table recipes (e.recipes); only fall back to legacy e.recipe
  // when the join table is empty, to avoid counting the same recipe twice.
  const allKeys = entries.flatMap((e) => {
    const recipeIngredients: string[] = []
    const mealPlanRecipes = e.recipes as any[]

    if (mealPlanRecipes && mealPlanRecipes.length > 0) {
      // Use join-table recipes only
      mealPlanRecipes.forEach((mpr: { recipe?: { ingredients: string } }) => {
        if (mpr.recipe) recipeIngredients.push(...safeParseArray(mpr.recipe.ingredients))
      })
    } else if (e.recipe) {
      // Legacy: primary recipe FK only
      recipeIngredients.push(...safeParseArray(e.recipe.ingredients))
    }

    return recipeIngredients.map((text) => normalizeIngredient(text))
  })
  const uniqueKeys = [...new Set(allKeys)]

  const learned = await prisma.ingredientCategory.findMany({
    where: { familyId: user.familyId, key: { in: uniqueKeys } },
  })
  const learnedMap = new Map(learned.map((l) => [l.key, l.category]))

  function resolveCategory(text: string, key: string): { category: string; source: 'learned' | 'custom' | 'guessed' } {
    // 1. Custom mapping: explicit user-defined rules always win
    // Try exact match first (fast path), then substring match (for when the recipe
    // ingredient has extra words like "rashers bacon – diced" matching a "rashes bacon" mapping)
    const lowerKey = key.toLowerCase().trim()
    const lowerText = text.toLowerCase().trim()
    let customCat = customMap.get(lowerKey) ?? customMap.get(lowerText)
    if (!customCat) {
      for (const [mappedIngredient, category] of customMap) {
        if (lowerKey.includes(mappedIngredient) || lowerText.includes(mappedIngredient)) {
          customCat = category
          break
        }
      }
    }
    if (customCat) return { category: customCat, source: 'custom' }
    // 2. Learned: previously remembered category (from past exports)
    const learnedCat = learnedMap.get(key)
    if (learnedCat) return { category: learnedCat, source: 'learned' }
    // 3. Auto-guess: built-in keyword matching
    return { category: autoGuessCategory(key), source: 'guessed' }
  }

  // Generate recipe previews — same dedup logic as ingredient collection above.
  const recipes = entries.flatMap((e) => {
    const recipePreviews: ReturnType<typeof makePreview>[] = []

    function makePreview(title: string, ingredients: string) {
      return {
        date: e.date.toISOString().slice(0, 10),
        title,
        mealType: e.mealType,
        ingredients: safeParseArray(ingredients).map((text) => {
          const key = normalizeIngredient(text)
          const resolved = resolveCategory(text, key)
          return { text, key, category: resolved.category, source: resolved.source }
        }),
      }
    }

    const mealPlanRecipes2 = e.recipes as any[]
    if (mealPlanRecipes2 && mealPlanRecipes2.length > 0) {
      // Use join-table recipes only
      mealPlanRecipes2.forEach((mpr: { recipe?: { title: string; ingredients: string } }) => {
        if (mpr.recipe) recipePreviews.push(makePreview(mpr.recipe.title, mpr.recipe.ingredients))
      })
    } else if (e.recipe) {
      // Legacy fallback
      recipePreviews.push(makePreview(e.recipe.title, e.recipe.ingredients))
    }

    return recipePreviews
  })

  const groceriesList = await prisma.list.findFirst({
    where: { familyId: user.familyId, name: 'Groceries', type: 'SHOPPING', isActive: true },
    include: {
      _count: { select: { items: { where: { isCompleted: false } } } },
      items: {
        where: { isCompleted: false },
        select: { content: true, category: true },
      },
    },
  })

  // Build a set of existing item keys (normalized) for diff view
  const existingItemKeys = new Set(
    (groceriesList?.items ?? []).map((item) => normalizeIngredient(item.content))
  )

  // Mark each ingredient as new or already in list
  const recipesWithDiff = recipes.map((recipe) => ({
    ...recipe,
    ingredients: recipe.ingredients.map((ing) => ({
      ...ing,
      alreadyInList: existingItemKeys.has(ing.key),
    })),
  }))

  return NextResponse.json({
    recipes: recipesWithDiff,
    groceriesList: groceriesList
      ? { id: groceriesList.id, itemCount: groceriesList._count.items }
      : null,
  })
}
