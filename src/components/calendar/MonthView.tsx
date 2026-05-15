'use client'

import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, format,
  startOfDay, endOfDay,
} from 'date-fns'
import { EventBadge } from './EventBadge'
import type { CalendarEvent } from '@/types'

interface MonthViewProps {
  currentDate: Date
  events: CalendarEvent[]
  weekStartsOn: 0 | 1
  onDayClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
}

export function MonthView({ currentDate, events, weekStartsOn, onDayClick, onEventClick }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const dayHeaders = weekStartsOn === 0
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  const weeks = Math.ceil(days.length / 7)

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
          const dayStart = startOfDay(day)
          const col = idx % 7
          const isWeekend = weekStartsOn === 0
            ? col === 0 || col === 6
            : col === 5 || col === 6

          const dayEvents = events.filter(e => {
            const eventStart = startOfDay(new Date(e.start))
            const eventEnd = startOfDay(new Date(e.end))
            return dayStart >= eventStart && dayStart <= eventEnd
          })

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
              {/* Date number */}
              <div className="flex items-start justify-between">
                <span
                  className={[
                    'text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full transition-colors shrink-0',
                    today
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground group-hover:bg-accent group-hover:text-accent-foreground',
                  ].join(' ')}
                >
                  {format(day, 'd')}
                </span>
                {dayEvents.length > 3 && (
                  <span className="text-xs text-muted-foreground font-medium mt-0.5 mr-0.5 hidden md:block">
                    +{dayEvents.length - 3}
                  </span>
                )}
              </div>

              {/* Events */}
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
    </div>
  )
}
