'use client'

import Link from 'next/link'
import { Plane, MapPin, Calendar, Package, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TripSummaryShape {
  id: string
  title: string
  destination: string
  startDate: string
  endDate: string
  status: string
  color: string | null
  icon: string | null
  packingList: { pendingItems: number } | null
}

export function UpcomingTripsCard({ trips }: { trips: TripSummaryShape[] }) {
  const now = new Date()

  const upcoming = trips
    .filter((t) => {
      if (t.status === 'cancelled' || t.status === 'completed') return false
      return new Date(t.endDate) >= now
    })
    .slice(0, 5)

  function daysUntil(date: string): string {
    const d = new Date(date)
    const diff = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return `${Math.abs(diff)}d ago`
    if (diff === 0) return 'Today!'
    if (diff === 1) return 'Tomorrow'
    return `${diff}d`
  }

  function formatShortDate(date: string): string {
    return new Date(date).toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
          <Plane className="h-4 w-4" />
          Upcoming Trips
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 min-h-0">
        {upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-6">
            <Plane className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">No upcoming trips</p>
            <Link href="/trips" className="text-xs text-primary hover:underline mt-1">
              Plan a trip
            </Link>
          </div>
        ) : (
          upcoming.map((trip) => (
            <Link
              key={trip.id}
              href={`/trips/${trip.id}`}
              className="flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors group"
            >
              <div className="shrink-0 mt-0.5">
                <Plane className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{trip.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {daysUntil(trip.startDate)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate">{trip.destination}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatShortDate(trip.startDate)}
                  </span>
                  {trip.packingList && trip.packingList.pendingItems > 0 && (
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {trip.packingList.pendingItems} to pack
                    </span>
                  )}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
            </Link>
          ))
        )}

        {trips.length > 5 && (
          <Link
            href="/trips"
            className="block text-center text-xs text-primary hover:underline pt-1"
          >
            View all {trips.length} trips
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
