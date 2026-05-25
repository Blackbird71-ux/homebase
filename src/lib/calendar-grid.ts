import type { CalendarEvent } from '@/types'

export const GRID_START  = 6   // 6am
export const GRID_END    = 23  // 11pm
export const HOUR_PX     = 64
export const MIN_H       = 20
export const ALLDAY_CAP  = 4   // max all-day events shown before "+N more"

export function hourLabel(hour: number): string {
  if (hour === 0)  return '12am'
  if (hour === 12) return '12pm'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

export function topPx(hour: number, minute: number): number {
  const clampedHour = Math.max(GRID_START, Math.min(GRID_END, hour))
  const mins = (clampedHour - GRID_START) * 60 + (clampedHour === hour ? minute : 0)
  return Math.round((mins / 60) * HOUR_PX)
}

export function heightPx(startHour: number, startMin: number, endHour: number, endMin: number): number {
  const startMins = Math.max(0, (startHour - GRID_START) * 60 + startMin)
  const endMins   = Math.min((GRID_END - GRID_START) * 60, (endHour - GRID_START) * 60 + endMin)
  return Math.max(MIN_H, Math.round(((endMins - startMins) / 60) * HOUR_PX))
}

export interface PositionedEvent {
  event: CalendarEvent
  col: number
  totalCols: number
}

export function layoutEvents(events: CalendarEvent[]): PositionedEvent[] {
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
