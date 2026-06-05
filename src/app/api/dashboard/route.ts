import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { SessionUser } from '@/types'
import { getLocalImageUrl } from '@/lib/image-cache'
import { todayBoundsInTz, addLocalDays } from '@/lib/timezone'
import { buildChoreSchedule } from '@/lib/chore-helpers'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import type { DashboardData, TodaysMeal } from '@/types'

function normalizeToUtcMidnight(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z')
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export async function GET(request: NextRequest) {
  const session = await auth()
  const user = session?.user as SessionUser | undefined
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const timezone = user.timezone ?? 'UTC'
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
  const now = new Date()

  // Parse optional query params
  const { searchParams } = new URL(request.url)
  const scopeParam = searchParams.get('scope')
  const scope = scopeParam === '14' ? 14 : scopeParam === '30' ? 30 : 7
  const dashboardTodoListId = searchParams.get('dashboardTodoListId')
  const dashboardShoppingListId = searchParams.get('dashboardShoppingListId')
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
  const weekEndDate = new Date(todayStart.getTime() + scope * 24 * 60 * 60 * 1000)

  const [
    upcomingEvents,
    todayMealPlans,
    tomorrowMealPlans,
    shoppingLists,
    todoLists,
    myTasksCountResult,
    weekEvents,
    weekMeals,
    weekTodos,
    choreData,
    billsData,
    tripsData,
  ] = await Promise.all([
    prisma.event.findMany({
      where: {
        familyId: user.familyId,
        OR: [
          { start: { gte: todayStart }, isRecurring: false },
          { isRecurring: true },
        ],
      },
      orderBy: { start: 'asc' },
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
      where: {
        familyId: user.familyId,
        type: 'SHOPPING',
        isActive: true,
        ...(dashboardShoppingListId ? { id: dashboardShoppingListId } : {}),
      },
      include: {
        items: { where: { isCompleted: false }, orderBy: { sortOrder: 'asc' }, take: 10, select: { content: true } },
        _count: { select: { items: { where: { isCompleted: false } } } },
      },
      ...(dashboardShoppingListId ? {} : { take: 1 }),
    }),
    prisma.list.findMany({
      where: {
        familyId: user.familyId,
        type: 'TODO',
        isActive: true,
        ...(dashboardTodoListId ? { id: dashboardTodoListId } : {}),
      },
      include: {
        items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: weekEnd } }, orderBy: { dueDate: 'asc' }, take: 10, select: { content: true, assignedToUserId: true } },
        _count: { select: { items: { where: { isCompleted: false, dueDate: { gte: todayStart, lt: todayEnd } } } } },
      },
      ...(dashboardTodoListId ? {} : { take: 1 }),
    }),
    // Count tasks assigned to current user
    prisma.listItem.count({
      where: {
        list: {
          familyId: user.familyId,
          type: 'TODO',
          isActive: true,
          ...(dashboardTodoListId ? { id: dashboardTodoListId } : {}),
        },
        isCompleted: false,
        dueDate: { gte: todayStart, lt: todayEnd },
        assignedToUserId: user.id,
      },
    }).catch(() => 0),
    // Weekly summary: events this week
    prisma.event.findMany({
      where: {
        familyId: user.familyId,
        OR: [
          { start: { gte: weekStart, lt: weekEndDate }, isRecurring: false },
          { isRecurring: true },
        ],
      },
      orderBy: { start: 'asc' },
      select: { id: true, title: true, start: true, end: true, color: true, isRecurring: true, recurrenceRule: true, recurrenceEndDate: true },
    }),
    // Weekly summary: meals this week (scoped to 7/14/30 days)
    prisma.mealPlan.findMany({
      where: { familyId: user.familyId, date: { gte: weekStart, lt: weekEndDate } },
      include: {
        recipe: { select: { id: true, title: true, description: true } },
        recipes: { include: { recipe: { select: { id: true, title: true, description: true } } }, orderBy: { order: 'asc' } },
      },
      orderBy: { date: 'asc' },
    }),

    // Weekly summary: pending todos this week
    prisma.listItem.findMany({
      where: {
        list: {
          familyId: user.familyId,
          type: 'TODO',
          isActive: true,
          ...(dashboardTodoListId ? { id: dashboardTodoListId } : {}),
        },
        isCompleted: false,
        dueDate: { gte: weekStart, lt: weekEndDate },
      },
      orderBy: { dueDate: 'asc' },
      take: 5,
      select: { content: true },
    }),
    // Chore data for chore schedule card — OR ensures overdue chores are always included
    prisma.chore.findMany({
      where: {
        familyId: user.familyId,
        isActive: true,
        OR: [
          { nextDueDate: { lt: todayStart } },
          { nextDueDate: { gte: todayStart, lte: addLocalDays(todayStart, 30, timezone) } },
        ],
      },
      include: {
        currentAssignee: { select: { id: true, name: true } },
        completions: {
          orderBy: { completedAt: 'desc' },
          take: 1,
          include: { completedBy: { select: { id: true, name: true } } },
        },
      },
      orderBy: { nextDueDate: 'asc' },
    }),
    // Bills data for bills-to-pay card
    prisma.financeRecurringBill.findMany({
      where: {
        familyId: user.familyId,
        isActive: true,
        paid: false,
        nextDueDate: { lte: new Date(mealPlanTodayStart.getTime() + 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { nextDueDate: 'asc' },
      select: { id: true, name: true, amount: true, frequency: true, nextDueDate: true, autoPay: true, payments: { select: { amount: true } } },
    }),
    // Trips — fetch upcoming trips for dashboard card
    prisma.trip.findMany({
      where: {
        familyId: user.familyId,
        status: { notIn: ['cancelled', 'completed'] },
        endDate: { gte: now },
      },
      orderBy: { startDate: 'asc' },
      take: 10,
      include: {
        packingList: {
          select: {
            items: {
              where: { isCompleted: false },
              select: { id: true },
            },
          },
        },
      },
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
  const expandedWeekEvents = (() => {
    const result = weekEvents.flatMap(e => {
      if (e.isRecurring && e.recurrenceRule) {
        return generateRecurrenceInstances(e.start, e.end, e.recurrenceRule, e.recurrenceEndDate, weekStart, weekEndDate, timezone)
          .map(inst => ({ ...e, start: inst.start, end: inst.end }))
      }
      return [e]
    })
    return result
      .filter(e => e.start >= weekStart && e.start < weekEndDate)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 5)
  })()

  const fmtDay   = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
  const fmtShort = new Intl.DateTimeFormat('en-AU', { timeZone: timezone, day: 'numeric', month: 'short' })
  const fmtLong  = new Intl.DateTimeFormat('en-AU', { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric' })
  const weekLabelEnd = new Date(weekEndDate.getTime() - 86_400_000)
  const weeklySummary = {
    weekLabel: `${fmtShort.format(weekStart)} - ${fmtLong.format(weekLabelEnd)}`,
    eventCount: expandedWeekEvents.length,
    mealCount: weekMeals.length,
    pendingTodoCount: weekTodos.length,
    topEvents: expandedWeekEvents.map(e => ({
      id: e.id,
      title: e.title,
      start: e.start.toISOString(),
      color: e.color,
      dayLabel: fmtDay.format(e.start),
    })),
    topMeals: [...weekMeals]
      .sort((a, b) => {
        const dateDiff = a.date.getTime() - b.date.getTime()
        if (dateDiff !== 0) return dateDiff
        const mealOrder = ['breakfast', 'lunch', 'dinner', 'snacks']
        return mealOrder.indexOf(a.mealType) - mealOrder.indexOf(b.mealType)
      })
      .map(m => {
        const recipeName = m.recipes?.[0]?.recipe?.title ?? m.recipe?.title ?? m.note ?? m.mealType
        const recipeNote = m.recipes?.[0]?.recipe?.description ?? m.recipe?.description ?? m.note ?? null
        const note = recipeNote && recipeNote !== recipeName ? recipeNote : null
        return { day: fmtDay.format(m.date), meal: recipeName, note }
      }),

    topTodos: weekTodos.map(t => t.content),
  }

  const data: DashboardData = {
    weeklySummary,
    upcomingEvents: (() => {
      const windowEnd = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000)
      const expanded = upcomingEvents.flatMap(e => {
        if (e.isRecurring && e.recurrenceRule) {
          return generateRecurrenceInstances(e.start, e.end, e.recurrenceRule, e.recurrenceEndDate, todayStart, windowEnd, timezone)
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
          myTasksCount: myTasksCountResult,
          familyTasksCount: todoLists[0]._count.items - myTasksCountResult,
          firstItems: todoLists[0].items.map(i => i.content),
        }
      : null,
    choreSchedule: buildChoreSchedule(choreData, todayStart, todayEnd, timezone, 30),
    trips: tripsData.map((trip) => ({
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      departureLocation: trip.departureLocation ?? null,
      startDate: trip.startDate.toISOString(),
      endDate: trip.endDate.toISOString(),
      status: trip.status,
      color: trip.color,
      icon: trip.icon,
      packingList: trip.packingList
        ? { pendingItems: trip.packingList.items.length }
        : null,
    })),
    billsToPay: billsData.map((bill) => {
      const dueDate = new Date(bill.nextDueDate)
      const diffMs = dueDate.getTime() - mealPlanTodayStart.getTime()
      const daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24))
      const totalPaid = bill.payments?.reduce((s: number, p: { amount: number }) => s + p.amount, 0) ?? 0
      const remainingBalance = Math.max(0, bill.amount - totalPaid)
      return {
        id: bill.id,
        name: bill.name,
        amount: bill.amount,
        frequency: bill.frequency,
        nextDueDate: bill.nextDueDate.toISOString(),
        isOverdue: daysUntilDue < 0,
        daysUntilDue,
        autoPay: bill.autoPay,
        remainingBalance,
      }
    }),
  }

  return NextResponse.json(data)
}