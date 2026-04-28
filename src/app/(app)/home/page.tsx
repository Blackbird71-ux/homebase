import { DashboardGrid } from '@/components/dashboard/DashboardGrid'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { getLocalImageUrl } from '@/lib/image-cache'
import { todayBoundsInTz } from '@/lib/timezone'
import { mergeDashboardCards, type DashboardCardConfig } from '@/lib/dashboard-cards'
import { HomeClient } from './HomeClient'
import type { DashboardData, TodaysMeal, WeeklySummaryData } from '@/types'
import { format, startOfWeek, endOfWeek } from 'date-fns'

/**
 * Normalize a date string to midnight UTC for meal plan queries.
 * This matches the normalization used in the meal plan API (POST /api/meal-plan).
 * Meal plans are stored at midnight UTC of the date they were created for.
 */
function normalizeToUtcMidnight(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z')
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

async function getDashboardData(familyId: string, timezone: string, cards: DashboardCardConfig[], dashboardShoppingListId?: string | null): Promise<DashboardData> {
  // Get today's boundaries in the family's timezone
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)

  // For meal plan queries, we need to match the storage normalization used by the meal plan API.
  // Meal plans are stored at midnight UTC of the date they were created for.
  // So we compute what "today" is in the family's timezone, then normalize to midnight UTC.
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
  const mealPlanTodayStart = normalizeToUtcMidnight(todayStr)
  const mealPlanTodayEnd = new Date(mealPlanTodayStart.getTime() + 24 * 60 * 60 * 1000)
  const mealPlanTomorrowStart = new Date(mealPlanTodayStart.getTime() + 24 * 60 * 60 * 1000)
  const mealPlanTomorrowEnd = new Date(mealPlanTomorrowStart.getTime() + 24 * 60 * 60 * 1000)

  // Determine which cards are visible to conditionally fetch data
  const visibleCardIds = new Set(cards.filter((c) => c.visible).map((c) => c.id))
  const needsEvents = visibleCardIds.has('upcoming-events') || visibleCardIds.has('weekly-summary')
  const needsMeals = visibleCardIds.has('todays-meals') || visibleCardIds.has('tomorrows-meals') || visibleCardIds.has('weekly-summary')
  const needsShopping = visibleCardIds.has('shopping-list')
  const needsTodo = visibleCardIds.has('todo-summary') || visibleCardIds.has('weekly-summary')

  // Compute week boundaries for weekly summary
  const nowInTz = new Date(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))
  const weekStart = startOfWeek(nowInTz, { weekStartsOn: 0 })
  const weekEndDate = endOfWeek(nowInTz, { weekStartsOn: 0 })
  const weekLabel = `${format(weekStart, 'd MMM')} – ${format(weekEndDate, 'd MMM')}`

  // Normalize week boundaries to UTC midnight for DB queries
  const weekStartStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(weekStart)
  const weekEndStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(weekEndDate)
  const weekStartUtc = normalizeToUtcMidnight(weekStartStr)
  const weekEndUtc = new Date(normalizeToUtcMidnight(weekEndStr).getTime() + 24 * 60 * 60 * 1000)

  const [upcomingEvents, todayMealPlans, tomorrowMealPlans, shoppingLists, todoLists, weekEvents, weekMealPlans, weekTodoLists] = await Promise.all([
    needsEvents
      ? prisma.event.findMany({
          where: { familyId, start: { gte: todayStart } },
          orderBy: { start: 'asc' },
          take: 5,
        })
      : Promise.resolve([]),
    needsMeals
      ? prisma.mealPlan.findMany({
          where: { familyId, date: { gte: mealPlanTodayStart, lt: mealPlanTodayEnd } },
          include: {
            recipe: { select: { id: true, title: true, image: true, description: true } },
            recipes: {
              include: { recipe: { select: { id: true, title: true, image: true, description: true } } },
              orderBy: { order: 'asc' },
            },
          },
        })
      : Promise.resolve([]),
    needsMeals
      ? prisma.mealPlan.findMany({
          where: { familyId, date: { gte: mealPlanTomorrowStart, lt: mealPlanTomorrowEnd } },
          include: {
            recipe: { select: { id: true, title: true, image: true, description: true } },
            recipes: {
              include: { recipe: { select: { id: true, title: true, image: true, description: true } } },
              orderBy: { order: 'asc' },
            },
          },
        })
      : Promise.resolve([]),
    needsShopping
      ? prisma.list.findMany({
          where: {
            familyId,
            type: 'SHOPPING',
            isActive: true,
            ...(dashboardShoppingListId ? { id: dashboardShoppingListId } : {}),
          },
          include: {
            items: { where: { isCompleted: false }, orderBy: { sortOrder: 'asc' }, take: 3, select: { content: true } },
            _count: { select: { items: { where: { isCompleted: false } } } },
          },
          // If a specific list is chosen, fetch that one; otherwise fall back to most recent
          ...(dashboardShoppingListId ? {} : { take: 1, orderBy: { createdAt: 'desc' } }),
        })
      : Promise.resolve([]),
    needsTodo
      ? prisma.list.findMany({
          where: { familyId, type: 'TODO', isActive: true },
          include: {
            items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: weekEnd } }, orderBy: { dueDate: 'asc' }, take: 3, select: { content: true } },
            _count: { select: { items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: todayEnd } } } } },
          },
          take: 1,
        })
      : Promise.resolve([]),
    // Weekly summary queries
    visibleCardIds.has('weekly-summary')
      ? prisma.event.findMany({
          where: { familyId, start: { gte: weekStartUtc, lt: weekEndUtc } },
          orderBy: { start: 'asc' },
          take: 3,
          select: { id: true, title: true, start: true, color: true },
        })
      : Promise.resolve([]),
    visibleCardIds.has('weekly-summary')
      ? prisma.mealPlan.findMany({
          where: { familyId, date: { gte: weekStartUtc, lt: weekEndUtc } },
          include: {
            recipe: { select: { id: true, title: true } },
            recipes: { include: { recipe: { select: { id: true, title: true } } }, orderBy: { order: 'asc' } },
          },
        })
      : Promise.resolve([]),
    visibleCardIds.has('weekly-summary')
      ? prisma.list.findMany({
          where: { familyId, type: 'TODO', isActive: true },
          include: {
            _count: { select: { items: { where: { isCompleted: false } } } },
            items: { where: { isCompleted: false }, orderBy: { sortOrder: 'asc' }, take: 3, select: { content: true } },
          },
          take: 1,
        })
      : Promise.resolve([]),
  ])

  // Map each meal type from a set of meal plans.
  // Prefer the MealPlanRecipe junction table (recipes[]) which is the current storage;
  // fall back to the legacy recipeId/recipe field for older records.
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

  // Build weekly summary data
  const weeklySummary: WeeklySummaryData | null = visibleCardIds.has('weekly-summary')
    ? {
        weekLabel,
        eventCount: weekEvents.length,
        mealCount: weekMealPlans.length,
        pendingTodoCount: weekTodoLists[0]?._count?.items ?? 0,
        topEvents: weekEvents.map(e => ({
          id: e.id,
          title: e.title,
          start: e.start.toISOString(),
          color: e.color,
        })),
        topMeals: (() => {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          return weekMealPlans.slice(0, 5).map(mp => {
            const dayIndex = new Date(mp.date).getUTCDay()
            const recipeName = mp.recipes?.[0]?.recipe?.title ?? mp.recipe?.title ?? mp.note ?? 'Planned'
            return { day: dayNames[dayIndex], meal: recipeName }
          })
        })(),
        topTodos: weekTodoLists[0]?.items?.map(i => i.content) ?? [],
      }
    : null

  return {
    weeklySummary,
    upcomingEvents: upcomingEvents.map(e => ({
      id: e.id, title: e.title,
      start: e.start.toISOString(), end: e.end.toISOString(),
      isAllDay: e.isAllDay, category: e.category, color: e.color,
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
    shoppingList: (() => {
      const chosen = shoppingLists[0] ?? null
      return chosen ? {
        listId: chosen.id, listName: chosen.name,
        totalItems: chosen._count.items,
        pendingItems: chosen._count.items,
        firstItems: chosen.items.map(i => i.content),
      } : null
    })(),
    todoSummary: todoLists[0] ? {
      listId: todoLists[0].id, listName: todoLists[0].name,
      dueTodayCount: todoLists[0]._count.items,
      firstItems: todoLists[0].items.map(i => i.content),
    } : null,
  }
}

export default async function HomePage() {
  const user = await requireSession()
  const timezone = user.timezone

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { uiPreferences: true },
  })

  // Parse dashboardCards and dashboardShoppingListId from uiPreferences
  let dashboardCards: DashboardCardConfig[] | null = null
  let dashboardShoppingListId: string | null = null
  if (fullUser?.uiPreferences) {
    try {
      const prefs = JSON.parse(fullUser.uiPreferences)
      dashboardCards = prefs.dashboardCards ?? null
      dashboardShoppingListId = prefs.dashboardShoppingListId ?? null
    } catch {
      // ignore parse errors
    }
  }

  const cards = mergeDashboardCards(dashboardCards)
  const data = await getDashboardData(user.familyId, timezone, cards, dashboardShoppingListId)

  return (
    <HomeClient
      data={data}
      timezone={timezone}
      initialCards={cards}
    />
  )
}
