'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Plus } from 'lucide-react'
import { formatInTz } from '@/lib/timezone'
import type { UpcomingEvent } from '@/types'
import Link from 'next/link'
import { EventModal } from '@/components/calendar/EventModal'

function formatEventDate(iso: string, timezone: string): string {
  const d = new Date(iso)
  const eventDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d)
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
  const todayParts = todayStr.split('-').map(Number)
  const tomorrow = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2] + 1))
  const tomorrowStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(tomorrow)
  if (eventDateStr === todayStr) return `Today ${formatInTz(d, timezone, { hour: 'numeric', minute: '2-digit' })}`
  if (eventDateStr === tomorrowStr) return `Tomorrow ${formatInTz(d, timezone, { hour: 'numeric', minute: '2-digit' })}`
  return formatInTz(d, timezone, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export function UpcomingEventsCard({ events, timezone }: { events: UpcomingEvent[]; timezone?: string }) {
  const tz = timezone ?? 'UTC'
  const router = useRouter()
  const [eventOpen, setEventOpen] = useState(false)

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Link href="/calendar" className="flex items-center gap-2 hover:text-foreground transition-colors flex-1 min-w-0">
            <Calendar className="h-4 w-4 shrink-0" /> Upcoming
          </Link>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEventOpen(true) }}
            className="flex items-center justify-center h-5 w-5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Add Event"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 min-h-0">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming events</p>
        ) : (
          events.map(e => (
            <Link key={e.id} href="/calendar" className="flex items-start gap-2 hover:opacity-80 transition-opacity">
              <div className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.color ?? '#6366f1' }} />
              <div>
                <p className="text-sm font-medium leading-tight">{e.title}</p>
                <p className="text-xs text-muted-foreground">
                  {e.isAllDay
                    ? new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(e.start)) + ' · All day'
                    : formatEventDate(e.start, tz)}
                </p>
              </div>
            </Link>
          ))
        )}
      </CardContent>

      <EventModal
        open={eventOpen}
        event={null}
        currentUserId=""
        defaultDate={new Date()}
        onClose={() => setEventOpen(false)}
        onSave={async () => { setEventOpen(false); router.refresh() }}
      />
    </Card>
  )
}
