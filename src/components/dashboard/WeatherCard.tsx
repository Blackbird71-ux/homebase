'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CloudSun, Loader2, MapPin, Droplets, Wind, Thermometer, RefreshCw, AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface WeatherData {
  temperature: number
  feelsLike: number
  condition: string
  icon: string
  humidity: number
  windSpeed: number
  description: string
  location: string
}

type WeatherState = 'loading' | 'loaded' | 'error' | 'unconfigured' | 'geo-denied'

export function WeatherCard() {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [state, setState] = useState<WeatherState>('loading')
  const [locationName, setLocationName] = useState<string>('')

  const CACHE_KEY = 'weather_last_coords'

  const fetchByCoords = useCallback(async (lat: number, lon: number) => {
    try {
      const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      if (!res.ok) {
        if (res.status === 501) {
          setState('unconfigured')
          return
        }
        setState('error')
        return
      }
      const data: WeatherData = await res.json()
      // Cache coords so next load is instant
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ lat, lon })) } catch { /* ignore */ }
      setWeather(data)
      setLocationName(data.location || `${lat.toFixed(2)}, ${lon.toFixed(2)}`)
      setState('loaded')
    } catch {
      setState('error')
    }
  }, [])

  const loadWeather = useCallback(() => {
    setState('loading')
    setWeather(null)

    // Use cached coords immediately if available (avoids geo permission delay on first paint)
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        const { lat, lon } = JSON.parse(cached) as { lat: number; lon: number }
        fetchByCoords(lat, lon)
        return
      }
    } catch { /* ignore */ }

    // No cache — request fresh geolocation
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchByCoords(position.coords.latitude, position.coords.longitude)
        },
        () => {
          // Geolocation denied or unavailable
          setState('geo-denied')
        },
        { timeout: 10000, enableHighAccuracy: false, maximumAge: 60000 },
      )
    } else {
      setState('geo-denied')
    }
  }, [fetchByCoords, CACHE_KEY])

  useEffect(() => {
    loadWeather()
  }, [loadWeather])

  function handleRetry() {
    loadWeather()
  }

  // ── Render states ──────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <CloudSun className="h-4 w-4" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (state === 'unconfigured') {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <CloudSun className="h-4 w-4" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <CloudSun className="h-6 w-6 mb-2 opacity-30 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">API key not configured</p>
        </CardContent>
      </Card>
    )
  }

  if (state === 'error' || state === 'geo-denied') {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <CloudSun className="h-4 w-4" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <AlertCircle className="h-6 w-6 mb-2 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground mb-2">
            {state === 'geo-denied' ? 'Location access denied' : 'Weather unavailable'}
          </p>
          <button
            onClick={handleRetry}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </CardContent>
      </Card>
    )
  }

  // ── Loaded state ───────────────────────────────────────────────────
  if (!weather) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <CloudSun className="h-4 w-4" />
            Weather
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <AlertCircle className="h-6 w-6 mb-2 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">Weather unavailable</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <CloudSun className="h-4 w-4" />
          Weather
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {weather.icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
                alt={weather.condition}
                className="h-10 w-10 shrink-0"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold">{Math.round(weather.temperature)}°</span>
                <span className="text-[10px] text-muted-foreground capitalize truncate">
                  {weather.description}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                {locationName}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Thermometer className="h-3 w-3 shrink-0" />
            <span className="truncate">{Math.round(weather.feelsLike)}° feels</span>
          </div>
          <div className="flex items-center gap-1">
            <Droplets className="h-3 w-3 shrink-0" />
            <span className="truncate">{weather.humidity}%</span>
          </div>
          <div className="flex items-center gap-1">
            <Wind className="h-3 w-3 shrink-0" />
            <span className="truncate">{Math.round(weather.windSpeed)} km/h</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
