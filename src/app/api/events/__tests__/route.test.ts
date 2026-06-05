import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: { event: { findMany: vi.fn(), create: vi.fn() }, user: { findMany: vi.fn() } },
}))
vi.mock('@/lib/google-sync', () => ({ pushEventToGoogle: vi.fn() }))

const mockSession: SessionUser = {
  id: 'user-1', email: 'test@example.com', name: 'Test', role: 'member',
  familyId: 'fam-1', weekStartsOn: 1, timezone: 'Australia/Sydney',
}

const makeEvent = (overrides = {}) => ({
  id: 'e1', title: 'Dentist', description: null,
  start: new Date('2026-05-01T09:00:00Z'), end: new Date('2026-05-01T10:00:00Z'),
  isAllDay: false, isPersonal: false, category: 'Medical', color: null,
  createdBy: 'user-1', familyId: 'fam-1', createdAt: new Date(),
  ...overrides,
})

describe('GET /api/events', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
  })

  it('returns own personal events with full details and isBusy=false', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.event.findMany).mockResolvedValue([makeEvent({ isPersonal: true, createdBy: 'user-1' })] as never)
    const res = await GET(new Request('http://localhost/api/events'))
    const body = await res.json()
    expect(body[0].isBusy).toBe(false)
    expect(body[0].title).toBe('Dentist')
  })

  it('masks personal events from other users as Busy', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.event.findMany).mockResolvedValue([makeEvent({ isPersonal: true, createdBy: 'user-2' })] as never)
    const res = await GET(new Request('http://localhost/api/events'))
    const body = await res.json()
    expect(body[0].isBusy).toBe(true)
    expect(body[0].title).toBe('Private event')
    expect(body[0].description).toBeNull()
    expect(body[0].category).toBeNull()
  })

  it('returns family events with isBusy=false for all users', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.event.findMany).mockResolvedValue([makeEvent({ isPersonal: false, createdBy: 'user-2' })] as never)
    const res = await GET(new Request('http://localhost/api/events'))
    const body = await res.json()
    expect(body[0].isBusy).toBe(false)
    expect(body[0].title).toBe('Dentist')
  })
})

describe('POST /api/events', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { auth } = await import('@/lib/auth')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
    vi.mocked(prisma.event.create).mockResolvedValue(makeEvent() as never)
  })

  it('creates event with isPersonal from body', async () => {
    const { prisma } = await import('@/lib/prisma')
    const req = new Request('http://localhost/api/events', {
      method: 'POST',
      body: JSON.stringify({ title: 'Dentist', start: '2026-05-01T09:00:00Z', end: '2026-05-01T10:00:00Z', isPersonal: true }),
    })
    await POST(req)
    expect(prisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPersonal: true }) })
    )
  })

  it('triggers pushEventToGoogle after create (no await)', async () => {
    const { pushEventToGoogle } = await import('@/lib/google-sync')
    const req = new Request('http://localhost/api/events', {
      method: 'POST',
      body: JSON.stringify({ title: 'Dentist', start: '2026-05-01T09:00:00Z', end: '2026-05-01T10:00:00Z' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(pushEventToGoogle).toHaveBeenCalledWith('e1', 'create')
  })
})
