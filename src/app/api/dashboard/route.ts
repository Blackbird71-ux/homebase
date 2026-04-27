import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { getLocalImageUrl } from '@/lib/image-cache'
import { todayBoundsInTz } from '@/lib/timezone'
import type { DashboardData, TodaysMeal } from '@/types'

function normalizeToUtcMidnight(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z')
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export async function GET() {
  const user = await requireSession()
  const timezone = user.timezone ?? 'Australia/Sydney'
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
  const now = new Date()
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Meal plans are stored at midnight UTC — compute the correct date range
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
  const mealPlanTodayStart = normalizeToUtcMidnight(todayStr)
  const mealPlanTodayEnd = new Date(mealPlanTodayStart.getTime() + 24 * 60 * 60 * 1000)

  const [upcomingEvents, todayMealPlans, shoppingLists, todoLists] = await Promise.all([
    prisma.event.findMany({
      where: { familyId: user.familyId, start: { gte: now } },
      orderBy: { start: 'asc' },
      take: 5,
    }),
    prisma.mealPlan.findMany({
      where: {
        familyId: user.familyId,
        date: { gte: mealPlanTodayStart, lt: mealPlanTodayEnd },
      },
      include: {
        recipe: { select: { id: true, title: true, image: true } },
        recipes: {
          include: { recipe: { select: { id: true, title: true, image: true } } },
          orderBy: { order: 'asc' },
        },
      },
    }),
    prisma.list.findMany({
      where: { familyId: user.familyId, type: 'SHOPPING', isActive: true },
      include: {
        items: {
          where: { isCompleted: false },
          orderBy: { sortOrder: 'asc' },
          take: 3,
          select: { content: true },
        },
        _count: { select: { items: { where: { isCompleted: false } } } },
      },
      take: 1,
    }),
    prisma.list.findMany({
      where: { familyId: user.familyId, type: 'TODO', isActive: true },
      include: {
        items: {
          where: { isCompleted: false, dueDate: { gte: todayStart, lt: weekEnd } },
          orderBy: { dueDate: 'asc' },
          take: 3,
          select: { content: true },
        },
        _count: { select: { items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: todayEnd } } } } },
      },
      take: 1,
    }),
  ])

  const mealByType = (type: string): TodaysMeal | null => {
    const m = todayMealPlans.find(p => p.mealType === type)
    if (!m) return null
    const primaryRecipe = m.recipes?.[0]?.recipe ?? m.recipe ?? null
    const primaryRecipeImage = m.recipes?.[0]?.recipe?.image ?? m.recipe?.image ?? null
    const recipeNames = (m.recipes && m.recipes.length > 0)
      ? m.recipes.map(r => r.recipe?.title).filter(Boolean).join(' & ')
      : (m.recipe?.title ?? null)
    return {
      mealPlanId: m.id,
      mealType: m.mealType,
      recipeId: primaryRecipe?.id ?? null,
      recipeName: recipeNames || m.note || null,
      recipeImage: getLocalImageUrl(primaryRecipeImage ?? null),
      note: m.note,
    }
  }

  const dinnerMeal = mealByType('dinner')

  const data: DashboardData = {
    upcomingEvents: upcomingEvents.map(e => ({
      id: e.id,
      title: e.title,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      isAllDay: e.isAllDay,
      category: e.category,
      color: e.color,
    })),
    tonightsDinner: dinnerMeal,
    todaysMeals: {
      breakfast: mealByType('breakfast'),
      lunch: mealByType('lunch'),
      dinner: dinnerMeal,
      snacks: mealByType('snacks'),
    },
    shoppingList: shoppingLists[0]
      ? {
          listId: shoppingLists[0].id,
          listName: shoppingLists[0].name,
          totalItems: shoppingLists[0]._count.items,
          pendingItems: shoppingLists[0]._count.items,
          firstItems: shoppingLists[0].items.map(i => i.content),
        }
      : null,
    todoSummary: todoLists[0]
      ? {
          listId: todoLists[0].id,
          listName: todoLists[0].name,
          dueTodayCount: todoLists[0]._count.items,
          firstItems: todoLists[0].items.map(i => i.content),
        }
      : null,
  }

  return NextResponse.json(data)
}
