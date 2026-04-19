# Google Calendar Push Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push HomeBase calendar events to each user's primary Google Calendar (fire-and-forget), with personal/family event visibility and a manual bulk sync button in Settings.

**Architecture:** Google OAuth tokens stored per-user in DB; a pure HTTP helper lib calls the Google Calendar REST API; a coordinator function loads affected users from DB and pushes events; event API routes trigger fire-and-forget push after each write; Settings UI lets users connect, bulk-sync, and disconnect.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + better-sqlite3, NextAuth v5, Vitest, Tailwind v4, shadcn/ui, sonner toasts, Google Calendar REST API (no SDK — raw fetch).

---

## Prerequisites

Before starting, add these to `.env.local` (get values from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID with redirect URI `http://localhost:3300/api/auth/google/callback`):

```
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3300/api/auth/google/callback
```

---

## File Map

| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Create | `src/lib/google-calendar.ts` |
| Create | `src/lib/__tests__/google-calendar.test.ts` |
| Create | `src/lib/google-sync.ts` |
| Create | `src/lib/__tests__/google-sync.test.ts` |
| Create | `src/app/api/auth/google/connect/route.ts` |
| Create | `src/app/api/auth/google/callback/route.ts` |
| Create | `src/app/api/auth/google/connect/__tests__/route.test.ts` |
| Create | `src/app/api/auth/google/callback/__tests__/route.test.ts` |
| Create | `src/app/api/auth/google/disconnect/route.ts` |
| Create | `src/app/api/auth/google/disconnect/__tests__/route.test.ts` |
| Create | `src/app/api/google-calendar/sync/route.ts` |
| Create | `src/app/api/google-calendar/sync/__tests__/route.test.ts` |
| Modify | `src/lib/event-helpers.ts` |
| Modify | `src/app/api/events/route.ts` |
| Modify | `src/app/api/events/[id]/route.ts` |
| Modify | `src/app/api/events/__tests__/route.test.ts` (create if missing) |
| Modify | `src/app/api/events/[id]/__tests__/route.test.ts` (create if missing) |
| Modify | `src/types/index.ts` |
| Modify | `src/app/(app)/calendar/page.tsx` |
| Modify | `src/components/calendar/EventModal.tsx` |
| Modify | `src/components/calendar/CalendarView.tsx` |
| Modify | `src/components/calendar/EventBadge.tsx` |
| Modify | `src/components/calendar/MonthView.tsx` |
| Modify | `src/components/calendar/WeekView.tsx` |
| Modify | `src/app/(app)/settings/page.tsx` |
| Create | `src/components/settings/GoogleCalendarCard.tsx` |
| Modify | `src/components/settings/IntegrationsTab.tsx` |

---

## Task 1: Schema — add isPersonal to Event, Google fields to User, GoogleCalendarSync model

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `isPersonal` to the Event model and Google fields to User**

Open `prisma/schema.prisma`. In the `Event` model, add after `isAllDay`:
```prisma
  isPersonal  Boolean  @default(false)
```

In the `Event` model, add the relation (after the `family` relation):
```prisma
  googleCalendarSyncs GoogleCalendarSync[]
```

In the `User` model, add after `weekStartsOn`:
```prisma
  googleConnected     Boolean  @default(false)
  googleEmail         String?
  googleRefreshToken  String?
  googleCalendarSyncs GoogleCalendarSync[]
```

- [ ] **Step 2: Add the GoogleCalendarSync model**

At the end of `prisma/schema.prisma`, add:

```prisma
model GoogleCalendarSync {
  id            String   @id @default(cuid())
  eventId       String
  userId        String
  googleEventId String
  createdAt     DateTime @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId],  references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
}
```

- [ ] **Step 3: Run migration**

```bash
cd "C:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
DATABASE_URL=file:./homebase.db npx prisma migrate dev --name add_google_calendar_sync
```

Expected output: `Your database is now in sync with your schema.`

- [ ] **Step 4: Regenerate Prisma client**

```bash
DATABASE_URL=file:./homebase.db npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add isPersonal, Google OAuth fields, GoogleCalendarSync schema"
```

---

## Task 2: Google Calendar HTTP helpers

**Files:**
- Create: `src/lib/google-calendar.ts`
- Create: `src/lib/__tests__/google-calendar.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/google-calendar.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "C:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
npx vitest run src/lib/__tests__/google-calendar.test.ts --reporter=verbose
```

