'use client'

import { useState, useEffect, useRef } from 'react'
import { startOfWeek, endOfWeek, eachDayOfInterval, isToday } from 'date-fns'
import { eventFallsOnDay } from '@/lib/event-helpers'
import { formatInTz, getLocalHourMinute } from '@/lib/timezone'
import {
  GRID_START, GRID_END, HOUR_PX,
  hourLabel, topPx, heightPx, layoutEvents,
} from '@/lib/calendar-grid'
import type { CalendarEvent } from '@/types'

const DAY_COL_W = 80   // px — sticky left column
const HEADER_H  = 28   // px — sticky top row
const EVENT_H   = 22   // px — height of a single event lane
const ROW_PAD   = 6    // px — padding above/below events in each row

interface HorizontalWeekViewProps {
  currentDate: Date
  events: CalendarEvent[]
  weekStartsOn: 0 | 1
  timezone: string
  onDayClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
}

export function HorizontalWeekView({
  currentDate, events, weekStartsOn, timezone, onDayClick, onEventClick,
}: HorizontalWeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn })
  const weekEnd   = endOfWeek(currentDate,   { weekStartsOn })
  const days      = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const [nowLeft, setNowLeft] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const totalW = (GRID_END - GRID_START) * HOUR_PX
  const hours  = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i)

  // current-time indicator
  useEffect(() => {
    function update() {
      const { hour, minute } = getLocalHourMinute(new Date().toISOString(), timezone)
      if (hour < GRID_START || hour >= GRID_END) { setNowLeft(null); return }
      setNowLeft(topPx(hour, minute))
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [timezone])

  // auto-scroll to ~1 hour before now on mount
  useEffect(() => {
    if (!scrollRef.current) return
    const { hour, minute } = getLocalHourMinute(new Date().toISOString(), timezone)
    scrollRef.current.scrollLeft = Math.max(0, topPx(Math.max(GRID_START, hour - 1), minute) - 40)
  }, [timezone])

  // per-day row data
  const dayData = days.map(day => {
    const allDay    = events.filter(e => e.isAllDay && eventFallsOnDay(e, day, timezone))
    const timed     = events.filter(e => !e.isAllDay && eventFallsOnDay(e, day, timezone))
    const placed    = layoutEvents(timed)
    const maxLanes  = placed.reduce((m, p) => Math.max(m, p.totalCols), 1)
    const rowH      = ROW_PAD * 2 + maxLanes * EVENT_H + Math.max(0, maxLanes - 1) * 3
    return { day, allDay, placed, maxLanes, rowH }
  })

  return (
    <div ref={scrollRef} className="h-full overflow-auto" style={{ scrollBehavior: 'auto' }}>
      <div style={{ minWidth: DAY_COL_W + totalW }}>

        {/* ── Time header (sticky top) ─────────────────────────────────── */}
        <div
          className="flex sticky top-0 z-20 bg-background border-b border-border/60"
          style={{ height: HEADER_H }}
        >
          {/* corner */}
          <div
            className="shrink-0 sticky left-0 z-30 bg-background border-r border-border/50"
            style={{ width: DAY_COL_W }}
          />
          {/* hour labels */}
          <div className="relative flex-none" style={{ width: totalW }}>
            {hours.map(h => (
              <div
                key={h}
                className="absolute inset-y-0 flex items-center border-r border-border/20"
                style={{ left: (h - GRID_START) * HOUR_PX, width: HOUR_PX }}
              >
                <span className="text-[10px] font-medium text-muted-foreground pl-1.5 leading-none select-none">
                  {hourLabel(h)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Day rows ─────────────────────────────────────────────────── */}
        {dayData.map(({ day, allDay, placed, rowH }) => {
          const today = isToday(day)
          return (
            <div
              key={day.toISOString()}
              className="flex border-b border-border/30 last:border-b-0"
            >
              {/* Day label (sticky left) */}
              <button
                type="button"
                onClick={() => onDayClick(day)}
                className={[
                  'shrink-0 sticky left-0 z-10 flex flex-col items-center justify-start pt-2 gap-0.5',
                  'border-r border-border/50 bg-background hover:bg-accent/40 transition-colors',
                  today ? 'bg-primary/5' : '',
                ].join(' ')}
                style={{ width: DAY_COL_W, minHeight: rowH }}
              >
                <span className={[
                  'text-[10px] font-bold uppercase tracking-wider leading-none',
                  today ? 'text-primary' : 'text-muted-foreground',
                ].join(' ')}>
                  {formatInTz(day, timezone, { weekday: 'short' })}
                </span>
                <span className={[
                  'text-lg font-bold w-9 h-9 flex items-center justify-center rounded-full leading-none',
                  today ? 'bg-primary text-primary-foreground' : 'text-foreground',
                ].join(' ')}>
                  {formatInTz(day, timezone, { day: 'numeric' })}
                </span>
                {allDay.length > 0 && (
                  <div className="flex flex-col items-stretch gap-0.5 w-full px-1 mt-0.5">
                    {allDay.slice(0, 2).map(e => (
                      <span
                        key={e.id}
                        className="text-[9px] leading-tight px-1 py-0.5 rounded-sm truncate text-white text-center"
                        style={{ background: e.color ?? 'var(--primary)' }}
                        title={e.title}
                        onClick={ev => { ev.stopPropagation(); onEventClick(e) }}
                      >
                        {e.title}
                      </span>
                    ))}
                    {allDay.length > 2 && (
                      <span className="text-[9px] text-muted-foreground text-center">+{allDay.length - 2} more</span>
                    )}
                  </div>
                )}
              </button>

              {/* Time grid */}
              <div
                className={['relative flex-none', today ? 'bg-primary/[0.025]' : ''].join(' ')}
                style={{ width: totalW, minHeight: rowH }}
              >
                {/* Hour dividers */}
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute inset-y-0 border-r border-border/20"
                    style={{ left: (h - GRID_START) * HOUR_PX, width: HOUR_PX }}
                  />
                ))}

                {/* Current-time vertical line */}
                {today && nowLeft !== null && (
                  <div
                    className="absolute inset-y-0 w-px bg-red-500 z-10 pointer-events-none"
                    style={{ left: nowLeft }}
                  >
                    <div className="w-2 h-2 rounded-full bg-red-500 absolute -top-1 -left-[3px]" />
                  </div>
                )}

                {/* Timed events */}
                {placed.map(({ event: e, col, totalCols }) => {
                  const { hour: sh, minute: sm } = getLocalHourMinute(e.start, timezone)
                  const { hour: eh, minute: em } = getLocalHourMinute(e.end, timezone)
                  const left   = topPx(sh, sm)
                  const width  = Math.max(6, heightPx(sh, sm, eh, em))
                  const laneH  = EVENT_H
                  const top    = ROW_PAD + col * (laneH + 3)
                  void totalCols

                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onEventClick(e)}
                      title={e.title}
                      className="absolute rounded overflow-hidden text-left flex items-center px-1.5 hover:brightness-90 transition-[filter]"
                      style={{
                        left,
                        width,
                        top,
                        height: laneH,
                        background: e.color ?? 'var(--primary)',
                      }}
                    >
                      <span className="text-white text-[10px] font-medium leading-tight truncate select-none">
                        {e.title}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
