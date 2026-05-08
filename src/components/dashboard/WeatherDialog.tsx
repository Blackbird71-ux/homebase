'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CloudSun, Loader2, AlertCircle, MapPin, Droplets, Wind, Thermometer, RefreshCw } from 'lucide-react'
import type { WeatherData } from '@/types'

// Emoji map for weather conditions
function conditionEmoji(condition: string): string {
  const map: Record<string, string> = {
    Clear: '☀️',
    Sunny: '☀️',
    Clouds: '☁️',
    Cloudy: '☁️',
    Overcast: '☁️',
    Rain: '🌧️',
    'Light Rain': '🌦️',
    Drizzle: '🌦️',
    'Heavy Rain': '🌧️',
    Thunderstorm: '⛈️',
    Snow: '❄️',
    'Light Snow': '🌨️',
    Mist: '🌫️',
    Fog: '🌫️',
    Haze: '🌫️',
    Smoke: '🌫️',
    Dust: '🌫️',
    Sand: '🌫️',
    Squall: '💨',
    Tornado: '🌪️',
  }
  return map[condition] ?? '🌤️'
}

interface WeatherDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WeatherDialog({ open, onOpenChange }: WeatherDialogProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfig, setNeedsConfig] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const hasAttempted = useRef(false)

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    setLoading(true)
    setError(null)
    setIsRetrying(false)
    try {
      const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.needsConfig) {
          setNeedsConfig(true)
        } else {
          setError(data.error ?? 'Failed to load weather.')
        }
        return
      }
      const data: WeatherData = await res.json()
      setWeather(data)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadWeather = useCallback(() => {
    // Try GPS first with fallback to saved location
    if (navigator.geolocation) {
      setLoading(true)
      setGeoError(null)
      setError(null)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGeoError(null)
          fetchWeather(position.coords.latitude, position.coords.longitude)
        },
        async (geoErr) => {
          // Geolocation failed — try saved location from settings as fallback
          let savedLocation: string | null = null
          try {
            const settingsRes = await fetch('/api/settings')
            if (settingsRes.ok) {
              const settings = await settingsRes.json()
              savedLocation = settings.uiPreferences?.weatherLocation ?? null
            }
          } catch {
            // ignore
          }

          if (savedLocation) {
            fetchWeather(0, 0) // we'll refetch below with location param
            // Actually use the location string
            setLoading(true)
            try {
              const res = await fetch(`/api/weather?location=${encodeURIComponent(savedLocation)}`)
              if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                if (data.needsConfig) {
                  setNeedsConfig(true)
                } else {
                  setError(data.error ?? 'Failed to load weather.')
                }
                return
              }
              const data: WeatherData = await res.json()
              setWeather(data)
            } catch {
              setError('Network error. Please try again.')
            } finally {
              setLoading(false)
            }
          } else {
            setLoading(false)
            setGeoError(
              geoErr.code === geoErr.PERMISSION_DENIED
                ? 'Location access was denied. Enable location in your browser, or set a default location in Settings > Appearance.'
                : 'Unable to determine your location. Set a default location in Settings > Appearance.'
            )
          }
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      )
    } else {
      // No geolocation API — try saved location
      setLoading(true)
      ;(async () => {
        let savedLocation: string | null = null
        try {
          const settingsRes = await fetch('/api/settings')
          if (settingsRes.ok) {
            const settings = await settingsRes.json()
            savedLocation = settings.uiPreferences?.weatherLocation ?? null
          }
        } catch {
          // ignore
        }

        if (savedLocation) {
          try {
            const res = await fetch(`/api/weather?location=${encodeURIComponent(savedLocation)}`)
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              if (data.needsConfig) {
                setNeedsConfig(true)
              } else {
                setError(data.error ?? 'Failed to load weather.')
              }
              return
            }
            const data: WeatherData = await res.json()
            setWeather(data)
          } catch {
            setError('Network error. Please try again.')
          }
        } else {
          setError('Geolocation is not available in your browser. Set a default location in Settings > Appearance.')
        }
        setLoading(false)
      })()
    }
  }, [fetchWeather])

  // Load weather when dialog opens
  useEffect(() => {
    if (open && !hasAttempted.current) {
      hasAttempted.current = true
      loadWeather()
    }
    if (!open) {
      hasAttempted.current = false
      setWeather(null)
      setError(null)
      setGeoError(null)
      setNeedsConfig(false)
    }
  }, [open, loadWeather])

  function handleRetry() {
    setWeather(null)
    setError(null)
    setGeoError(null)
    setNeedsConfig(false)
    setIsRetrying(true)
    // Small delay before retrying so the UI resets
    setTimeout(() => {
      loadWeather()
    }, 100)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudSun className="h-5 w-5 text-primary" />
            Today's Weather
          </DialogTitle>
          <DialogDescription>
            Current conditions and forecast
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Fetching weather...</p>
            </div>
          )}

          {needsConfig && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertCircle className="h-8 w-8 text-amber-500" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Weather Not Configured</p>
                <p className="text-xs text-muted-foreground">
                  An admin needs to add an OpenWeatherMap API key to the server environment variables.
                </p>
              </div>
            </div>
          )}

          {geoError && !loading && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Location Unavailable</p>
                <p className="text-xs text-muted-foreground">{geoError}</p>
              </div>
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Error</p>
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </button>
            </div>
          )}

          {weather && !loading && (
            <div className="space-y-4">
              {/* Main weather display */}
              <div className="flex items-center justify-between bg-muted/30 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{conditionEmoji(weather.condition)}</span>
                  <div>
                    <p className="text-3xl font-bold">{weather.temperature}°C</p>
                    <p className="text-xs text-muted-foreground capitalize">{weather.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Feels like</p>
                  <p className="text-sm font-medium">{weather.feelsLike}°C</p>
                </div>
              </div>

              {/* Location */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {weather.location}
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 bg-muted/20 rounded-lg p-3">
                  <Droplets className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Humidity</p>
                    <p className="text-sm font-medium">{weather.humidity}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-muted/20 rounded-lg p-3">
                  <Wind className="h-4 w-4 text-cyan-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Wind</p>
                    <p className="text-sm font-medium">{weather.windSpeed} km/h</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
