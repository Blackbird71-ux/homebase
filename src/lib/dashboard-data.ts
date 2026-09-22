import { prisma } from '@/lib/prisma'
import { getLocalImageUrl } from '@/lib/image-cache'
import { todayBoundsInTz, todayStringInTz, formatInTz } from '@/lib/timezone'
import { buildChoreSchedule, choreScheduleWhere } from '@/lib/chore-helpers'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import { liveBillWhere } from '@/lib/finance-live-filter'
import { getPinnedNotes } from '@/lib/pinned-notes'
import { getCalendarWeekEvents } from '@/lib/calendar-week'
import { getStickyNotes, EMPTY_STICKY_NOTES } from '@/lib/sticky-note'
import type { DashboardData, TodaysMeal, WeeklySummaryData } from '@/types'

const DAY_MS = 24 * 60 * 60 * 1000
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks']

export interface DashboardDataOptions {
  familyId: string
  userId: string
  timezone: string
  /** Weekly-summary window in days. */
  scope: 7 | 14 | 30
  dashboardShoppingListId?: string | null
  dashboardTodoListId?: string | null
  /**
   * Card ids currently visible. Data is only fetched for these cards.
   * Omit to fetch everything (the client refetch after Customise needs data
   * for cards that were just switched on).
   */
  visibleCardIds?: ReadonlySet<string>
}

/**
 * Build the home dashboard data. The single source of truth for both the SSR
 * home page (first paint) and GET /api/dashboard (client refresh), so a card
 * looks the same before and after a refresh.
 *
 * Server-only (imports prisma).
 */
