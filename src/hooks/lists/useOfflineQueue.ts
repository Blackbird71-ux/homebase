import { useCallback, useEffect } from 'react'
import {
  queueOfflineMutation,
  removeMutationsByTempId,
  broadcastQueueCount,
  OFFLINE_QUEUE_FLUSHED,
} from '@/lib/offline-queue'
import type { QueuedMutation } from '@/lib/offline-queue'
import { listenAppEvent, AppEvents } from '@/lib/app-events'
import type { ListItemShape } from '@/lib/list-helpers'
import type { MutationGuard } from '@/hooks/useMutationGuard'

function parseServerItems(raw: Record<string, unknown>[]): ListItemShape[] {
  return raw.map(i => ({
    ...i,
    dueDate:    i.dueDate    ? new Date(i.dueDate as string)    : null,
    createdAt:  new Date(i.createdAt as string),
    recipeId:   (i.recipeId   as string | null) ?? null,
    recipeName: (i.recipeName as string | null) ?? null,
  })) as ListItemShape[]
}

/**
 * Per-list side of offline sync. Flushing itself is global — see
 * useGlobalOfflineFlush (mounted in AppShell). This hook:
 * - enqueues this list's mutations (queueMutation / cancelTempItem)
 * - refetches the list when a global flush resolved mutations for it
 * - refetches on SHOPPING_LIST_UPDATED and a 30s visibility-gated poll
 */
export function useOfflineQueue(
  listId: string,
  setItems: React.Dispatch<React.SetStateAction<ListItemShape[]>>,
  guard: MutationGuard,
) {
  // Guarded refetch — skip overwriting state if an optimistic mutation landed
  // during the fetch window (QA.md §12.27).
  const refetchItems = useCallback(() => {
    const v = guard.snapshot()
    fetch(`/api/lists/${listId}/items`)
      .then(res => res.ok ? res.json() : null)
      .then(raw => { if (raw && guard.canApply(v)) setItems(parseServerItems(raw)) })
      .catch(() => {})
  }, [listId, setItems, guard])

  // Refetch after the global flusher synced mutations belonging to this list
  useEffect(() => {
    function handleFlushed(event: Event) {
      const listIds = (event as CustomEvent<{ listIds: string[] }>).detail?.listIds
      if (listIds?.includes(listId)) refetchItems()
    }
    window.addEventListener(OFFLINE_QUEUE_FLUSHED, handleFlushed)
    return () => window.removeEventListener(OFFLINE_QUEUE_FLUSHED, handleFlushed)
  }, [listId, refetchItems])

  // Enqueue a mutation made while offline. Passing an explicit `id` collapses
  // repeats (e.g. successive reorders) into one queue entry — IndexedDB put()
  // overwrites on the same key.
  const queueMutation = useCallback(async (
    m: Omit<QueuedMutation, 'id' | 'listId' | 'queuedAt'> & { id?: string },
  ) => {
    await queueOfflineMutation({ id: m.id ?? crypto.randomUUID(), listId, queuedAt: Date.now(), ...m })
  }, [listId])

  // Cancel everything queued for an offline-created item that was deleted
  // before syncing — the POST and any follow-up PATCHes simply vanish.
  const cancelTempItem = useCallback(async (tempId: string) => {
    try { await removeMutationsByTempId(tempId) } catch { /* IndexedDB unavailable */ }
    await broadcastQueueCount()
  }, [])

  // Refetch when AI assistant or another source updates the list
  useEffect(() => {
    return listenAppEvent(AppEvents.SHOPPING_LIST_UPDATED, refetchItems)
  }, [refetchItems])

  // Poll for item changes from other devices every 30s when the tab is visible and online
  useEffect(() => {
    const interval = setInterval(() => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return
      refetchItems()
    }, 30000)
    return () => clearInterval(interval)
  }, [refetchItems])

  return { queueMutation, cancelTempItem }
}
