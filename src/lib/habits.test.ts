import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  habitFindFirst: vi.fn(),
  habitDeleteMany: vi.fn(),
  upsert: vi.fn(),
  checkInDeleteMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    habit: { findFirst: m.habitFindFirst, deleteMany: m.habitDeleteMany },
    habitCheckIn: { upsert: m.upsert, deleteMany: m.checkInDeleteMany },
  },
}))

import { parseHabitInput, setHabitCheckIn, deleteHabit } from './habits'
import { todayStringInTz } from './timezone'
import { addDaysToKey } from './habit-helpers'

const TZ = 'Australia/Sydney'
const ctx = { familyId: 'fam', userId: 'u1', timezone: TZ, weekStartsOn: 0 as const }

beforeEach(() => {
  vi.clearAllMocks()
  m.habitFindFirst.mockResolvedValue({ id: 'h1' })
  m.habitDeleteMany.mockResolvedValue({ count: 1 })
})

describe('parseHabitInput', () => {
  it('requires a trimmed name on create', () => {
    expect(parseHabitInput({}, true)).toEqual({ error: 'Name is required' })
    expect(parseHabitInput({ name: '   ' }, true)).toEqual({ error: 'Name is required' })
    expect(parseHabitInput({ name: ' Walk ' }, true)).toEqual({ data: { name: 'Walk' } })
  })

  it('allows partial updates without a name', () => {
    expect(parseHabitInput({ isActive: false }, false)).toEqual({ data: { isActive: false } })
  })

  it('rejects out-of-range or non-integer targets', () => {
    for (const t of [0, 8, 2.5, '3']) expect('error' in parseHabitInput({ name: 'x', targetPerWeek: t }, true)).toBe(true)
    expect(parseHabitInput({ name: 'x', targetPerWeek: 3 }, true)).toEqual({ data: { name: 'x', targetPerWeek: 3 } })
  })

  it('validates email reminder fields', () => {
    expect(parseHabitInput({ emailReminder: true, reminderHour: 18 }, false)).toEqual({ data: { emailReminder: true, reminderHour: 18 } })
    expect('error' in parseHabitInput({ emailReminder: 'yes' }, false)).toBe(true)
    for (const h of [-1, 24, 7.5, '8']) expect('error' in parseHabitInput({ reminderHour: h }, false)).toBe(true)
  })
})

describe('setHabitCheckIn', () => {
  const today = todayStringInTz(TZ)

  it('scopes the habit lookup to family and user', async () => {
    await setHabitCheckIn(ctx, 'h1', true)
    expect(m.habitFindFirst.mock.calls[0][0].where).toEqual({ id: 'h1', familyId: 'fam', userId: 'u1' })
  })

  it('upserts on tick and deletes on untick', async () => {
    expect(await setHabitCheckIn(ctx, 'h1', true)).toBe('ok')
    expect(m.upsert.mock.calls[0][0].where).toEqual({ habitId_date: { habitId: 'h1', date: today } })
    expect(await setHabitCheckIn(ctx, 'h1', false)).toBe('ok')
    expect(m.checkInDeleteMany).toHaveBeenCalledWith({ where: { habitId: 'h1', date: today } })
  })

  it('rejects future, too-old, malformed and impossible dates', async () => {
    for (const d of [addDaysToKey(today, 1), addDaysToKey(today, -7), '2026-13-01', '2026-02-31', 'nope']) {
      expect(await setHabitCheckIn(ctx, 'h1', true, d)).toBe('bad-date')
    }
    expect(m.upsert).not.toHaveBeenCalled()
  })

  it('accepts yesterday and returns not-found for another user\'s habit', async () => {
    expect(await setHabitCheckIn(ctx, 'h1', true, addDaysToKey(today, -1))).toBe('ok')
    m.habitFindFirst.mockResolvedValue(null)
    expect(await setHabitCheckIn(ctx, 'other', true)).toBe('not-found')
  })
})

describe('deleteHabit', () => {
  it('deletes only the caller\'s habit and reports whether one matched', async () => {
    expect(await deleteHabit(ctx, 'h1')).toBe(true)
    expect(m.habitDeleteMany).toHaveBeenCalledWith({ where: { id: 'h1', familyId: 'fam', userId: 'u1' } })
    m.habitDeleteMany.mockResolvedValue({ count: 0 })
    expect(await deleteHabit(ctx, 'x')).toBe(false)
  })
})
