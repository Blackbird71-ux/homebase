import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAccessToken, createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from '@/lib/google-calendar'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const sampleEvent = {
  title: 'School Run',
  description: 'Drop off at 8am',
  start: new Date('2026-05-01T08:00:00Z'),
  end: new Date('2026-05-01T08:30:00Z'),
  isAllDay: false,
}

const allDayEvent = {
  title: 'Public Holiday',
  description: null,
  start: new Date('2026-05-01T00:00:00Z'),
  end: new Date('2026-05-01T00:00:00Z'),
  isAllDay: true,
}

describe('getAccessToken', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns access_token from Google token endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok123' }),
    })
    const token = await getAccessToken('refresh-abc')
    expect(token).toBe('tok123')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws if access_token is missing in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'invalid_grant' }),
    })
    await expect(getAccessToken('bad-refresh')).rejects.toThrow()
  })
})

describe('createGoogleEvent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('POSTs to primary calendar and returns googleEventId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'google-evt-1' }),
    })
    const id = await createGoogleEvent('tok', sampleEvent)
    expect(id).toBe('google-evt-1')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends dateTime for timed events', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'x' }) })
    await createGoogleEvent('tok', sampleEvent)
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.start.dateTime).toBeDefined()
    expect(body.start.date).toBeUndefined()
  })

  it('sends date (not dateTime) for all-day events', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'x' }) })
    await createGoogleEvent('tok', allDayEvent)
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    expect(body.start.date).toBeDefined()
    expect(body.start.dateTime).toBeUndefined()
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    await expect(createGoogleEvent('tok', sampleEvent)).rejects.toThrow()
  })
})

describe('updateGoogleEvent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('PUTs to the correct Google event URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await updateGoogleEvent('tok', 'gid-1', sampleEvent)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/gid-1',
      expect.objectContaining({ method: 'PUT' })
    )
  })
})

describe('deleteGoogleEvent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('DELETEs the correct Google event URL', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await deleteGoogleEvent('tok', 'gid-2')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/gid-2',
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})
