import { useCallback, useEffect } from 'react'
import { flushQueuedMutations, broadcastQueueCount, OFFLINE_QUEUE_FLUSHED } from '@/lib/offline-queue'

/**
 * Global offline-queue flusher — mounted once in AppShell so queued mutations
 * sync no matter which page is open (or none of the queuing pages at all).
 *
 * Flushes on: mount (queue left over from a previous session), coming back
 * online, returning to a visible tab, and Background Sync SYNC_REQUESTED
 * messages from the service worker. After a flush that resolved mutations it
 * dispatches OFFLINE_QUEUE_FLUSHED with the affected listIds so pages that own
 * optimistic state can refetch.
 */
export function useGlobalOfflineFlush() {
  const flushAndNotify = useCallback(async () => {
    const listIds = await flushQueuedMutations()
    await broadcastQueueCount()
    if (listIds.length > 0) {
      window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_FLUSHED, { detail: { listIds } }))
    }
  }, [])

  useEffect(() => {
    if (navigator.onLine) flushAndNotify()
    else broadcastQueueCount() // show the banner count immediately when loading offline

    window.addEventListener('online', flushAndNotify)

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && navigator.onLine) flushAndNotify()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    function handleSWMessage(event: MessageEvent) {
      if (event.data?.type === 'SYNC_REQUESTED') flushAndNotify()
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage)
    }

    return () => {
      window.removeEventListener('online', flushAndNotify)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage)
      }
    }
  }, [flushAndNotify])
}
