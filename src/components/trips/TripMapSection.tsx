'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Map,
  AdvancedMarker,
  Polyline,
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
  lat?: number
  lng?: number
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
          stops.push({
            location: act.location.trim(),
            title: act.title,
            dayLabel,
            color,
            lat: act.locationLat ?? undefined,
            lng: act.locationLng ?? undefined,
          })
        }
      })
  })
  return stops
}

// ── Places search box (must live inside APIProvider + Map) ───────────────────

function MapSearch() {
  const map = useMap()
  const placesLib = useMapsLibrary('places')
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elementRef = useRef<any>(null)
  const [searchMarker, setSearchMarker] = useState<google.maps.LatLngLiteral | null>(null)
  const [searchName, setSearchName] = useState('')

  useEffect(() => {
    if (!placesLib || !map || !containerRef.current) return
    const mapRef = map

    // PlaceAutocompleteElement — replacement for the deprecated Autocomplete class
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PAE = (google.maps.places as any).PlaceAutocompleteElement
    if (!PAE) return

    const pac = new PAE({ placeholder: 'Search places…' })

    // Strip the element's own visual chrome so our wrapper provides the styling
    pac.style.cssText = 'width:100%;--gmp-mat-color-surface:transparent;' +
      '--gmp-mat-color-outline:transparent;--gmp-mat-color-on-surface:inherit;' +
      '--gmp-mat-color-on-surface-variant:inherit;--gmp-mat-shape-medium:0;' +
      'box-shadow:none;font-size:0.875rem;'

    elementRef.current = pac
    containerRef.current.appendChild(pac)

    async function handleSelect(event: Event) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const place = (event as any).place
      if (!place) return
      await place.fetchFields({ fields: ['location', 'displayName'] })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loc: google.maps.LatLng | null = (place as any).location
      if (!loc) return
      const pos = { lat: loc.lat(), lng: loc.lng() }
      mapRef.panTo(pos)
      mapRef.setZoom(15)
      setSearchMarker(pos)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSearchName((place as any).displayName ?? '')
    }

    pac.addEventListener('gmp-placeselect', handleSelect)

    return () => {
      pac.removeEventListener('gmp-placeselect', handleSelect)
      try { containerRef.current?.removeChild(pac) } catch {}
      elementRef.current = null
    }
  }, [placesLib, map])

  function clear() {
    setSearchMarker(null)
    setSearchName('')
    if (elementRef.current) elementRef.current.value = ''
  }

  return (
    <>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-background rounded-lg shadow-lg border border-border px-3 py-2 w-72">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <div ref={containerRef} className="flex-1 min-w-0 overflow-hidden" />
        {searchMarker && (
          <button onClick={clear} className="text-muted-foreground hover:text-foreground shrink-0">
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

// ── Nominatim geocoder (free, no billing required) ───────────────────────────

async function nominatimGeocode(address: string): Promise<google.maps.LatLngLiteral | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'HomeBase-Travel-App/1.0' } }
    )
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
  } catch {}
  return null
}

// ── Inner map (must live inside APIProvider) ─────────────────────────────────

function TripMapInner({
  destination,
  stops,
}: {
  destination: string
  stops: RouteStop[]
}) {
  const map = useMap('trip-route-map')
  const [markers, setMarkers] = useState<MarkerData[]>([])
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[]>([])
  const [geoStatus, setGeoStatus] = useState<string>('locating stops…')
  // Track whether we've already fitted the map to the resolved bounds
  const fittedRef = useRef(false)

  // Geocoding runs independently of the map instance so map re-initialisation
  // doesn't cancel mid-loop.
  useEffect(() => {
    let cancelled = false
    fittedRef.current = false

    async function run() {
      const targets = stops.length > 0 ? stops : null

      if (!targets) {
        setGeoStatus('no stops with locations')
        return
      }

      setGeoStatus(`locating ${targets.length} stop(s)…`)

      // Use stored coordinates when available; fall back to Nominatim (1 s gap per policy)
      const resolved: { position: google.maps.LatLngLiteral; stop: RouteStop }[] = []
      let lastWasNetworkCall = false
      for (let i = 0; i < targets.length; i++) {
        if (cancelled) return

        if (targets[i].lat !== undefined && targets[i].lng !== undefined) {
          resolved.push({ position: { lat: targets[i].lat!, lng: targets[i].lng! }, stop: targets[i] })
          lastWasNetworkCall = false
          continue
        }

        if (lastWasNetworkCall) await new Promise(r => setTimeout(r, 1100))
        if (cancelled) return
        const pos = await nominatimGeocode(targets[i].location)
        lastWasNetworkCall = true
        if (pos) resolved.push({ position: pos, stop: targets[i] })
      }

      if (cancelled) return

      setGeoStatus(`${resolved.length}/${targets.length} located`)
      setMarkers(resolved.map((r, i) => ({ position: r.position, stop: r.stop, index: i })))
      setRoutePath(resolved.map(r => r.position))
    }

    run()
    return () => { cancelled = true }
  }, [stops])

  // Fit the map once markers are resolved and the map instance is available.
  useEffect(() => {
    if (!map || fittedRef.current) return

    if (routePath.length === 0 && markers.length === 0) {
      // No stops resolved — centre on destination
      nominatimGeocode(destination).then(pos => {
        if (pos) { map.setCenter(pos); map.setZoom(9) }
      })
      return
    }

    if (routePath.length >= 2) {
      const bounds = routePath.reduce(
        (b, p) => ({
          north: Math.max(b.north, p.lat),
          south: Math.min(b.south, p.lat),
          east: Math.max(b.east, p.lng),
          west: Math.min(b.west, p.lng),
        }),
        { north: -90, south: 90, east: -180, west: 180 }
      )
      map.fitBounds(bounds, 48)
      fittedRef.current = true
    } else if (routePath.length === 1) {
      map.setCenter(routePath[0])
      map.setZoom(9)
      fittedRef.current = true
    }
  }, [map, routePath, markers, destination])

  return (
    <>
      {/* Map panel */}
      <div className="flex-1 relative min-h-[300px]">
        <Map
          id="trip-route-map"
          defaultCenter={{ lat: 15, lng: 101 }}
          defaultZoom={5}
          mapId="DEMO_MAP_ID"
          style={{ width: '100%', height: '100%' }}
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          <MapSearch />
          {routePath.length >= 2 && (
            <Polyline
              path={routePath}
              strokeColor="#6366f1"
              strokeWeight={5}
              strokeOpacity={0.8}
              geodesic={true}
            />
          )}
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
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Route · {stops.length} stop{stops.length !== 1 ? 's' : ''}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mb-3">{geoStatus}</p>

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
                const marker = markers.find(m => m.stop === stop)
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

  // Stable reference — prevents the geocoding effect from cancelling itself on every parent render
  const stops = useMemo(
    () => buildStops(departureLocation, days),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [departureLocation, JSON.stringify(days)]
  )

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

  return (
    <div className="flex flex-col md:flex-row h-full">
      <TripMapInner destination={destination} stops={stops} />
    </div>
  )
}
