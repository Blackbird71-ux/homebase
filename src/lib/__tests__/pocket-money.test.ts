import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { completionStreak } from '@/lib/pocket-money'

// recentDayKeys[0] = today, [1] = yesterday, etc.
const days = ['2026-06-12', '2026-06-11', '2026-06-10', '2026-06-09', '2026-06-08']

describe('completionStreak', () => {
  it('returns 0 with no completions', () => {
    expect(completionStreak(new Set(), days)).toBe(0)
  })

  it('counts consecutive days back from today', () => {
    expect(completionStreak(new Set(['2026-06-12', '2026-06-11', '2026-06-10']), days)).toBe(3)
  })

  it('does not break the streak when today has no completion yet', () => {
    expect(completionStreak(new Set(['2026-06-11', '2026-06-10']), days)).toBe(2)
  })

  it('breaks the streak on a missed earlier day', () => {
    expect(completionStreak(new Set(['2026-06-12', '2026-06-10', '2026-06-09']), days)).toBe(1)
  })

  it('returns 0 when the last completion was two days ago', () => {
    expect(completionStreak(new Set(['2026-06-10', '2026-06-09']), days)).toBe(0)
  })

  it('counts today-only as a streak of 1', () => {
    expect(completionStreak(new Set(['2026-06-12']), days)).toBe(1)
  })

  it('ignores non-consecutive history beyond the break', () => {
    expect(completionStreak(new Set(['2026-06-12', '2026-06-11', '2026-06-09', '2026-06-08']), days)).toBe(2)
  })
})
