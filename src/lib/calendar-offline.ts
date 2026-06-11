/**
 * Offline queueing for calendar event mutations (client-safe, no server imports).
 *
 * Replay units:
 *
 * - Create: POST /api/events with a `clientMutationId` (= the tmp_ id). The
 *   route's findUnique guard makes replay idempotent — a lost response and a
 *   re-replay return the already-created event instead of duplicating it.
 *   Queued under a RANDOM id (each create is a distinct event).
 *
 * - Update: PUT /api/events/[id], queued under a FIXED per-event id so
 *   successive offline edits collapse into one entry (IndexedDB put()
 *   overwrites on the same key) — safe because the PUT body carries the full
 *   form state. Edits to a tmp_ event keep the tmp_ id in the endpoint; the
 *   flusher's idMap rewrites it to the real id once the POST has synced
 *   (queuedAt ordering guarantees the POST replays first).
 *
 * - Delete: DELETE /api/events/[id] (+ ?all=true for a recurring series),
 *   fixed per-event id. The route 404s if the event is already gone, which
 *   the flusher drops as resolved. Deleting a tmp_ event just cancels its
 *   queued POST and any follow-up PUTs — it was never on the server.
 */
import {
  queueOfflineMutation,
  removeMutationsByTempId,
  broadcastQueueCount,
} from './offline-queue'
import type { CalendarEvent } from '@/types'

/** Scope key used as `listId` so OFFLINE_QUEUE_FLUSHED can target calendar views. */
export const CALENDAR_SCOPE = 'calendar'

/** Events created while offline (matches the list-item temp id convention). */
export function isTempEventId(id: string): boolean {
  return id.startsWith('tmp_')
}

/**
 * Optimistic ops applied over fetched events while mutations are queued.
 * Offline, refresh() returns the SW-cached /api/events response, which
 * doesn't know about queued changes — without these the user's event would
 * vanish and get re-added, creating real duplicates after sync.
 */
export type OfflineEventOp =
  | { type: 'create'; event: CalendarEvent }
  | { type: 'update'; id: string; patch: Partial<CalendarEvent> }
  | { type: 'delete'; id: string }

/**
 * Pure overlay of pending offline ops onto server-fetched events, in order.
 * Update/delete match by id or seriesId — edits and deletes target the series
 * row, mirroring the server (recurring instances are virtual expansions).
 */
export function applyOfflineEventOps(
  events: CalendarEvent[],
  ops: OfflineEventOp[],
): CalendarEvent[] {
  let result = events
  for (const op of ops) {
    if (op.type === 'create') {
      result = [...result, op.event]
    } else if (op.type === 'update') {
      result = result.map(e =>
        e.id === op.id || e.seriesId === op.id ? { ...e, ...op.patch } : e,
      )
    } else {
      result = result.filter(e => e.id !== op.id && e.seriesId !== op.id)
    }
  }
  return result
}

/** Queue an event create. Returns the tmp_ id to use for optimistic display. */
export async function queueEventCreate(body: Record<string, unknown>): Promise<string> {
  const tempId = `tmp_${crypto.randomUUID()}`
  await queueOfflineMutation({
    id: crypto.randomUUID(),
    listId: CALENDAR_SCOPE,
    queuedAt: Date.now(),
    endpoint: '/api/events',
    method: 'POST',
    body: { ...body, clientMutationId: tempId },
    tempId,
  })
  return tempId
}

/** Queue an event update. `body` must be the full PUT payload the form would send. */
export async function queueEventUpdate(
  eventId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await queueOfflineMutation({
    id: `event_put_${eventId}`,
    listId: CALENDAR_SCOPE,
    queuedAt: Date.now(),
    endpoint: `/api/events/${eventId}`,
    method: 'PUT',
    body,
  })
}

/**
 * Queue an event delete. For offline-created events (tmp_ id) there is
 * nothing on the server — cancel the queued POST and any follow-up PUTs.
 */
export async function queueEventDelete(eventId: string, all: boolean): Promise<void> {
  if (isTempEventId(eventId)) {
    try { await removeMutationsByTempId(eventId) } catch { /* IndexedDB unavailable */ }
    await broadcastQueueCount()
    return
  }
  await queueOfflineMutation({
    id: `event_del_${eventId}`,
    listId: CALENDAR_SCOPE,
    queuedAt: Date.now(),
    endpoint: `/api/events/${eventId}${all ? '?all=true' : ''}`,
    method: 'DELETE',
  })
}
