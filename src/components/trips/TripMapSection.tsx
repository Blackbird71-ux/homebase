'use client'

import { useEffect, useState } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'
import { MapPin } from 'lucide-react'
import type { TripDayShape } from '@/types'

// One colour per day (cycles if more than 10 days)
const DAY_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#f43f5e',
]

interface RouteStop {
  location: string
  title: string
  dayLabel: string
  color: string
}

interface MarkerData {
  position: google.maps.LatLngLiteral
  stop: RouteStop
  index: number
}

function buildStops(departureLocation: string | null | undefined, days: TripDayShape[]): RouteStop[] {
  const stops: RouteStop[] = []
  if (departureLocation?.trim()) {
    stops.push({ location: departureLocation.trim(), title: 'Departure', dayLabel: 'Start', color: '#6b7280' })
  }
  days.forEach((day, di) => {
    const color = DAY_COLORS[di % DAY_COLORS.length]
    const dayLabel = day.label ?? `Day ${di + 1}`
    day.activities
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach(act => {
        if (act.location?.trim()) {
          stops.push({ location: act.location.trim(), title: act.title, dayLabel, color })
        }
      })
  })
  return stops
}

// ── Inner map (must live inside APIProvider) ─────────────────────────────────

function TripMapInner({
  destination,
  stops,
}: {
  destination: string
  stops: RouteStop[]
}) {
  const map = useMap()
  const routesLib = useMapsLibrary('routes')
  const geocodingLib = useMapsLibrary('geocoding')
  const [markers, setMarkers] = useState<MarkerData[]>([])

  // Draw directions route when we have 2+ stops
  useEffect(() => {
    if (!routesLib || !map || stops.length < 2) return

    const service = new routesLib.DirectionsService()
    const renderer = new routesLib.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#6366f1', strokeWeight: 5, strokeOpacity: 0.75 },
    })

    const waypoints = stops.slice(1, -1).map(s => ({ location: s.location, stopover: true }))

    service.route(
      {
        origin: stops[0].location,
        destination: stops[stops.length - 1].location,
        waypoints,
        travelMode: routesLib.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== 'OK' || !result) return
        renderer.setDirections(result)
        const bounds = result.routes[0]?.bounds
        if (bounds) map.fitBounds(bounds, 48)

        // Extract actual geocoded positions from the route legs
        const legs = result.routes[0]?.legs ?? []
        const positions: MarkerData[] = legs.map((leg, i) => ({
          position: { lat: leg.start_location.lat(), lng: leg.start_location.lng() },
          stop: stops[i],
          index: i,
        }))
        const last = legs[legs.length - 1]
        if (last) {
          positions.push({
            position: { lat: last.end_location.lat(), lng: last.end_location.lng() },
            stop: stops[stops.length - 1],
            index: stops.length - 1,
          })
        }
        setMarkers(positions)
      },
    )

    return () => renderer.setMap(null)
  }, [routesLib, map, stops])

  // For 0-1 stops: geocode the destination and centre the map
  useEffect(() => {
    if (!geocodingLib || !map || stops.length >= 2) return
    const geocoder = new geocodingLib.Geocoder()
    geocoder.geocode({ address: destination }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        map.setCenter(results[0].geometry.location)
        map.setZoom(9)
      }
    })

    // If exactly 1 stop, geocode it for a marker
    if (stops.length === 1) {
      geocoder.geocode({ address: stops[0].location }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const loc = results[0].geometry.location
          setMarkers([{ position: { lat: loc.lat(), lng: loc.lng() }, stop: stops[0], index: 0 }])
        }
      })
    }
  }, [geocodingLib, map, destination, stops])

  return (
    <>
      {/* Map panel */}
      <div className="flex-1 relative min-h-[300px]">
        <Map
          defaultCenter={{ lat: 15, lng: 101 }}
          defaultZoom={5}
          mapId="DEMO_MAP_ID"
          style={{ width: '100%', height: '100%' }}
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          {markers.map((m) => (
            <AdvancedMarker key={m.index} position={m.position} title={m.stop.title}>
              <div
                style={{ backgroundColor: m.stop.color }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white"
              >
                {m.index + 1}
              </div>
            </AdvancedMarker>
          ))}
        </Map>
      </div>

      {/* Stop list sidebar */}
      <div className="w-full md:w-64 shrink-0 border-t md:border-t-0 md:border-l border-border overflow-y-auto bg-card">
        <div className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Route · {stops.length} stop{stops.length !== 1 ? 's' : ''}
          </p>

          {stops.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <MapPin className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                Add locations to activities in the Itinerary tab to see them on the map.
              </p>
            </div>
          ) : (
            <ol className="space-y-3">
              {stops.map((stop, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    style={{ backgroundColor: stop.color }}
                    className="mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{stop.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{stop.location}</p>
                    <p className="text-xs text-muted-foreground/70">{stop.dayLabel}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

interface TripMapSectionProps {
  destination: string
  departureLocation?: string | null
  days: TripDayShape[]
}

export function TripMapSection({ destination, departureLocation, days }: TripMapSectionProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
        <MapPin className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          Set <code className="text-xs bg-muted px-1 py-0.5 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in your environment to enable maps.
        </p>
      </div>
    )
  }

  const stops = buildStops(departureLocation, days)

  return (
    <APIProvider apiKey={apiKey}>
      <div className="flex flex-col md:flex-row h-full">
        <TripMapInner destination={destination} stops={stops} />
      </div>
    </APIProvider>
  )
}
