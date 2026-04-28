'use client'

import { useState, useCallback, useRef } from 'react'
import { addMonths, subMonths, addWeeks, subWeeks, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { EventModal } from './EventModal'
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

  // Refs to avoid stale closure issues in refresh callback
  const viewRef = useRef(view)
  const currentDateRef = useRef(currentDate)
  viewRef.current = view
  currentDateRef.current = currentDate

  const refresh = useCallback(async (date?: Date, currentView?: string) => {
    const targetDate = date ?? currentDateRef.current
    const targetView = currentView ?? viewRef.current
    // Compute the visible date range to pass to the API for recurring event expansion
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
    // Add some padding to ensure we capture edge cases
    rangeStart = new Date(rangeStart.getTime() - 7 * 24 * 60 * 60 * 1000)
    rangeEnd = new Date(rangeEnd.getTime() + 7 * 24 * 60 * 60 * 1000)

    const params = new URLSearchParams({
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
    })
    const res = await fetch(`/api/events?${params}`)
    if (res.ok) setEvents(await res.json())
  }, [weekStartsOn])

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

  const title = view === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : `Week of ${format(currentDate, 'MMM d, yyyy')}`

  return (
    <div className="flex flex-col h-full p-3 md:p-4 gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-base md:text-lg font-semibold w-40 md:w-52 text-center truncate">{title}</h2>
          <Button variant="outline" size="icon" onClick={() => navigate('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => {
            const today = new Date()
            setCurrentDate(today)
            refresh(today, view)
          }}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => {
                setView('month')
                refresh(currentDate, 'month')
              }}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${view === 'month' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              Month
            </button>
            <button
              onClick={() => {
                setView('week')
                refresh(currentDate, 'week')
              }}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${view === 'week' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              Week
            </button>
          </div>
          <Button size="sm" onClick={() => openNew()}>
            <Plus className="h-4 w-4 mr-1" /> Add Event
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden border border-border rounded-lg">
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
          // Clear selected event after a short delay to ensure modal animation completes
          setTimeout(() => setSelectedEvent(null), 300)
        }}
        onSave={refresh}
      />
    </div>
  )
}
