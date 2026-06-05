import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tag: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    recipe: { findMany: vi.fn() },
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

describe('GET /api/tags', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
  })

  it('returns tags without counts by default', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      { id: 'tag-1', name: 'Vegetarian', familyId: 'family-1', createdAt: new Date('2024-01-01') },
      { id: 'tag-2', name: 'Quick', familyId: 'family-1', createdAt: new Date('2024-01-02') },
    ] as never)

    const req = new Request('http://localhost/api/tags')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([
      { id: 'tag-1', name: 'Vegetarian', emoji: null, sortOrder: 0, scope: 'general', createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 'tag-2', name: 'Quick', emoji: null, sortOrder: 0, scope: 'general', createdAt: '2024-01-02T00:00:00.000Z' },
    ])
  })

  it('returns tags with counts when includeCounts=true', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      { 
        id: 'tag-1', 
        name: 'Vegetarian', 
        familyId: 'family-1', 
        createdAt: new Date('2024-01-01'),
        _count: { recipes: 5 }
      },
    ] as never)
    vi.mocked(prisma.recipe.findMany).mockResolvedValue([])

    const req = new Request('http://localhost/api/tags?includeCounts=true')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual([
      { id: 'tag-1', name: 'Vegetarian', emoji: null, sortOrder: 0, scope: 'general', createdAt: '2024-01-01T00:00:00.000Z', recipeCount: 5 },
    ])
  })

  it('filters by search parameter', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.tag.findMany).mockResolvedValue([
      { id: 'tag-1', name: 'Vegetarian', familyId: 'family-1', createdAt: new Date('2024-01-01') },
    ] as never)

    const req = new Request('http://localhost/api/tags?search=vege')
    const res = await GET(req)
    
    expect(prisma.tag.findMany).toHaveBeenCalledWith({
      where: {
        familyId: 'family-1',
        name: { not: 'legacy-tags', contains: 'vege', mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      include: undefined,
    })
  })
})

describe('POST /api/tags', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
  })

  it('creates a new tag', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.tag.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.tag.create).mockResolvedValue({
      id: 'tag-new',
      name: 'Dinner',
      familyId: 'family-1',
      createdAt: new Date('2024-01-01'),
    } as never)

    const req = new Request('http://localhost/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dinner' }),
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toEqual({
      id: 'tag-new',
      name: 'Dinner',
      emoji: null,
      sortOrder: 0,
      scope: 'general',
      createdAt: '2024-01-01T00:00:00.000Z',
    })
  })

  it('returns error when name is missing', async () => {
    const req = new Request('http://localhost/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('Tag name is required')
  })

  it('returns error when tag already exists', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.tag.findFirst).mockResolvedValue({
      id: 'tag-existing',
      name: 'Dinner',
      familyId: 'family-1',
      createdAt: new Date(),
    } as never)

    const req = new Request('http://localhost/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dinner' }),
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toContain('already exists')
  })
})