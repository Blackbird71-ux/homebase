import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recipeBook: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

const mockSession: SessionUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  familyId: 'family-1',
  weekStartsOn: 1,
  timezone: 'Australia/Sydney',
}

describe('GET /api/recipe-books', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
  })

  it('returns books with recipeCount', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findMany).mockResolvedValue([
      { id: 'book-1', name: 'Soups', familyId: 'family-1', createdAt: new Date(), _count: { recipes: 11 } },
    ] as never)

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([{ id: 'book-1', name: 'Soups', recipeCount: 11 }])
  })
})

describe('POST /api/recipe-books', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
  })

  it('returns 400 if name is missing', async () => {
    const req = new Request('http://localhost/api/recipe-books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates a book and returns it', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.create).mockResolvedValue({
      id: 'book-1',
      name: 'Soups',
      familyId: 'family-1',
      createdAt: new Date(),
    } as never)

    const req = new Request('http://localhost/api/recipe-books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Soups' }),
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.name).toBe('Soups')
    expect(prisma.recipeBook.create).toHaveBeenCalledWith({
      data: { name: 'Soups', familyId: 'family-1' },
    })
  })
})
