'use client'

import { useState, useEffect } from 'react'
import { WifiOffIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react'
import { OFFLINE_QUEUE_UPDATE, OFFLINE_QUEUE_SYNC_ISSUE } from '@/lib/offline-queue'

export function OfflineBanner() {
  // Lazy initializer reads navigator.onLine at first render (client-only).
  // Avoids calling setState directly inside an effect body.
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return !navigator.onLine
  })
  const [pendingCount, setPendingCount] = useState(0)
  // Last flush stopped on a 401 — queue is preserved until the user signs in.
  const [authRequired, setAuthRequired] = useState(false)
  // Mutations permanently rejected by the server in the last flush (shown ~10s).
  const [droppedCount, setDroppedCount] = useState(0)

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false)
    }
    function handleOffline() {
      setIsOffline(true)
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
    }
    window.addEventListener(OFFLINE_QUEUE_UPDATE, handleQueueUpdate)
    return () => window.removeEventListener(OFFLINE_QUEUE_UPDATE, handleQueueUpdate)
  }, [])

  // Listen for flush outcomes: auth-blocked queue and permanently dropped mutations.
  useEffect(() => {
    let dismissTimer: ReturnType<typeof setTimeout> | undefined
    function handleSyncIssue(e: Event) {
      const detail = (e as CustomEvent<{ authRequired: boolean; dropped: number }>).detail
      setAuthRequired(detail.authRequired)
      if (detail.dropped > 0) {
        setDroppedCount(detail.dropped)
        clearTimeout(dismissTimer)
        dismissTimer = setTimeout(() => setDroppedCount(0), 10_000)
      }
    }
    window.addEventListener(OFFLINE_QUEUE_SYNC_ISSUE, handleSyncIssue)
    return () => {
      clearTimeout(dismissTimer)
      window.removeEventListener(OFFLINE_QUEUE_SYNC_ISSUE, handleSyncIssue)
    }
  }, [])

  if (!isOffline && pendingCount === 0 && droppedCount === 0) return null

  const changes = (n: number) => `change${n === 1 ? '' : 's'}`
  let message: string
  let icon: 'offline' | 'syncing' | 'warning'
  if (isOffline && pendingCount > 0) {
    message = `Offline — ${pendingCount} ${changes(pendingCount)} pending sync`
    icon = 'offline'
  } else if (isOffline) {
    message = "You're offline — changes will sync when you reconnect"
    icon = 'offline'
  } else if (authRequired && pendingCount > 0) {
    message = `Sign in to sync ${pendingCount} pending ${changes(pendingCount)}`
    icon = 'warning'
  } else if (pendingCount > 0) {
    message = `Syncing ${pendingCount} ${changes(pendingCount)}…`
    icon = 'syncing'
  } else {
    message = `${droppedCount} offline ${changes(droppedCount)} couldn't be synced`
    icon = 'warning'
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-medium py-1.5 px-4"
    >
      {icon === 'syncing' && <RefreshCwIcon className="h-4 w-4 shrink-0 animate-spin" />}
      {icon === 'warning' && <TriangleAlertIcon className="h-4 w-4 shrink-0" />}
      {icon === 'offline' && <WifiOffIcon className="h-4 w-4 shrink-0" />}
      <span>{message}</span>
    </div>
  )
}
