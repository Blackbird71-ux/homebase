import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/auth-helpers', () => ({ requireSession: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { update: vi.fn() } } }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockReturnValue({
    get: vi.fn().mockReturnValue({ value: 'state-abc' }),
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockSession: SessionUser = {
  id: 'user-1', email: 'test@example.com', name: 'Test', role: 'member',
  familyId: 'fam-1', weekStartsOn: 1, timezone: 'Australia/Sydney',
}

describe('GET /api/auth/google/callback', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.GOOGLE_CLIENT_ID = 'cid'
    process.env.GOOGLE_CLIENT_SECRET = 'csec'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3300/api/auth/google/callback'
    const { requireSession } = await import('@/lib/auth-helpers')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'at',
        refresh_token: 'rt-new',
        token_type: 'Bearer',
      }),
    })
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.user.update).mockResolvedValue({} as never)
  })

  it('returns 400 if state param does not match cookie', async () => {
    const req = new Request('http://localhost:3300/api/auth/google/callback?code=abc&state=WRONG')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('exchanges code for tokens and stores refresh token', async () => {
    const { prisma } = await import('@/lib/prisma')
    const req = new Request('http://localhost:3300/api/auth/google/callback?code=abc&state=state-abc')
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ googleRefreshToken: 'rt-new', googleConnected: true }),
      })
    )
  })

  it('redirects to /settings?google=connected on success', async () => {
    const req = new Request('http://localhost:3300/api/auth/google/callback?code=abc&state=state-abc')
    const res = await GET(req)
    expect(res.headers.get('location')).toContain('/settings?google=connected')
  })
})