Expected: all tests fail with `Cannot find module '@/lib/google-calendar'`.

- [ ] **Step 3: Implement `src/lib/google-calendar.ts`**

Create `src/lib/google-calendar.ts`:

```typescript
interface GoogleEventInput {
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
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/lib/__tests__/google-calendar.test.ts --reporter=verbose
```

Expected: all 9 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google-calendar.ts src/lib/__tests__/google-calendar.test.ts
git commit -m "feat: add Google Calendar HTTP helpers"
```

---

## Task 3: pushEventToGoogle coordinator

**Files:**
- Create: `src/lib/google-sync.ts`
- Create: `src/lib/__tests__/google-sync.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/google-sync.test.ts`:

```typescript
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
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/__tests__/google-sync.test.ts --reporter=verbose
```

Expected: all tests fail with `Cannot find module '@/lib/google-sync'`.

- [ ] **Step 3: Implement `src/lib/google-sync.ts`**

Create `src/lib/google-sync.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { getAccessToken, createGoogleEvent, updateGoogleEvent } from '@/lib/google-calendar'

export async function pushEventToGoogle(
  eventId: string,
  operation: 'create' | 'update'
): Promise<void> {
  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } })
    if (!event) return

    const allConnected = await prisma.user.findMany({
      where: { familyId: event.familyId, googleConnected: true },
      select: { id: true, googleRefreshToken: true },
    })

    // Personal events only push to creator; family events push to all connected users
    const targetUsers = event.isPersonal
      ? allConnected.filter((u) => u.id === event.createdBy)
      : allConnected

    const existingSyncs = await prisma.googleCalendarSync.findMany({
      where: { eventId },
    })
    const syncMap = new Map(existingSyncs.map((s) => [s.userId, s]))

    const eventInput = {
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      isAllDay: event.isAllDay,
    }

    const targetUserIds = new Set(targetUsers.map((u) => u.id))

    // Remove from users who should no longer have the event (visibility changed)
    for (const sync of existingSyncs) {
      if (!targetUserIds.has(sync.userId)) {
        const user = allConnected.find((u) => u.id === sync.userId)
        if (user?.googleRefreshToken) {
          try {
            const { deleteGoogleEvent } = await import('@/lib/google-calendar')
            const token = await getAccessToken(user.googleRefreshToken)
            await deleteGoogleEvent(token, sync.googleEventId)
          } catch {
            // swallow
          }
        }
        await prisma.googleCalendarSync.delete({ where: { id: sync.id } })
      }
    }

    // Create or update for target users
    for (const user of targetUsers) {
      if (!user.googleRefreshToken) continue
      try {
        const token = await getAccessToken(user.googleRefreshToken)
        const existing = syncMap.get(user.id)
        if (existing) {
          await updateGoogleEvent(token, existing.googleEventId, eventInput)
        } else {
          const googleEventId = await createGoogleEvent(token, eventInput)
          await prisma.googleCalendarSync.create({
            data: { eventId, userId: user.id, googleEventId },
          })
        }
      } catch {
        // swallow individual user errors
      }
    }
  } catch (err) {
    console.error('[google-sync] pushEventToGoogle failed:', err)
  }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/lib/__tests__/google-sync.test.ts --reporter=verbose
```

Expected: all 6 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google-sync.ts src/lib/__tests__/google-sync.test.ts
git commit -m "feat: add pushEventToGoogle coordinator"
```

---

## Task 4: OAuth connect + callback routes

**Files:**
- Create: `src/app/api/auth/google/connect/route.ts`
- Create: `src/app/api/auth/google/callback/route.ts`
- Create: `src/app/api/auth/google/connect/__tests__/route.test.ts`
- Create: `src/app/api/auth/google/callback/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/auth/google/connect/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/auth-helpers', () => ({ requireSession: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

const mockSession: SessionUser = {
  id: 'user-1', email: 'test@example.com', name: 'Test', role: 'member',
  familyId: 'fam-1', weekStartsOn: 1, timezone: 'Australia/Sydney',
}

describe('GET /api/auth/google/connect', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env.GOOGLE_CLIENT_ID = 'test-client-id'
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3300/api/auth/google/callback'
    const { requireSession } = await import('@/lib/auth-helpers')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
  })

  it('redirects to Google OAuth URL', async () => {
    const req = new Request('http://localhost:3300/api/auth/google/connect')
    const res = await GET(req)
    expect(res.status).toBe(302)
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
```

