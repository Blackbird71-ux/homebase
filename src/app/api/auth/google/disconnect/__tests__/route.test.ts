import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    googleCalendarSync: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}))
vi.mock('@/lib/google-calendar', () => ({
  getAccessToken: vi.fn(),
  deleteGoogleEvent: vi.fn(),
}))

const mockSession: SessionUser = {
  id: 'user-1', email: 'test@example.com', name: 'Test', role: 'member',
  familyId: 'fam-1', weekStartsOn: 1, timezone: 'Australia/Sydney',
}

const mockUser = {
  id: 'user-1', googleConnected: true, googleRefreshToken: 'rt1', googleEmail: 'g@gmail.com',
}

const mockSyncRows = [
  { id: 's1', eventId: 'e1', userId: 'user-1', googleEventId: 'gid-1' },
  { id: 's2', eventId: 'e2', userId: 'user-1', googleEventId: 'gid-2' },
]

function makeReq(body: object) {
  return new Request('http://localhost/api/auth/google/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/google/disconnect', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
    vi.mocked(prisma.user.update).mockResolvedValue({} as never)
    vi.mocked(prisma.googleCalendarSync.findMany).mockResolvedValue(mockSyncRows as never)
    vi.mocked(prisma.googleCalendarSync.deleteMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(gc.getAccessToken).mockResolvedValue('tok')
    vi.mocked(gc.deleteGoogleEvent).mockResolvedValue(undefined)
  })

  it('returns 400 for invalid deleteFromGoogle value', async () => {
    const res = await POST(makeReq({ deleteFromGoogle: 'maybe' }))
    expect(res.status).toBe(400)
  })

  it('clears google fields on user in both modes', async () => {
    const { prisma } = await import('@/lib/prisma')
    await POST(makeReq({ deleteFromGoogle: false }))
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { googleConnected: false, googleRefreshToken: null, googleEmail: null },
    })
  })

  it('does NOT delete Google events when deleteFromGoogle is false', async () => {
    const gc = await import('@/lib/google-calendar')
    await POST(makeReq({ deleteFromGoogle: false }))
    expect(gc.deleteGoogleEvent).not.toHaveBeenCalled()
  })

  it('deletes Google events and sync rows when deleteFromGoogle is true', async () => {
    const gc = await import('@/lib/google-calendar')
    const { prisma } = await import('@/lib/prisma')
    await POST(makeReq({ deleteFromGoogle: true }))
    expect(gc.deleteGoogleEvent).toHaveBeenCalledTimes(2)
    expect(prisma.googleCalendarSync.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })

  it('returns 200 on success', async () => {
    const res = await POST(makeReq({ deleteFromGoogle: false }))
    expect(res.status).toBe(200)
  })
})
