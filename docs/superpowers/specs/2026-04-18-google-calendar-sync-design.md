# Google Calendar Push Sync — Design Spec

**Date:** 2026-04-18
**Scope:** Push-only sync from HomeBase → each user's primary Google Calendar, per-user opt-in, with personal/family event visibility, fire-and-forget automatic push, and a manual bulk sync.

---

## Goals

- Each family member can independently connect their Google account in Settings
- Events created/updated/deleted in HomeBase are automatically pushed to all connected family members' Google Calendars (fire-and-forget, no latency impact on HomeBase operations)
- Personal events are visible only to the creator in full; other family members see a "Busy" placeholder
- A manual "Sync next 12 months" button handles the initial bulk load
- On disconnect, the user chooses to keep or delete their synced events from Google; no re-authentication prompts after the initial connect

---

## Out of Scope

- Pulling events from Google Calendar into HomeBase (push-only)
- Recurring event support (HomeBase has no recurring events)
- Multiple Google accounts per user

---

## Data Model Changes

### `Event` model — add one field

```prisma
isPersonal  Boolean  @default(false)
```

`isPersonal = true` means the event belongs to the creator only. Other family members see it as "Busy" with no details.

### `User` model — add Google OAuth fields

```prisma
googleConnected     Boolean  @default(false)
googleEmail         String?
googleRefreshToken  String?
```

`googleRefreshToken` is stored permanently. A short-lived access token is obtained server-side on demand by exchanging the refresh token — never stored, never prompted again after initial connect.

### New `GoogleCalendarSync` model

Tracks which HomeBase event maps to which Google Calendar event ID, per user. Needed because the same family event is pushed to multiple users' Google Calendars, each producing a distinct Google event ID.

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

`onDelete: Cascade` on `eventId` ensures sync rows are automatically cleaned up when a HomeBase event is deleted.

---

## Google OAuth Connect Flow

This is **separate from login** — credentials auth is unchanged. The Google OAuth flow is solely for calendar write permissions.

### Scopes requested

```
https://www.googleapis.com/auth/calendar.events
```

Write-only scope — HomeBase can create/update/delete events in the user's calendar but cannot read existing events.

### Connect

1. User clicks "Connect Google Calendar" in Settings
2. `GET /api/auth/google/connect` — builds Google OAuth URL with `access_type=offline&prompt=consent` (ensures a refresh token is always returned) and redirects
3. Google OAuth consent screen
4. Google redirects to `GET /api/auth/google/callback?code=...&state=...`
5. Server exchanges code → stores `googleRefreshToken` and `googleEmail` on the User row, sets `googleConnected = true`
6. Redirects back to `/settings` with a success toast

### Disconnect

User clicks "Disconnect" → modal with two options:
- **Keep my events in Google Calendar** — clears `googleRefreshToken`, `googleEmail`, `googleConnected = false`; leaves `GoogleCalendarSync` rows (orphaned, for audit); leaves Google events untouched
- **Delete synced events from Google Calendar** — uses refresh token to get a final access token, calls Google Calendar API to delete each event in `GoogleCalendarSync` for this user, then clears all sync rows and the User's Google fields

`state` parameter on the OAuth URL is a signed CSRF token tied to the session user ID to prevent OAuth callback hijacking.

---

## Push Sync Mechanics

### Automatic push (fire-and-forget)

After every successful `POST`, `PUT`, or `DELETE` on `/api/events` and `/api/events/[id]`, the route calls `pushEventToGoogle(eventId, operation)` without `await` and returns immediately. The user's request completes at HomeBase DB speed regardless of Google's availability.

```
pushEventToGoogle(eventId: string, operation: 'create' | 'update' | 'delete')
```

**Logic:**

1. Load event + all family members with `googleConnected = true`
2. Determine target users:
   - `isPersonal = true` → only the event creator (if connected)
   - `isPersonal = false` → all connected family members
3. For each target user:
   - Exchange `googleRefreshToken` → access token via Google token endpoint
   - **create**: `POST https://www.googleapis.com/calendar/v3/calendars/primary/events` → store returned `googleEventId` in `GoogleCalendarSync`
   - **update**: look up `googleEventId` from `GoogleCalendarSync` → `PUT` to Google. If `isPersonal` changed from `false` → `true`, delete the event from other family members' Google Calendars and remove their `GoogleCalendarSync` rows. If changed from `true` → `false`, push to all newly-eligible connected family members.
   - **delete**: look up `googleEventId` → `DELETE` to Google → remove `GoogleCalendarSync` row
