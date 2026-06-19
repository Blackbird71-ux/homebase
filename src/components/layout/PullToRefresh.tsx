'use client'

import { useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

// Mounts once in the app shell, wrapping every page. Listens for a downward pull
// from the top of whatever page-level scroller is in view and reloads on release
// past the threshold. A reload is the only refresh that universally re-fetches
// data, since pages fetch client-side in their own effects — see
// docs/interaction-system.md for the in-place-refetch upgrade path.

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { distance, status, threshold } = usePullToRefresh(ref, () => {
    window.location.reload()
  })

  const visible = status !== 'idle'
  const progress = Math.min(distance / threshold, 1)

  return (
    <div ref={ref} className="relative flex-1 overflow-hidden pb-16">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card shadow-md"
        style={{
          transform: `translate(-50%, ${distance - 44}px)`,
          opacity: visible ? Math.max(progress, 0.35) : 0,
          transition: status === 'pulling' || status === 'ready' ? 'none' : 'opacity .2s ease, transform .25s ease',
        }}
      >
        <RefreshCw
          className={`h-4 w-4 text-foreground ${status === 'refreshing' ? 'animate-spin' : ''}`}
          style={{ transform: status === 'refreshing' ? undefined : `rotate(${progress * 270}deg)` }}
        />
      </div>
      {children}
    </div>
  )
}
