import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PATCH } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    recipeBook: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('@/lib/audit-log', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
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

const existingBook = { id: 'book-1', name: 'Soups', hidden: false, familyId: 'family-1', createdAt: new Date() }

function patchReq(body: unknown) {
  return new Request('http://localhost/api/recipe-books/book-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = Promise.resolve({ id: 'book-1' })

describe('PATCH /api/recipe-books/[id]', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
  })

  it('returns 404 when the book is not in the user family', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findFirst).mockResolvedValue(null)

    const res = await PATCH(patchReq({ name: 'Dinners' }), { params })
    expect(res.status).toBe(404)
    expect(prisma.recipeBook.findFirst).toHaveBeenCalledWith({
      where: { id: 'book-1', familyId: 'family-1' },
    })
  })

  it('renames a book', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findFirst)
      .mockResolvedValueOnce(existingBook as never) // ownership check
      .mockResolvedValueOnce(null as never)         // no name clash
    vi.mocked(prisma.recipeBook.update).mockResolvedValue({ ...existingBook, name: 'Dinners' } as never)

    const res = await PATCH(patchReq({ name: 'Dinners' }), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ id: 'book-1', name: 'Dinners', hidden: false })
    expect(prisma.recipeBook.update).toHaveBeenCalledWith({
      where: { id: 'book-1' },
      data: { name: 'Dinners' },
    })
  })

  it('returns 409 when renaming to an existing name', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findFirst)
      .mockResolvedValueOnce(existingBook as never)
      .mockResolvedValueOnce({ id: 'book-2', name: 'Dinners' } as never)

    const res = await PATCH(patchReq({ name: 'Dinners' }), { params })
    expect(res.status).toBe(409)
    expect(prisma.recipeBook.update).not.toHaveBeenCalled()
  })

  it('toggles hidden', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findFirst).mockResolvedValue(existingBook as never)
    vi.mocked(prisma.recipeBook.update).mockResolvedValue({ ...existingBook, hidden: true } as never)

    const res = await PATCH(patchReq({ hidden: true }), { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.hidden).toBe(true)
    expect(prisma.recipeBook.update).toHaveBeenCalledWith({
      where: { id: 'book-1' },
      data: { hidden: true },
    })
  })

  it('returns 400 for an empty name', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findFirst).mockResolvedValue(existingBook as never)

    const res = await PATCH(patchReq({ name: '   ' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when there is nothing to update', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.recipeBook.findFirst).mockResolvedValue(existingBook as never)

    const res = await PATCH(patchReq({}), { params })
    expect(res.status).toBe(400)
  })
})
