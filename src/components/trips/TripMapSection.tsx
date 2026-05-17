'use client'

import { useEffect, useRef, useState } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps'
import { MapPin, Search, X } from 'lucide-react'
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

// ── Places search box (must live inside APIProvider + Map) ───────────────────

function MapSearch() {
  const map = useMap()
  const placesLib = useMapsLibrary('places')
  const inputRef = useRef<HTMLInputElement>(null)
  const [searchMarker, setSearchMarker] = useState<google.maps.LatLngLiteral | null>(null)
  const [searchName, setSearchName] = useState('')

  useEffect(() => {
    if (!placesLib || !map || !inputRef.current) return

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ['geometry', 'name'],
    })

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (!place.geometry?.location) return
      const pos = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() }
      map.panTo(pos)
      map.setZoom(15)
      setSearchMarker(pos)
      setSearchName(place.name ?? '')
    })

    return () => google.maps.event.removeListener(listener)
  }, [placesLib, map])

  function clear() {
    if (inputRef.current) inputRef.current.value = ''
    setSearchMarker(null)
    setSearchName('')
  }

  return (
    <>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-background rounded-lg shadow-lg border border-border px-3 py-2 w-72">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search places…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {searchMarker && (
          <button onClick={clear} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {searchMarker && (
        <AdvancedMarker position={searchMarker} title={searchName}>
          <div className="flex flex-col items-center">
            <div className="bg-rose-500 text-white text-xs font-semibold px-2 py-1 rounded shadow-lg border border-white whitespace-nowrap max-w-[160px] truncate">
              {searchName}
            </div>
            <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-rose-500" />
          </div>
        </AdvancedMarker>
      )}
    </>
  )
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
  const geocodingLib = useMapsLibrary('geocoding')
  const [markers, setMarkers] = useState<MarkerData[]>([])
  const polylineRef = useRef<google.maps.Polyline | null>(null)

  useEffect(() => {
    if (!geocodingLib || !map) return

    let cancelled = false
    const geocoder = new geocodingLib.Geocoder()

    if (stops.length === 0) {
      geocoder.geocode({ address: destination }, (results, status) => {
        if (cancelled) return
        if (status === 'OK' && results?.[0]) {
          map.setCenter(results[0].geometry.location)
          map.setZoom(9)
        }
      })
      return () => { cancelled = true }
    }

    Promise.all(
      stops.map(stop =>
        new Promise<{ position: google.maps.LatLngLiteral; stop: RouteStop } | null>(resolve => {
          geocoder.geocode({ address: stop.location }, (results, status) => {
            if (status === 'OK' && results?.[0]) {
              const loc = results[0].geometry.location
              resolve({ position: { lat: loc.lat(), lng: loc.lng() }, stop })
            } else {
              resolve(null)
            }
          })
        })
      )
    ).then(results => {
      if (cancelled) return
      const resolved = results.filter((r): r is NonNullable<typeof r> => r !== null)

      setMarkers(resolved.map((r, i) => ({ position: r.position, stop: r.stop, index: i })))

      polylineRef.current?.setMap(null)
      polylineRef.current = null

      if (resolved.length >= 2) {
        const path = resolved.map(r => r.position)
        polylineRef.current = new google.maps.Polyline({
          path,
          map,
          strokeColor: '#6366f1',
          strokeWeight: 5,
          strokeOpacity: 0.8,
          geodesic: true,
        })
        const bounds = new google.maps.LatLngBounds()
        path.forEach(p => bounds.extend(p))
        map.fitBounds(bounds, 48)
      } else if (resolved.length === 1) {
        map.setCenter(resolved[0].position)
        map.setZoom(9)
      }
    })

    return () => {
      cancelled = true
      polylineRef.current?.setMap(null)
      polylineRef.current = null
    }
  }, [geocodingLib, map, stops, destination])

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
          <MapSearch />
          {markers.map((m) => (
            <AdvancedMarker
              key={m.index}
              position={m.position}
              title={m.stop.title}
              onClick={() => {
                map?.panTo(m.position)
                map?.setZoom(13)
              }}
            >
              <div
                style={{ backgroundColor: m.stop.color }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white cursor-pointer"
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
              {stops.map((stop, i) => {
                const marker = markers[i]
                return (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 cursor-pointer rounded-md p-1 -m-1 hover:bg-muted/50 transition-colors"
                    onClick={() => {
                      if (marker) {
                        map?.panTo(marker.position)
                        map?.setZoom(13)
                      }
                    }}
                  >
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
                )
              })}
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
