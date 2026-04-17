import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pushEventToGoogle } from '@/lib/google-sync'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    event: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    googleCalendarSync: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

vi.mock('@/lib/google-calendar', () => ({
  getAccessToken: vi.fn(),
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
}))

const familyEvent = {
  id: 'evt-1',
  title: 'School Run',
  description: null,
  start: new Date('2026-05-01T08:00:00Z'),
  end: new Date('2026-05-01T08:30:00Z'),
  isAllDay: false,
  isPersonal: false,
  createdBy: 'user-1',
  familyId: 'fam-1',
}

const personalEvent = { ...familyEvent, isPersonal: true }

const connectedUsers = [
  { id: 'user-1', googleRefreshToken: 'rt1', googleConnected: true },
  { id: 'user-2', googleRefreshToken: 'rt2', googleConnected: true },
]

describe('pushEventToGoogle', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    vi.mocked(prisma.event.findUnique).mockResolvedValue(familyEvent as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue(connectedUsers as never)
    vi.mocked(prisma.googleCalendarSync.findMany).mockResolvedValue([])
    vi.mocked(gc.getAccessToken).mockResolvedValue('tok')
    vi.mocked(gc.createGoogleEvent).mockResolvedValue('google-evt-id')
    vi.mocked(gc.updateGoogleEvent).mockResolvedValue(undefined)
    vi.mocked(gc.deleteGoogleEvent).mockResolvedValue(undefined)
  })

  it('creates Google events for all connected users on create (family event)', async () => {
    const gc = await import('@/lib/google-calendar')
    await pushEventToGoogle('evt-1', 'create')
    expect(gc.createGoogleEvent).toHaveBeenCalledTimes(2)
  })

  it('creates Google event only for creator on create (personal event)', async () => {
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    vi.mocked(prisma.event.findUnique).mockResolvedValue(personalEvent as never)
    await pushEventToGoogle('evt-1', 'create')
    expect(gc.createGoogleEvent).toHaveBeenCalledTimes(1)
    expect(gc.getAccessToken).toHaveBeenCalledWith('rt1')
  })

  it('stores GoogleCalendarSync rows after create', async () => {
    const { prisma } = await import('@/lib/prisma')
    await pushEventToGoogle('evt-1', 'create')
    expect(prisma.googleCalendarSync.create).toHaveBeenCalledTimes(2)
  })

  it('updates existing sync rows on update', async () => {
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    vi.mocked(prisma.googleCalendarSync.findMany).mockResolvedValue([
      { id: 's1', eventId: 'evt-1', userId: 'user-1', googleEventId: 'gid-1', createdAt: new Date() },
      { id: 's2', eventId: 'evt-1', userId: 'user-2', googleEventId: 'gid-2', createdAt: new Date() },
    ] as never)
    await pushEventToGoogle('evt-1', 'update')
    expect(gc.updateGoogleEvent).toHaveBeenCalledTimes(2)
    expect(gc.createGoogleEvent).not.toHaveBeenCalled()
  })

  it('swallows errors silently', async () => {
    const gc = await import('@/lib/google-calendar')
    vi.mocked(gc.createGoogleEvent).mockRejectedValue(new Error('Network error'))
    await expect(pushEventToGoogle('evt-1', 'create')).resolves.not.toThrow()
  })

  it('returns immediately if event not found', async () => {
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    vi.mocked(prisma.event.findUnique).mockResolvedValue(null)
    await pushEventToGoogle('evt-1', 'create')
    expect(gc.createGoogleEvent).not.toHaveBeenCalled()
  })

  it('removes sync row and deletes Google event for user when visibility changes to personal', async () => {
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    // user-2 has an existing sync row but the event is now personal (creator = user-1)
    vi.mocked(prisma.event.findUnique).mockResolvedValue(personalEvent as never)
    vi.mocked(prisma.googleCalendarSync.findMany).mockResolvedValue([
      { id: 's2', eventId: 'evt-1', userId: 'user-2', googleEventId: 'gid-2', createdAt: new Date() },
    ] as never)
    await pushEventToGoogle('evt-1', 'update')
    expect(gc.deleteGoogleEvent).toHaveBeenCalledWith('tok', 'gid-2')
    expect(prisma.googleCalendarSync.delete).toHaveBeenCalledWith({ where: { id: 's2' } })
  })

  it('creates sync row for newly eligible user when visibility changes to family', async () => {
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    // family event, user-2 has no sync row yet
    vi.mocked(prisma.googleCalendarSync.findMany).mockResolvedValue([
      { id: 's1', eventId: 'evt-1', userId: 'user-1', googleEventId: 'gid-1', createdAt: new Date() },
    ] as never)
    await pushEventToGoogle('evt-1', 'update')
    // user-1 should update, user-2 should create
    expect(gc.updateGoogleEvent).toHaveBeenCalledTimes(1)
    expect(gc.createGoogleEvent).toHaveBeenCalledTimes(1)
    expect(prisma.googleCalendarSync.create).toHaveBeenCalledTimes(1)
  })
})
