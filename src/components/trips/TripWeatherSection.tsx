'use client'

import { useState, useEffect } from 'react'
import { CloudSun, Loader2, MapPin, Thermometer, Droplets, Wind, Calendar } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface TripWeatherSectionProps {
  destination: string
  startDate: string
  endDate: string
  /** Optional departure/start location (e.g. home city) */
  startLocation?: string | null
  /** Optional intermediate leg destinations for multi-stop trips */
  legs?: { destination: string; date: string }[]
}

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

interface ForecastDay {
  date: string
  tempMin: number
  tempMax: number
  condition: string
  description: string
  icon: string
  humidity: number
  windSpeed: number
}

type WeatherState = 'loading' | 'loaded' | 'error' | 'unconfigured'

export function TripWeatherSection({
  destination,
  startDate,
  endDate,
  startLocation,
  legs,
}: TripWeatherSectionProps) {
  // ── State for weather data ────────────────────────────────────────
  const [destWeather, setDestWeather] = useState<WeatherData | null>(null)
  const [destForecast, setDestForecast] = useState<ForecastDay[] | null>(null)
  const [destState, setDestState] = useState<WeatherState>('loading')

  const [startWeather, setStartWeather] = useState<WeatherData | null>(null)
  const [startForecast, setStartForecast] = useState<ForecastDay[] | null>(null)
  const [startState, setStartState] = useState<WeatherState>('loading')

  // ── State for next leg (if any) ──────────────────────────────────
  const [legsWeather, setLegsWeather] = useState<Record<number, { weather: WeatherData | null; forecast: ForecastDay[] | null; state: WeatherState }>>({})

  const tripStart = new Date(startDate)
  const tripEnd = new Date(endDate)
  const durationDays = Math.round((tripEnd.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const isLongTrip = durationDays > 5

  // Determine which tabs to show
  const hasStartLocation = !!startLocation
  const showLegsTab = isLongTrip && legs && legs.length > 0

  // ── Fetch weather for a location ─────────────────────────────────
  async function fetchWeather(location: string): Promise<{ current: WeatherData | null; forecast: ForecastDay[] | null; needsConfig: boolean }> {
    const city = location.split(',')[0].trim()
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`/api/weather?location=${encodeURIComponent(city)}`),
      fetch(`/api/weather?type=forecast&location=${encodeURIComponent(city)}`),
    ])

    if (!currentRes.ok) {
      const body = await currentRes.json().catch(() => ({})) as { needsConfig?: boolean }
      return { current: null, forecast: null, needsConfig: !!body.needsConfig }
    }

    const current = await currentRes.json() as WeatherData

    let forecast: ForecastDay[] | null = null
    if (forecastRes.ok) {
      const data = await forecastRes.json()
      forecast = data.forecast ?? null
    }

    return { current, forecast, needsConfig: false }
  }

  // ── Fetch destination weather ────────────────────────────────────
  useEffect(() => {
    if (!destination) return
    let cancelled = false
    setDestState('loading')

    fetchWeather(destination)
      .then(({ current, forecast, needsConfig }) => {
        if (cancelled) return
        if (current) {
          setDestWeather(current)
          setDestState('loaded')
        } else {
          setDestState(needsConfig ? 'unconfigured' : 'error')
        }
        setDestForecast(forecast)
      })
      .catch(() => {
        if (!cancelled) setDestState('error')
      })

    return () => { cancelled = true }
  }, [destination])

  // ── Fetch start location weather ─────────────────────────────────
  useEffect(() => {
    if (!startLocation) return
    let cancelled = false
    setStartState('loading')

    fetchWeather(startLocation)
      .then(({ current, forecast, needsConfig }) => {
        if (cancelled) return
        if (current) {
          setStartWeather(current)
          setStartState('loaded')
        } else {
          setStartState(needsConfig ? 'unconfigured' : 'error')
        }
        setStartForecast(forecast)
      })
      .catch(() => {
        if (!cancelled) setStartState('error')
      })

    return () => { cancelled = true }
  }, [startLocation])

  // ── Fetch leg destination weather ────────────────────────────────
  useEffect(() => {
    if (!showLegsTab || !legs) return
    let cancelled = false

    legs.forEach(async (leg, index) => {
      setLegsWeather((prev) => ({
        ...prev,
        [index]: { weather: null, forecast: null, state: 'loading' },
      }))

      try {
        const { current, forecast, needsConfig } = await fetchWeather(leg.destination)
        if (!cancelled) {
          setLegsWeather((prev) => ({
            ...prev,
            [index]: {
              weather: current,
              forecast,
              state: current ? 'loaded' : needsConfig ? 'unconfigured' : 'error',
            },
          }))
        }
      } catch {
        if (!cancelled) {
          setLegsWeather((prev) => ({
            ...prev,
            [index]: { weather: null, forecast: null, state: 'error' },
          }))
        }
      }
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLegsTab, legs?.length])

  // ── Helpers ──────────────────────────────────────────────────────
  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  }

  function isDateInForecast(dateStr: string): boolean {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(dateStr)
    target.setHours(0, 0, 0, 0)
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays >= 0 && diffDays <= 5
  }

  function getForecastForDate(forecast: ForecastDay[] | null, dateStr: string): ForecastDay | null {
    if (!forecast) return null
    const targetDate = new Date(dateStr).toISOString().slice(0, 10)
    return forecast.find((f) => f.date === targetDate) ?? null
  }

  // ── Render weather card ──────────────────────────────────────────
  function renderWeatherCard(
    weather: WeatherData | null,
    forecast: ForecastDay[] | null,
    state: WeatherState,
    locationLabel: string,
    dateLabel: string,
  ) {
    if (state === 'loading') {
      return (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-sm">Loading weather...</span>
        </div>
      )
    }

    if (state === 'unconfigured') {
      return (
        <div className="p-6 text-center text-muted-foreground rounded-lg border border-border bg-card">
          <CloudSun className="h-6 w-6 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Weather information requires an API key</p>
          <p className="text-xs mt-1">Set OPENWEATHER_API_KEY in your environment</p>
        </div>
      )
    }

    if (state === 'error' || !weather) {
      return (
        <div className="p-4 text-center text-muted-foreground rounded-lg border border-border bg-card">
          <CloudSun className="h-6 w-6 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Weather unavailable</p>
          <p className="text-xs mt-1">Could not load weather for {locationLabel}</p>
        </div>
      )
    }

    // Find forecast entry for the trip start/end date
    const startForecastDay = getForecastForDate(forecast, startDate)
    const endForecastDay = getForecastForDate(forecast, endDate)
    const showStartForecast = startForecastDay && isDateInForecast(startDate)
    const showEndForecast = endForecastDay && isDateInForecast(endDate)

    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Location header */}
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {weather.location || locationLabel} &middot; {dateLabel}
          </span>
        </div>

        {/* Current weather */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {weather.icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://openweathermap.org/img/wn/${weather.icon}@2x.png`}
                  alt={weather.condition}
                  className="h-12 w-12"
                />
              )}
              <div>
                <span className="text-2xl font-bold">{Math.round(weather.temperature)}°</span>
                <p className="text-xs text-muted-foreground capitalize">{weather.description}</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              Feels like {Math.round(weather.feelsLike)}°
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Thermometer className="h-4 w-4" />
              <span>{Math.round(weather.temperature)}°C</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Droplets className="h-4 w-4" />
              <span>{weather.humidity}% humidity</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground col-span-2">
              <Wind className="h-4 w-4" />
              <span>{Math.round(weather.windSpeed)} km/h wind</span>
            </div>
          </div>

          {/* Trip forecast context */}
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Trip weather for {formatDate(startDate)} – {formatDate(endDate)}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Current conditions shown &middot; Enable forecast API key for daily forecasts
            </p>
          </div>
        </div>

        {/* Forecast for trip dates (if within forecast range) */}
        {(showStartForecast || showEndForecast) && (
          <div className="border-t border-border p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Forecast
            </p>
            <div className="grid grid-cols-2 gap-2">
              {showStartForecast && startForecastDay && (
                <div className="rounded-md bg-muted/20 p-2.5">
                  <p className="text-xs text-muted-foreground mb-1">
                    {formatDate(startDate)}
                  </p>
                  <div className="flex items-center gap-2">
                    {startForecastDay.icon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://openweathermap.org/img/wn/${startForecastDay.icon}.png`}
                        alt={startForecastDay.condition}
                        className="h-8 w-8"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold">{startForecastDay.tempMax}°</span>
                        <span className="text-xs text-muted-foreground">/ {startForecastDay.tempMin}°</span>
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{startForecastDay.description}</p>
                    </div>
                  </div>
                </div>
              )}
              {showEndForecast && endForecastDay && (
                <div className="rounded-md bg-muted/20 p-2.5">
                  <p className="text-xs text-muted-foreground mb-1">
                    {formatDate(endDate)}
                  </p>
                  <div className="flex items-center gap-2">
                    {endForecastDay.icon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://openweathermap.org/img/wn/${endForecastDay.icon}.png`}
                        alt={endForecastDay.condition}
                        className="h-8 w-8"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold">{endForecastDay.tempMax}°</span>
                        <span className="text-xs text-muted-foreground">/ {endForecastDay.tempMin}°</span>
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{endForecastDay.description}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Determine tab order ──────────────────────────────────────────
  const tabs: { id: string; label: string }[] = []
  if (hasStartLocation) {
    tabs.push({ id: 'start', label: 'Start' })
  }
  tabs.push({ id: 'destination', label: 'Destination' })
  if (showLegsTab && legs) {
    legs.forEach((leg, idx) => {
      const city = leg.destination.split(',')[0].trim()
      tabs.push({ id: `leg-${idx}`, label: `Leg ${idx + 1}: ${city}` })
    })
  }

  const defaultTab = tabs.length > 0 ? tabs[0].id : 'destination'

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <CloudSun className="h-4 w-4" />
          Weather
        </h2>
      </div>

      {tabs.length > 1 ? (
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-3 w-full overflow-x-auto">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {hasStartLocation && (
            <TabsContent value="start">
              {renderWeatherCard(
                startWeather,
                startForecast,
                startState,
                startLocation,
                `${durationDays} day(s)`,
              )}
            </TabsContent>
          )}

          <TabsContent value="destination">
            {renderWeatherCard(
              destWeather,
              destForecast,
              destState,
              destination,
              `${durationDays} day(s)`,
            )}
          </TabsContent>

          {showLegsTab && legs?.map((leg, idx) => (
            <TabsContent key={`leg-${idx}`} value={`leg-${idx}`}>
              {renderWeatherCard(
                legsWeather[idx]?.weather ?? null,
                legsWeather[idx]?.forecast ?? null,
                legsWeather[idx]?.state ?? 'loading',
                leg.destination,
                `Arriving ${formatDate(leg.date)}`,
              )}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        /* Single weather card when no start location */
        renderWeatherCard(
          destWeather,
          destForecast,
          destState,
          destination,
          `${durationDays} day(s)`,
        )
      )}

      {!destWeather && !startWeather && destState === 'unconfigured' && !hasStartLocation && (
        <div className="p-8 text-center text-muted-foreground rounded-lg border border-dashed border-border">
          <CloudSun className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Weather information requires an API key</p>
          <p className="text-xs mt-1">Set OPENWEATHER_API_KEY in your environment</p>
        </div>
      )}
    </section>
  )
}
