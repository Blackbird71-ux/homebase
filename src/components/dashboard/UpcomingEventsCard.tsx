import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from 'lucide-react'
import { format, isToday, isTomorrow } from 'date-fns'
import type { UpcomingEvent } from '@/types'
import Link from 'next/link'

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  if (isToday(d)) return `Today ${format(d, 'h:mm a')}`
  if (isTomorrow(d)) return `Tomorrow ${format(d, 'h:mm a')}`
  return format(d, 'EEE d MMM h:mm a')
}

export function UpcomingEventsCard({ events }: { events: UpcomingEvent[] }) {
  return (
    <Link href="/calendar" className="block h-full">
      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
            <Calendar className="h-4 w-4" /> Upcoming
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events</p>
          ) : (
            events.map(e => (
              <div key={e.id} className="flex items-start gap-2">
                <div className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.color ?? '#6366f1' }} />
                <div>
                  <p className="text-sm font-medium leading-tight">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.isAllDay ? format(new Date(e.start), 'EEE d MMM') + ' · All day' : formatEventDate(e.start)}
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