export async function getDashboardData({
  familyId,
  userId,
  timezone,
  scope,
  dashboardShoppingListId,
  dashboardTodoListId,
  visibleCardIds,
}: DashboardDataOptions): Promise<DashboardData> {
  const wants = (...ids: string[]) => !visibleCardIds || ids.some((id) => visibleCardIds.has(id))
  const needsWeekly = wants('weekly-summary')
  const needsEvents = wants('upcoming-events', 'weekly-summary')
  const needsMeals = wants('todays-meals', 'tomorrows-meals', 'weekly-summary')
  const needsShopping = wants('shopping-list')
  const needsTodo = wants('todo-summary', 'weekly-summary')
  const needsChores = wants('chore-schedule')
  const needsBills = wants('bills-to-pay')
  const needsTrips = wants('upcoming-trips')
  const needsNotes = wants('pinned-notes')
  const needsCalendarWeek = wants('calendar-week')
  const needsStickyNote = wants('sticky-note', 'sticky-note-personal')

  // Instant boundaries in the family's timezone (events, to-do due dates, chores)
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
  const weekEnd = new Date(todayStart.getTime() + 7 * DAY_MS)
  const weekStartUtc = todayStart
  const weekEndUtc = new Date(todayStart.getTime() + scope * DAY_MS)

  // Date-key boundaries: meal plans, bills and trips store calendar dates as UTC
  // midnight, so "today" for them is the local date at UTC midnight.
  const todayStr = todayStringInTz(timezone)
  const todayKey = new Date(todayStr + 'T00:00:00Z')
  const tomorrowKey = new Date(todayKey.getTime() + DAY_MS)
  const dayAfterKey = new Date(tomorrowKey.getTime() + DAY_MS)
  const scopeEndKey = new Date(todayKey.getTime() + scope * DAY_MS)

  const fmtKey = (key: Date) => formatInTz(key, 'UTC', { day: 'numeric', month: 'short' })
  const weekLabel = `${fmtKey(todayKey)} – ${fmtKey(new Date(scopeEndKey.getTime() - DAY_MS))}`

  const mealPlanInclude = {
    recipe: { select: { id: true, title: true, image: true, description: true } },
    recipes: {
      include: { recipe: { select: { id: true, title: true, image: true, description: true } } },
      orderBy: { order: 'asc' as const },
    },
  }

  const [upcomingEvents, todayMealPlans, tomorrowMealPlans, shoppingLists, todoLists, myTasksCountResult, weekEvents, weekMealPlans, weekTodoLists, choreData, billsData, tripsData, pinnedNotesData, calendarWeekData, stickyNotesData] = await Promise.all([
    needsEvents
      ? prisma.event.findMany({
          where: {
            familyId,
            OR: [
              { start: { gte: todayStart }, isRecurring: false },
              { isRecurring: true },
            ],
          },
          orderBy: { start: 'asc' },
        })
      : Promise.resolve([]),
    needsMeals
      ? prisma.mealPlan.findMany({
          where: { familyId, date: { gte: todayKey, lt: tomorrowKey } },
          include: mealPlanInclude,
        })
      : Promise.resolve([]),
    needsMeals
      ? prisma.mealPlan.findMany({
          where: { familyId, date: { gte: tomorrowKey, lt: dayAfterKey } },
          include: mealPlanInclude,
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
            items: { where: { isCompleted: false }, orderBy: { sortOrder: 'asc' }, take: 10, select: { content: true } },
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
            items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: weekEnd } }, orderBy: { dueDate: 'asc' }, take: 10, select: { content: true, assignedToUserId: true } },
            _count: { select: { items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: todayEnd } } } } },
          },
          ...(dashboardTodoListId ? {} : { take: 1 }),
        })
      : Promise.resolve([]),
    needsTodo
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
    needsWeekly
      ? prisma.event.findMany({
          where: {
            familyId,
            OR: [
              { start: { gte: weekStartUtc, lt: weekEndUtc }, isRecurring: false },
              { isRecurring: true },
            ],
          },
          orderBy: { start: 'asc' },
          select: { id: true, title: true, start: true, end: true, color: true, isRecurring: true, recurrenceRule: true, recurrenceEndDate: true, recurrenceExceptions: true },
        })
      : Promise.resolve([]),
    needsWeekly
      ? prisma.mealPlan.findMany({
          where: { familyId, date: { gte: todayKey, lt: scopeEndKey } },
          include: {
            recipe: { select: { id: true, title: true, description: true } },
            recipes: { include: { recipe: { select: { id: true, title: true, description: true } } }, orderBy: { order: 'asc' } },
          },
          orderBy: { date: 'asc' },
        })
      : Promise.resolve([]),
    needsWeekly
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
          where: choreScheduleWhere(familyId, todayStart, 30, timezone),
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
            nextDueDate: { lte: new Date(todayKey.getTime() + 30 * DAY_MS) },
            ...liveBillWhere,
          },
          orderBy: { nextDueDate: 'asc' },
          select: { id: true, name: true, amount: true, frequency: true, nextDueDate: true, autoPay: true, payments: { select: { amount: true } } },
        })
      : Promise.resolve([]),
    needsTrips
      ? prisma.trip.findMany({
          where: {
            familyId,
            status: { notIn: ['cancelled', 'completed'] },
            endDate: { gte: todayKey },
          },
          orderBy: { startDate: 'asc' },
          take: 10,
          select: {
            id: true, title: true, destination: true,
            departureLocation: true,
            startDate: true, endDate: true, status: true,
            color: true, icon: true,
            packingList: { select: { items: { where: { isCompleted: false }, select: { id: true } } } },
          },
        })
      : Promise.resolve([]),
    needsNotes
      ? getPinnedNotes(familyId, userId)
      : Promise.resolve([]),
    needsCalendarWeek
      ? getCalendarWeekEvents(familyId, timezone)
      : Promise.resolve([]),
    needsStickyNote
      ? getStickyNotes(familyId, userId)
      : Promise.resolve(EMPTY_STICKY_NOTES),
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
  const expandedWeekEvents = weekEvents
    .flatMap(e => {
      if (e.isRecurring && e.recurrenceRule) {
        return generateRecurrenceInstances(e.start, e.end, e.recurrenceRule, e.recurrenceEndDate, weekStartUtc, weekEndUtc, timezone, e.recurrenceExceptions)
          .map(inst => ({ ...e, start: inst.start, end: inst.end }))
      }
      return [e]
    })
    .filter(e => e.start >= weekStartUtc && e.start < weekEndUtc)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const weeklySummary: WeeklySummaryData | null = needsWeekly
    ? {
        weekLabel,
        eventCount: expandedWeekEvents.length, // full count; only the first 3 are listed
        mealCount: weekMealPlans.length,
        pendingTodoCount: weekTodoLists[0]?._count?.items ?? 0,
        topEvents: expandedWeekEvents.slice(0, 3).map(e => ({
          id: e.id,
          title: e.title,
          start: e.start.toISOString(),
          color: e.color,
          dayLabel: formatInTz(e.start, timezone, { weekday: 'short' }),
        })),
        topMeals: [...weekMealPlans]
          .sort((a, b) =>
            a.date.getTime() - b.date.getTime() ||
            MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType))
          .slice(0, 5)
          .map(mp => {
            const recipeName = mp.recipes?.[0]?.recipe?.title ?? mp.recipe?.title ?? mp.note ?? 'Planned'
            const recipeNote = mp.recipes?.[0]?.recipe?.description ?? mp.recipe?.description ?? mp.note ?? null
            // Use the recipe description as the note shown under the meal name (same as Today's Meals does)
            const note = recipeNote && recipeNote !== recipeName ? recipeNote : null
            // Meal plan dates are UTC-midnight date keys — label them in UTC
            return { day: formatInTz(mp.date, 'UTC', { weekday: 'short' }), meal: recipeName, note }
          }),
        topTodos: weekTodoLists[0]?.items?.map(i => i.content) ?? [],
      }
    : null

  return {
    weeklySummary,
    upcomingEvents: (() => {
      const windowEnd = new Date(todayStart.getTime() + 30 * DAY_MS)
      const expanded = upcomingEvents.flatMap(e => {
        if (e.isRecurring && e.recurrenceRule) {
          return generateRecurrenceInstances(e.start, e.end, e.recurrenceRule, e.recurrenceEndDate, todayStart, windowEnd, timezone, e.recurrenceExceptions)
            .map(inst => ({ ...e, start: inst.start, end: inst.end }))
        }
        return [e]
      })
      return expanded
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .slice(0, 5)
        .map(e => ({
          id: e.id, title: e.title,
          start: e.start.toISOString(), end: e.end.toISOString(),
          isAllDay: e.isAllDay, category: e.category, color: e.color,
        }))
    })(),
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
    choreSchedule: buildChoreSchedule(choreData, todayStart, todayEnd, timezone, 30),
    billsToPay: billsData.map((bill) => {
      // nextDueDate is a UTC-midnight date key; count whole calendar days from today's key
      const daysUntilDue = Math.round((bill.nextDueDate.getTime() - todayKey.getTime()) / DAY_MS)
      const totalPaid = bill.payments.reduce((s, p) => s + p.amount, 0)
      return {
        id: bill.id,
        name: bill.name,
        amount: bill.amount,
        frequency: bill.frequency,
        nextDueDate: bill.nextDueDate.toISOString(),
        isOverdue: daysUntilDue < 0,
        daysUntilDue,
        autoPay: bill.autoPay,
        remainingBalance: Math.max(0, bill.amount - totalPaid),
      }
    }),
    pinnedNotes: pinnedNotesData,
    calendarWeek: calendarWeekData,
    stickyNotes: stickyNotesData,
    trips: tripsData.map(t => ({
      id: t.id,
      title: t.title,
      destination: t.destination,
      departureLocation: t.departureLocation ?? null,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      status: t.status,
      color: t.color,
      icon: t.icon,
      packingList: t.packingList ? { pendingItems: t.packingList.items.length } : null,
    })),
  }
}
