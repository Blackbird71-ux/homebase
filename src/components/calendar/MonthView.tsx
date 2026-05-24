'use client'

import { useState, useRef, useEffect } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday,
} from 'date-fns'
import { Utensils, ClipboardList, Plane, X } from 'lucide-react'
import { EventBadge } from './EventBadge'
import { eventFallsOnDay } from '@/lib/event-helpers'
import { formatInTz } from '@/lib/timezone'
import type { CalendarEvent } from '@/types'

interface MonthViewProps {
  currentDate: Date
  events: CalendarEvent[]
  weekStartsOn: 0 | 1
  timezone: string
  onDayClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
  onMealClick?: (date: Date) => void
  onChoreClick?: (date: Date) => void
  onTripClick?: (tripId: string) => void
}

interface OverflowPopup {
  day: Date
  top: number
  left: number
}

export function MonthView({ currentDate, events, weekStartsOn, timezone, onDayClick, onEventClick, onMealClick, onChoreClick, onTripClick }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const [overflow, setOverflow] = useState<OverflowPopup | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overflow) return
    function onMouseDown(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOverflow(null)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOverflow(null)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [overflow])

  const dayHeaders = weekStartsOn === 0
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const weeks = Math.ceil(days.length / 7)

  const overflowDayEvents = overflow
    ? events.filter(e => eventFallsOnDay(e, overflow.day, timezone))
    : []

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
        {dayHeaders.map((d, i) => {
          const isWeekend = weekStartsOn === 0
            ? i === 0 || i === 6
            : i === 5 || i === 6
          return (
            <div
              key={d}
              className={`py-2.5 text-center text-xs font-semibold uppercase tracking-widest ${isWeekend ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}
            >
              <span className="hidden sm:inline">{d}</span>
              <span className="sm:hidden">{d.slice(0, 1)}</span>
            </div>
          )
        })}
      </div>

      {/* Calendar grid */}
      <div
        className="flex-1 grid grid-cols-7"
        style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {days.map((day, idx) => {
          const col = idx % 7
          const isWeekend = weekStartsOn === 0
            ? col === 0 || col === 6
            : col === 5 || col === 6

          const dayEvents = events.filter(e => eventFallsOnDay(e, day, timezone))
          const tripEvent = dayEvents.find(e => e.source === 'trip')

          const inMonth = isSameMonth(day, currentDate)
          const today = isToday(day)

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={[
                'border-b border-r border-border/50 flex flex-col gap-0.5 cursor-pointer transition-all duration-150 group',
                'p-1 md:p-1.5',
                !inMonth ? 'opacity-35' : '',
                isWeekend && inMonth ? 'bg-muted/20' : '',
                today ? 'bg-primary/5' : 'hover:bg-accent/20',
              ].join(' ')}
            >
              {/* Date number + action buttons */}
              <div className="flex items-start justify-between">
                <span
                  className={[
                    'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full transition-colors shrink-0',
                    today
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground group-hover:bg-accent group-hover:text-accent-foreground',
                  ].join(' ')}
                >
                  {formatInTz(day, timezone, { day: 'numeric' })}
                </span>
                <div className="flex items-center gap-0.5">
                  {onMealClick && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onMealClick(day) }}
                      title="Add meal to planner"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      <Utensils className="h-3 w-3" />
                    </button>
                  )}
                  {onChoreClick && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onChoreClick(day) }}
                      title="Add chore"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                      <ClipboardList className="h-3 w-3" />
                    </button>
                  )}
                  {onTripClick && tripEvent?.tripId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onTripClick(tripEvent.tripId!) }}
                      title="View trip"
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-primary/70 hover:text-primary transition-colors"
                    >
                      <Plane className="h-3 w-3" />
                    </button>
                  )}
                  {dayEvents.length > 3 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const left = Math.min(rect.left, window.innerWidth - 272)
                        setOverflow({ day, top: rect.bottom + 4, left })
                      }}
                      className="text-xs text-muted-foreground font-medium mt-0.5 mr-0.5 hidden md:block hover:text-foreground transition-colors cursor-pointer"
                    >
                      +{dayEvents.length - 3}
                    </button>
                  )}
                </div>
              </div>

              {/* Events (first 3) */}
              <div className="flex flex-col gap-0.5 overflow-hidden flex-1">
                {dayEvents.slice(0, 3).map(e => (
                  <EventBadge key={e.id} event={e} onClick={onEventClick} />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-xs text-muted-foreground px-1 md:hidden">
                    +{dayEvents.length - 3}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Overflow popup */}
      {overflow && (
        <div
          ref={popupRef}
          className="fixed z-50 w-64 bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
          style={{ top: overflow.top, left: overflow.left }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
            <span className="text-sm font-semibold">{formatInTz(overflow.day, timezone, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <button
              onClick={() => setOverflow(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1 p-2 max-h-80 overflow-y-auto">
            {overflowDayEvents.map(e => (
              <EventBadge
                key={e.id}
                event={e}
                onClick={(ev) => { setOverflow(null); onEventClick(ev) }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