Create `src/app/api/auth/google/callback/__tests__/route.test.ts`:

```typescript
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
    expect(res.status).toBe(302)
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/auth/google --reporter=verbose
```

Expected: all tests fail with module not found errors.

- [ ] **Step 3: Implement connect route**

Create `src/app/api/auth/google/connect/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(_req: Request) {
  await requireSession()

  const state = randomUUID()

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  const response = NextResponse.redirect(googleUrl)
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return response
}
```

- [ ] **Step 4: Implement callback route**

Create `src/app/api/auth/google/callback/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const storedState = cookieStore.get('google_oauth_state')?.value

  if (!state || state !== storedState) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 400 })
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 })
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  const tokenData = await tokenRes.json() as {
    access_token?: string
    refresh_token?: string
    id_token?: string
    error?: string
  }

  if (!tokenData.access_token || !tokenData.refresh_token) {
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 400 })
  }

  // Fetch Google email from userinfo
  let googleEmail: string | null = null
  try {
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const info = await infoRes.json() as { email?: string }
    googleEmail = info.email ?? null
  } catch {
    // email is optional
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      googleConnected: true,
      googleRefreshToken: tokenData.refresh_token,
      googleEmail,
    },
  })

  const response = NextResponse.redirect(
    new URL('/settings?google=connected', req.url)
  )
  response.cookies.delete('google_oauth_state')
  return response
}
```

- [ ] **Step 5: Run tests — expect all pass**

```bash
npx vitest run src/app/api/auth/google --reporter=verbose
```

Expected: all 5 tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/google/connect/ src/app/api/auth/google/callback/
git commit -m "feat: add Google OAuth connect and callback routes"
```

---

## Task 5: OAuth disconnect route

**Files:**
- Create: `src/app/api/auth/google/disconnect/route.ts`
- Create: `src/app/api/auth/google/disconnect/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/auth/google/disconnect/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/auth-helpers', () => ({ requireSession: vi.fn() }))
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
    const { requireSession } = await import('@/lib/auth-helpers')
    const { prisma } = await import('@/lib/prisma')
    const gc = await import('@/lib/google-calendar')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/auth/google/disconnect --reporter=verbose
```

Expected: all tests fail.

- [ ] **Step 3: Implement the disconnect route**

Create `src/app/api/auth/google/disconnect/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { getAccessToken, deleteGoogleEvent } from '@/lib/google-calendar'

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json() as { deleteFromGoogle?: boolean }

  if (typeof body.deleteFromGoogle !== 'boolean') {
    return NextResponse.json({ error: 'deleteFromGoogle must be a boolean' }, { status: 400 })
  }

  if (body.deleteFromGoogle) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { googleRefreshToken: true },
    })

    if (dbUser?.googleRefreshToken) {
      const syncRows = await prisma.googleCalendarSync.findMany({
        where: { userId: user.id },
      })

      let token: string | null = null
      try {
        token = await getAccessToken(dbUser.googleRefreshToken)
      } catch {
        // If we can't get a token, skip deletion from Google
      }

      if (token) {
        for (const row of syncRows) {
          try {
            await deleteGoogleEvent(token, row.googleEventId)
          } catch {
            // Log but continue — clear HomeBase data regardless
            console.error(`[disconnect] Failed to delete Google event ${row.googleEventId}`)
          }
        }
      }

      await prisma.googleCalendarSync.deleteMany({ where: { userId: user.id } })
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { googleConnected: false, googleRefreshToken: null, googleEmail: null },
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/app/api/auth/google/disconnect --reporter=verbose
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/google/disconnect/
git commit -m "feat: add Google OAuth disconnect route"
```

---

## Task 6: Manual bulk sync route

**Files:**
- Create: `src/app/api/google-calendar/sync/route.ts`
- Create: `src/app/api/google-calendar/sync/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/google-calendar/sync/__tests__/route.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/google-calendar --reporter=verbose
```

Expected: all tests fail.

- [ ] **Step 3: Implement the sync route**

Create `src/app/api/google-calendar/sync/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { getAccessToken, createGoogleEvent } from '@/lib/google-calendar'

export async function POST(_req: Request) {
  const user = await requireSession()

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { googleConnected: true, googleRefreshToken: true },
  })

  if (!dbUser?.googleConnected || !dbUser.googleRefreshToken) {
    return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 })
  }

  const now = new Date()
  const twelveMonthsLater = new Date(now)
  twelveMonthsLater.setFullYear(twelveMonthsLater.getFullYear() + 1)

  const events = await prisma.event.findMany({
    where: {
      familyId: user.familyId,
      start: { gte: now, lte: twelveMonthsLater },
    },
  })

  const existingSyncs = await prisma.googleCalendarSync.findMany({
    where: { userId: user.id },
    select: { eventId: true },
  })
  const syncedEventIds = new Set(existingSyncs.map((s) => s.eventId))

  let synced = 0
  let skipped = 0

  let token: string
  try {
    token = await getAccessToken(dbUser.googleRefreshToken)
  } catch {
    return NextResponse.json({ error: 'Failed to authenticate with Google' }, { status: 502 })
  }

  for (const event of events) {
    // Skip personal events from other users
    if (event.isPersonal && event.createdBy !== user.id) {
      skipped++
      continue
    }

    // Skip already-synced events
    if (syncedEventIds.has(event.id)) {
      skipped++
      continue
    }

    try {
      const googleEventId = await createGoogleEvent(token, {
        title: event.title,
        description: event.description,
        start: event.start,
        end: event.end,
        isAllDay: event.isAllDay,
      })
      await prisma.googleCalendarSync.create({
        data: { eventId: event.id, userId: user.id, googleEventId },
      })
      synced++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ synced, skipped })
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/app/api/google-calendar --reporter=verbose
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/google-calendar/
git commit -m "feat: add manual bulk Google Calendar sync route"
```

---

## Task 7: Event API — isPersonal field, masking, creator guards, fire-and-forget push

**Files:**
- Modify: `src/lib/event-helpers.ts`
- Modify: `src/app/api/events/route.ts`
- Modify: `src/app/api/events/[id]/route.ts`
- Create: `src/app/api/events/__tests__/route.test.ts`
- Create: `src/app/api/events/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests for GET and POST**

