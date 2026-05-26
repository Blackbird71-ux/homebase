import { useCallback, useEffect } from 'react'
import { enqueueMutation, getAllMutations, removeMutation } from '@/lib/offline-queue'
import { listenAppEvent, AppEvents } from '@/lib/app-events'
import type { ListItemShape } from '@/lib/list-helpers'

async function registerBackgroundSync() {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.ready
    await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register('homebase-list-sync')
  } catch {
    // Not supported or permission denied — the online/visibilitychange fallback covers this
  }
}

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
 * Owns all offline-sync concerns for a shopping list:
 * - IndexedDB mutation queue (enqueue, flush, remove)
 * - Background Sync registration
 * - online / visibilitychange / SW-message event listeners
 * - SHOPPING_LIST_UPDATED app-event listener
 *
 * Returns `{ registerBackgroundSync, broadcastQueueCount, enqueueMutation }`
 * so callers can enqueue mutations and update the OfflineBanner count.
 */
export function useOfflineQueue(
  listId: string,
  setItems: React.Dispatch<React.SetStateAction<ListItemShape[]>>,
  shouldSkipServerUpdate: () => boolean = () => false,
) {
  const broadcastQueueCount = useCallback(async () => {
    try {
      const all = await getAllMutations()
      const count = all.filter(m => m.listId === listId).length
      window.dispatchEvent(new CustomEvent('offline-queue-update', { detail: { count } }))
    } catch {
      // IndexedDB unavailable
    }
  }, [listId])

  const flushQueueAndRefetch = useCallback(async () => {
    let mutations: Awaited<ReturnType<typeof getAllMutations>>
    try {
      mutations = await getAllMutations()
    } catch {
      return
    }

    const mine = mutations
      .filter(m => m.listId === listId)
      .sort((a, b) => a.queuedAt - b.queuedAt)

    if (mine.length === 0) return

    for (const mutation of mine) {
      try {
        const res = await fetch(mutation.endpoint, {
          method: mutation.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mutation.body),
        })
        if (res.ok || res.status === 404) await removeMutation(mutation.id)
      } catch {
        break // Still offline — stop and retry next time
      }
    }

    try {
      const res = await fetch(`/api/lists/${listId}/items`)
      if (res.ok) setItems(parseServerItems(await res.json()))
    } catch {
      // Network gone again — leave optimistic state as-is
    }

    await broadcastQueueCount()
  }, [listId, broadcastQueueCount, setItems])

  // Flush on coming back online (iOS/Safari fallback)
  useEffect(() => {
    window.addEventListener('online', flushQueueAndRefetch)
    return () => window.removeEventListener('online', flushQueueAndRefetch)
  }, [flushQueueAndRefetch])

  // Listen for Background Sync messages from the service worker (Chrome/Android)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    function handleSWMessage(event: MessageEvent) {
      if (event.data?.type === 'SYNC_REQUESTED') flushQueueAndRefetch()
    }
    navigator.serviceWorker.addEventListener('message', handleSWMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage)
  }, [flushQueueAndRefetch])

  // Flush when the user returns to the tab after it was backgrounded
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && navigator.onLine) flushQueueAndRefetch()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [flushQueueAndRefetch])

  // Broadcast initial queue count on mount
  useEffect(() => { broadcastQueueCount() }, [broadcastQueueCount])

  // Refetch when AI assistant or another source updates the list
  useEffect(() => {
    return listenAppEvent(AppEvents.SHOPPING_LIST_UPDATED, () => {
      fetch(`/api/lists/${listId}/items`)
        .then(res => res.ok ? res.json() : null)
        .then(raw => { if (raw && !shouldSkipServerUpdate()) setItems(parseServerItems(raw)) })
        .catch(() => {})
    })
  }, [listId, setItems, shouldSkipServerUpdate])

  // Poll for item changes from other devices every 30s when the tab is visible and online
  useEffect(() => {
    const interval = setInterval(() => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return
      if (shouldSkipServerUpdate()) return
      fetch(`/api/lists/${listId}/items`)
        .then(res => res.ok ? res.json() : null)
        .then(raw => { if (raw && !shouldSkipServerUpdate()) setItems(parseServerItems(raw)) })
        .catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [listId, setItems, shouldSkipServerUpdate])

  return { registerBackgroundSync, broadcastQueueCount, enqueueMutation }
}
