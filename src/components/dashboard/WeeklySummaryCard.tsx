'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CalendarDays, Utensils, CheckSquare, CloudSun, Plus } from 'lucide-react'
import Link from 'next/link'
import { WeatherDialog } from './WeatherDialog'
import { EventModal } from '@/components/calendar/EventModal'
import { AssignMealModal } from '@/components/meal-plan/AssignMealModal'
import { CardQuickAdd } from './CardQuickAdd'
import { toast } from 'sonner'
import type { WeatherData } from '@/types'

export interface WeeklySummaryData {
  weekLabel: string
  eventCount: number
  mealCount: number
  pendingTodoCount: number
  topEvents: { id: string; title: string; start: string; color: string | null; dayLabel: string }[]
  topMeals: { day: string; meal: string; note?: string | null }[]
  topTodos: string[]
}

type ScopeDays = 7 | 14 | 30

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function WeeklySummaryCard({
  data,
  scope,
  onScopeChange,
  availableLists,
  selectedListId,
  onListChange,
}: {
  data: WeeklySummaryData | null
  scope?: ScopeDays
  onScopeChange?: (scope: ScopeDays) => void
  availableLists?: { id: string; name: string }[]
  selectedListId?: string | null
  onListChange?: (listId: string) => void
}) {
  const router = useRouter()
  const [weatherOpen, setWeatherOpen] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const [mealOpen, setMealOpen] = useState(false)
  const today = todayLocal()

  // Prefetch weather data on mount so it's instantly available when dialog opens
  const [prefetchedWeather, setPrefetchedWeather] = useState<WeatherData | null>(null)
  const [prefetchedLoading, setPrefetchedLoading] = useState(false)
  const [prefetchedError, setPrefetchedError] = useState<string | null>(null)
  const [prefetchedNeedsConfig, setPrefetchedNeedsConfig] = useState(false)
  const [prefetchedGeoError, setPrefetchedGeoError] = useState<string | null>(null)
  const prefetchStarted = useRef(false)

  useEffect(() => {
    if (prefetchStarted.current) return
    prefetchStarted.current = true

    const prefetchWeather = async () => {
      setPrefetchedLoading(true)

      // Try GPS first
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 300000,
            })
          })
          const res = await fetch(
            `/api/weather?lat=${position.coords.latitude}&lon=${position.coords.longitude}`
          )
          if (res.ok) {
            const weatherData: WeatherData = await res.json()
            setPrefetchedWeather(weatherData)
          } else {
            const errData = await res.json().catch(() => ({}))
            if (errData.needsConfig) {
              setPrefetchedNeedsConfig(true)
            } else {
              setPrefetchedError(errData.error ?? 'Failed to load weather.')
            }
          }
          setPrefetchedLoading(false)
          return
        } catch {
          // GPS failed — fall through to saved location
        }
      }

      // Fallback to saved location from settings
      try {
        const settingsRes = await fetch('/api/settings')
        if (settingsRes.ok) {
          const settings = await settingsRes.json()
          const savedLocation = settings.uiPreferences?.weatherLocation ?? null
          if (savedLocation) {
            const res = await fetch(`/api/weather?location=${encodeURIComponent(savedLocation)}`)
            if (res.ok) {
              const weatherData: WeatherData = await res.json()
              setPrefetchedWeather(weatherData)
            } else {
              const errData = await res.json().catch(() => ({}))
              if (errData.needsConfig) {
                setPrefetchedNeedsConfig(true)
              } else {
                setPrefetchedError(errData.error ?? 'Failed to load weather.')
              }
            }
          } else {
            setPrefetchedGeoError('Set a default location in Settings > Appearance.')
          }
        } else {
          setPrefetchedGeoError('Unable to load settings.')
        }
      } catch {
        setPrefetchedError('Network error.')
      }
      setPrefetchedLoading(false)
    }

    prefetchWeather()
  }, [])

  async function handleMealAssign(assignData: { recipeIds?: string[]; note?: string }) {
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today + 'T00:00:00Z', mealType: 'dinner', ...assignData }),
      })
      if (!res.ok) throw new Error('Failed to save meal')
      toast.success('Meal added')
      setMealOpen(false)
      router.refresh()
    } catch {
      toast.error('Failed to save meal')
    }
  }

  if (!data) return null

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <CalendarDays className="h-4 w-4" /> Next {scope ?? 7} Days — {data.weekLabel}
          </CardTitle>
          <div className="flex items-center gap-1">
            {/* Weather button */}
            <button
              type="button"
              onClick={() => setWeatherOpen(true)}
              title="Today's weather"
              className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/30"
            >
              <CloudSun className="h-3 w-3" />
              <span className="hidden sm:inline">Weather</span>
            </button>
            {onScopeChange && (
              <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-muted/30">
                {([7, 14, 30] as ScopeDays[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onScopeChange(d)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                      (scope ?? 7) === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {d === 30 ? '30d' : d === 14 ? '14d' : '7d'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <WeatherDialog
        open={weatherOpen}
        onOpenChange={setWeatherOpen}
        prefetchedWeather={prefetchedWeather}
        prefetchedLoading={prefetchedLoading}
        prefetchedError={prefetchedError}
        prefetchedNeedsConfig={prefetchedNeedsConfig}
        prefetchedGeoError={prefetchedGeoError}
      />
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Events summary */}
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-1">
              <Link href="/calendar" className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase">Events</span>
              </Link>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEventOpen(true) }}
                className="flex items-center justify-center h-5 w-5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Add Event"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <Link href="/calendar" className="block hover:opacity-80 transition-opacity">
              <p className="text-lg font-bold">{data.eventCount}</p>
              <p className="text-xs text-muted-foreground">this week</p>
              {data.topEvents.length > 0 && (
                <div className="mt-2 space-y-1">
                  {data.topEvents.map((e) => (
                    <div key={e.id} className="flex items-center gap-1.5 text-xs">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: e.color ?? '#6366f1' }} />
                      <span className="text-muted-foreground font-medium shrink-0 w-[28px]">{e.dayLabel}</span>
                      <span className="truncate">{e.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </Link>
          </div>

          {/* Meals summary */}
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-1">
              <Link href="/meal-plan" className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                <Utensils className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-medium text-muted-foreground uppercase">Meals</span>
              </Link>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMealOpen(true) }}
                className="flex items-center justify-center h-5 w-5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Add Meal"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <Link href="/meal-plan" className="block hover:opacity-80 transition-opacity">
              <p className="text-lg font-bold">{data.mealCount}</p>
              <p className="text-xs text-muted-foreground">planned meals</p>
              {data.topMeals.length > 0 && (
                <div className="mt-2 space-y-1">
                  {data.topMeals.map((m, i) => (
                    <div key={i}>
                      <p className="text-xs truncate">
                        <span className="text-muted-foreground">{m.day}:</span> {m.meal}
                      </p>
                      {m.note && (
                        <p className="text-[10px] text-muted-foreground/70 truncate pl-3 leading-tight">{m.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Link>
          </div>

          {/* To-dos summary */}
          <div className="block p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-muted-foreground uppercase">To-Do</span>
              {availableLists && availableLists.length > 1 && (
                <select
                  value={selectedListId ?? ''}
                  onChange={(e) => onListChange?.(e.target.value)}
                  className="ml-auto text-[10px] text-muted-foreground bg-transparent border border-border rounded px-1 py-0.5 cursor-pointer max-w-[120px] truncate"
                >
                  {availableLists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              )}
              {selectedListId && (
                <div className={availableLists && availableLists.length > 1 ? '' : 'ml-auto'}>
                  <CardQuickAdd type="todo-item" listId={selectedListId} />
                </div>
              )}
            </div>
            <Link href="/lists" className="block hover:opacity-80 transition-opacity">
              <p className="text-lg font-bold">{data.pendingTodoCount}</p>
              <p className="text-xs text-muted-foreground">pending tasks</p>
              {data.topTodos.length > 0 && (
                <div className="mt-2 space-y-1">
                  {data.topTodos.map((t, i) => (
                    <p key={i} className="text-xs truncate">{t}</p>
                  ))}
                </div>
              )}
            </Link>
          </div>
        </div>
      </CardContent>

      <EventModal
        open={eventOpen}
        event={null}
        currentUserId=""
        defaultDate={new Date()}
        onClose={() => setEventOpen(false)}
        onSave={() => { setEventOpen(false); router.refresh() }}
      />

      <AssignMealModal
        open={mealOpen}
        onOpenChange={setMealOpen}
        date={today}
        mealType="dinner"
        onAssign={handleMealAssign}
      />
    </Card>
  )
}
