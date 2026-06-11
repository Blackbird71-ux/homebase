'use client'

import { useState, useEffect } from 'react'
import { WifiOffIcon, RefreshCwIcon } from 'lucide-react'

export function OfflineBanner() {
  // Lazy initializer reads navigator.onLine at first render (client-only).
  // Avoids calling setState directly inside an effect body.
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return !navigator.onLine
  })
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false)
      setIsSyncing(true)
    }
    function handleOffline() {
      setIsOffline(true)
      setIsSyncing(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Listen for queue-count updates broadcast by the offline queue (lib/offline-queue)
  useEffect(() => {
    function handleQueueUpdate(e: Event) {
      const count = (e as CustomEvent<{ count: number }>).detail.count
      setPendingCount(count)
      if (count === 0) setIsSyncing(false)
    }
    window.addEventListener('offline-queue-update', handleQueueUpdate)
    return () => window.removeEventListener('offline-queue-update', handleQueueUpdate)
  }, [])

  if (!isOffline && pendingCount === 0) return null

  let message: string
  if (isSyncing && pendingCount > 0) {
    message = `Syncing ${pendingCount} change${pendingCount === 1 ? '' : 's'}…`
  } else if (isOffline && pendingCount > 0) {
    message = `Offline — ${pendingCount} change${pendingCount === 1 ? '' : 's'} pending sync`
  } else if (isOffline) {
    message = "You're offline — changes will sync when you reconnect"
  } else {
    message = `Syncing ${pendingCount} change${pendingCount === 1 ? '' : 's'}…`
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-medium py-1.5 px-4"
    >
      {isSyncing && !isOffline
        ? <RefreshCwIcon className="h-4 w-4 shrink-0 animate-spin" />
        : <WifiOffIcon className="h-4 w-4 shrink-0" />
      }
      <span>{message}</span>
    </div>
  )
}