4. Errors are caught, logged to console, and swallowed — HomeBase never fails because Google is unavailable

**Token refresh:** Google access tokens expire after 1 hour. The helper always requests a fresh access token from the token endpoint using the stored refresh token before each push. No caching, no expiry tracking needed.

### Manual bulk sync

`POST /api/google-calendar/sync`

- Requires the calling user to have `googleConnected = true`
- Fetches all events for the family from `now` to `now + 12 months`
- For each event, checks whether a `GoogleCalendarSync` row already exists for this user
  - If yes: skips (idempotent — re-running sync never duplicates events)
  - If no: pushes to Google, stores `GoogleCalendarSync` row
- Filters by visibility: personal events only sync if `createdBy === user.id`
- Returns `{ synced: number, skipped: number }`

---

## Calendar Visibility

### API changes

`GET /api/events` — for each event where `isPersonal = true` and `event.createdBy !== user.id`:
- Replace `title` with `'Busy'`
- Set `description`, `category`, `color` to `null`
- Keep `start`, `end`, `isAllDay` (needed for rendering the block)
- Add `isBusy: true` flag so the client renders it differently

`PUT /api/events/[id]` — if `isPersonal = true` and `createdBy !== user.id`: return 403. Only the creator can edit or delete their personal events.

`DELETE /api/events/[id]` — same 403 guard.

### Client rendering

Events with `isBusy: true`:
- Rendered as a grey/muted block with label "Busy"
- Not clickable (no detail modal)
- Creator's own personal events: rendered normally (they see `isBusy: false`)

### Event form

Adds a visibility toggle to the create/edit event form:
- **Family** (default) — `isPersonal: false`
- **Personal** — `isPersonal: true`

Toggle is always visible; default is Family.

---

## Settings UI

New **"Google Calendar"** section on the Settings page (visible to all users, not admin-only).

### Disconnected state

```
Google Calendar
Connect your Google account to automatically sync HomeBase events
to your Google Calendar.

[Connect Google Calendar]
```

### Connected state

```
Google Calendar
Connected as mark@gmail.com ✓

[Sync next 12 months]   [Disconnect]
```

**Sync button behaviour:**
- Calls `POST /api/google-calendar/sync`
- Button shows loading state during sync
- On complete: sonner toast "X events synced to Google Calendar"
- On error: sonner toast "Sync failed. Please try again."

**Disconnect button behaviour:**
- Opens modal:
  ```
  Disconnect Google Calendar

  ○ Keep my events in Google Calendar
  ○ Delete synced events from Google Calendar

  [Cancel]  [Disconnect]
  ```
- Calls `POST /api/auth/google/disconnect` with the chosen option

---

## File Map

| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Create | `src/lib/google-calendar.ts` |
| Create | `src/app/api/auth/google/connect/route.ts` |
| Create | `src/app/api/auth/google/callback/route.ts` |
| Create | `src/app/api/auth/google/disconnect/route.ts` |
| Create | `src/app/api/google-calendar/sync/route.ts` |
| Modify | `src/app/api/events/route.ts` |
| Modify | `src/app/api/events/[id]/route.ts` |
| Modify | `src/app/(app)/settings/page.tsx` (or settings component) |
| Modify | `src/components/calendar/EventForm.tsx` (or equivalent) |
| Modify | `src/components/calendar/CalendarView.tsx` (or equivalent) |

---

## Environment Variables Required

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3300/api/auth/google/callback
```

These are set by the operator in `.env.local`. No UI for this — server configuration only.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Google API call fails during push | Logged, swallowed — HomeBase operation still succeeds |
| Refresh token revoked by user in Google | Push silently fails; user must reconnect in Settings |
| Manual sync fails partway through | Returns partial count; user can re-run (idempotent) |
| OAuth callback with invalid state | 400 response, no token stored |
| Disconnect + delete fails for some events | Log failures, clear HomeBase Google fields anyway |

---

## Testing

- Unit tests for `src/lib/google-calendar.ts` (mock Google HTTP calls)
- Unit tests for all new API routes (mock Prisma + Google helper)
- No browser tests — Settings UI and calendar display verified manually
