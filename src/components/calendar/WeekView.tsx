'use client'

import { useState, useEffect, useRef } from 'react'
import {
  startOfWeek, endOfWeek, eachDayOfInterval, isToday,
} from 'date-fns'
import { Utensils, ClipboardList, Plane } from 'lucide-react'
import { EventBadge } from './EventBadge'
import { eventFallsOnDay } from '@/lib/event-helpers'
import { formatInTz, getLocalHourMinute } from '@/lib/timezone'
import type { CalendarEvent } from '@/types'

const GRID_START = 6   // 6am
const GRID_END   = 23  // 11pm
const HOUR_PX    = 64
const MIN_H      = 20

interface WeekViewProps {
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

function hourLabel(hour: number): string {
  if (hour === 0)  return '12am'
  if (hour === 12) return '12pm'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

function topPx(hour: number, minute: number): number {
  const clampedHour = Math.max(GRID_START, Math.min(GRID_END, hour))
  const mins = (clampedHour - GRID_START) * 60 + (clampedHour === hour ? minute : 0)
  return Math.round((mins / 60) * HOUR_PX)
}

function heightPx(startHour: number, startMin: number, endHour: number, endMin: number): number {
  const startMins = Math.max(0, (startHour - GRID_START) * 60 + startMin)
  const endMins   = Math.min((GRID_END - GRID_START) * 60, (endHour - GRID_START) * 60 + endMin)
  return Math.max(MIN_H, Math.round(((endMins - startMins) / 60) * HOUR_PX))
}

interface PositionedEvent {
  event: CalendarEvent
  col: number
  totalCols: number
}

function layoutEvents(events: CalendarEvent[]): PositionedEvent[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  )
  const result: PositionedEvent[] = []
  const cols: number[] = []

  for (const event of sorted) {
    const startMs = new Date(event.start).getTime()
    const endMs   = new Date(event.end).getTime()
    let placed = false
    for (let i = 0; i < cols.length; i++) {
      if (cols[i] <= startMs) {
        result.push({ event, col: i, totalCols: 0 })
        cols[i] = endMs
        placed = true
        break
      }
    }
    if (!placed) {
      result.push({ event, col: cols.length, totalCols: 0 })
      cols.push(endMs)
    }
  }

  for (let i = 0; i < result.length; i++) {
    const startI = new Date(result[i].event.start).getTime()
    const endI   = new Date(result[i].event.end).getTime()
    let maxCol = result[i].col
    for (let j = 0; j < result.length; j++) {
      const startJ = new Date(result[j].event.start).getTime()
      const endJ   = new Date(result[j].event.end).getTime()
      if (startJ < endI && endJ > startI) maxCol = Math.max(maxCol, result[j].col)
    }
    result[i].totalCols = maxCol + 1
  }

  return result
}

export function WeekView({ currentDate, events, weekStartsOn, timezone, onDayClick, onEventClick, onMealClick, onChoreClick, onTripClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn })
  const weekEnd   = endOfWeek(currentDate, { weekStartsOn })
  const days      = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const [nowTop, setNowTop] = useState<number | null>(null)
  const gridScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function update() {
      const { hour, minute } = getLocalHourMinute(new Date().toISOString(), timezone)
      if (hour < GRID_START || hour >= GRID_END) { setNowTop(null); return }
      setNowTop(topPx(hour, minute))
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [timezone])

  useEffect(() => {
    if (!gridScrollRef.current) return
    const { hour, minute } = getLocalHourMinute(new Date().toISOString(), timezone)
    gridScrollRef.current.scrollTop = topPx(Math.max(GRID_START, hour - 1), minute)
  }, [timezone])

  const gridHeight = (GRID_END - GRID_START) * HOUR_PX
  const hourCount  = GRID_END - GRID_START