Create `src/app/api/events/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/auth-helpers', () => ({ requireSession: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { event: { findMany: vi.fn(), create: vi.fn() } },
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
    const { requireSession } = await import('@/lib/auth-helpers')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
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
    expect(body[0].title).toBe('Busy')
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
    const { requireSession } = await import('@/lib/auth-helpers')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
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
    // pushEventToGoogle is called (fire-and-forget, so it may not have resolved yet)
    expect(pushEventToGoogle).toHaveBeenCalledWith('e1', 'create')
  })
})
```

Create `src/app/api/events/[id]/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PUT, DELETE } from '../route'
import type { SessionUser } from '@/types'

vi.mock('@/lib/auth-helpers', () => ({ requireSession: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    event: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    googleCalendarSync: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/google-sync', () => ({ pushEventToGoogle: vi.fn() }))
vi.mock('@/lib/google-calendar', () => ({
  getAccessToken: vi.fn(),
  deleteGoogleEvent: vi.fn(),
}))

const mockSession: SessionUser = {
  id: 'user-1', email: 'test@example.com', name: 'Test', role: 'member',
  familyId: 'fam-1', weekStartsOn: 1, timezone: 'Australia/Sydney',
}

const myPersonalEvent = {
  id: 'e1', title: 'Doctor', description: null,
  start: new Date('2026-05-01T09:00:00Z'), end: new Date('2026-05-01T10:00:00Z'),
  isAllDay: false, isPersonal: true, createdBy: 'user-1', familyId: 'fam-1',
  category: null, color: null, createdAt: new Date(),
}

const otherPersonalEvent = { ...myPersonalEvent, createdBy: 'user-2' }

const params = Promise.resolve({ id: 'e1' })

describe('PUT /api/events/[id]', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.event.findFirst).mockResolvedValue(myPersonalEvent as never)
    vi.mocked(prisma.event.update).mockResolvedValue(myPersonalEvent as never)
  })

  it('allows creator to edit their own personal event', async () => {
    const req = new Request('http://localhost/api/events/e1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Doctor updated' }),
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(200)
  })

  it('returns 403 when non-creator tries to edit a personal event', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.event.findFirst).mockResolvedValue(otherPersonalEvent as never)
    const req = new Request('http://localhost/api/events/e1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Hack' }),
    })
    const res = await PUT(req, { params })
    expect(res.status).toBe(403)
  })

  it('triggers pushEventToGoogle after update', async () => {
    const { pushEventToGoogle } = await import('@/lib/google-sync')
    const req = new Request('http://localhost/api/events/e1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated' }),
    })
    await PUT(req, { params })
    expect(pushEventToGoogle).toHaveBeenCalledWith('e1', 'update')
  })
})

describe('DELETE /api/events/[id]', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { requireSession } = await import('@/lib/auth-helpers')
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(requireSession).mockResolvedValue(mockSession)
    vi.mocked(prisma.event.findFirst).mockResolvedValue(myPersonalEvent as never)
    vi.mocked(prisma.event.delete).mockResolvedValue(myPersonalEvent as never)
    vi.mocked(prisma.googleCalendarSync.findMany).mockResolvedValue([])
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
  })

  it('allows creator to delete their own personal event', async () => {
    const res = await DELETE(new Request('http://localhost/api/events/e1'), { params })
    expect(res.status).toBe(200)
  })

  it('returns 403 when non-creator tries to delete a personal event', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.event.findFirst).mockResolvedValue(otherPersonalEvent as never)
    const res = await DELETE(new Request('http://localhost/api/events/e1'), { params })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/events --reporter=verbose
```

