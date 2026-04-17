export interface GoogleEventInput {
  title: string
  description: string | null
  start: Date
  end: Date
  isAllDay: boolean
}

interface GoogleEventBody {
  summary: string
  description?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

function buildGoogleEvent(event: GoogleEventInput): GoogleEventBody {
  if (event.isAllDay) {
    const startDate = event.start.toISOString().slice(0, 10)
    // Google all-day end is exclusive: add one day
    const endMs = event.end.getTime() + 86400000
    const endDate = new Date(endMs).toISOString().slice(0, 10)
    return {
      summary: event.title,
      ...(event.description && { description: event.description }),
      start: { date: startDate },
      end: { date: endDate },
    }
  }
  return {
    summary: event.title,
    ...(event.description && { description: event.description }),
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: event.end.toISOString() },
  }
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string }
  if (!data.access_token) throw new Error('Failed to obtain Google access token')
  return data.access_token
}

export async function createGoogleEvent(accessToken: string, event: GoogleEventInput): Promise<string> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildGoogleEvent(event)),
  })
  if (!res.ok) throw new Error(`Google Calendar API error: ${res.status}`)
  const data = await res.json() as { id: string }
  if (!data.id) throw new Error('Google Calendar API did not return an event id')
  return data.id
}

export async function updateGoogleEvent(accessToken: string, googleEventId: string, event: GoogleEventInput): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildGoogleEvent(event)),
    }
  )
  if (!res.ok) throw new Error(`Google Calendar API error: ${res.status}`)
}

export async function deleteGoogleEvent(accessToken: string, googleEventId: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  if (!res.ok) throw new Error(`Google Calendar API error: ${res.status}`)
}
