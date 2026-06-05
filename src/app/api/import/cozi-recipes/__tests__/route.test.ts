import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recipeBook: { findFirst: vi.fn(), create: vi.fn() },
    recipe: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    coziImport: { create: vi.fn() },
  },
}))
vi.mock('@/lib/audit-log', () => ({ createAuditLog: vi.fn() }))

const mockSession: SessionUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  familyId: 'family-1',
  weekStartsOn: 1,
  timezone: 'Australia/Sydney',
}

function manualBody(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'manual',
    title: 'Pumpkin Soup',
    description: 'Warm and cozy',
    ingredients: ['1kg pumpkin', '2 cups stock'],
    instructions: ['Simmer pumpkin.'],
    ...overrides,
  }
}

function makeRequest(body: object) {
  return new Request('http://localhost/api/import/cozi-recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/import/cozi-recipes', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)

    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.recipeBook.create).mockResolvedValue({ id: 'book-1', name: 'Cozi Import', familyId: 'family-1', createdAt: new Date() } as never)
    vi.mocked(prisma.recipe.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.recipe.create).mockResolvedValue({ id: 'r-1', title: 'Pumpkin Soup' } as never)
    vi.mocked(prisma.recipe.update).mockResolvedValue({ id: 'r-1', title: 'Pumpkin Soup' } as never)
    vi.mocked(prisma.coziImport.create).mockResolvedValue({ id: 'imp-1' } as never)
  })

  it('returns 400 for an invalid mode', async () => {
    const res = await POST(makeRequest({ mode: 'nonsense' }))
    expect(res.status).toBe(400)
  })

  it('imports a manual recipe', async () => {
    const res = await POST(makeRequest(manualBody()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.imported).toBe(1)
    expect(body.failed).toBe(0)
    expect(body.results[0].imported).toBe(true)
  })

  it('counts a thrown recipe as failed (not a 500) and records the reason', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipe.create).mockRejectedValue(new Error('DB down'))

    const res = await POST(makeRequest(manualBody()))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.imported).toBe(0)
    expect(body.skipped).toBe(0)
    expect(body.failed).toBe(1)
    expect(body.results[0].failed).toBe(true)
    expect(body.results[0].reason).toBe('DB down')
  })
})