Expected: tests fail.

- [ ] **Step 3: Add `maskPersonalEvent` helper to `src/lib/event-helpers.ts`**

Append to `src/lib/event-helpers.ts`:

```typescript
export interface EventRow {
  id: string
  title: string
  description: string | null
  start: Date
  end: Date
  isAllDay: boolean
  isPersonal: boolean
  category: string | null
  color: string | null
  createdBy: string
  familyId: string
  createdAt: Date
}

export function maskPersonalEvent(event: EventRow, viewerUserId: string) {
  if (event.isPersonal && event.createdBy !== viewerUserId) {
    return {
      ...event,
      title: 'Busy',
      description: null,
      category: null,
      color: null,
      isBusy: true,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      createdAt: event.createdAt.toISOString(),
    }
  }
  return {
    ...event,
    isBusy: false,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    createdAt: event.createdAt.toISOString(),
  }
}
```

- [ ] **Step 4: Update `src/app/api/events/route.ts`**

Replace the entire file with:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { validateEventDates, maskPersonalEvent } from '@/lib/event-helpers'
import { pushEventToGoogle } from '@/lib/google-sync'

export async function GET(req: Request) {
  const user = await requireSession()
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where: Record<string, unknown> = { familyId: user.familyId }
  if (from && to) {
    where.start = { gte: new Date(from), lte: new Date(to) }
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { start: 'asc' },
  })

  return NextResponse.json(events.map((e) => maskPersonalEvent(e, user.id)))
}

export async function POST(req: Request) {
  const user = await requireSession()
  const body = await req.json()
  const { title, description, start, end, isAllDay, category, color, isPersonal } = body

  if (!title || !start || !end) {
    return NextResponse.json({ error: 'title, start, and end are required' }, { status: 400 })
  }

  const validation = validateEventDates(start, end, isAllDay)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const event = await prisma.event.create({
    data: {
      title,
      description: description ?? null,
      start: new Date(start),
      end: new Date(end),
      isAllDay: isAllDay ?? false,
      isPersonal: isPersonal ?? false,
      category: category ?? null,
      color: color ?? null,
      createdBy: user.id,
      familyId: user.familyId,
    },
  })

  void pushEventToGoogle(event.id, 'create')

  return NextResponse.json(maskPersonalEvent(event, user.id), { status: 201 })
}
```

- [ ] **Step 5: Update `src/app/api/events/[id]/route.ts`**

Replace the entire file with:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/auth-helpers'
import { validateEventDates, maskPersonalEvent } from '@/lib/event-helpers'
import { pushEventToGoogle } from '@/lib/google-sync'
import { getAccessToken, deleteGoogleEvent } from '@/lib/google-calendar'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const event = await prisma.event.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(maskPersonalEvent(event, user.id))
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params
  const body = await req.json()
  const { title, description, start, end, isAllDay, category, color, isPersonal } = body

  const existing = await prisma.event.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.isPersonal && existing.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (start && end) {
    const validation = validateEventDates(start, end, isAllDay)
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const updated = await prisma.event.update({
    where: { id },
    data: {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(start && { start: new Date(start) }),
      ...(end && { end: new Date(end) }),
      ...(isAllDay !== undefined && { isAllDay }),
      ...(isPersonal !== undefined && { isPersonal }),
      ...(category !== undefined && { category }),
      ...(color !== undefined && { color }),
    },
  })

  void pushEventToGoogle(id, 'update')

  return NextResponse.json(maskPersonalEvent(updated, user.id))
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireSession()
  const { id } = await params

  const existing = await prisma.event.findFirst({
    where: { id, familyId: user.familyId },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.isPersonal && existing.createdBy !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Pre-load Google sync data BEFORE deleting (cascade will remove rows)
  const syncRows = await prisma.googleCalendarSync.findMany({
    where: { eventId: id },
  })
  const userIds = syncRows.map((r) => r.userId)
  const connectedUsers = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, googleRefreshToken: true },
      })
    : []

  await prisma.event.delete({ where: { id } })

  // Fire-and-forget: delete from each user's Google Calendar
  void (async () => {
    for (const row of syncRows) {
      const u = connectedUsers.find((x) => x.id === row.userId)
      if (!u?.googleRefreshToken) continue
      try {
        const token = await getAccessToken(u.googleRefreshToken)
        await deleteGoogleEvent(token, row.googleEventId)
      } catch (err) {
        console.error('[events] Failed to delete Google event', err)
      }
    }
  })()

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 6: Run tests — expect all pass**

```bash
npx vitest run src/app/api/events --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/event-helpers.ts src/app/api/events/
git commit -m "feat: add isPersonal field, personal event masking, creator guards, fire-and-forget push"
```

---

## Task 8: Types, calendar page, EventModal personal toggle, CalendarView busy handling

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/app/(app)/calendar/page.tsx`
- Modify: `src/components/calendar/EventModal.tsx`
- Modify: `src/components/calendar/CalendarView.tsx`

