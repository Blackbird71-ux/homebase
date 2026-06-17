'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import { formatInTz } from '@/lib/timezone'
import type { MapMember } from './FamilyMap'

// Leaflet touches `window`, so the map must load client-side only.
const FamilyMap = dynamic(() => import('./FamilyMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full grid place-items-center text-sm text-muted-foreground">Loading map…</div>,
})

export function FamilyLocationView() {
  const timezone = useFamilyTimezone()
  const [members, setMembers] = useState<MapMember[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    function load() {
      fetch('/api/location')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((data: MapMember[]) => { if (active) { setMembers(data); setError(false) } })
        .catch(() => { if (active) setError(true) })
    }
    load()
    const id = setInterval(load, 60_000) // refresh others' pins each minute
    return () => { active = false; clearInterval(id) }
  }, [])

  if (error) {
    return <p className="p-6 text-sm text-destructive">Couldn&apos;t load locations. Try again shortly.</p>
  }
  if (members === null) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>
  }
  if (members.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        No family members are sharing their location yet. Turn on{' '}
        <span className="font-medium">Location Sharing</span> in Settings → Account to appear here.
      </p>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-border">
        <FamilyMap members={members} timezone={timezone} />
      </div>
      <ul className="shrink-0 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {members.map((m) => (
          <li key={m.userId}>
            <span className="font-medium text-foreground">{m.name}</span>
            {' · '}
            {formatInTz(new Date(m.updatedAt), timezone, {
              weekday: 'short', hour: 'numeric', minute: '2-digit',
            })}
          </li>
        ))}
      </ul>
    </div>
  )
}
