'use client'

import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  isToday, isSameDay, format
} from 'date-fns'
import { EventBadge } from './EventBadge'
import type { CalendarEvent } from '@/types'

interface WeekViewProps {
  currentDate: Date
  events: CalendarEvent[]
  weekStartsOn: 0 | 1
  onDayClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
}

export function WeekView({ currentDate, events, weekStartsOn, onDayClick, onEventClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border shrink-0">
        {days.map(day => (
          <div key={day.toISOString()}
            onClick={() => onDayClick(day)}
            className={`py-3 text-center cursor-pointer hover:bg-accent/30 transition-colors ${isToday(day) ? 'bg-primary/10' : ''}`}>
            <p className="text-xs text-muted-foreground uppercase">{format(day, 'EEE')}</p>
            <p className={`text-lg font-semibold mt-0.5 mx-auto w-9 h-9 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-primary text-primary-foreground' : ''}`}>
              {format(day, 'd')}
            </p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-b border-border shrink-0 min-h-[2rem]">
        {days.map(day => {
          const allDay = events.filter(e => e.isAllDay && isSameDay(new Date(e.start), day))
          return (
            <div key={day.toISOString()} className="p-1 border-r border-border flex flex-col gap-0.5">
              {allDay.map(e => <EventBadge key={e.id} event={e} onClick={onEventClick} />)}
            </div>
          )
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-7 h-full">
          {days.map(day => {
            const timed = events
              .filter(e => !e.isAllDay && isSameDay(new Date(e.start), day))
              .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
            return (
              <div key={day.toISOString()} className="border-r border-border p-1 flex flex-col gap-1">
                {timed.map(e => (
                  <div key={e.id} className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{format(new Date(e.start), 'h:mm a')}</span>
                    <EventBadge event={e} onClick={onEventClick} />
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