No unit tests — all client components. Verify by hand after Task 10.

- [ ] **Step 1: Update `CalendarEvent` type in `src/types/index.ts`**

Find the `CalendarEvent` interface and replace it with:

```typescript
export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  start: string
  end: string
  isAllDay: boolean
  isPersonal: boolean
  isBusy: boolean
  category: string | null
  color: string | null
  createdBy: string
}
```

- [ ] **Step 2: Update `src/app/(app)/calendar/page.tsx`**

The server page queries events from DB directly. Apply the same masking logic:

Replace the file with:

```typescript
import { CalendarView } from '@/components/calendar/CalendarView'
import { requireSession } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { maskPersonalEvent } from '@/lib/event-helpers'
import type { CalendarEvent } from '@/types'

export default async function CalendarPage() {
  const user = await requireSession()

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 31)

  const events = await prisma.event.findMany({
    where: { familyId: user.familyId, start: { gte: from, lte: to } },
    orderBy: { start: 'asc' },
  })

  const calendarEvents: CalendarEvent[] = events.map((e) => {
    const masked = maskPersonalEvent(e, user.id)
    return {
      id: masked.id,
      title: masked.title,
      description: masked.description,
      start: masked.start,
      end: masked.end,
      isAllDay: masked.isAllDay,
      isPersonal: masked.isPersonal,
      isBusy: masked.isBusy,
      category: masked.category,
      color: masked.color,
      createdBy: masked.createdBy,
    }
  })

  return (
    <CalendarView
      initialEvents={calendarEvents}
      weekStartsOn={user.weekStartsOn as 0 | 1}
    />
  )
}
```

- [ ] **Step 3: Add personal/family toggle to `EventModal.tsx`**

In `src/components/calendar/EventModal.tsx`:

Add `isPersonal` state after the existing `useState` declarations:
```typescript
  const [isPersonal, setIsPersonal] = useState(false)
```

In the `useEffect` that sets form values, add:
```typescript
      setIsPersonal(event.isPersonal ?? false)
```
And in the else branch (new event):
```typescript
      setIsPersonal(false)
```

In `handleSave`, include `isPersonal` in the request body:
```typescript
      body: JSON.stringify({ title, description, start: startDate, end: endDate, isAllDay, category, isPersonal }),
```

