import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '../route'
import type { SessionUser } from '@/types'

const mockSession: SessionUser = {
  id: 'user-1', email: 'test@example.com', name: 'Test', role: 'member',
  familyId: 'fam-1', weekStartsOn: 1, timezone: 'Australia/Sydney',
}

describe('GET /api/auth/google/connect', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3300/api/auth/google/callback'
    const { auth } = await import('@/lib/auth')
    vi.mocked(auth).mockResolvedValue({ user: mockSession } as never)
  })

  it('redirects to Google OAuth URL', async () => {
    const req = new Request('http://localhost:3300/api/auth/google/connect')
    const res = await GET(req)
    expect(res.status).toBe(307)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('accounts.google.com/o/oauth2/v2/auth')
    expect(location).toContain('test-client-id')
    expect(location).toContain('calendar.events')
  })

  it('sets google_oauth_state cookie on the redirect response', async () => {
    const req = new Request('http://localhost:3300/api/auth/google/connect')
    const res = await GET(req)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('google_oauth_state')
    expect(setCookie).toContain('HttpOnly')
  })
})
