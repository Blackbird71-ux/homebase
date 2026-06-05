'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Utensils, ClipboardList, Plane } from 'lucide-react'
import { EventBadge } from './EventBadge'
import { eventFallsOnDay } from '@/lib/event-helpers'
import { formatInTz, getLocalHourMinute, isTodayInTz } from '@/lib/timezone'
import { GRID_START, GRID_END, HOUR_PX, ALLDAY_CAP, hourLabel, topPx, heightPx, layoutEvents } from '@/lib/calendar-grid'
import type { CalendarEvent } from '@/types'

interface DayViewProps {
  currentDate: Date
  events: CalendarEvent[]
  timezone: string
  onEventClick: (event: CalendarEvent) => void
  onDayClick: (date: Date) => void
  onMealClick?: (date: Date) => void
  onChoreClick?: (date: Date) => void
  onTripClick?: (tripId: string) => void
}

interface OverflowPopup { top: number; left: number }

export function DayView({ currentDate, events, timezone, onEventClick, onDayClick, onMealClick, onChoreClick, onTripClick }: DayViewProps) {
  const [nowTop, setNowTop] = useState<number | null>(null)
  const [overflow, setOverflow] = useState<OverflowPopup | null>(null)
  const popupRef   = useRef<HTMLDivElement>(null)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const today      = isTodayInTz(currentDate, timezone)

  useEffect(() => {
    function update() {
      if (!today) { setNowTop(null); return }
      const { hour, minute } = getLocalHourMinute(new Date().toISOString(), timezone)
      if (hour < GRID_START || hour >= GRID_END) { setNowTop(null); return }
      setNowTop(topPx(hour, minute))
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [timezone, today])

  useEffect(() => {
    if (!scrollRef.current || !today) return
    const { hour, minute } = getLocalHourMinute(new Date().toISOString(), timezone)
    scrollRef.current.scrollTop = topPx(Math.max(GRID_START, hour - 1), minute)
  }, [timezone, today])

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

  const allDay     = events.filter(e => e.isAllDay  && eventFallsOnDay(e, currentDate, timezone))
  const timed      = events.filter(e => !e.isAllDay && eventFallsOnDay(e, currentDate, timezone))
  const visible    = allDay.slice(0, ALLDAY_CAP)
  const extra      = allDay.length - ALLDAY_CAP
  const positioned = layoutEvents(timed)
  const gridHeight = (GRID_END - GRID_START) * HOUR_PX
  const hourCount  = GRID_END - GRID_START
  const tripEvent  = events.find(e => e.source === 'trip' && eventFallsOnDay(e, currentDate, timezone))

  return (
    <div className="h-full overflow-hidden flex flex-col">

      {/* Day header */}
      <div className="border-b border-border/60 bg-muted/30 shrink-0 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <p className={['text-xs font-bold uppercase tracking-widest', today ? 'text-primary' : 'text-muted-foreground'].join(' ')}>
            {formatInTz(currentDate, timezone, { weekday: 'long' })}
          </p>
          <p className={[
            'text-xl font-bold h-10 w-10 flex items-center justify-center rounded-full',
            today ? 'bg-primary text-primary-foreground shadow-md' : 'text-foreground',
          ].join(' ')}>
            {formatInTz(currentDate, timezone, { day: 'numeric' })}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatInTz(currentDate, timezone, { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onMealClick && (
            <button onClick={() => onMealClick(currentDate)} title="Add meal"
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground">
              <Utensils className="h-3.5 w-3.5" />
            </button>
          )}
          {onChoreClick && (
            <button onClick={() => onChoreClick(currentDate)} title="Add chore"
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
            </button>
          )}
          {onTripClick && tripEvent?.tripId && (
            <button onClick={() => onTripClick(tripEvent.tripId!)} title="View trip"
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-primary/70 hover:text-primary">
              <Plane className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* All-day banner */}
      {allDay.length > 0 && (
        <div className="border-b border-border/60 shrink-0 bg-muted/10 px-2 py-1 flex flex-col gap-0.5">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-0.5">All day</p>
          {visible.map(e => <EventBadge key={e.id} event={e} onClick={onEventClick} />)}
          {extra > 0 && (
            <button
              onClick={ev => {
                const rect = ev.currentTarget.getBoundingClientRect()
                setOverflow({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 272) })
              }}
              className="text-xs text-muted-foreground font-medium px-1 hover:text-foreground transition-colors text-left"
            >
              +{extra} more
            </button>
          )}
        </div>
      )}

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[3rem_1fr] divide-x divide-border/40" style={{ height: gridHeight }}>

          {/* Hour gutter */}
          <div className="relative border-r border-border/40">
            {Array.from({ length: hourCount }).map((_, i) => (
              <div key={i} className="absolute right-1 text-[10px] text-muted-foreground/60 leading-none select-none"
                style={{ top: Math.max(2, i * HOUR_PX - 6) }}>
                {hourLabel(GRID_START + i)}
              </div>
            ))}
          </div>

          {/* Day column */}
          <div
            className={['relative cursor-pointer', today ? 'bg-primary/[0.02]' : ''].join(' ')}
            style={{ height: gridHeight }}
            onClick={() => onDayClick(currentDate)}
          >
            {Array.from({ length: hourCount }).map((_, i) => (
              <div key={i} className="absolute left-0 right-0 border-t border-border/50 pointer-events-none" style={{ top: i * HOUR_PX }} />
            ))}
            {Array.from({ length: hourCount }).map((_, i) => (
              <div key={`h${i}`} className="absolute left-0 right-0 border-t border-border/30 pointer-events-none" style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
            ))}

            {positioned.map(({ event, col, totalCols }) => {
              const { hour: sh, minute: sm } = getLocalHourMinute(event.start, timezone)
              const { hour: eh, minute: em } = getLocalHourMinute(event.end, timezone)
              const top    = topPx(sh, sm)
              const height = heightPx(sh, sm, eh, em)
              return (
                <div key={event.id} className="absolute z-10 overflow-hidden flex flex-col"
                  style={{
                    top, height,
                    width: `calc((100% - 2px) / ${totalCols})`,
                    left:  `calc(${col} * (100% - 2px) / ${totalCols})`,
                    padding: '1px 2px',
                  }}
                  onClick={ev => ev.stopPropagation()}
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

            {today && nowTop !== null && (
              <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: nowTop }}>
                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                <div className="flex-1 h-px bg-red-500" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Overflow popup */}
      {overflow && (
        <div ref={popupRef} className="fixed z-50 w-64 bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
          style={{ top: overflow.top, left: overflow.left }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
            <span className="text-sm font-semibold">
              {formatInTz(currentDate, timezone, { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <button onClick={() => setOverflow(null)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-col gap-1 p-2 max-h-80 overflow-y-auto">
            {allDay.map(e => <EventBadge key={e.id} event={e} onClick={ev => { setOverflow(null); onEventClick(ev) }} />)}
          </div>
        </div>
      )}
    </div>
  )
}