In the JSX, add the toggle after the category select:
```tsx
          <div className="flex items-center gap-3 pt-1">
            <span className="text-sm font-medium">Visibility</span>
            <div className="flex rounded-md border border-border overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setIsPersonal(false)}
                className={`px-3 py-1 transition-colors ${!isPersonal ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              >
                Family
              </button>
              <button
                type="button"
                onClick={() => setIsPersonal(true)}
                className={`px-3 py-1 transition-colors ${isPersonal ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
              >
                Personal
              </button>
            </div>
          </div>
```

- [ ] **Step 4: Update `CalendarView.tsx` to not open modal for busy events**

In `src/components/calendar/CalendarView.tsx`, find the `openEdit` function and replace it with:

```typescript
  function openEdit(event: CalendarEvent) {
    if (event.isBusy) return // Cannot edit other users' personal events
    setSelectedEvent(event)
    setDefaultDate(undefined)
    setModalOpen(true)
  }
```

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/app/\(app\)/calendar/page.tsx src/components/calendar/EventModal.tsx src/components/calendar/CalendarView.tsx
git commit -m "feat: add isPersonal toggle in EventModal, block Busy event editing"
```

---

## Task 9: Calendar rendering — Busy blocks in EventBadge, MonthView, WeekView

**Files:**
- Modify: `src/components/calendar/EventBadge.tsx`
- Modify: `src/components/calendar/MonthView.tsx`
- Modify: `src/components/calendar/WeekView.tsx`

No unit tests — visual components. Verify by hand after Task 10.

- [ ] **Step 1: Update `EventBadge.tsx` to render busy events differently**

Replace the file with:

```typescript
import type { CalendarEvent } from '@/types'

const CATEGORY_COLORS: Record<string, string> = {
  Medical: '#ef4444',
  School: '#3b82f6',
  Social: '#8b5cf6',
  Work: '#f59e0b',
  Other: '#6b7280',
}

export function EventBadge({
  event,
  onClick,
}: {
  event: CalendarEvent
  onClick: (event: CalendarEvent) => void
}) {
  if (event.isBusy) {
    return (
      <div className="w-full text-left truncate text-xs px-1.5 py-0.5 rounded font-medium bg-muted text-muted-foreground cursor-default select-none">
        Busy
      </div>
    )
  }

  const color = event.color ?? CATEGORY_COLORS[event.category ?? ''] ?? '#6366f1'

  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(event) }}
      className="w-full text-left truncate text-xs px-1.5 py-0.5 rounded font-medium"
      style={{ backgroundColor: color + '33', color }}
    >
      {event.title}
    </button>
  )
}
```

- [ ] **Step 2: No changes needed to MonthView or WeekView**

`MonthView` and `WeekView` both call `onEventClick(event)` via `EventBadge`'s `onClick` prop. Since `EventBadge` now renders a non-clickable `<div>` for busy events (no `onClick` prop passed), and `CalendarView.openEdit` already guards against `isBusy`, no changes are needed in the view components.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/EventBadge.tsx
git commit -m "feat: render Busy placeholder for other users' personal events"
```

---

## Task 10: Settings UI — Google Calendar card

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`
- Create: `src/components/settings/GoogleCalendarCard.tsx`
- Modify: `src/components/settings/IntegrationsTab.tsx`

No unit tests — client UI. Verify by hand.

- [ ] **Step 1: Update `src/app/(app)/settings/page.tsx` to fetch Google connection state**

Find the `prisma.user.findUnique` call and add `googleConnected` and `googleEmail` to the `select`:

```typescript
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        theme: true,
        fontSize: true,
        weekStartsOn: true,
        googleConnected: true,
        googleEmail: true,
        family: {
          select: {
            id: true,
            name: true,
            umamiScriptUrl: true,
            umamiSiteId: true,
          },
        },
      },
```

In the `IntegrationsTab` usage, add the new props:

```typescript
            <IntegrationsTab
              isAdmin={user.role === 'admin'}
              initialUmamiScriptUrl={user.family.umamiScriptUrl}
              initialUmamiSiteId={user.family.umamiSiteId}
              googleConnected={user.googleConnected}
              googleEmail={user.googleEmail}
            />
```

- [ ] **Step 2: Create `src/components/settings/GoogleCalendarCard.tsx`**

Create `src/components/settings/GoogleCalendarCard.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, AlertCircle, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'

interface GoogleCalendarCardProps {
  googleConnected: boolean
  googleEmail: string | null
}

