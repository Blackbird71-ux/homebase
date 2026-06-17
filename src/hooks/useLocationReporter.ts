'use client'

import { useEffect } from 'react'

const REPORT_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes while the app is open

/**
 * While the user has location sharing enabled, report this device's position to
 * the server on mount and every few minutes. Web apps can only read GPS in the
 * foreground, so this captures a *last-known* location, not live tracking.
 *
 * Does nothing (and never prompts for GPS permission) when `enabled` is false.
 */
export function useLocationReporter(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    let cancelled = false

    function report() {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return
          fetch('/api/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          }).catch(() => { /* offline / transient — next tick retries */ })
        },
        () => { /* permission denied or unavailable — stay silent */ },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
      )
    }

    report()
    const id = setInterval(report, REPORT_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [enabled])
}
