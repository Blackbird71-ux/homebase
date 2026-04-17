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

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }

  const entries = await prisma.mealPlan.findMany({
    where: {
      familyId: user.familyId,
      date: { gte: new Date(from), lte: new Date(to) },
      recipeId: { not: null },
    },
    include: { recipe: true },
    orderBy: { date: 'asc' },
  })

  const allKeys = entries.flatMap((e) =>
    safeParseArray(e.recipe!.ingredients).map((text) => normalizeIngredient(text))
  )
  const uniqueKeys = [...new Set(allKeys)]

  const learned = await prisma.ingredientCategory.findMany({
    where: { familyId: user.familyId, key: { in: uniqueKeys } },
  })
  const learnedMap = new Map(learned.map((l) => [l.key, l.category]))

  const recipes = entries.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    title: e.recipe!.title,
    ingredients: safeParseArray(e.recipe!.ingredients).map((text) => {
      const key = normalizeIngredient(text)
      const learnedCat = learnedMap.get(key)
      return {
        text,
        key,
        category: learnedCat ?? autoGuessCategory(key),
        source: learnedCat ? 'learned' : 'guessed',
      }
    }),
  }))

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
