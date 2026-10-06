/**
 * Pure, client-safe habit maths. Check-ins are YYYY-MM-DD local-calendar-date keys
 * (captured in the user's timezone at tick time), so everything here is plain
 * calendar arithmetic on keys — no timezone or DST handling is needed.
 */

const DAY_MS = 24 * 60 * 60 * 1000

const keyToMs = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDaysToKey(key: string, days: number): string {
  return new Date(keyToMs(key) + days * DAY_MS).toISOString().slice(0, 10)
}

/** First day of the week containing `key` (0 = Sunday, 1 = Monday). */
export function weekStartKey(key: string, weekStartsOn: 0 | 1 = 0): string {
  const dow = new Date(keyToMs(key)).getUTCDay()
  return addDaysToKey(key, -((dow - weekStartsOn + 7) % 7))
}

export const HABIT_NAME_MAX = 100

export function normalizeWeekStart(v: number | null | undefined): 0 | 1 {
  return v === 1 ? 1 : 0
}

export interface HabitStats {
  doneToday: boolean
  /** Check-ins in the current week */
  weekCount: number
  /** Weekly target, clamped to 1–7 */
  weekTarget: number
  /** Consecutive days (daily habits) or weeks meeting target (weekly habits) */
  streak: number
  streakUnit: 'day' | 'week'
}

/**
 * Daily habits (target 7): streak = consecutive days ending today, or yesterday
 * if today isn't ticked yet (an in-progress day never breaks a streak).
 * Weekly habits: streak = consecutive weeks that met the target; the current
 * week counts once met and never breaks the streak while still in progress.
 */
export function computeHabitStats({
  checkIns,
  targetPerWeek,
  today,
  weekStartsOn = 0,
}: {
  checkIns: string[]
  targetPerWeek: number
  today: string
  weekStartsOn?: 0 | 1
}): HabitStats {
  const days = new Set(checkIns)
  const weekTarget = Math.min(7, Math.max(1, Math.round(targetPerWeek)))
  const thisWeek = weekStartKey(today, weekStartsOn)
  const perWeek = new Map<string, number>()
  for (const d of days) {
    const w = weekStartKey(d, weekStartsOn)
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1)
  }
  const weekCount = perWeek.get(thisWeek) ?? 0

  let streak = 0
  if (weekTarget === 7) {
    let cursor = days.has(today) ? today : addDaysToKey(today, -1)
    while (days.has(cursor)) {
      streak++
      cursor = addDaysToKey(cursor, -1)
    }
  } else {
    if (weekCount >= weekTarget) streak++
    let cursor = addDaysToKey(thisWeek, -7)
    while ((perWeek.get(cursor) ?? 0) >= weekTarget) {
      streak++
      cursor = addDaysToKey(cursor, -7)
    }
  }

  return {
    doneToday: days.has(today),
    weekCount,
    weekTarget,
    streak,
    streakUnit: weekTarget === 7 ? 'day' : 'week',
  }
}

export interface HabitView extends HabitStats {
  id: string
  name: string
  targetPerWeek: number
  isActive: boolean
  emailReminder: boolean
  reminderHour: number
}
