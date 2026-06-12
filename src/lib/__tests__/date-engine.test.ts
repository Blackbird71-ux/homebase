import { describe, it, expect } from 'vitest'
import { birthdayOccurrencesInRange } from '@/lib/date-engine'

const TZ = 'Australia/Sydney'

// Local midnight in Sydney (UTC+10, no DST in June) expressed in UTC
function sydney(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+10:00`)
}

describe('birthdayOccurrencesInRange', () => {
  it('returns occurrences inside the range, recurring annually', () => {
    const json = JSON.stringify([
      { name: 'Sarah', type: 'birthday', date: '2014-06-20' },
      { name: 'Mark & Kate', type: 'anniversary', date: '03-15' },
    ])
    const out = birthdayOccurrencesInRange(json, sydney('2026-06-01'), sydney('2026-06-30'), TZ)
    expect(out).toEqual([{ name: 'Sarah', type: 'birthday', day: '2026-06-20' }])
  })

  it('handles MM-DD entries without a year', () => {
    const json = JSON.stringify([{ name: 'Kate', type: 'birthday', date: '03-15' }])
    const out = birthdayOccurrencesInRange(json, sydney('2026-03-01'), sydney('2026-03-31'), TZ)
    expect(out).toEqual([{ name: 'Kate', type: 'birthday', day: '2026-03-15' }])
  })

  it('spans year boundaries (Dec range into Jan)', () => {
    const json = JSON.stringify([{ name: 'Jo', type: 'birthday', date: '1990-01-05' }])
    const out = birthdayOccurrencesInRange(json, sydney('2026-12-20'), sydney('2027-01-10'), TZ)
    expect(out).toEqual([{ name: 'Jo', type: 'birthday', day: '2027-01-05' }])
  })

  it('clamps Feb 29 to Feb 28 in non-leap years', () => {
    const json = JSON.stringify([{ name: 'Leap', type: 'birthday', date: '2000-02-29' }])
    const nonLeap = birthdayOccurrencesInRange(json, sydney('2026-02-01'), sydney('2026-03-01'), TZ)
    expect(nonLeap).toEqual([{ name: 'Leap', type: 'birthday', day: '2026-02-28' }])
    const leap = birthdayOccurrencesInRange(json, sydney('2028-02-01'), sydney('2028-03-01'), TZ)
    expect(leap).toEqual([{ name: 'Leap', type: 'birthday', day: '2028-02-29' }])
  })

  it('excludes occurrences outside the range', () => {
    const json = JSON.stringify([{ name: 'Sarah', type: 'birthday', date: '2014-06-20' }])
    const out = birthdayOccurrencesInRange(json, sydney('2026-07-01'), sydney('2026-07-31'), TZ)
    expect(out).toEqual([])
  })

  it('returns [] for null, invalid JSON, and malformed entries', () => {
    expect(birthdayOccurrencesInRange(null, sydney('2026-06-01'), sydney('2026-06-30'), TZ)).toEqual([])
    expect(birthdayOccurrencesInRange('not json', sydney('2026-06-01'), sydney('2026-06-30'), TZ)).toEqual([])
    const bad = JSON.stringify([{ name: 'X', type: 'birthday', date: 'June twenty' }, { date: '06-15' }])
    expect(birthdayOccurrencesInRange(bad, sydney('2026-06-01'), sydney('2026-06-30'), TZ)).toEqual([])
  })

  it('uses the local day key at range edges (tz-sensitive)', () => {
    // 2026-06-19T15:00Z is already 20 June in Sydney — a 20 June birthday
    // with range starting at that instant must be included
    const json = JSON.stringify([{ name: 'Edge', type: 'birthday', date: '06-20' }])
    const out = birthdayOccurrencesInRange(json, new Date('2026-06-19T15:00:00Z'), new Date('2026-06-20T13:59:00Z'), TZ)
    expect(out).toEqual([{ name: 'Edge', type: 'birthday', day: '2026-06-20' }])
  })
})
