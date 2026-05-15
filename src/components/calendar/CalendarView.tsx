'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  addMonths, subMonths, addWeeks, subWeeks,
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
} from 'date-fns'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, LayoutGrid } from 'lucide-react'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { EventModal } from './EventModal'
import { listenAppEvent, AppEvents } from '@/lib/app-events'
import type { CalendarEvent } from '@/types'

interface CalendarViewProps {
  initialEvents: CalendarEvent[]
  weekStartsOn: 0 | 1
  currentUserId: string
}

export function CalendarView({ initialEvents, weekStartsOn, currentUserId }: CalendarViewProps) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate] = useState<Date | undefined>()

  const viewRef = useRef(view)
  const currentDateRef = useRef(currentDate)
  viewRef.current = view
  currentDateRef.current = currentDate

  const refresh = useCallback(async (date?: Date, currentView?: string) => {
    const targetDate = date ?? currentDateRef.current
    const targetView = currentView ?? viewRef.current
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
    })
    const res = await fetch(`/api/events?${params}`)
    if (res.ok) setEvents(await res.json())
  }, [weekStartsOn])

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

  function openEdit(event: CalendarEvent) {
    if (event.isBusy) return
    setSelectedEvent(event)
    setDefaultDate(undefined)
    setModalOpen(true)
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

        {/* Right: view switcher + add */}
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
          />
        ) : (
          <WeekView
            currentDate={currentDate}
            events={events}
            weekStartsOn={weekStartsOn}
            onDayClick={date => openNew(date)}
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
      />
    </div>
  )
}
