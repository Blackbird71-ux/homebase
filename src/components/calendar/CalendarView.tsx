'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  addMonths, subMonths, addWeeks, subWeeks,
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
} from 'date-fns'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, LayoutGrid, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { EventModal } from './EventModal'
import { AssignMealModal } from '@/components/meal-plan/AssignMealModal'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/sheet'
import { listenAppEvent, AppEvents } from '@/lib/app-events'
import type { CalendarEvent } from '@/types'

interface CalendarSettings {
  calShowMeals: boolean
  calShowTodos: boolean
  calShowChores: boolean
}

interface CalendarViewProps {
  initialEvents: CalendarEvent[]
  weekStartsOn: 0 | 1
  currentUserId: string
  calendarSettings?: CalendarSettings
}

export function CalendarView({ initialEvents, weekStartsOn, currentUserId, calendarSettings: initialSettings }: CalendarViewProps) {
  const router = useRouter()
  const [view, setView] = useState<'month' | 'week'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate] = useState<Date | undefined>()
  const [mealModalOpen, setMealModalOpen] = useState(false)
  const [mealModalDate, setMealModalDate] = useState('')
  const [choreDrawerOpen, setChoreDrawerOpen] = useState(false)
  const [choreDate, setChoreDate] = useState('')
  const [choreTitle, setChoreTitle] = useState('')
  const [choreSaving, setChoreSaving] = useState(false)
  const [calSettings, setCalSettings] = useState<CalendarSettings>(
    initialSettings ?? { calShowMeals: false, calShowTodos: false, calShowChores: false }
  )
  const [settingsOpen, setSettingsOpen] = useState(false)

  const viewRef = useRef(view)
  const currentDateRef = useRef(currentDate)
  viewRef.current = view
  currentDateRef.current = currentDate

  // Sync server-rendered events when router.refresh() causes a re-render
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return }
    setEvents(initialEvents)
  }, [initialEvents])

  const calSettingsRef = useRef(calSettings)
  calSettingsRef.current = calSettings

  const refresh = useCallback(async (date?: Date, currentView?: string, settings?: CalendarSettings) => {
    const targetDate = date ?? currentDateRef.current
    const targetView = currentView ?? viewRef.current
    const s = settings ?? calSettingsRef.current
    let rangeStart: Date
    let rangeEnd: Date
    if (targetView === 'month') {
      const monthStart = startOfMonth(targetDate)
      const monthEnd = endOfMonth(targetDate)
      rangeStart = startOfWeek(monthStart, { weekStartsOn })
      rangeEnd = endOfWeek(monthEnd, { weekStartsOn })
    } else {
      rangeStart = startOfWeek(targetDate, { weekStartsOn })
      rangeEnd = endOfWeek(targetDate, { weekStartsOn })
    }
    rangeStart = new Date(rangeStart.getTime() - 7 * 24 * 60 * 60 * 1000)
    rangeEnd = new Date(rangeEnd.getTime() + 7 * 24 * 60 * 60 * 1000)

    const params = new URLSearchParams({
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
      ...(s.calShowMeals ? { meals: '1' } : {}),
      ...(s.calShowTodos ? { todos: '1' } : {}),
      ...(s.calShowChores ? { chores: '1' } : {}),
    })
    router.refresh()
    const res = await fetch(`/api/events?${params}`, { cache: 'no-store' })
    if (res.ok) setEvents(await res.json())
  }, [weekStartsOn, router])

  useEffect(() => {
    const cleanup = listenAppEvent(AppEvents.CALENDAR_UPDATED, () => {
      refresh()
    })
    return cleanup
  }, [refresh])

  function navigate(dir: 'prev' | 'next') {
    if (view === 'month') {
      const newDate = dir === 'next' ? addMonths(currentDate, 1) : subMonths(currentDate, 1)
      setCurrentDate(newDate)
      refresh(newDate, 'month')
    } else {
      const newDate = dir === 'next' ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1)
      setCurrentDate(newDate)
      refresh(newDate, 'week')
    }
  }

  function goToday() {
    const today = new Date()
    setCurrentDate(today)
    refresh(today, view)
  }

  function openNew(date?: Date) {
    setSelectedEvent(null)
    setDefaultDate(date)
    setModalOpen(true)
  }

  function openNewChore(date: Date) {
    setChoreDate(format(date, 'yyyy-MM-dd'))
    setChoreTitle('')
    setChoreDrawerOpen(true)
  }

  async function handleChoreCreate() {
    if (!choreTitle.trim()) return
    setChoreSaving(true)
    try {
      const res = await fetch('/api/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: choreTitle.trim(), frequency: 'one-off', startDate: choreDate }),
      })
      if (!res.ok) throw new Error('Failed to save chore')
      toast.success('Chore added')
      setChoreDrawerOpen(false)
      refresh()
    } catch {
      toast.error('Failed to add chore')
    } finally {
      setChoreSaving(false)
    }
  }

  function openNewMeal(date: Date) {
    setMealModalDate(format(date, 'yyyy-MM-dd'))
    setMealModalOpen(true)
  }

  async function handleMealAssign({ recipeIds, note }: { recipeIds?: string[]; note?: string }) {
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date(mealModalDate + 'T00:00:00.000Z').toISOString(),
          mealType: 'dinner',
          recipeIds: recipeIds ?? [],
          note,
          append: false,
        }),
      })
      if (!res.ok) throw new Error('Failed to save meal')
      toast.success('Meal added to planner')
      setMealModalOpen(false)
    } catch {
      toast.error('Failed to add meal')
    }
  }

  function openEdit(event: CalendarEvent) {
    if (event.source === 'trip' && event.tripId) {
      router.push('/trips/' + event.tripId)
      return
    }
    if (event.isBusy) return
    setSelectedEvent(event)
    setDefaultDate(undefined)
    setModalOpen(true)
  }

  function onTripClick(tripId: string) {
    router.push('/trips/' + tripId)
  }

  async function toggleSetting(key: keyof CalendarSettings) {
    const next = { ...calSettings, [key]: !calSettings[key] }
    setCalSettings(next)
    refresh(undefined, undefined, next)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uiPreferences: { [key]: next[key] } }),
    })
  }

  const isThisMonth = view === 'month'
    ? format(currentDate, 'M-yyyy') === format(new Date(), 'M-yyyy')
    : false

  const monthLabel = format(currentDate, 'MMMM')
  const yearLabel = format(currentDate, 'yyyy')
  const weekLabel = `${format(startOfWeek(currentDate, { weekStartsOn }), 'MMM d')} – ${format(endOfWeek(currentDate, { weekStartsOn }), 'MMM d, yyyy')}`

  return (
    <div className="flex flex-col h-full gap-0 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4 pb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 bg-card/50 backdrop-blur-sm">

        {/* Left: navigation */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate('prev')}
            className="h-8 w-8 flex items-center justify-center rounded-full border border-border/70 bg-background hover:bg-accent transition-colors shrink-0"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate('next')}
            className="h-8 w-8 flex items-center justify-center rounded-full border border-border/70 bg-background hover:bg-accent transition-colors shrink-0"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Title */}
          <div className="ml-1 min-w-0">
            {view === 'month' ? (
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold tracking-tight text-foreground truncate">{monthLabel}</span>
                <span className="text-sm font-medium text-muted-foreground">{yearLabel}</span>
              </div>
            ) : (
              <span className="text-base font-semibold text-foreground truncate block">{weekLabel}</span>
            )}
          </div>

          {/* Today badge */}
          <button
            onClick={goToday}
            className={[
              'ml-1 px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors shrink-0',
              isThisMonth
                ? 'border-primary/40 text-primary bg-primary/10 cursor-default'
                : 'border-border/70 text-muted-foreground bg-background hover:bg-accent hover:text-foreground',
            ].join(' ')}
          >
            Today
          </button>
        </div>

        {/* Right: view switcher + settings + add */}
        <div className="flex items-center gap-2 shrink-0">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border/70 bg-background p-0.5 gap-0.5">
            <button
              onClick={() => { setView('month'); refresh(currentDate, 'month') }}
              title="Month view"
              className={[
                'h-7 w-7 flex items-center justify-center rounded-md transition-all text-sm',
                view === 'month'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              ].join(' ')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setView('week'); refresh(currentDate, 'week') }}
              title="Week view"
              className={[
                'h-7 w-7 flex items-center justify-center rounded-md transition-all text-sm',
                view === 'week'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              ].join(' ')}
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Calendar display settings */}
          <div className="relative">
            <button
              onClick={() => setSettingsOpen(v => !v)}
              title="Calendar display settings"
              className={[
                'h-8 w-8 flex items-center justify-center rounded-lg border border-border/70 bg-background transition-colors',
                settingsOpen
                  ? 'bg-accent text-foreground border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              ].join(' ')}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            {settingsOpen && (
              <div
                className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-border bg-card shadow-xl p-3 flex flex-col gap-2"
                onMouseLeave={() => setSettingsOpen(false)}
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Show on calendar</p>
                {([
                  { key: 'calShowMeals' as const, label: "Tonight's dinner" },
                  { key: 'calShowTodos' as const, label: 'Todos with due date' },
                  { key: 'calShowChores' as const, label: 'Chores due' },
                ] as const).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={calSettings[key]}
                      onClick={() => toggleSetting(key)}
                      className="shrink-0"
                      style={{
                        display: 'inline-flex', width: 32, height: 18, borderRadius: 9,
                        background: calSettings[key] ? 'var(--primary)' : 'var(--muted)',
                        position: 'relative', transition: 'background 0.15s', border: 'none', cursor: 'pointer', padding: 0,
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: 2, left: calSettings[key] ? 16 : 2,
                        width: 14, height: 14, borderRadius: '50%', background: 'white',
                        transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </button>
                    <span className="text-xs text-foreground">{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Add event */}
          <Button
            size="sm"
            onClick={() => openNew()}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Event</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* ── Calendar body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden bg-background">
        {view === 'month' ? (
          <MonthView
            currentDate={currentDate}
            events={events}
            weekStartsOn={weekStartsOn}
            onDayClick={date => openNew(date)}
            onEventClick={openEdit}
            onMealClick={openNewMeal}
            onChoreClick={openNewChore}
            onTripClick={onTripClick}
          />
        ) : (
          <WeekView
            currentDate={currentDate}
            events={events}
            weekStartsOn={weekStartsOn}
            onDayClick={date => openNew(date)}
            onEventClick={openEdit}
            onMealClick={openNewMeal}
            onChoreClick={openNewChore}
            onTripClick={onTripClick}
          />
        )}
      </div>

      <EventModal
        event={selectedEvent}
        defaultDate={defaultDate}
        open={modalOpen}
        currentUserId={currentUserId}
        onClose={() => {
          setModalOpen(false)
          setTimeout(() => setSelectedEvent(null), 300)
        }}
        onSave={refresh}
      />

      {mealModalDate && (
        <AssignMealModal
          open={mealModalOpen}
          onOpenChange={setMealModalOpen}
          date={mealModalDate}
          mealType="dinner"
          onAssign={handleMealAssign}
        />
      )}

      <Drawer open={choreDrawerOpen} onOpenChange={setChoreDrawerOpen}>
        <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>Add Chore{choreDate ? ` — ${choreDate}` : ''}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Title <span className="text-destructive">*</span></label>
              <input
                autoFocus
                type="text"
                value={choreTitle}
                onChange={e => setChoreTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleChoreCreate() }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. Clean bathroom"
              />
            </div>
          </div>
          <div className="border-t border-border px-4 py-3 flex justify-end gap-2">
            <button onClick={() => setChoreDrawerOpen(false)} className="px-4 py-2 rounded-md text-sm border border-input hover:bg-accent">Cancel</button>
            <button
              onClick={handleChoreCreate}
              disabled={!choreTitle.trim() || choreSaving}
              className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {choreSaving ? 'Saving…' : 'Add Chore'}
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
