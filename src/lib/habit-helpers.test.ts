import { describe, it, expect } from 'vitest'
import { addDaysToKey, weekStartKey, computeHabitStats } from './habit-helpers'

describe('date-key arithmetic', () => {
  it('adds days across month/year boundaries', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('is unaffected by Australian DST transitions (Oct/Apr)', () => {
    expect(addDaysToKey('2026-10-03', 1)).toBe('2026-10-04') // DST starts 4 Oct 2026
    expect(addDaysToKey('2026-10-04', 1)).toBe('2026-10-05')
    expect(addDaysToKey('2026-04-04', 1)).toBe('2026-04-05') // DST ends 5 Apr 2026
    expect(addDaysToKey('2026-04-05', 1)).toBe('2026-04-06')
  })

  it('finds the week start for Sunday and Monday weeks', () => {
    expect(weekStartKey('2026-10-07', 0)).toBe('2026-10-04') // Wed -> Sun
    expect(weekStartKey('2026-10-04', 0)).toBe('2026-10-04')
    expect(weekStartKey('2026-10-04', 1)).toBe('2026-09-28') // Sun -> prev Mon
  })
})

describe('computeHabitStats', () => {
  const today = '2026-10-07' // Wednesday

  it('counts a daily streak ending today', () => {
    const s = computeHabitStats({ checkIns: ['2026-10-05', '2026-10-06', '2026-10-07'], targetPerWeek: 7, today })
    expect(s).toMatchObject({ doneToday: true, streak: 3, streakUnit: 'day' })
  })

  it('does not break a daily streak when today is not yet ticked', () => {
    const s = computeHabitStats({ checkIns: ['2026-10-05', '2026-10-06'], targetPerWeek: 7, today })
    expect(s).toMatchObject({ doneToday: false, streak: 2 })
  })

  it('breaks a daily streak after a missed day', () => {
    const s = computeHabitStats({ checkIns: ['2026-10-04', '2026-10-05'], targetPerWeek: 7, today })
    expect(s.streak).toBe(0)
  })

  it('keeps a daily streak across the DST start boundary', () => {
    const s = computeHabitStats({ checkIns: ['2026-10-03', '2026-10-04', '2026-10-05'], targetPerWeek: 7, today: '2026-10-05' })
    expect(s.streak).toBe(3)
  })

  it('counts weeks meeting a weekly target, in-progress week not breaking', () => {
    // target 3; last week (27 Sep-3 Oct) had 3, week before had 3, this week has 1 so far
    const checkIns = ['2026-09-20', '2026-09-22', '2026-09-24', '2026-09-27', '2026-09-29', '2026-10-01', '2026-10-04']
    const s = computeHabitStats({ checkIns, targetPerWeek: 3, today })
    expect(s).toMatchObject({ weekCount: 1, weekTarget: 3, streak: 2, streakUnit: 'week' })
  })

  it('adds the current week once its target is met', () => {
    const checkIns = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-04', '2026-10-05', '2026-10-06']
    const s = computeHabitStats({ checkIns, targetPerWeek: 3, today })
    expect(s.streak).toBe(2)
  })

  it('stops the weekly streak at an under-target week', () => {
    const checkIns = ['2026-09-27', '2026-09-28', '2026-10-04', '2026-10-05', '2026-10-06']
    const s = computeHabitStats({ checkIns, targetPerWeek: 3, today })
    expect(s.streak).toBe(1)
  })

  it('clamps the target to 1-7', () => {
    expect(computeHabitStats({ checkIns: [], targetPerWeek: 0, today }).weekTarget).toBe(1)
    expect(computeHabitStats({ checkIns: [], targetPerWeek: 99, today }).weekTarget).toBe(7)
  })
})
