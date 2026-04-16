import { describe, it, expect } from 'vitest'
import { generateCode, isValidCodeFormat } from '@/lib/invite'

describe('invite', () => {
  it('generates an 8-character uppercase alphanumeric code', () => {
    const code = generateCode()
    expect(code).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('generates unique codes', () => {
    const codes = Array.from({ length: 100 }, () => generateCode())
    const unique = new Set(codes)
    expect(unique.size).toBe(100)
  })

  it('validates correct format', () => {
    expect(isValidCodeFormat('ABC12345')).toBe(true)
  })

  it('rejects lowercase', () => {
    expect(isValidCodeFormat('abc12345')).toBe(false)
  })

  it('rejects wrong length', () => {
    expect(isValidCodeFormat('ABC123')).toBe(false)
  })
})
