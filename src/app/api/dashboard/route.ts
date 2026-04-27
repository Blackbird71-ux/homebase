import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { getLocalImageUrl } from '@/lib/image-cache'
import { todayBoundsInTz } from '@/lib/timezone'
import type { DashboardData, TodaysMeal } from '@/types'

export async function GET() {
  const user = await requireSession()
  const timezone = user.timezone ?? 'Australia/Sydney'
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
  const now = new Date()
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [upcomingEvents, todayMealPlans, shoppingLists, todoLists] = await Promise.all([
    prisma.event.findMany({
      where: { familyId: user.familyId, start: { gte: now } },
      orderBy: { start: 'asc' },
      take: 5,
    }),
    prisma.mealPlan.findMany({
      where: {
        familyId: user.familyId,
        date: { gte: todayStart, lt: todayEnd },
      },
      include: { recipe: { select: { id: true, title: true, image: true } } },
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
    return {
      mealPlanId: m.id,
      mealType: m.mealType,
      recipeId: m.recipe?.id ?? null,
      recipeName: m.recipe?.title ?? null,
      recipeImage: getLocalImageUrl(m.recipe?.image ?? null),
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
