'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_TIMEZONE } from '@/lib/timezone'

// The family timezone is fetched once per session and cached at module level so
// that every row/page sharing this hook triggers at most one network request.
let cached: string | null = null
let inflight: Promise<string> | null = null

function load(): Promise<string> {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = fetch('/api/settings/family')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const tz = (d?.timezone as string) ?? DEFAULT_TIMEZONE
        cached = tz
        return tz
      })
      .catch(() => {
        cached = DEFAULT_TIMEZONE
        return DEFAULT_TIMEZONE
      })
      .finally(() => { inflight = null })
  }
  return inflight
}

/**
 * Returns the family's IANA timezone (e.g. 'Australia/Sydney'), fetched once and
 * cached for the session. Defaults to 'Australia/Sydney' until loaded and on any
 * fetch failure — which matches the existing browser-local rendering on the
 * family's own (Sydney) devices, so this hook can only improve correctness on a
 * device set to a different timezone.
 */
export function useFamilyTimezone(): string {
  const [tz, setTz] = useState(cached ?? DEFAULT_TIMEZONE)
  useEffect(() => {
    let active = true
    load().then(t => { if (active) setTz(t) })
    return () => { active = false }
  }, [])
  return tz
}
