'use client'

import { useState, useEffect, useCallback } from 'react'

export interface CurrentWeather {
  temperature: number
  feelsLike: number
  condition: string
  icon: string
  humidity: number
  windSpeed: number
  description: string
  location: string
}

export type WeatherStatus = 'loading' | 'loaded' | 'unavailable'

const CACHE_KEY = 'weather_last_coords'

/**
 * Shared current-weather fetch chain: cached coords (localStorage) →
 * fresh geolocation → saved location from Settings > Appearance.
 * Resolves to 'unavailable' on any failure (incl. OPENWEATHER_API_KEY
 * not configured — the route returns 503 + needsConfig) so callers can
 * simply hide their weather UI.
 */
export function useCurrentWeather(): { weather: CurrentWeather | null; status: WeatherStatus } {
  const [weather, setWeather] = useState<CurrentWeather | null>(null)
  const [status, setStatus] = useState<WeatherStatus>('loading')

  const fetchWeather = useCallback(async (query: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/weather?${query}`)
      if (!res.ok) return false
      setWeather(await res.json())
      setStatus('loaded')
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      // 1. Cached coords — instant, no geo permission delay
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const { lat, lon } = JSON.parse(cached) as { lat: number; lon: number }
          if (await fetchWeather(`lat=${lat}&lon=${lon}`)) return
        }
      } catch { /* ignore */ }
      if (cancelled) return

      // 2. Fresh geolocation
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 10000, enableHighAccuracy: false, maximumAge: 300000,
            })
          })
          if (cancelled) return
          const { latitude: lat, longitude: lon } = pos.coords
          if (await fetchWeather(`lat=${lat}&lon=${lon}`)) {
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ lat, lon })) } catch { /* ignore */ }
            return
          }
        } catch { /* geo denied/unavailable — fall through */ }
      }
      if (cancelled) return

      // 3. Saved default location from settings
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const settings = await res.json()
          const saved = settings.uiPreferences?.weatherLocation ?? null
          if (saved && await fetchWeather(`location=${encodeURIComponent(saved)}`)) return
        }
      } catch { /* ignore */ }

      if (!cancelled) setStatus('unavailable')
    }

    load()
    return () => { cancelled = true }
  }, [fetchWeather])

  return { weather, status }
}
