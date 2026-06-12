'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, LayoutGrid, Settings2, Calendar, List, GanttChart } from 'lucide-react'
import { toast } from 'sonner'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { DayView } from './DayView'
import { ScheduleView } from './ScheduleView'
import { HorizontalWeekView } from './HorizontalWeekView'
import { EventModal } from './EventModal'
import { AssignMealModal } from '@/components/meal-plan/AssignMealModal'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/sheet'
import { listenAppEvent, AppEvents } from '@/lib/app-events'
import { OFFLINE_QUEUE_FLUSHED } from '@/lib/offline-queue'
import { CALENDAR_SCOPE, applyOfflineEventOps, type OfflineEventOp } from '@/lib/calendar-offline'
import { CHORES_SCOPE, queueChoreComplete } from '@/lib/chores-offline'
import { MEAL_PLAN_SCOPE, queueMealPlanSlotState } from '@/lib/meal-plan-offline'
import {
  localTimeToStoredDateTime, formatInTz, dateStringInTz, addLocalDays,
  addMonthsInTz, addWeeksInTz,
  startOfWeekInTz, endOfWeekInTz, isSameMonthInTz,
} from '@/lib/timezone'
import { buildEventsQuery, type CalendarViewName } from '@/lib/event-helpers'
import type { CalendarEvent } from '@/types'

interface CalendarSettings {
  calShowMeals: boolean
  calShowTodos: boolean
  calShowChores: boolean
  calShowBills: boolean
  calShowDocs: boolean
  calShowBirthdays: boolean
  calShowMaintenance: boolean
}

interface CalendarViewProps {
  initialEvents: CalendarEvent[]
  weekStartsOn: 0 | 1
  currentUserId: string
  timezone: string
  calendarSettings?: CalendarSettings
}