  return (
    <div className="h-full overflow-hidden flex flex-col">

      {/* ── Mobile: vertical day list ─────────────────────────────────── */}
      <div className="md:hidden flex-1 overflow-y-auto">
        {days.map((day) => {
          const allDay = events.filter((e) => e.isAllDay && eventFallsOnDay(e, day, timezone))
          const timed  = events
            .filter((e) => !e.isAllDay && eventFallsOnDay(e, day, timezone))
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
                  {formatInTz(day, timezone, { weekday: 'short' })}
                </span>
                <span className={[
                  'text-sm font-bold h-7 w-7 flex items-center justify-center rounded-full shrink-0 transition-colors',
                  today ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground',
                ].join(' ')}>
                  {formatInTz(day, timezone, { day: 'numeric' })}
                </span>
              </div>
              <div className="ml-11 flex flex-col gap-1.5">
                {allEvents.map((e) => (
                  <div key={e.id} onClick={(ev) => { ev.stopPropagation(); onEventClick(e) }}>
                    {!e.isAllDay && (
                      <span className="text-xs text-muted-foreground font-medium block mb-0.5">
                        {formatInTz(new Date(e.start), timezone, { hour: 'numeric', minute: '2-digit', hour12: true })}
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

      {/* ── Desktop: time grid ───────────────────────────────────────── */}
      <div className="hidden md:flex flex-col h-full overflow-hidden">

        {/* Day header row */}
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-border/60 bg-muted/30 shrink-0">
          <div className="border-r border-border/40" />
          {days.map((day) => {
            const today = isToday(day)
            const dayTripEvent = events.find(e => e.source === 'trip' && eventFallsOnDay(e, day, timezone))
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
                  {formatInTz(day, timezone, { weekday: 'short' })}
                </p>
                <p className={[
                  'text-xl font-bold mx-auto w-10 h-10 flex items-center justify-center rounded-full transition-all',
                  today
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                ].join(' ')}>
                  {formatInTz(day, timezone, { day: 'numeric' })}
                </p>
                <div className="flex items-center justify-center gap-0.5 mt-1">
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
                  {onTripClick && dayTripEvent?.tripId && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onTripClick(dayTripEvent.tripId!) }}
                      title="View trip"
                      className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-primary/70 hover:text-primary transition-colors"
                    >
                      <Plane className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* All-day events banner */}
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-border/60 shrink-0 max-h-28 overflow-y-auto">
          <div className="border-r border-border/40 bg-muted/10" />
          {days.map((day) => {
            const allDay = events.filter((e) => e.isAllDay && eventFallsOnDay(e, day, timezone))
            return (
              <div key={day.toISOString()} className="p-1 border-r border-border/40 last:border-r-0 flex flex-col gap-0.5 bg-muted/10 min-h-[2rem]">
                {allDay.map((e) => <EventBadge key={e.id} event={e} onClick={onEventClick} />)}
              </div>
            )
          })}
        </div>

        {/* Scrollable time grid */}
        <div ref={gridScrollRef} className="flex-1 overflow-y-auto">
          <div
            className="grid grid-cols-[3rem_repeat(7,1fr)] divide-x divide-border/40"
            style={{ height: gridHeight }}
          >
            {/* Hour gutter */}
            <div className="relative border-r border-border/40">
              {Array.from({ length: hourCount }).map((_, i) => (
                <div
                  key={i}
                  className="absolute right-1 text-[10px] text-muted-foreground/60 leading-none select-none"
                  style={{ top: Math.max(2, i * HOUR_PX - 6) }}
                >
                  {hourLabel(GRID_START + i)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((day) => {
              const today      = isToday(day)
              const timed      = events.filter((e) => !e.isAllDay && eventFallsOnDay(e, day, timezone))
              const positioned = layoutEvents(timed)

              return (
                <div
                  key={day.toISOString()}
                  className={['relative cursor-pointer', today ? 'bg-primary/[0.02]' : ''].join(' ')}
                  style={{ height: gridHeight }}
                  onClick={() => onDayClick(day)}
                >
                  {/* Hour lines */}
                  {Array.from({ length: hourCount }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-border/50 pointer-events-none"
                      style={{ top: i * HOUR_PX }}
                    />
                  ))}
                  {/* Half-hour lines */}
                  {Array.from({ length: hourCount }).map((_, i) => (
                    <div
                      key={`h${i}`}
                      className="absolute left-0 right-0 border-t border-border/30 pointer-events-none"
                      style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
                    />
                  ))}

                  {/* Positioned timed events */}
                  {positioned.map(({ event, col, totalCols }) => {
                    const { hour: sh, minute: sm } = getLocalHourMinute(event.start, timezone)
                    const { hour: eh, minute: em } = getLocalHourMinute(event.end, timezone)
                    const top    = topPx(sh, sm)
                    const height = heightPx(sh, sm, eh, em)
                    return (
                      <div
                        key={event.id}
                        className="absolute z-10 overflow-hidden flex flex-col"
                        style={{
                          top,
                          height,
                          width: `calc((100% - 2px) / ${totalCols})`,
                          left:  `calc(${col} * (100% - 2px) / ${totalCols})`,
                          padding: '1px 2px',
                        }}
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        {height >= 36 && (
                          <span className="text-[9px] text-muted-foreground px-1 pt-0.5 shrink-0 leading-none">
                            {formatInTz(new Date(event.start), timezone, { hour: 'numeric', minute: '2-digit', hour12: true })}
                          </span>
                        )}
                        <div className="flex-1 min-h-0">
                          <EventBadge event={event} onClick={onEventClick} />
                        </div>
                      </div>
                    )
                  })}

                  {/* Current-time indicator — today only */}
                  {today && nowTop !== null && (
                    <div
                      className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                      style={{ top: nowTop }}
                    >
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                      <div className="flex-1 h-px bg-red-500" />
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
