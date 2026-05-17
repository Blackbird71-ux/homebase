'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plane, Plus, MapPin, Calendar, Package, CheckCircle2, Clock, AlertTriangle, Tag } from 'lucide-react'
import type { TripSummary } from '@/types'
import { TripTagsManager } from '@/components/trips/TripTagsManager'

interface TripsClientProps {
  initialTrips: TripSummary[]
  currentUserId: string
}

export function TripsClient({ initialTrips }: TripsClientProps) {
  const router = useRouter()
  const [trips, setTrips] = useState<TripSummary[]>(initialTrips)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)

  // ── Status helpers ─────────────────────────────────────────────────

  const now = new Date()

  function getTripStatus(trip: TripSummary): { label: string; color: string; icon: React.ReactNode } {
    const start = new Date(trip.startDate)
    const end   = new Date(trip.endDate)

    if (trip.status === 'cancelled') {
      return { label: 'Cancelled', color: 'text-muted-foreground line-through', icon: <AlertTriangle className="h-3.5 w-3.5" /> }
    }
    if (trip.status === 'completed') {
      return { label: 'Completed', color: 'text-green-500', icon: <CheckCircle2 className="h-3.5 w-3.5" /> }
    }
    if (now >= start && now <= end) {
      return { label: 'In Progress', color: 'text-blue-500', icon: <Clock className="h-3.5 w-3.5" /> }
    }
    if (now < start) {
      return { label: 'Upcoming', color: 'text-amber-500', icon: <Calendar className="h-3.5 w-3.5" /> }
    }
    return { label: trip.status ?? 'Planning', color: 'text-muted-foreground', icon: <Plane className="h-3.5 w-3.5" /> }
  }

  function formatDateRange(start: string, end: string): string {
    const s = new Date(start)
    const e = new Date(end)
    const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
    if (s.toDateString() === e.toDateString()) return s.toLocaleDateString('en-AU', opts)
    return `${s.toLocaleDateString('en-AU', opts)} – ${e.toLocaleDateString('en-AU', opts)}`
  }

  function daysUntil(date: string): string {
    const d    = new Date(date)
    const diff = Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0)  return `${Math.abs(diff)} day(s) ago`
    if (diff === 0) return 'Today!'
    if (diff === 1) return 'Tomorrow'
    return `${diff} day(s) away`
  }

  // ── Actions ────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm('Delete this trip?')) return
    const res = await fetch(`/api/trips/${id}`, { method: 'DELETE' })
    if (res.ok) setTrips((prev) => prev.filter((t) => t.id !== id))
  }

  const handleCreated = useCallback((trip: TripSummary) => {
    setTrips((prev) => [...prev, trip].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()))
    setShowCreateDialog(false)
    router.refresh()
  }, [router])

  // ── Group trips ────────────────────────────────────────────────────

  const activeTrips = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
  const pastTrips   = trips.filter((t) => t.status === 'completed' || t.status === 'cancelled')

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 md:p-6 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Plane className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Trips</h1>
            <p className="text-sm text-muted-foreground">
              {activeTrips.length} active trip{activeTrips.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTagManager(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium border border-input hover:bg-accent transition-colors text-muted-foreground"
          >
            <Tag className="h-4 w-4" />
            <span className="hidden sm:inline">Tags</span>
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Trip
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8">
        {activeTrips.length === 0 && pastTrips.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Plane className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">No trips yet</p>
            <p className="text-sm">Plan your next adventure!</p>
          </div>
        )}

        {activeTrips.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Upcoming & Active
            </h2>
            <div className="grid gap-4">
              {activeTrips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  getTripStatus={getTripStatus}
                  formatDateRange={formatDateRange}
                  daysUntil={daysUntil}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </section>
        )}

        {pastTrips.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Past Trips
            </h2>
            <div className="grid gap-3">
              {pastTrips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  getTripStatus={getTripStatus}
                  formatDateRange={formatDateRange}
                  daysUntil={daysUntil}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateTripDialog
          onClose={() => setShowCreateDialog(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Global Tag Manager */}
      <TripTagsManager
        open={showTagManager}
        onClose={() => setShowTagManager(false)}
      />
    </div>
  )
}

// ── Trip Card ──────────────────────────────────────────────────────────────

function TripCard({
  trip,
  getTripStatus,
  formatDateRange,
  daysUntil,
  onDelete,
}: {
  trip: TripSummary
  getTripStatus: (t: TripSummary) => { label: string; color: string; icon: React.ReactNode }
  formatDateRange: (s: string, e: string) => string
  daysUntil: (d: string) => string
  onDelete: (id: string) => void
}) {
  const statusInfo = getTripStatus(trip)
  const isPast     = trip.status === 'completed' || trip.status === 'cancelled'

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="block rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`font-semibold truncate ${isPast ? 'text-muted-foreground' : ''}`}>
                {trip.icon ? (
                  <span className="mr-1.5">{trip.icon}</span>
                ) : (
                  <Plane className="h-4 w-4 inline mr-1.5 text-muted-foreground" />
                )}
                {trip.title}
              </h3>
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${statusInfo.color}`}>
                {statusInfo.icon}
                {statusInfo.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{trip.destination}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
              {!isPast && (
                <span className="text-xs text-muted-foreground/60 ml-1">
                  ({daysUntil(trip.startDate)})
                </span>
              )}
            </div>
          </div>

          {trip.packingList && (
            <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted/50 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              <span>
                {trip.packingList.pendingItems > 0
                  ? `${trip.packingList.pendingItems} item(s) to pack`
                  : 'All packed!'}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Create Trip Dialog ─────────────────────────────────────────────────────

function CreateTripDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (trip: TripSummary) => void
}) {
  const [title, setTitle]                 = useState('')
  const [destination, setDestination]     = useState('')
  const [startDate, setStartDate]         = useState('')
  const [endDate, setEndDate]             = useState('')
  const [accommodation, setAccommodation] = useState('')
  const [transport, setTransport]         = useState('')
  const [notes, setNotes]                 = useState('')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !destination.trim() || !startDate || !endDate) {
      setError('Title, destination, and dates are required')
      return
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError('End date must be after start date')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          destination: destination.trim(),
          startDate,
          endDate,
          accommodation: accommodation.trim() || null,
          transport: transport.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create trip')
      }
      const trip = await res.json()
      onCreated(trip)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-popover border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-semibold">New Trip</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Japan 2027"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Destination *</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Tokyo, Japan"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Accommodation</label>
              <input
                value={accommodation}
                onChange={(e) => setAccommodation(e.target.value)}
                placeholder="Hotel name / booking ref"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Transport</label>
              <input
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
                placeholder="Flight info / car rental"
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium border border-input hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
