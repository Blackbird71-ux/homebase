import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PUT, DELETE } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    event: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    googleCalendarSync: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/google-sync', () => ({ pushEventToGoogle: vi.fn() }))
vi.mock('@/lib/google-calendar', () => ({
  getAccessToken: vi.fn(),
  deleteGoogleEvent: vi.fn(),
}))

const mockSession: SessionUser = {
  id: 'user-1', email: 'test@example.com', name: 'Test', role: 'member',
  familyId: 'fam-1', weekStartsOn: 1, timezone: 'Australia/Sydney',
}

const myPersonalEvent = {
  id: 'e1', title: 'Doctor', description: null,
  start: new Date('2026-05-01T09:00:00Z'), end: new Date('2026-05-01T10:00:00Z'),
  isAllDay: false, isPersonal: true, createdBy: 'user-1', familyId: 'fam-1',
  category: null, color: null, createdAt: new Date(),
}

const otherPersonalEvent = { ...myPersonalEvent, createdBy: 'user-2' }

const params = Promise.resolve({ id: 'e1' })

describe('PUT /api/events/[id]', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
    vi.mocked(prisma.event.findFirst).mockResolvedValue(myPersonalEvent as never)
    vi.mocked(prisma.event.update).mockResolvedValue(myPersonalEvent as never)
  })

  it('allows creator to edit their own personal event', async () => {
    const req = new Request('http://localhost/api/events/e1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Doctor updated' }),
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
  })

  it('returns 403 when non-creator tries to edit a personal event', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.event.findFirst).mockResolvedValue(otherPersonalEvent as never)
    const req = new Request('http://localhost/api/events/e1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Hack' }),
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(403)
  })

  it('triggers pushEventToGoogle after update', async () => {
    const { pushEventToGoogle } = await import('@/lib/google-sync')
    const req = new Request('http://localhost/api/events/e1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated' }),
    })
    await PUT(req, { params })
    expect(pushEventToGoogle).toHaveBeenCalledWith('e1', 'update')
  })
})

describe('DELETE /api/events/[id]', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
    vi.mocked(prisma.event.findFirst).mockResolvedValue(myPersonalEvent as never)
    vi.mocked(prisma.event.delete).mockResolvedValue(myPersonalEvent as never)
    vi.mocked(prisma.googleCalendarSync.findMany).mockResolvedValue([])
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
  })

  it('allows creator to delete their own personal event', async () => {
    const res = await DELETE(new Request('http://localhost/api/events/e1'), { params })
    expect(res.status).toBe(200)
  })

  it('returns 403 when non-creator tries to delete a personal event', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.event.findFirst).mockResolvedValue(otherPersonalEvent as never)
    const res = await DELETE(new Request('http://localhost/api/events/e1'), { params })
    expect(res.status).toBe(403)
  })
})
