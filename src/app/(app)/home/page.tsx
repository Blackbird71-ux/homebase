import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { getLocalImageUrl } from '@/lib/image-cache'
import { todayBoundsInTz } from '@/lib/timezone'
import { mergeDashboardCards, type DashboardCardConfig } from '@/lib/dashboard-cards'
import { HomeClient } from './HomeClient'
import type { DashboardData, TodaysMeal, WeeklySummaryData, ChoreScheduleDay, ChoreScheduleItem } from '@/types'
import { format } from 'date-fns'

/**
 * Normalize a date string to midnight UTC for meal plan queries.
 * This matches the normalization used in the meal plan API (POST /api/meal-plan).
 * Meal plans are stored at midnight UTC of the date they were created for.
 */
function normalizeToUtcMidnight(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z')
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function buildChoreSchedule(
  chores: any[],
  todayStart: Date,
  days: number = 30
): ChoreScheduleDay[] {
  if (!chores || !Array.isArray(chores)) return []
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const schedule: ChoreScheduleDay[] = []
  for (let i = 0; i < days; i++) {
    const dayDate = new Date(todayStart)
    dayDate.setDate(dayDate.getDate() + i)
    const dayStart = new Date(dayDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayDate)
    dayEnd.setHours(23, 59, 59, 999)
    const dayChores = chores.filter((c: any) => {
      if (!c.nextDueDate) return false
      return c.nextDueDate >= dayStart && c.nextDueDate <= dayEnd
    })
    schedule.push({
      day: dayNames[dayDate.getDay()],
      // Store as local YYYY-MM-DD string to avoid UTC timezone shift when parsing
      date: `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`,
      chores: dayChores.map((c: any): ChoreScheduleItem => ({
        id: c.id,
        title: c.title,
        frequency: c.frequency,
        note: c.note,
        currentAssignee: c.currentAssignee ? { id: c.currentAssignee.id, name: c.currentAssignee.name } : null,
        lastCompletedBy: c.completions?.[0]?.completedBy ? { id: c.completions[0].completedBy.id, name: c.completions[0].completedBy.name } : null,
        lastCompletedAt: c.completions?.[0]?.completedAt?.toISOString() ?? null,
        isOverdue: c.nextDueDate ? c.nextDueDate < todayStart : false,
        isCompletable: c.allowEarlyStart || (c.nextDueDate ? c.nextDueDate <= todayStart : false),
      })),
    })
  }
  return schedule
}

async function getDashboardData(familyId: string, timezone: string, cards: DashboardCardConfig[], dashboardShoppingListId?: string | null, weekStartsOn: 0 | 1 = 0, userId?: string, dashboardTodoListId?: string | null): Promise<DashboardData> {
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
  const needsChores = visibleCardIds.has('chore-schedule')
  const needsBills = visibleCardIds.has('bills-to-pay')

  // Compute rolling 7-day window from today
  const nowInTz = new Date(new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))
  const weekStart = new Date(nowInTz)
  const weekEndDate = new Date(nowInTz)
  weekEndDate.setDate(weekEndDate.getDate() + 6)
  const weekLabel = `${format(weekStart, 'd MMM')} – ${format(weekEndDate, 'd MMM')}`

  // Normalize week boundaries to UTC midnight for DB queries
  const weekStartStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(weekStart)
  const weekEndStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(weekEndDate)
  const weekStartUtc = normalizeToUtcMidnight(weekStartStr)
  const weekEndUtc = new Date(normalizeToUtcMidnight(weekEndStr).getTime() + 24 * 60 * 60 * 1000)

  const [upcomingEvents, todayMealPlans, tomorrowMealPlans, shoppingLists, todoLists, myTasksCountResult, weekEvents, weekMealPlans, weekTodoLists, choreData, billsData] = await Promise.all([
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
          where: {
            familyId,
            type: 'TODO',
            isActive: true,
            ...(dashboardTodoListId ? { id: dashboardTodoListId } : {}),
          },
          include: {
            items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: weekEnd } }, orderBy: { dueDate: 'asc' }, take: 3, select: { content: true, assignedToUserId: true } },
            _count: { select: { items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: todayEnd } } } } },
          },
          ...(dashboardTodoListId ? {} : { take: 1 }),
        })
      : Promise.resolve([]),
    needsTodo && userId
      ? prisma.listItem.count({
          where: {
            list: {
              familyId,
              type: 'TODO',
              isActive: true,
              ...(dashboardTodoListId ? { id: dashboardTodoListId } : {}),
            },
            isCompleted: false,
            dueDate: { gte: todayStart, lt: todayEnd },
            assignedToUserId: userId,
          },
        })
      : Promise.resolve(0),
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
            recipe: { select: { id: true, title: true, description: true } },
            recipes: { include: { recipe: { select: { id: true, title: true, description: true } } }, orderBy: { order: 'asc' } },
          },
        })
      : Promise.resolve([]),
    visibleCardIds.has('weekly-summary')
      ? prisma.list.findMany({
          where: {
            familyId,
            type: 'TODO',
            isActive: true,
            ...(dashboardTodoListId ? { id: dashboardTodoListId } : {}),
          },
          include: {
            _count: { select: { items: { where: { isCompleted: false } } } },
            items: { where: { isCompleted: false }, orderBy: { sortOrder: 'asc' }, take: 4, select: { content: true } },
          },
          ...(dashboardTodoListId ? {} : { take: 1 }),
        })
      : Promise.resolve([]),
    needsChores
      ? prisma.chore.findMany({
          where: {
            familyId,
            isActive: true,
            nextDueDate: { lte: new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000) },
          },
          select: {
            id: true,
            title: true,
            frequency: true,
            note: true,
            nextDueDate: true,
            allowEarlyStart: true,
            currentAssignee: { select: { id: true, name: true } },
            completions: {
              orderBy: { completedAt: 'desc' },
              take: 1,
              select: { completedAt: true, completedBy: { select: { id: true, name: true } } },
            },
          },
          orderBy: { nextDueDate: 'asc' },
        })
      : Promise.resolve([]),
    needsBills
      ? prisma.financeRecurringBill.findMany({
          where: {
            familyId,
            isActive: true,
            paid: false,
            nextDueDate: { lte: new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { nextDueDate: 'asc' },
          select: { id: true, name: true, amount: true, frequency: true, nextDueDate: true, autoPay: true },
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
          dayLabel: (() => {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            return dayNames[e.start.getDay()]
          })(),
        })),
        topMeals: (() => {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          return weekMealPlans.slice(0, 5).map(mp => {
            const dayIndex = new Date(mp.date).getUTCDay()
            const recipeName = mp.recipes?.[0]?.recipe?.title ?? mp.recipe?.title ?? mp.note ?? 'Planned'
            const recipeNote = mp.recipes?.[0]?.recipe?.description ?? mp.recipe?.description ?? mp.note ?? null
            // Use the recipe description as the note shown under the meal name (same as Today's Meals does)
            const note = recipeNote && recipeNote !== recipeName ? recipeNote : null
            return { day: dayNames[dayIndex], meal: recipeName, note }
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
      myTasksCount: myTasksCountResult,
      familyTasksCount: todoLists[0]._count.items - myTasksCountResult,
      firstItems: todoLists[0].items.map(i => i.content),
    } : null,
    choreSchedule: buildChoreSchedule(choreData, todayStart, 30),
    billsToPay: billsData.map((bill) => {
      const dueDate = new Date(bill.nextDueDate)
      const diffMs = dueDate.getTime() - todayStart.getTime()
      const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      return {
        id: bill.id,
        name: bill.name,
        amount: bill.amount,
        frequency: bill.frequency,
        nextDueDate: bill.nextDueDate.toISOString(),
        isOverdue: daysUntilDue < 0,
        daysUntilDue,
        autoPay: bill.autoPay,
      }
    }),
  }
}

export default async function HomePage() {
  const user = await requireSession()
  const timezone = user.timezone

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { uiPreferences: true },
  })

  // Parse dashboardCards, dashboardShoppingListId, dashboardTodoListId and dashboardCardLayouts from uiPreferences
  let dashboardCards: DashboardCardConfig[] | null = null
  let dashboardShoppingListId: string | null = null
  let dashboardTodoListId: string | null = null
  let dashboardCardLayouts: Record<string, { x: number; y: number; width: number; height: number | 'auto' }> | null = null
  let listOrder: string[] | null = null
  let dashboardScope: 7 | 14 | 30 = 7
  let dashboardChoreShowOnlyMine: boolean = false
  if (fullUser?.uiPreferences) {
    try {
      const prefs = JSON.parse(fullUser.uiPreferences)
      dashboardCards = prefs.dashboardCards ?? null
      dashboardShoppingListId = prefs.dashboardShoppingListId ?? null
      dashboardTodoListId = prefs.dashboardTodoListId ?? null
      dashboardCardLayouts = prefs.dashboardCardLayouts ?? null
      listOrder = Array.isArray(prefs.listOrder) ? prefs.listOrder : null
      if (prefs.dashboardScope && [7, 14, 30].includes(prefs.dashboardScope)) {
        dashboardScope = prefs.dashboardScope as 7 | 14 | 30
      }
      if (typeof prefs.dashboardChoreShowOnlyMine === 'boolean') {
        dashboardChoreShowOnlyMine = prefs.dashboardChoreShowOnlyMine
      }
    } catch {
      // ignore parse errors
    }
  }

  const cards = mergeDashboardCards(dashboardCards)
  const [data, availableTodoLists, availableShoppingLists] = await Promise.all([
    getDashboardData(user.familyId, timezone, cards, dashboardShoppingListId, (user.weekStartsOn ?? 0) as 0 | 1, user.id, dashboardTodoListId),
    prisma.list.findMany({
      where: { familyId: user.familyId, type: 'TODO', isActive: true },
      select: { id: true, name: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.list.findMany({
      where: { familyId: user.familyId, type: 'SHOPPING', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // Apply per-user list order to the todo list dropdown
  const orderedTodoLists = (listOrder
    ? [...availableTodoLists].sort((a, b) => {
        const ai = listOrder!.indexOf(a.id)
        const bi = listOrder!.indexOf(b.id)
        if (ai === -1 && bi === -1) return a.sortOrder - b.sortOrder
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    : availableTodoLists
  ).map(({ id, name }) => ({ id, name }))

  return (
    <HomeClient
      data={data}
      timezone={timezone}
      initialCards={cards}
      initialLayouts={dashboardCardLayouts}
      dashboardShoppingListId={dashboardShoppingListId}
      availableShoppingLists={availableShoppingLists}
      dashboardTodoListId={dashboardTodoListId}
      availableTodoLists={orderedTodoLists}
      dashboardScope={dashboardScope}
      dashboardChoreShowOnlyMine={dashboardChoreShowOnlyMine}
    />
  )
}
