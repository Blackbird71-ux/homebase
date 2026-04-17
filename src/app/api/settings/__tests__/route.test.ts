import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, PATCH } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    family: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth-helpers', () => ({
  requireSession: vi.fn(),
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}))

const mockSession: SessionUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  familyId: 'family-1',
  weekStartsOn: 0,
  timezone: 'Australia/Sydney',
}

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin',
  familyId: 'family-1',
  theme: 'dark',
  fontSize: 'base',
  weekStartsOn: 0,
  password: 'hashed',
  family: {
    id: 'family-1',
    name: 'Test Family',
    umamiScriptUrl: null,
    umamiSiteId: null,
  },
}

describe('GET /api/settings', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
  })

  it('returns user and family settings', async () => {
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.name).toBe('Test User')
    expect(body.theme).toBe('dark')
    expect(body.family.name).toBe('Test Family')
  })

  it('returns 404 if user not found', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/settings', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never)
    vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, theme: 'light' } as never)
  })

  it('updates theme', async () => {
    const { prisma } = await import('@/lib/prisma')
    const req = new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'light' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ theme: 'light' }) })
    )
  })

  it('rejects invalid theme value', async () => {
    const req = new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ theme: 'rainbow' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('rejects password change when currentPassword is wrong', async () => {
    const bcrypt = await import('bcryptjs')
    vi.mocked(bcrypt.default.compare).mockResolvedValue(false as never)
    const req = new Request('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'newpass123' }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})
