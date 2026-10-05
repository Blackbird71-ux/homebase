import { describe, it, expect } from 'vitest'
import { normalizeQuickAdds, splitQuickAdds, QUICK_ADD_IDS } from './mobile-quick-adds'

describe('normalizeQuickAdds', () => {
  it('returns null for non-arrays (not customised)', () => {
    expect(normalizeQuickAdds(undefined)).toBeNull()
    expect(normalizeQuickAdds('event')).toBeNull()
  })
  it('drops unknown and duplicate ids, keeping order', () => {
    expect(normalizeQuickAdds(['note', 'bogus', 'event', 'note', 5, null])).toEqual(['note', 'event'])
  })
  it('keeps an empty array (user chose none)', () => {
    expect(normalizeQuickAdds([])).toEqual([])
  })
})

describe('splitQuickAdds', () => {
  const all = QUICK_ADD_IDS.map((id) => ({ id }))
  it('shows everything when not customised', () => {
    const r = splitQuickAdds(all, null)
    expect(r.shown).toHaveLength(all.length)
    expect(r.more).toHaveLength(0)
  })
  it('shows chosen in order and puts the rest under More', () => {
    const r = splitQuickAdds(all, ['note', 'event'])
    expect(r.shown.map((a) => a.id)).toEqual(['note', 'event'])
    expect(r.more).toHaveLength(all.length - 2)
    expect(r.more.map((a) => a.id)).not.toContain('note')
  })
  it('puts everything under More when none chosen', () => {
    const r = splitQuickAdds(all, [])
    expect(r.shown).toHaveLength(0)
    expect(r.more).toHaveLength(all.length)
  })
})
