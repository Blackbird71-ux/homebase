'use client'

import { eachDayOfInterval, addDays, isToday } from 'date-fns'
import { EventBadge } from './EventBadge'
import { eventFallsOnDay } from '@/lib/event-helpers'
import { formatInTz } from '@/lib/timezone'
import type { CalendarEvent } from '@/types'

interface ScheduleViewProps {
  currentDate: Date
  events: CalendarEvent[]
  timezone: string
  onEventClick: (event: CalendarEvent) => void
  onDayClick: (date: Date) => void
}

export function ScheduleView({ currentDate, events, timezone, onEventClick, onDayClick }: ScheduleViewProps) {
  const days = eachDayOfInterval({ start: currentDate, end: addDays(currentDate, 59) })

  const daysWithEvents = days
    .map(day => ({
      day,
      events: events
        .filter(e => eventFallsOnDay(e, day, timezone))
        .sort((a, b) => {
          if (a.isAllDay && !b.isAllDay) return -1
          if (!a.isAllDay && b.isAllDay) return 1
          return new Date(a.start).getTime() - new Date(b.start).getTime()
        }),
    }))
    .filter(d => d.events.length > 0)

  if (daysWithEvents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No events in the next 60 days
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto py-2">
        {daysWithEvents.map(({ day, events: dayEvents }) => {
          const today = isToday(day)
          return (
            <div key={day.toISOString()} className="flex gap-4 px-4 py-3 border-b border-border/30 last:border-b-0">

              {/* Date column */}
              <button
                type="button"
                onClick={() => onDayClick(day)}
                className="w-14 shrink-0 text-left"
              >
                <p className={['text-[10px] font-bold uppercase tracking-widest leading-none mb-1', today ? 'text-primary' : 'text-muted-foreground'].join(' ')}>
                  {formatInTz(day, timezone, { weekday: 'short' })}
                </p>
                <p className={[
                  'text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-full leading-none',
                  today ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent transition-colors',
                ].join(' ')}>
                  {formatInTz(day, timezone, { day: 'numeric' })}
                </p>
              </button>

              {/* Events column */}
              <div className="flex-1 flex flex-col gap-1.5 py-1">
                {dayEvents.map(e => (
                  <div key={e.id} className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0 pt-0.5 leading-tight">
                      {e.isAllDay
                        ? 'All day'
                        : formatInTz(new Date(e.start), timezone, { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                    <div className="flex-1 min-w-0">
                      <EventBadge event={e} onClick={onEventClick} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
