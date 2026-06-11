/**
 * Offline queueing for chore completions (client-safe, no server imports).
 *
 * A completion is replayed as POST /api/chores/[id]/complete with a
 * clientMutationId — completeChore's findUnique guard makes replay
 * idempotent (no double schedule-advance or assignee rotation when the
 * response is lost and the queue replays).
 *
 * Queued under a FIXED per-chore id so an offline double-tap collapses into
 * one completion (IndexedDB put() overwrites on the same key). Only chore
 * COMPLETION is queued — create/edit/rotate/delete stay online-only.
 */
import { queueOfflineMutation } from './offline-queue'

/** Scope key used as `listId` so OFFLINE_QUEUE_FLUSHED can target chore views. */
export const CHORES_SCOPE = 'chores'

/** Queue a chore completion made while offline. */
export async function queueChoreComplete(choreId: string, note?: string | null): Promise<void> {
  await queueOfflineMutation({
    id: `chorecomplete_${choreId}`,
    listId: CHORES_SCOPE,
    queuedAt: Date.now(),
    endpoint: `/api/chores/${choreId}/complete`,
    method: 'POST',
    body: { note: note ?? null, clientMutationId: crypto.randomUUID() },
  })
}
