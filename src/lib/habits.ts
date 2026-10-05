import { prisma } from '@/lib/prisma'
import { dateStringInTz, todayStringInTz } from '@/lib/timezone'
import { computeHabitStats, addDaysToKey, normalizeWeekStart, HABIT_NAME_MAX, type HabitView } from '@/lib/habit-helpers'
import type { SessionUser } from '@/types'

/** Server-only (imports prisma). Habits are personal: every query is scoped to familyId + userId. */

// Enough history for daily streaks to be accurate for a year.
const HISTORY_DAYS = 400
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export interface HabitCtx {
  familyId: string
  userId: string
  timezone: string
  weekStartsOn: 0 | 1
}

export function habitCtxFromUser(user: SessionUser): HabitCtx {
  return { familyId: user.familyId, userId: user.id, timezone: user.timezone ?? 'UTC', weekStartsOn: normalizeWeekStart(user.weekStartsOn) }
}

export interface HabitInput {
  name?: unknown
  targetPerWeek?: unknown
  isActive?: unknown
}

export type ParsedHabit = { name?: string; targetPerWeek?: number; isActive?: boolean }

/** Validates editable fields; returns an error string or the cleaned partial. */
export function parseHabitInput(input: HabitInput, requireName: boolean): { error: string } | { data: ParsedHabit } {
  const data: ParsedHabit = {}
  if (input.name !== undefined || requireName) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!name) return { error: 'Name is required' }
    if (name.length > HABIT_NAME_MAX) return { error: `Name must be ${HABIT_NAME_MAX} characters or fewer` }
    data.name = name
  }
  if (input.targetPerWeek !== undefined) {
    const t = input.targetPerWeek
    if (typeof t !== 'number' || !Number.isInteger(t) || t < 1 || t > 7) return { error: 'targetPerWeek must be a whole number from 1 to 7' }
    data.targetPerWeek = t
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') return { error: 'isActive must be a boolean' }
    data.isActive = input.isActive
  }
  return { data }
}

export async function listHabits(ctx: HabitCtx, opts: { includeInactive?: boolean } = {}): Promise<HabitView[]> {
  const today = todayStringInTz(ctx.timezone)
  const since = addDaysToKey(today, -HISTORY_DAYS)
  const habits = await prisma.habit.findMany({
    where: { familyId: ctx.familyId, userId: ctx.userId, ...(opts.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { checkIns: { where: { date: { gte: since } }, select: { date: true } } },
  })
  return habits.map((h) => ({
    id: h.id,
    name: h.name,
    targetPerWeek: h.targetPerWeek,
    isActive: h.isActive,
    ...computeHabitStats({
      checkIns: h.checkIns.map((c) => c.date),
      targetPerWeek: h.targetPerWeek,
      today,
      weekStartsOn: ctx.weekStartsOn,
    }),
  }))
}

export async function createHabit(ctx: HabitCtx, data: ParsedHabit & { name: string }) {
  const last = await prisma.habit.findFirst({
    where: { familyId: ctx.familyId, userId: ctx.userId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  return prisma.habit.create({
    data: {
      familyId: ctx.familyId,
      userId: ctx.userId,
      name: data.name,
      targetPerWeek: data.targetPerWeek ?? 7,
      isActive: data.isActive ?? true,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })
}

/** Returns null when the habit is not the caller's. */
export async function updateHabit(ctx: HabitCtx, id: string, data: ParsedHabit) {
  const existing = await prisma.habit.findFirst({ where: { id, familyId: ctx.familyId, userId: ctx.userId }, select: { id: true } })
  if (!existing) return null
  return prisma.habit.update({ where: { id }, data })
}

/** Returns false when the habit is not the caller's. Check-ins cascade. */
export async function deleteHabit(ctx: HabitCtx, id: string): Promise<boolean> {
  const { count } = await prisma.habit.deleteMany({ where: { id, familyId: ctx.familyId, userId: ctx.userId } })
  return count > 0
}

/**
 * Ticks or un-ticks a habit for a local calendar day (default today). Only today
 * and the previous 6 days are allowed: no future ticks, no deep back-filling.
 * Idempotent.
 */
export async function setHabitCheckIn(
  ctx: HabitCtx,
  habitId: string,
  done: boolean,
  date?: string
): Promise<'ok' | 'not-found' | 'bad-date'> {
  const today = todayStringInTz(ctx.timezone)
  const key = date ?? today
  // Round-trip rejects impossible dates such as 2026-02-31.
  if (!DATE_KEY_RE.test(key) || dateStringInTz(new Date(key + 'T12:00:00Z'), 'UTC') !== key) return 'bad-date'
  if (key > today || key < addDaysToKey(today, -6)) return 'bad-date'

  const habit = await prisma.habit.findFirst({ where: { id: habitId, familyId: ctx.familyId, userId: ctx.userId }, select: { id: true } })
  if (!habit) return 'not-found'

  if (done) {
    await prisma.habitCheckIn.upsert({
      where: { habitId_date: { habitId, date: key } },
      create: { habitId, date: key },
      update: {},
    })
  } else {
    await prisma.habitCheckIn.deleteMany({ where: { habitId, date: key } })
  }
  return 'ok'
}
