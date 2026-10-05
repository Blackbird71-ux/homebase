import { describe, it, expect } from 'vitest'
import { normalizePins, pinHref, MAX_PINS } from './mobile-pins'

describe('normalizePins', () => {
  it('returns [] for non-arrays', () => {
    expect(normalizePins(null)).toEqual([])
    expect(normalizePins({})).toEqual([])
  })
  it('drops malformed and duplicate entries', () => {
    expect(
      normalizePins([
        { type: 'page', href: '/lists' },
        { type: 'page', href: '/lists' },
        { type: 'page', href: 'https://evil.example' },
        { type: 'list', id: '' },
        { type: 'list', id: 'abc' },
        'junk',
      ])
    ).toEqual([
      { type: 'page', href: '/lists' },
      { type: 'list', id: 'abc' },
    ])
  })
  it('caps at MAX_PINS', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ type: 'list', id: `l${i}` }))
    expect(normalizePins(many)).toHaveLength(MAX_PINS)
  })
})

describe('pinHref', () => {
  it('opens a list directly', () => {
    expect(pinHref({ type: 'list', id: 'abc' })).toBe('/lists?list=abc')
    expect(pinHref({ type: 'page', href: '/calendar' })).toBe('/calendar')
  })
})
