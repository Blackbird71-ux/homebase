'use client'

import { useState, useEffect, useRef } from 'react'
import { Utensils, ClipboardList, Plane, X } from 'lucide-react'
import { EventBadge } from './EventBadge'
import { eventFallsOnDay } from '@/lib/event-helpers'
import {
  formatInTz, getLocalHourMinute, startOfWeekInTz, endOfWeekInTz, eachDayInTz, isTodayInTz,
} from '@/lib/timezone'
import { GRID_START, GRID_END, HOUR_PX, ALLDAY_CAP, hourLabel, topPx, heightPx, layoutEvents } from '@/lib/calendar-grid'
import type { CalendarEvent } from '@/types'

interface OverflowPopup {
  day: Date
  top: number
  left: number
}

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

export function WeekView({ currentDate, events, weekStartsOn, timezone, onDayClick, onEventClick, onMealClick, onChoreClick, onTripClick }: WeekViewProps) {
  const weekStart = startOfWeekInTz(currentDate, timezone, weekStartsOn)
  const weekEnd   = endOfWeekInTz(currentDate, timezone, weekStartsOn)
  const days      = eachDayInTz(weekStart, weekEnd, timezone)

  const [nowTop, setNowTop] = useState<number | null>(null)
  const [overflow, setOverflow] = useState<OverflowPopup | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const gridScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!overflow) return
    function onMouseDown(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setOverflow(null)
    }
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setOverflow(null) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('mousedown', onMouseDown); document.removeEventListener('keydown', onKeyDown) }
  }, [overflow])

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
          const today = isTodayInTz(day, timezone)

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
            const today = isTodayInTz(day, timezone)
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
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-border/60 shrink-0">
          <div className="border-r border-border/40 bg-muted/10" />
          {days.map((day) => {
            const allDay = events.filter((e) => e.isAllDay && eventFallsOnDay(e, day, timezone))
            const visible = allDay.slice(0, ALLDAY_CAP)
            const extra = allDay.length - ALLDAY_CAP
            return (
              <div key={day.toISOString()} className="p-1 border-r border-border/40 last:border-r-0 flex flex-col gap-0.5 bg-muted/10 min-h-[2rem]">
                {visible.map((e) => <EventBadge key={e.id} event={e} onClick={onEventClick} />)}
                {extra > 0 && (
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation()
                      const rect = ev.currentTarget.getBoundingClientRect()
                      const left = Math.min(rect.left, window.innerWidth - 272)
                      setOverflow({ day, top: rect.bottom + 4, left })
                    }}
                    className="text-xs text-muted-foreground font-medium px-1 hover:text-foreground transition-colors text-left"
                  >
                    +{extra} more
                  </button>
                )}
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
              const today      = isTodayInTz(day, timezone)
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

      {/* Overflow popup */}
      {overflow && (
        <div
          ref={popupRef}
          className="fixed z-50 w-64 bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
          style={{ top: overflow.top, left: overflow.left }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
            <span className="text-sm font-semibold">
              {formatInTz(overflow.day, timezone, { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <button onClick={() => setOverflow(null)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1 p-2 max-h-80 overflow-y-auto">
            {events.filter(e => eventFallsOnDay(e, overflow.day, timezone)).map(e => (
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
