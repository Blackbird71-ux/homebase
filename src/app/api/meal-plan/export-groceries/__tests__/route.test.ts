import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ingredientCategory: { upsert: vi.fn() },
    list: { findFirst: vi.fn(), create: vi.fn() },
    listItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn(),
}))

const mockSession: SessionUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'member',
  familyId: 'family-1',
  weekStartsOn: 1,
  timezone: 'Australia/Sydney',
}

const mockList = { id: 'list-1', name: 'Groceries', type: 'SHOPPING', familyId: 'family-1', isActive: true, createdAt: new Date() }

const sampleItems = [
  { text: '500g beef mince', key: 'beef mince', category: 'Meat' },
  { text: '1 onion', key: 'onion', category: 'Produce' },
]

function makeRequest(body: object) {
  return new Request('http://localhost/api/meal-plan/export-groceries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/meal-plan/export-groceries', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.ingredientCategory.upsert).mockResolvedValue({} as never)
    vi.mocked(prisma.list.findFirst).mockResolvedValue(mockList as never)
    vi.mocked(prisma.listItem.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.listItem.createMany).mockResolvedValue({ count: 2 } as never)
  })

  it('returns 400 if items is empty', async () => {
    const res = await POST(makeRequest({ items: [], mode: 'replace' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if mode is invalid', async () => {
    const res = await POST(makeRequest({ items: sampleItems, mode: 'smash' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if an item is missing key', async () => {
    const res = await POST(makeRequest({ items: [{ text: 'milk', key: '', category: 'Dairy' }], mode: 'replace' }))
    expect(res.status).toBe(400)
  })

  it('upserts IngredientCategory for each item', async () => {
    const { prisma } = await import('@/lib/prisma')
    await POST(makeRequest({ items: sampleItems, mode: 'append' }))
    expect(prisma.ingredientCategory.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.ingredientCategory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { familyId_key: { familyId: 'family-1', key: 'beef mince' } },
        update: { category: 'Meat' },
        create: { familyId: 'family-1', key: 'beef mince', category: 'Meat' },
      })
    )
  })

  it('replace mode clears existing items before creating', async () => {
    const { prisma } = await import('@/lib/prisma')
    await POST(makeRequest({ items: sampleItems, mode: 'replace' }))
    expect(prisma.listItem.deleteMany).toHaveBeenCalledWith({ where: { listId: 'list-1' } })
    expect(prisma.listItem.createMany).toHaveBeenCalled()
    expect(prisma.listItem.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          content: '500g beef mince',
          category: 'Meat',
          sortOrder: 0,
          createdBy: 'user-1',
          listId: 'list-1',
        }),
      ]),
    })
  })

  it('append mode does NOT clear existing items', async () => {
    const { prisma } = await import('@/lib/prisma')
    await POST(makeRequest({ items: sampleItems, mode: 'append' }))
    expect(prisma.listItem.deleteMany).not.toHaveBeenCalled()
    expect(prisma.listItem.createMany).toHaveBeenCalled()
  })

  it('creates Groceries list when none exists', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.list.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.list.create).mockResolvedValue(mockList as never)

    await POST(makeRequest({ items: sampleItems, mode: 'replace' }))
    expect(prisma.list.create).toHaveBeenCalledWith({
      data: { name: 'Groceries', type: 'SHOPPING', familyId: 'family-1' },
    })
  })

  it('returns listId and itemCount on success', async () => {
    const res = await POST(makeRequest({ items: sampleItems, mode: 'append' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.listId).toBe('list-1')
    expect(body.itemCount).toBe(2)
  })
})
