'use client'

import Link from 'next/link'
import { CalendarRange } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { eventColor } from '@/lib/event-color'
import type { CalendarWeekEvent } from '@/types'

export function CalendarWeekCard({ events }: { events: CalendarWeekEvent[] }) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Link href="/calendar" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <CalendarRange className="h-4 w-4" />
            Next 7 Days
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No events in the next 7 days</p>
        ) : (
          <ul className="space-y-1">
            {events.map((e) => (
              <li key={e.key} className="flex items-start gap-2 text-sm">
                <span className="h-2 w-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: eventColor(e) }} />
                <span className="min-w-0">
                  <span className="text-muted-foreground">{e.dateLabel}</span>
                  {' - '}
                  {e.timeLabel && <span className="font-medium">{e.timeLabel} </span>}
                  {e.title}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
