import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/auth-helpers', () => ({ requireSession: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    event: { findMany: vi.fn() },
    googleCalendarSync: { findMany: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/google-calendar', () => ({
  getAccessToken: vi.fn(),
  createGoogleEvent: vi.fn(),
}))

const mockSession: SessionUser = {
  id: 'user-1', email: 'test@example.com', name: 'Test', role: 'member',
  familyId: 'fam-1', weekStartsOn: 1, timezone: 'Australia/Sydney',
}

const now = new Date()
const future = new Date(now.getTime() + 86400000)

const mockUser = { id: 'user-1', googleConnected: true, googleRefreshToken: 'rt1' }

const familyEvent = {
  id: 'e1', title: 'Meeting', description: null,
  start: future, end: future, isAllDay: false,
  isPersonal: false, createdBy: 'user-1',
}

const otherPersonalEvent = {
  ...familyEvent, id: 'e2', isPersonal: true, createdBy: 'user-2',
}

describe('POST /api/google-calendar/sync', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
    vi.mocked(prisma.event.findMany).mockResolvedValue([familyEvent] as never)
    vi.mocked(prisma.googleCalendarSync.findMany).mockResolvedValue([])
    vi.mocked(prisma.googleCalendarSync.create).mockResolvedValue({} as never)
    vi.mocked(gc.getAccessToken).mockResolvedValue('tok')
    vi.mocked(gc.createGoogleEvent).mockResolvedValue('new-gid')
  })

  it('returns 400 if user is not connected to Google', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...mockUser, googleConnected: false } as never)
    const res = await POST(new Request('http://localhost/api/google-calendar/sync', { method: 'POST' }))
    expect(res.status).toBe(400)
  })

  it('syncs events not already in GoogleCalendarSync', async () => {
    const gc = await import('@/lib/google-calendar')
    await POST(new Request('http://localhost/api/google-calendar/sync', { method: 'POST' }))
    expect(gc.createGoogleEvent).toHaveBeenCalledTimes(1)
  })

  it('skips events already synced', async () => {
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    vi.mocked(prisma.googleCalendarSync.findMany).mockResolvedValue([
      { id: 's1', eventId: 'e1', userId: 'user-1', googleEventId: 'gid-1', createdAt: new Date() },
    ] as never)
    await POST(new Request('http://localhost/api/google-calendar/sync', { method: 'POST' }))
    expect(gc.createGoogleEvent).not.toHaveBeenCalled()
  })

  it('skips personal events created by other users', async () => {
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    vi.mocked(prisma.event.findMany).mockResolvedValue([otherPersonalEvent] as never)
    await POST(new Request('http://localhost/api/google-calendar/sync', { method: 'POST' }))
    expect(gc.createGoogleEvent).not.toHaveBeenCalled()
  })

  it('returns synced and skipped counts', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.event.findMany).mockResolvedValue([familyEvent, otherPersonalEvent] as never)
    const res = await POST(new Request('http://localhost/api/google-calendar/sync', { method: 'POST' }))
    const body = await res.json()
    expect(body.synced).toBe(1)
    expect(body.skipped).toBe(1)
  })
})