export function CalendarView({ initialEvents, weekStartsOn, currentUserId, timezone, calendarSettings: initialSettings }: CalendarViewProps) {
  const router = useRouter()
  const [view, setView] = useState<'month' | 'week' | 'day' | 'schedule' | 'horizontal'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  // Mutations queued while offline, overlaid on fetched events for display —
  // offline refreshes return the SW-cached response, which doesn't know
  // about queued changes. Cleared once the global flusher syncs them.
  const [pendingOps, setPendingOps] = useState<OfflineEventOp[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate] = useState<Date | undefined>()
  const [mealModalOpen, setMealModalOpen] = useState(false)
  const [mealModalDate, setMealModalDate] = useState('')
  const [choreDrawerOpen, setChoreDrawerOpen] = useState(false)
  const [choreDate, setChoreDate] = useState('')
  const [choreTitle, setChoreTitle] = useState('')
  const [choreTime, setChoreTime] = useState('')
  const [choreDuration, setChoreDuration] = useState('60')
  const [choreSaving, setChoreSaving] = useState(false)
  const [choreCompleteOpen, setChoreCompleteOpen] = useState(false)
  const [choreCompleteId, setChoreCompleteId] = useState('')
  const [choreCompleteTitle, setChoreCompleteTitle] = useState('')
  const [choreCompleting, setChoreCompleting] = useState(false)
  const [birthdayContactOpen, setBirthdayContactOpen] = useState(false)
  const [birthdayContactEntry, setBirthdayContactEntry] = useState<{ name: string; type: string; date: string } | null>(null)
  const [birthdayContactSaving, setBirthdayContactSaving] = useState(false)
  const [calSettings, setCalSettings] = useState<CalendarSettings>(
    initialSettings ?? { calShowMeals: false, calShowTodos: false, calShowChores: false, calShowBills: true, calShowDocs: true, calShowBirthdays: true, calShowMaintenance: true }
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
    const query = buildEventsQuery(targetView as CalendarViewName, targetDate, timezone, weekStartsOn, s)
    const res = await fetch(`/api/events?${query}`, { cache: 'no-store' })
    if (res.ok) setEvents(await res.json())
  }, [weekStartsOn, router, timezone])

  useEffect(() => {
    const cleanup = listenAppEvent(AppEvents.CALENDAR_UPDATED, () => {
      refresh()
    })
    return cleanup
  }, [refresh])

  // Drop the optimistic overlay and refetch once the global flusher
  // (useGlobalOfflineFlush) has synced queued calendar mutations.
  useEffect(() => {
    function handleFlushed(event: Event) {
      const listIds = (event as CustomEvent<{ listIds: string[] }>).detail?.listIds
      if (listIds?.includes(CALENDAR_SCOPE)) {
        setPendingOps([])
        refresh()
      } else if (listIds?.includes(CHORES_SCOPE) || listIds?.includes(MEAL_PLAN_SCOPE)) {
        // Replayed chore completions / meal-plan edits change the synthetic
        // chore and meal events server-side — refetch so they realign.
        // Calendar pendingOps stay untouched.
        refresh()
      }
    }
    window.addEventListener(OFFLINE_QUEUE_FLUSHED, handleFlushed)
    return () => window.removeEventListener(OFFLINE_QUEUE_FLUSHED, handleFlushed)
  }, [refresh])

  // Fetch full event list on mount — SSR only includes real Event records,
  // not synthetic events (meals, chores, bills) added by /api/events
  useEffect(() => {
    refresh()
  }, [refresh])

  function navigate(dir: 'prev' | 'next') {
    let newDate: Date
    if (view === 'month') {
      newDate = addMonthsInTz(currentDate, dir === 'next' ? 1 : -1, timezone)
    } else if (view === 'week' || view === 'horizontal') {
      newDate = addWeeksInTz(currentDate, dir === 'next' ? 1 : -1, timezone)
    } else if (view === 'day') {
      newDate = addLocalDays(currentDate, dir === 'next' ? 1 : -1, timezone)
    } else {
      newDate = addLocalDays(currentDate, dir === 'next' ? 30 : -30, timezone)
    }
    setCurrentDate(newDate)
    refresh(newDate, view)
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
    setChoreDate(dateStringInTz(date, timezone))
    setChoreTitle('')
    setChoreTime('')
    setChoreDuration('60')
    setChoreDrawerOpen(true)
  }

  async function handleChoreCreate() {
    if (!choreTitle.trim()) return
    setChoreSaving(true)
    try {
      const res = await fetch('/api/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: choreTitle.trim(),
          frequency: 'one-off',
          startDate: choreDate,
          ...(choreTime ? { startTime: localTimeToStoredDateTime(choreTime), duration: parseInt(choreDuration) } : {}),
        }),
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
    setMealModalDate(dateStringInTz(date, timezone))
    setMealModalOpen(true)
  }

  async function handleMealAssign({ recipeIds, note }: { recipeIds?: string[]; note?: string }) {
    // Offline: queue the slot's desired state for idempotent replay (same
    // whole-slot replace the online append:false POST performs).
    if (!navigator.onLine) {
      try {
        await queueMealPlanSlotState(mealModalDate, 'dinner', recipeIds ?? [], note ?? null)
        toast.success('Saved offline — will sync when you reconnect')
        setMealModalOpen(false)
      } catch {
        toast.error('Failed to save offline — storage unavailable.')
      }
      return
    }

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
    if (event.source === 'bill' || event.source === 'income') return
    if (event.source === 'birthday') {
      if (event.contactId) {
        router.push('/contacts')
      } else if (event.birthdayEntry && event.birthdayEntry.type !== 'anniversary') {
        setBirthdayContactEntry(event.birthdayEntry)
        setBirthdayContactOpen(true)
      }
      return
    }
    if (event.source === 'document') {
      router.push('/documents')
      return
    }
    if (event.source === 'maintenance') {
      router.push('/maintenance')
      return
    }
    if (event.source === 'chore') {
      setChoreCompleteId(event.id.replace('chore-', ''))
      setChoreCompleteTitle(event.title.replace(/^Chore:\s*/, ''))
      setChoreCompleteOpen(true)
      return
    }
    setSelectedEvent(event)
    setDefaultDate(undefined)
    setModalOpen(true)
  }

  async function handleChoreComplete() {
    if (!choreCompleteId) return
    setChoreCompleting(true)

    // Offline: queue the completion for idempotent replay; the post-flush
    // refetch moves the synthetic chore event to its advanced due date.
    if (!navigator.onLine) {
      try {
        await queueChoreComplete(choreCompleteId)
        toast.success('Saved offline — will sync when you reconnect')
        setChoreCompleteOpen(false)
      } catch {
        toast.error('Failed to save offline — storage unavailable.')
      } finally {
        setChoreCompleting(false)
      }
      return
    }

    try {
      const res = await fetch(`/api/chores/${choreCompleteId}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (!res.ok) throw new Error('Failed to complete chore')
      toast.success('Chore marked as done')
      setChoreCompleteOpen(false)
      refresh()
    } catch {
      toast.error('Failed to complete chore')
    } finally {
      setChoreCompleting(false)
    }
  }

  async function handleBirthdayContactCreate() {
    if (!birthdayContactEntry) return
    setBirthdayContactSaving(true)
    try {
      const res = await fetch('/api/contacts/from-birthday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: birthdayContactEntry.name, date: birthdayContactEntry.date }),
      })
      if (!res.ok) throw new Error('Failed to create contact')
      toast.success(`Contact created for ${birthdayContactEntry.name}`)
      setBirthdayContactOpen(false)
      refresh()
    } catch {
      toast.error('Failed to create contact')
    } finally {
      setBirthdayContactSaving(false)
    }
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

  const displayEvents = pendingOps.length > 0 ? applyOfflineEventOps(events, pendingOps) : events

  const today = new Date()
  const isCurrentPeriod = view === 'month'
    ? isSameMonthInTz(currentDate, today, timezone)
    : view === 'week' || view === 'horizontal'
    ? dateStringInTz(startOfWeekInTz(currentDate, timezone, weekStartsOn), timezone) === dateStringInTz(startOfWeekInTz(today, timezone, weekStartsOn), timezone)
    : dateStringInTz(currentDate, timezone) === dateStringInTz(today, timezone)

  const monthLabel    = formatInTz(currentDate, timezone, { month: 'long' })
  const yearLabel     = formatInTz(currentDate, timezone, { year: 'numeric' })
  const weekLabel     = `${formatInTz(startOfWeekInTz(currentDate, timezone, weekStartsOn), timezone, { month: 'short', day: 'numeric' })} – ${formatInTz(endOfWeekInTz(currentDate, timezone, weekStartsOn), timezone, { month: 'short', day: 'numeric', year: 'numeric' })}`
  const dayLabel      = formatInTz(currentDate, timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const scheduleLabel = `${formatInTz(currentDate, timezone, { month: 'short', day: 'numeric' })} – ${formatInTz(addLocalDays(currentDate, 59, timezone), timezone, { month: 'short', day: 'numeric', year: 'numeric' })}`

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
            ) : view === 'week' || view === 'horizontal' ? (
              <span className="text-base font-semibold text-foreground truncate block">{weekLabel}</span>
            ) : view === 'day' ? (
              <span className="text-base font-semibold text-foreground truncate block">{dayLabel}</span>
            ) : (
              <span className="text-base font-semibold text-foreground truncate block">{scheduleLabel}</span>
            )}
          </div>

          {/* Today badge */}
          <button
            onClick={goToday}
            className={[
              'ml-1 px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors shrink-0',
              isCurrentPeriod
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
            <button
              onClick={() => { setView('day'); refresh(currentDate, 'day') }}
              title="Day view"
              className={[
                'h-7 w-7 flex items-center justify-center rounded-md transition-all text-sm',
                view === 'day'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              ].join(' ')}
            >
              <Calendar className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setView('schedule'); refresh(currentDate, 'schedule') }}
              title="Schedule view"
              className={[
                'h-7 w-7 flex items-center justify-center rounded-md transition-all text-sm',
                view === 'schedule'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              ].join(' ')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => { setView('horizontal'); refresh(currentDate, 'horizontal') }}
              title="Timeline view"
              className={[
                'h-7 w-7 flex items-center justify-center rounded-md transition-all text-sm',
                view === 'horizontal'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              ].join(' ')}
            >
              <GanttChart className="h-3.5 w-3.5" />
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
                  { key: 'calShowMeals'  as const, label: "Tonight's dinner" },
                  { key: 'calShowTodos'  as const, label: 'Todos with due date' },
                  { key: 'calShowChores' as const, label: 'Chores due' },
                  { key: 'calShowBills'  as const, label: 'Bills & income due' },
                  { key: 'calShowDocs'   as const, label: 'Document expiry' },
                  { key: 'calShowBirthdays'   as const, label: 'Birthdays & anniversaries' },
                  { key: 'calShowMaintenance' as const, label: 'Maintenance due' },
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
            events={displayEvents}
            weekStartsOn={weekStartsOn}
            timezone={timezone}
            onDayClick={date => openNew(date)}
            onEventClick={openEdit}
            onMealClick={openNewMeal}
            onChoreClick={openNewChore}
            onTripClick={onTripClick}
          />
        ) : view === 'week' ? (
          <WeekView
            currentDate={currentDate}
            events={displayEvents}
            weekStartsOn={weekStartsOn}
            timezone={timezone}
            onDayClick={date => { setCurrentDate(date); setView('day'); refresh(date, 'day') }}
            onEventClick={openEdit}
            onMealClick={openNewMeal}
            onChoreClick={openNewChore}
            onTripClick={onTripClick}
          />
        ) : view === 'day' ? (
          <DayView
            currentDate={currentDate}
            events={displayEvents}
            timezone={timezone}
            onDayClick={date => openNew(date)}
            onEventClick={openEdit}
            onMealClick={openNewMeal}
            onChoreClick={openNewChore}
            onTripClick={onTripClick}
          />
        ) : view === 'horizontal' ? (
          <HorizontalWeekView
            currentDate={currentDate}
            events={displayEvents}
            weekStartsOn={weekStartsOn}
            timezone={timezone}
            onDayClick={date => { setCurrentDate(date); setView('day'); refresh(date, 'day') }}
            onEventClick={openEdit}
          />
        ) : (
          <ScheduleView
            currentDate={currentDate}
            events={displayEvents}
            timezone={timezone}
            onDayClick={date => { setCurrentDate(date); setView('day'); refresh(date, 'day') }}
            onEventClick={openEdit}
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
        onOfflineChange={op => setPendingOps(prev => [...prev, op])}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Start time <span className="text-muted-foreground">(optional)</span></label>
                <input
                  type="time"
                  value={choreTime}
                  onChange={e => setChoreTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Duration</label>
                <select
                  value={choreDuration}
                  onChange={e => setChoreDuration(e.target.value)}
                  disabled={!choreTime}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">1 hour</option>
                  <option value="90">90 min</option>
                  <option value="120">2 hours</option>
                </select>
              </div>
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
      <Drawer open={choreCompleteOpen} onOpenChange={setChoreCompleteOpen}>
        <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>Mark chore as done?</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-4 text-sm text-muted-foreground">{choreCompleteTitle}</div>
          <div className="border-t border-border px-4 py-3 flex justify-between gap-2">
            <button
              onClick={() => { setChoreCompleteOpen(false); router.push('/chores') }}
              className="px-4 py-2 rounded-md text-sm border border-input hover:bg-accent"
            >
              Edit Chore
            </button>
            <div className="flex gap-2">
              <button onClick={() => setChoreCompleteOpen(false)} className="px-4 py-2 rounded-md text-sm border border-input hover:bg-accent">Cancel</button>
              <button
                onClick={handleChoreComplete}
                disabled={choreCompleting}
                className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {choreCompleting ? 'Saving…' : 'Mark Done'}
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
      <Drawer open={birthdayContactOpen} onOpenChange={setBirthdayContactOpen}>
        <DrawerContent className="sm:max-w-[480px]" showCloseButton={true}>
          <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
            <DrawerTitle>Create contact for {birthdayContactEntry?.name}?</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 py-4 text-sm text-muted-foreground">
            Adds {birthdayContactEntry?.name} to your Contacts with their birthday saved.
            The standalone calendar entry is removed — the contact becomes the single
            source of this birthday.
          </div>
          <div className="border-t border-border px-4 py-3 flex justify-end gap-2">
            <button onClick={() => setBirthdayContactOpen(false)} className="px-4 py-2 rounded-md text-sm border border-input hover:bg-accent">Cancel</button>
            <button
              onClick={handleBirthdayContactCreate}
              disabled={birthdayContactSaving}
              className="px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {birthdayContactSaving ? 'Saving…' : 'Create Contact'}
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
