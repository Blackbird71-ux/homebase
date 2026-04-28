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

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
  const mealPlanTodayStart = normalizeToUtcMidnight(todayStr)
  const mealPlanTodayEnd = new Date(mealPlanTodayStart.getTime() + 24 * 60 * 60 * 1000)
  const mealPlanTomorrowStart = new Date(mealPlanTodayStart.getTime() + 24 * 60 * 60 * 1000)
  const mealPlanTomorrowEnd = new Date(mealPlanTomorrowStart.getTime() + 24 * 60 * 60 * 1000)

  const mealPlanInclude = {
    recipe: { select: { id: true, title: true, image: true, description: true } },
    recipes: {
      include: { recipe: { select: { id: true, title: true, image: true, description: true } } },
      orderBy: { order: 'asc' as const },
    },
  }

  const weekStart = new Date(todayStart.getTime())
  const weekEndDate = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [
    upcomingEvents,
    todayMealPlans,
    tomorrowMealPlans,
    shoppingLists,
    todoLists,
    weekEvents,
    weekMeals,
    weekTodos,
  ] = await Promise.all([
    prisma.event.findMany({
      where: { familyId: user.familyId, start: { gte: now } },
      orderBy: { start: 'asc' },
      take: 5,
    }),
    prisma.mealPlan.findMany({
      where: { familyId: user.familyId, date: { gte: mealPlanTodayStart, lt: mealPlanTodayEnd } },
      include: mealPlanInclude,
    }),
    prisma.mealPlan.findMany({
      where: { familyId: user.familyId, date: { gte: mealPlanTomorrowStart, lt: mealPlanTomorrowEnd } },
      include: mealPlanInclude,
    }),
    prisma.list.findMany({
      where: { familyId: user.familyId, type: 'SHOPPING', isActive: true },
      include: {
        items: { where: { isCompleted: false }, orderBy: { sortOrder: 'asc' }, take: 3, select: { content: true } },
        _count: { select: { items: { where: { isCompleted: false } } } },
      },
      take: 1,
    }),
    prisma.list.findMany({
      where: { familyId: user.familyId, type: 'TODO', isActive: true },
      include: {
        items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: weekEnd } }, orderBy: { dueDate: 'asc' }, take: 3, select: { content: true } },
        _count: { select: { items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: todayEnd } } } } },
      },
      take: 1,
    }),
    // Weekly summary: events this week
    prisma.event.findMany({
      where: { familyId: user.familyId, start: { gte: weekStart, lt: weekEndDate } },
      orderBy: { start: 'asc' },
      take: 5,
      select: { id: true, title: true, start: true, color: true },
    }),
    // Weekly summary: meals this week
    prisma.mealPlan.findMany({
      where: { familyId: user.familyId, date: { gte: weekStart, lt: weekEndDate } },
      include: {
        recipe: { select: { title: true } },
        recipes: { include: { recipe: { select: { title: true } } } },
      },
      orderBy: { date: 'asc' },
    }),
    // Weekly summary: pending todos this week
    prisma.listItem.findMany({
      where: {
        list: { familyId: user.familyId, type: 'TODO', isActive: true },
        isCompleted: false,
        dueDate: { gte: weekStart, lt: weekEndDate },
      },
      orderBy: { dueDate: 'asc' },
      take: 5,
      select: { content: true },
    }),
  ])

  function mealByType(plans: typeof todayMealPlans, type: string): TodaysMeal | null {
    const m = plans.find(p => p.mealType === type)
    if (!m) return null
    const primaryRecipe = m.recipes?.[0]?.recipe ?? m.recipe ?? null
    const primaryRecipeImage = m.recipes?.[0]?.recipe?.image ?? m.recipe?.image ?? null
    const primaryDescription = m.recipes?.[0]?.recipe?.description ?? m.recipe?.description ?? null
    const recipeNames = (m.recipes && m.recipes.length > 0)
      ? m.recipes.map(r => r.recipe?.title).filter(Boolean).join(' & ')
      : (m.recipe?.title ?? null)
    return {
      mealPlanId: m.id,
      mealType: m.mealType,
      recipeId: primaryRecipe?.id ?? null,
      recipeName: recipeNames || m.note || null,
      recipeImage: getLocalImageUrl(primaryRecipeImage ?? null),
      recipeDescription: primaryDescription,
      note: m.note,
    }
  }

  const dinnerMeal = mealByType(todayMealPlans, 'dinner')

  // Build weekly summary
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weeklySummary = {
    weekLabel: `${weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} - ${new Date(weekEndDate.getTime() - 86400000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    eventCount: weekEvents.length,
    mealCount: weekMeals.length,
    pendingTodoCount: weekTodos.length,
    topEvents: weekEvents.map(e => ({
      id: e.id,
      title: e.title,
      start: e.start.toISOString(),
      color: e.color,
    })),
    topMeals: weekMeals.map(m => ({
      day: dayNames[m.date.getDay()],
      meal: m.recipes?.[0]?.recipe?.title ?? m.recipe?.title ?? m.note ?? m.mealType,
    })),
    topTodos: weekTodos.map(t => t.content),
  }

  const data: DashboardData = {
    weeklySummary,
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
      breakfast: mealByType(todayMealPlans, 'breakfast'),
      lunch: mealByType(todayMealPlans, 'lunch'),
      dinner: dinnerMeal,
      snacks: mealByType(todayMealPlans, 'snacks'),
    },
    tomorrowsMeals: {
      breakfast: mealByType(tomorrowMealPlans, 'breakfast'),
      lunch: mealByType(tomorrowMealPlans, 'lunch'),
      dinner: mealByType(tomorrowMealPlans, 'dinner'),
      snacks: mealByType(tomorrowMealPlans, 'snacks'),
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
