'use client'

import { useState, useEffect, useRef } from 'react'
import { UsersIcon } from 'lucide-react'

interface PresenceUser {
  userId: string
  name: string
  lastSeen: number // timestamp
}

interface ListPresenceProps {
  listId: string
  currentUserId: string
}

const PRESENCE_INTERVAL = 15000 // ping every 15s
const STALE_THRESHOLD = 45000 // consider user gone after 45s

export function ListPresence({ listId, currentUserId }: ListPresenceProps) {
  const [users, setUsers] = useState<PresenceUser[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Ping presence endpoint
    async function ping() {
      try {
        await fetch(`/api/lists/${listId}/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUserId }),
        })
      } catch {
        // Silently fail — presence is best-effort
      }
    }

    // Fetch current presence
    async function fetchPresence() {
      try {
        const res = await fetch(`/api/lists/${listId}/presence`)
        if (res.ok) {
          const data = await res.json()
          const now = Date.now()
          // Filter out stale users and current user
          const active = (data.users as PresenceUser[]).filter(
            (u) => u.userId !== currentUserId && now - u.lastSeen < STALE_THRESHOLD
          )
          setUsers(active)
        }
      } catch {
        // Silently fail
      }
    }

    // Initial ping and fetch
    ping()
    fetchPresence()

    // Poll for presence updates
    intervalRef.current = setInterval(() => {
      ping()
      fetchPresence()
    }, PRESENCE_INTERVAL)

    // Ping on page unload
    function handleBeforeUnload() {
      navigator.sendBeacon(
        `/api/lists/${listId}/presence`,
        JSON.stringify({ userId: currentUserId, leave: true })
      )
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Signal leave
      navigator.sendBeacon(
        `/api/lists/${listId}/presence`,
        JSON.stringify({ userId: currentUserId, leave: true })
      )
    }
  }, [listId, currentUserId])

  if (users.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <UsersIcon className="h-3 w-3" />
      <span>
        {users.length === 1
          ? `${users[0].name} is viewing`
          : `${users.map((u) => u.name).join(', ')} are viewing`}
      </span>
    </div>
  )
}
