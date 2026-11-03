import { describe, it, expect, vi, beforeEach } from 'vitest'
import { keepGoogleTokensAlive } from '@/lib/google-sync'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/google-calendar', () => ({
  getAccessToken: vi.fn(),
  createGoogleEvent: vi.fn(),
  updateGoogleEvent: vi.fn(),
  deleteGoogleEvent: vi.fn(),
}))

vi.mock('@/lib/push', () => ({
  sendPushToUser: vi.fn(),
}))

const connectedUsers = [
  { id: 'user-1', googleRefreshToken: 'rt1' },
  { id: 'user-2', googleRefreshToken: 'rt2' },
]

describe('keepGoogleTokensAlive', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    const push = await import('@/lib/push')
    vi.mocked(prisma.user.findMany).mockResolvedValue(connectedUsers as never)
    vi.mocked(gc.getAccessToken).mockResolvedValue('tok')
    vi.mocked(push.sendPushToUser).mockResolvedValue(1)
  })

  it('exchanges every connected user\'s refresh token', async () => {
    const gc = await import('@/lib/google-calendar')
    await keepGoogleTokensAlive()
    expect(gc.getAccessToken).toHaveBeenCalledWith('rt1')
    expect(gc.getAccessToken).toHaveBeenCalledWith('rt2')
  })

  it('pushes a reconnect alert when Google rejects the token (invalid_grant)', async () => {
    const gc = await import('@/lib/google-calendar')
    const push = await import('@/lib/push')
    vi.mocked(gc.getAccessToken)
      .mockRejectedValueOnce(new Error('Failed to obtain Google access token: invalid_grant'))
      .mockResolvedValueOnce('tok')
    await keepGoogleTokensAlive()
    expect(push.sendPushToUser).toHaveBeenCalledTimes(1)
    expect(push.sendPushToUser).toHaveBeenCalledWith('user-1', expect.objectContaining({ url: '/settings?tab=integrations' }))
    // second user still refreshed after the first failed
    expect(gc.getAccessToken).toHaveBeenCalledWith('rt2')
  })

  it('does not alert on transient failures (network error)', async () => {
    const gc = await import('@/lib/google-calendar')
    const push = await import('@/lib/push')
    vi.mocked(gc.getAccessToken).mockRejectedValue(new Error('fetch failed'))
    await keepGoogleTokensAlive()
    expect(push.sendPushToUser).not.toHaveBeenCalled()
  })

  it('does nothing when no users are connected', async () => {
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
    await keepGoogleTokensAlive()
    expect(gc.getAccessToken).not.toHaveBeenCalled()
  })
})
