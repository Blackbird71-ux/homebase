'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatInTz } from '@/lib/timezone'
import type { FamilyMemberLocation } from '@/lib/location'

export interface MapMember extends Omit<FamilyMemberLocation, 'updatedAt'> {
  updatedAt: string
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'
}

function pinIcon(name: string): L.DivIcon {
  return L.divIcon({
    className: 'hb-map-pin',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;background:var(--primary,#2563eb);color:#fff;font-size:12px;font-weight:600;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${initials(name)}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })
}

// Fit the map to all member pins whenever the set changes.
function FitBounds({ members }: { members: MapMember[] }) {
  const map = useMap()
  useEffect(() => {
    if (members.length === 0) return
    if (members.length === 1) {
      map.setView([members[0].lat, members[0].lng], 14)
      return
    }
    const bounds = L.latLngBounds(members.map((m) => [m.lat, m.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 })
  }, [members, map])
  return null
}

export default function FamilyMap({ members, timezone }: { members: MapMember[]; timezone: string }) {
  const center: [number, number] = members.length
    ? [members[0].lat, members[0].lng]
    : [-33.8688, 151.2093] // Sydney fallback when nobody is sharing yet

  return (
    <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds members={members} />
      {members.map((m) => (
        <Marker key={m.userId} position={[m.lat, m.lng]} icon={pinIcon(m.name)}>
          <Popup>
            <div className="text-sm">
              <p className="font-medium">{m.name}</p>
              <p className="text-muted-foreground">
                Last seen {formatInTz(new Date(m.updatedAt), timezone, {
                  weekday: 'short', day: 'numeric', month: 'short',
                  hour: 'numeric', minute: '2-digit',
                })}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
