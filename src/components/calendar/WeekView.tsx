'use client'

import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  isToday, format, startOfDay,
} from 'date-fns'
import { Utensils, ClipboardList } from 'lucide-react'
import { EventBadge } from './EventBadge'
import type { CalendarEvent } from '@/types'

interface WeekViewProps {
  currentDate: Date
  events: CalendarEvent[]
  weekStartsOn: 0 | 1
  onDayClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
  onMealClick?: (date: Date) => void
  onChoreClick?: (date: Date) => void
}

export function WeekView({ currentDate, events, weekStartsOn, onDayClick, onEventClick, onMealClick, onChoreClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn })
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

  return (
    <div className="h-full overflow-hidden flex flex-col">

      {/* ── Mobile: vertical day list ─────────────────────────────────── */}
      <div className="md:hidden flex-1 overflow-y-auto">
        {days.map((day) => {
          const dayStart = startOfDay(day)
          const allDay = events.filter((e) => {
            if (!e.isAllDay) return false
            const es = startOfDay(new Date(e.start))
            const ee = startOfDay(new Date(e.end))
            return dayStart >= es && dayStart <= ee
          })
          const timed = events
            .filter((e) => {
              if (e.isAllDay) return false
              const es = startOfDay(new Date(e.start))
              const ee = startOfDay(new Date(e.end))
              return dayStart >= es && dayStart <= ee
            })
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
          const allEvents = [...allDay, ...timed]
          const today = isToday(day)

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDayClick(day)}
              className={[
                'w-full text-left px-4 py-3 transition-colors border-b border-border/50',
                today ? 'bg-primary/5' : 'hover:bg-accent/20',
              ].join(' ')}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className={[
                  'text-xs font-bold uppercase tracking-widest w-8 shrink-0',
                  today ? 'text-primary' : 'text-muted-foreground',
                ].join(' ')}>
                  {format(day, 'EEE')}
                </span>
                <span className={[
                  'text-sm font-bold h-7 w-7 flex items-center justify-center rounded-full shrink-0 transition-colors',
                  today ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground',
                ].join(' ')}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="ml-11 flex flex-col gap-1.5">
                {allEvents.map((e) => (
                  <div key={e.id} onClick={(ev) => { ev.stopPropagation(); onEventClick(e) }}>
                    {!e.isAllDay && (
                      <span className="text-xs text-muted-foreground font-medium block mb-0.5">
                        {format(new Date(e.start), 'h:mm a')}
                      </span>
                    )}
                    <EventBadge event={e} onClick={onEventClick} />
                  </div>
                ))}
                {allEvents.length === 0 && (
                  <p className="text-xs text-muted-foreground/50 italic">No events</p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Desktop: 7-column grid ────────────────────────────────────── */}
      <div className="hidden md:flex flex-col h-full overflow-hidden">

        {/* Day header row */}
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30 shrink-0">
          {days.map((day) => {
            const today = isToday(day)
            return (
              <div
                key={day.toISOString()}
                onClick={() => onDayClick(day)}
                className={[
                  'py-3 text-center cursor-pointer transition-colors border-r border-border/40 last:border-r-0 group',
                  today ? 'bg-primary/5' : 'hover:bg-accent/20',
                ].join(' ')}
              >
                <p className={[
                  'text-xs font-bold uppercase tracking-widest mb-1',
                  today ? 'text-primary' : 'text-muted-foreground',
                ].join(' ')}>
                  {format(day, 'EEE')}
                </p>
                <p className={[
                  'text-xl font-bold mx-auto w-10 h-10 flex items-center justify-center rounded-full transition-all',
                  today
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                ].join(' ')}>
                  {format(day, 'd')}
                </p>
                {onMealClick && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onMealClick(day) }}
                    title="Add meal to planner"
                    className="opacity-0 group-hover:opacity-100 transition-opacity mx-auto mt-1 h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  >
                    <Utensils className="h-3 w-3" />
                  </button>
                )}
                {onChoreClick && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onChoreClick(day) }}
                    title="Add chore"
                    className="opacity-0 group-hover:opacity-100 transition-opacity mx-auto mt-1 h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  >
                    <ClipboardList className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* All-day events row */}
        <div className="grid grid-cols-7 border-b border-border/60 shrink-0 min-h-[2rem]">
          {days.map((day) => {
            const dayStart = startOfDay(day)
            const allDay = events.filter((e) => {
              if (!e.isAllDay) return false
              const es = startOfDay(new Date(e.start))
              const ee = startOfDay(new Date(e.end))
              return dayStart >= es && dayStart <= ee
            })
            return (
              <div key={day.toISOString()} className="p-1 border-r border-border/40 last:border-r-0 flex flex-col gap-0.5 bg-muted/10">
                {allDay.map((e) => <EventBadge key={e.id} event={e} onClick={onEventClick} />)}
              </div>
            )
          })}
        </div>

        {/* Timed events */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-7 h-full divide-x divide-border/40">
            {days.map((day) => {
              const dayStart = startOfDay(day)
              const today = isToday(day)
              const timed = events
                .filter((e) => {
                  if (e.isAllDay) return false
                  const es = startOfDay(new Date(e.start))
                  const ee = startOfDay(new Date(e.end))
                  return dayStart >= es && dayStart <= ee
                })
                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
              return (
                <div
                  key={day.toISOString()}
                  className={[
                    'p-1.5 flex flex-col gap-1.5 min-h-full cursor-pointer transition-colors',
                    today ? 'bg-primary/[0.03]' : 'hover:bg-accent/10',
                  ].join(' ')}
                  onClick={() => onDayClick(day)}
                >
                  {timed.map((e) => (
                    <div key={e.id} className="flex flex-col gap-0.5" onClick={(ev) => ev.stopPropagation()}>
                      <span className="text-xs text-muted-foreground font-medium px-1">
                        {format(new Date(e.start), 'h:mm a')}
                      </span>
                      <EventBadge event={e} onClick={onEventClick} />
                    </div>
                  ))}
                  {timed.length === 0 && (
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-xs text-muted-foreground/30">—</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