export function GoogleCalendarCard({ googleConnected, googleEmail }: GoogleCalendarCardProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [deleteFromGoogle, setDeleteFromGoogle] = useState(false)

  useEffect(() => {
    if (searchParams.get('google') === 'connected') {
      toast.success('Google Calendar connected successfully')
      router.replace('/settings?tab=integrations')
    }
  }, [searchParams, router])

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/google-calendar/sync', { method: 'POST' })
      const data = await res.json() as { synced?: number; skipped?: number; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? 'Sync failed. Please try again.')
      } else {
        toast.success(`${data.synced} event${data.synced !== 1 ? 's' : ''} synced to Google Calendar`)
      }
    } catch {
      toast.error('Sync failed. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      const res = await fetch('/api/auth/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteFromGoogle }),
      })
      if (res.ok) {
        toast.success('Google Calendar disconnected')
        setShowDisconnectModal(false)
        router.refresh()
      } else {
        toast.error('Failed to disconnect. Please try again.')
      }
    } catch {
      toast.error('Failed to disconnect. Please try again.')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Google Calendar
          </CardTitle>
          <CardDescription>
            {googleConnected
              ? 'Events you create in HomeBase are automatically pushed to your Google Calendar.'
              : 'Connect your Google account to automatically sync HomeBase events to your Google Calendar.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {googleConnected ? (
            <>
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                Connected as {googleEmail}
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSync} disabled={syncing} variant="outline">
                  {syncing ? 'Syncing…' : 'Sync next 12 months'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setDeleteFromGoogle(false); setShowDisconnectModal(true) }}
                >
                  Disconnect
                </Button>
              </div>
            </>
          ) : (
            <Button asChild variant="outline">
              <a href="/api/auth/google/connect">
                <CalendarDays className="h-4 w-4 mr-2" />
                Connect Google Calendar
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Disconnect Google Calendar</p>
                <p className="text-sm text-muted-foreground mt-1">What would you like to do with your synced events?</p>
              </div>
            </div>
            <div className="space-y-2 pl-8">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="disconnect-mode"
                  checked={!deleteFromGoogle}
                  onChange={() => setDeleteFromGoogle(false)}
                />
                Keep my events in Google Calendar
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="disconnect-mode"
                  checked={deleteFromGoogle}
                  onChange={() => setDeleteFromGoogle(true)}
                />
                Delete synced events from Google Calendar
              </label>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowDisconnectModal(false)} disabled={disconnecting}>
                Cancel
              </Button>
              <Button onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Update `IntegrationsTab.tsx` to accept and render `GoogleCalendarCard`**

Add `googleConnected` and `googleEmail` to the props interface:

```typescript
interface IntegrationsTabProps {
  isAdmin: boolean
  initialUmamiScriptUrl: string | null
  initialUmamiSiteId: string | null
  googleConnected: boolean
  googleEmail: string | null
}
```

Update the function signature to destructure the new props:
```typescript
export function IntegrationsTab({ isAdmin, initialUmamiScriptUrl, initialUmamiSiteId, googleConnected, googleEmail }: IntegrationsTabProps) {
```

Add this import at the top of the file:
```typescript
import { GoogleCalendarCard } from './GoogleCalendarCard'
```

Add the `GoogleCalendarCard` at the top of the returned `<div className="space-y-6">`:
```typescript
    <div className="space-y-6">
      <GoogleCalendarCard googleConnected={googleConnected} googleEmail={googleEmail} />
      {/* existing cards below */}
```

- [ ] **Step 4: Run the full test suite**

```bash
cd "C:/Users/liddlem/Downloads/Claude Apps/HomeBase/homebase"
npx vitest run --reporter=verbose 2>&1 | tail -10
```

Expected: all tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/settings/page.tsx src/components/settings/GoogleCalendarCard.tsx src/components/settings/IntegrationsTab.tsx
git commit -m "feat: add Google Calendar settings UI with connect, sync, and disconnect"
```

---

## Manual Verification Checklist

After all tasks, start the dev server and verify in the browser at `http://localhost:3300`:

1. **Settings → Integrations tab** — "Google Calendar" card appears
2. **Connect** — clicking "Connect Google Calendar" redirects to Google OAuth consent (requires real `GOOGLE_CLIENT_ID` in `.env.local`)
3. **After connect** — toast "Google Calendar connected successfully" appears; card shows connected email
4. **Sync next 12 months** — clicking the button shows loading state, then toast with event count
5. **Create a Family event** — create an event from the calendar. No error on creation. Check Google Calendar to confirm event appears (requires real credentials)
6. **Create a Personal event** — select "Personal" in the visibility toggle. Other users see it as "Busy" in the calendar; creator sees full details
7. **Edit/delete as non-creator** — attempting via direct API call or logged-in as different user returns 403
8. **Disconnect (keep)** — card returns to disconnected state; Google events remain
9. **Disconnect (delete)** — card returns to disconnected state; Google events removed
