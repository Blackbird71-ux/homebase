import { prisma } from '@/lib/prisma'
import { getLocalImageUrl } from '@/lib/image-cache'
import { todayBoundsInTz, todayStringInTz } from '@/lib/timezone'
import { generateRecurrenceInstances } from '@/lib/recurrence'
import { eventFallsOnDay } from '@/lib/event-helpers'
import { listHabits } from '@/lib/habits'
import type { HabitView } from '@/lib/habit-helpers'
import type { CalendarEvent } from '@/types'

export type TodayScope = 'mine' | 'family'

export interface TodayEvent {
  id: string
  title: string
  start: string
  end: string
  isAllDay: boolean
  color: string | null
  location: string | null
}

export interface TodayChore {
  id: string
  title: string
  isOverdue: boolean
  assigneeName: string | null
}

export interface TodayTodo {
  id: string
  content: string
  listId: string
  listName: string
  isOverdue: boolean
  assigneeName: string | null
}

export interface TodayMeal {
  id: string
  mealType: string
  name: string
  recipeId: string | null
  image: string | null
}

export interface TodayData {
  scope: TodayScope
  /** YYYY-MM-DD in the user's timezone */
  date: string
  events: TodayEvent[]
  chores: TodayChore[]
  todos: TodayTodo[]
  meals: TodayMeal[]
  /** The user's own active habits; always personal, whatever the scope. */
  habits: HabitView[]
}

const DAY_MS = 24 * 60 * 60 * 1000
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snacks']

/**
 * Everything happening today: events, chores due/overdue, to-dos due/overdue and
 * today's meals. `mine` narrows events (created by / attending), chores
 * (assigned) and to-dos (assigned) to the user; meals are always household-wide.
 *
 * Server-only (imports prisma). Boundaries come from todayBoundsInTz; meal-plan
 * dates are UTC-midnight date keys, so they use the local date string at UTC midnight.
 */
export async function getTodayData({
  familyId,
  userId,
  timezone,
  scope,
  weekStartsOn = 0,
}: {
  familyId: string
  userId: string
  timezone: string
  scope: TodayScope
  weekStartsOn?: 0 | 1
}): Promise<TodayData> {
  const mine = scope === 'mine'
  const { start: todayStart, end: todayEnd } = todayBoundsInTz(timezone)
  const todayStr = todayStringInTz(timezone)
  const todayKey = new Date(todayStr + 'T00:00:00Z')
  const tomorrowKey = new Date(todayKey.getTime() + DAY_MS)

  const [events, chores, todoItems, mealPlans, habits] = await Promise.all([
    prisma.event.findMany({
      where: {
        familyId,
        ...(mine ? { OR: [{ createdBy: userId }, { attendees: { some: { userId } } }] } : {}),
        // overlapping today, or recurring (expanded below)
        AND: [
          {
            OR: [
              { isRecurring: true },
              { start: { lt: todayEnd }, end: { gte: todayStart } },
            ],
          },
        ],
      },
      orderBy: { start: 'asc' },
    }),
    prisma.chore.findMany({
      where: {
        familyId,
        isActive: true,
        // null = due now; < todayEnd = overdue or due today
        OR: [{ nextDueDate: null }, { nextDueDate: { lt: todayEnd } }],
        ...(mine ? { currentAssigneeId: userId } : {}),
      },
      select: {
        id: true,
        title: true,
        nextDueDate: true,
        currentAssignee: { select: { name: true } },
      },
      orderBy: { nextDueDate: 'asc' },
    }),
    prisma.listItem.findMany({
      where: {
        isCompleted: false,
        dueDate: { lt: todayEnd },
        list: { familyId, type: 'TODO', isActive: true },
        ...(mine ? { assignedToUserId: userId } : {}),
      },
      select: {
        id: true,
        content: true,
        dueDate: true,
        listId: true,
        list: { select: { name: true } },
        assignedToUser: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.mealPlan.findMany({
      where: { familyId, date: { gte: todayKey, lt: tomorrowKey } },
      include: {
        recipe: { select: { id: true, title: true, image: true } },
        recipes: {
          include: { recipe: { select: { id: true, title: true, image: true } } },
          orderBy: { order: 'asc' },
        },
      },
    }),
    listHabits({ familyId, userId, timezone, weekStartsOn }),
  ])

  const todayEvents = events
    .flatMap((e) => {
      if (e.isRecurring && e.recurrenceRule) {
        return generateRecurrenceInstances(
          e.start, e.end, e.recurrenceRule, e.recurrenceEndDate,
          todayStart, todayEnd, timezone, e.recurrenceExceptions
        ).map((inst) => ({ ...e, start: inst.start, end: inst.end }))
      }
      return e.isRecurring ? [] : [e]
    })
    .filter((e) =>
      eventFallsOnDay(
        { start: e.start.toISOString(), end: e.end.toISOString(), isAllDay: e.isAllDay } as CalendarEvent,
        todayStart,
        timezone
      )
    )
    // all-day first, then by start time
    .sort((a, b) => Number(b.isAllDay) - Number(a.isAllDay) || a.start.getTime() - b.start.getTime())
    .map((e): TodayEvent => ({
      id: e.id,
      title: e.title,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      isAllDay: e.isAllDay,
      color: e.color,
      location: e.location,
    }))

  return {
    scope,
    date: todayStr,
    events: todayEvents,
    chores: chores.map((c): TodayChore => ({
      id: c.id,
      title: c.title,
      isOverdue: !c.nextDueDate || c.nextDueDate < todayStart,
      assigneeName: c.currentAssignee?.name ?? null,
    })),
    todos: todoItems.map((i): TodayTodo => ({
      id: i.id,
      content: i.content,
      listId: i.listId,
      listName: i.list.name,
      isOverdue: !!i.dueDate && i.dueDate < todayStart,
      assigneeName: i.assignedToUser?.name ?? null,
    })),
    habits,
    meals: [...mealPlans]
      .sort((a, b) => MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType))
      .map((m): TodayMeal => {
        const recipes = m.recipes.length > 0 ? m.recipes.map((r) => r.recipe) : m.recipe ? [m.recipe] : []
        const names = recipes.map((r) => r?.title).filter(Boolean).join(' & ')
        return {
          id: m.id,
          mealType: m.mealType,
          name: names || m.note || 'Planned',
          recipeId: recipes[0]?.id ?? null,
          image: getLocalImageUrl(recipes[0]?.image ?? null),
        }
      }),
  }
}
