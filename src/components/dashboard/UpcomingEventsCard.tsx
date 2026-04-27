import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from 'lucide-react'
import { format } from 'date-fns'
import type { UpcomingEvent } from '@/types'
import Link from 'next/link'

/**
 * Compare a UTC date to "today" in the given timezone.
 * Returns 'today', 'tomorrow', or a formatted date string.
 */
function formatEventDate(iso: string, timezone: string): string {
  const d = new Date(iso)
  // Get the date parts in the target timezone
  const eventDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d)
  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
  // Compute tomorrow's date string
  const todayParts = todayStr.split('-').map(Number)
  const tomorrow = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2] + 1))
  const tomorrowStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(tomorrow)

  if (eventDateStr === todayStr) {
    return `Today ${format(d, 'h:mm a')}`
  }
  if (eventDateStr === tomorrowStr) {
    return `Tomorrow ${format(d, 'h:mm a')}`
  }
  return format(d, 'EEE d MMM h:mm a')
}

export function UpcomingEventsCard({ events, timezone }: { events: UpcomingEvent[]; timezone?: string }) {
  const tz = timezone ?? 'UTC'
  return (
    <Link href="/calendar" className="block h-full">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <Calendar className="h-4 w-4" /> Upcoming
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 space-y-2 min-h-0">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events</p>
          ) : (
            events.map(e => (
              <div key={e.id} className="flex items-start gap-2">
                <div className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.color ?? '#6366f1' }} />
                <div>
                  <p className="text-sm font-medium leading-tight">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.isAllDay ? format(new Date(e.start), 'EEE d MMM') + ' · All day' : formatEventDate(e.start, tz)}
                  </p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
