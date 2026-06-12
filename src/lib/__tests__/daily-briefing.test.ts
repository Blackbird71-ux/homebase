import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn() }))

import { formatBriefing, type FamilyBriefing } from '@/lib/daily-briefing'

const base: FamilyBriefing = {
  dateLabel: 'Friday 12 Jun',
  events: [],
  birthdays: [],
  choresOverdue: [],
  choresDueToday: [],
  dinner: null,
  billsThisWeek: [],
}

describe('formatBriefing', () => {
  it('formats a full briefing', () => {
    const { title, body } = formatBriefing(
      {
        ...base,
        events: [
          { title: 'School assembly', time: '9:00 am', isPersonal: false, createdBy: 'u1' },
          { title: 'Bin night', time: null, isPersonal: false, createdBy: 'u1' },
        ],
        birthdays: ['Nan'],
        choresOverdue: ['Vacuum (Liam)'],
        choresDueToday: ['Bins (Mark)'],
        dinner: 'Spag bol',
        billsThisWeek: ['Electricity $245.00 (Mon)'],
      },
      'u1'
    )
    expect(title).toBe('Daily briefing — Friday 12 Jun')
    expect(body).toBe(
      '🎂 Nan today!\n' +
        '📅 9:00 am School assembly · Bin night\n' +
        '🔴 Overdue: Vacuum (Liam)\n' +
        '🧹 Chores: Bins (Mark)\n' +
        '🍽️ Dinner: Spag bol\n' +
        '💳 Bills: Electricity $245.00 (Mon)'
    )
  })

  it('masks personal events created by other users', () => {
    const briefing = {
      ...base,
      events: [{ title: 'Therapy', time: '2:00 pm', isPersonal: true, createdBy: 'u1' }],
    }
    expect(formatBriefing(briefing, 'u2').body).toBe('📅 2:00 pm Private event')
    expect(formatBriefing(briefing, 'u1').body).toBe('📅 2:00 pm Therapy')
  })

  it('falls back to a friendly message when nothing is on', () => {
    expect(formatBriefing(base, 'u1').body).toBe('Nothing scheduled today. Enjoy!')
  })
})
