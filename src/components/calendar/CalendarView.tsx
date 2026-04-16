'use client'

import { useState, useCallback } from 'react'
import { addMonths, subMonths, addWeeks, subWeeks, format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { EventModal } from './EventModal'
import type { CalendarEvent } from '@/types'

interface CalendarViewProps {
  initialEvents: CalendarEvent[]
  weekStartsOn: 0 | 1
}

export function CalendarView({ initialEvents, weekStartsOn }: CalendarViewProps) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate] = useState<Date | undefined>()

  const refresh = useCallback(async () => {
    const res = await fetch('/api/events')
    if (res.ok) setEvents(await res.json())
  }, [])

  function navigate(dir: 'prev' | 'next') {
    if (view === 'month') {
      setCurrentDate(d => dir === 'next' ? addMonths(d, 1) : subMonths(d, 1))
    } else {
      setCurrentDate(d => dir === 'next' ? addWeeks(d, 1) : subWeeks(d, 1))
    }
  }

  function openNew(date?: Date) {
    setSelectedEvent(null)
    setDefaultDate(date)
    setModalOpen(true)
  }

  function openEdit(event: CalendarEvent) {
    setSelectedEvent(event)
    setDefaultDate(undefined)
    setModalOpen(true)
  }

  const title = view === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : `Week of ${format(currentDate, 'MMM d, yyyy')}`

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold w-52 text-center">{title}</h2>
          <Button variant="outline" size="icon" onClick={() => navigate('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${view === 'month' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              Month
            </button>
            <button
              onClick={() => setView('week')}
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
        onClose={() => setModalOpen(false)}
        onSave={refresh}
      />
    </div>
  )
}
