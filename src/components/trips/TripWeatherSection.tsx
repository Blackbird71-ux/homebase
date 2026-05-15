'use client'

import { useState, useEffect } from 'react'
import { CloudSun, Loader2, MapPin, Thermometer, Droplets, Wind } from 'lucide-react'

interface TripWeatherSectionProps {
  destination: string
  startDate: string
  endDate: string
}

interface ForecastDay {
  date: string
  temp: number
  feelsLike: number
  condition: string
  icon: string
  humidity: number
  windSpeed: number
  description: string
}

export function TripWeatherSection({ destination, startDate, endDate }: TripWeatherSectionProps) {
  const [forecast, setForecast] = useState<ForecastDay[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Only fetch if we have a destination
    if (!destination) return

    let cancelled = false
    setLoading(true)
    setError('')

    // Extract city name for weather query
    const city = destination.split(',')[0].trim()

    fetch(`/api/weather?location=${encodeURIComponent(city)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Weather data not available')
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        // The current weather endpoint returns current conditions.
        // We'll show a single card with current conditions for the destination.
        if (data && data.temperature !== undefined) {
          setForecast([
            {
              date: new Date().toISOString(),
              temp: data.temperature,
              feelsLike: data.feelsLike,
              condition: data.condition,
              icon: data.icon,
              humidity: data.humidity,
              windSpeed: data.windSpeed,
              description: data.description,
            },
          ])
        } else {
          setForecast(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load weather')
          setForecast(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [destination])

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  }

  // Calculate trip duration for display
  const tripStart = new Date(startDate)
  const tripEnd = new Date(endDate)
  const durationDays = Math.round((tripEnd.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24)) + 1

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <CloudSun className="h-4 w-4" />
          Weather
        </h2>
      </div>

      {loading && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-sm">Loading weather...</span>
        </div>
      )}

      {error && (
        <div className="p-4 text-center text-muted-foreground rounded-lg border border-border bg-card">
          <CloudSun className="h-6 w-6 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Weather unavailable</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {forecast && !loading && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {/* Trip destination header */}
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {destination} &middot; {durationDays} day(s)
            </span>
          </div>

          {/* Current weather for the destination */}
          {forecast.map((day) => (
            <div key={day.date} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {day.icon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://openweathermap.org/img/wn/${day.icon}@2x.png`}
                      alt={day.condition}
                      className="h-12 w-12"
                    />
                  )}
                  <div>
                    <span className="text-2xl font-bold">{Math.round(day.temp)}°</span>
                    <p className="text-xs text-muted-foreground capitalize">{day.description}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  Feels like {Math.round(day.feelsLike)}°
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Thermometer className="h-4 w-4" />
                  <span>{Math.round(day.temp)}°C</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Droplets className="h-4 w-4" />
                  <span>{day.humidity}% humidity</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                  <Wind className="h-4 w-4" />
                  <span>{Math.round(day.windSpeed)} km/h wind</span>
                </div>
              </div>

              {/* Trip date range context */}
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Trip weather for {formatDate(startDate)} – {formatDate(endDate)}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Current conditions shown &middot; Enable forecast API key for daily forecasts
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!forecast && !loading && !error && (
        <div className="p-8 text-center text-muted-foreground rounded-lg border border-dashed border-border">
          <CloudSun className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Weather information requires an API key</p>
          <p className="text-xs mt-1">Set OPENWEATHER_API_KEY in your environment</p>
        </div>
      )}
    </section>
  )
}
