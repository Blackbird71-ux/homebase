import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  event: vi.fn(),
  chore: vi.fn(),
  listItem: vi.fn(),
  mealPlan: vi.fn(),
  habit: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    event: { findMany: m.event },
    chore: { findMany: m.chore },
    listItem: { findMany: m.listItem },
    mealPlan: { findMany: m.mealPlan },
    habit: { findMany: m.habit },
  },
}))
vi.mock('@/lib/image-cache', () => ({ getLocalImageUrl: (v: string | null) => v }))

import { getTodayData } from './today-data'
import { todayBoundsInTz } from './timezone'

const TZ = 'Australia/Sydney'
const base = { familyId: 'fam', userId: 'u1', timezone: TZ }

beforeEach(() => {
  vi.clearAllMocks()
  m.event.mockResolvedValue([])
  m.chore.mockResolvedValue([])
  m.listItem.mockResolvedValue([])
  m.mealPlan.mockResolvedValue([])
  m.habit.mockResolvedValue([])
})

describe('getTodayData', () => {
  it('scopes events, chores and to-dos to the user for "mine"', async () => {
    await getTodayData({ ...base, scope: 'mine' })
    expect(m.event.mock.calls[0][0].where.OR).toEqual([{ createdBy: 'u1' }, { attendees: { some: { userId: 'u1' } } }])
    expect(m.chore.mock.calls[0][0].where.currentAssigneeId).toBe('u1')
    expect(m.listItem.mock.calls[0][0].where.assignedToUserId).toBe('u1')
    expect(m.event.mock.calls[0][0].where.familyId).toBe('fam')
  })

  it('does not narrow by user for "family"', async () => {
    await getTodayData({ ...base, scope: 'family' })
    expect(m.event.mock.calls[0][0].where.OR).toBeUndefined()
    expect(m.chore.mock.calls[0][0].where.currentAssigneeId).toBeUndefined()
    expect(m.listItem.mock.calls[0][0].where.assignedToUserId).toBeUndefined()
  })

  it('flags overdue chores and to-dos relative to local midnight', async () => {
    const { start } = todayBoundsInTz(TZ)
    m.chore.mockResolvedValue([
      { id: 'a', title: 'Overdue', nextDueDate: new Date(start.getTime() - 3600_000), currentAssignee: null },
      { id: 'b', title: 'Today', nextDueDate: start, currentAssignee: { name: 'Sam' } },
      { id: 'c', title: 'Due now', nextDueDate: null, currentAssignee: null },
    ])
    m.listItem.mockResolvedValue([
      { id: 'i', content: 'x', dueDate: new Date(start.getTime() - 1), listId: 'l', list: { name: 'L' }, assignedToUser: null },
      { id: 'j', content: 'y', dueDate: start, listId: 'l', list: { name: 'L' }, assignedToUser: null },
    ])
    const data = await getTodayData({ ...base, scope: 'family' })
    expect(data.chores.map((c) => c.isOverdue)).toEqual([true, false, true])
    expect(data.todos.map((t) => t.isOverdue)).toEqual([true, false])
  })

  it('always returns only the users own active habits, even for "family"', async () => {
    m.habit.mockResolvedValue([{ id: 'h1', name: 'Walk', targetPerWeek: 7, isActive: true, checkIns: [] }])
    const data = await getTodayData({ ...base, scope: 'family' })
    expect(m.habit.mock.calls[0][0].where).toEqual({ familyId: 'fam', userId: 'u1', isActive: true })
    expect(data.habits).toMatchObject([{ id: 'h1', doneToday: false, weekTarget: 7 }])
  })

  it('keeps events on today (local) and drops ones that ended before local midnight', async () => {
    const { start, end } = todayBoundsInTz(TZ)
    const ev = (id: string, s: Date, e: Date) => ({
      id, title: id, start: s, end: e, isAllDay: false, color: null, location: null,
      isRecurring: false, recurrenceRule: null, recurrenceEndDate: null, recurrenceExceptions: null,
    })
    m.event.mockResolvedValue([
      ev('today', new Date(start.getTime() + 9 * 3600_000), new Date(start.getTime() + 10 * 3600_000)),
      ev('yesterday', new Date(start.getTime() - 5 * 3600_000), new Date(start.getTime() - 4 * 3600_000)),
      ev('tomorrow', new Date(end.getTime() + 3600_000), new Date(end.getTime() + 7200_000)),
    ])
    const data = await getTodayData({ ...base, scope: 'family' })
    expect(data.events.map((e) => e.id)).toEqual(['today'])
  })
})
