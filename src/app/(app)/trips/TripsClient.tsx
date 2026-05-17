'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plane, Plus, MapPin, Calendar, Package, Trash2, Tag,
} from 'lucide-react'
import type { TripSummary } from '@/types'
import { TripTagsManager } from '@/components/trips/TripTagsManager'

// ── Cover palette derived deterministically from trip id ──────────────────────
const COVER_PALETTES = ['ocean', 'sunset', 'forest', 'desert', 'alpine', 'neutral'] as const
function getCoverClass(tripId: string): string {
  const hash = tripId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return `hb-cover--${COVER_PALETTES[hash % COVER_PALETTES.length]}`
}

// ── Status helpers ─────────────────────────────────────────────────────────────
const now = new Date()
type StatusKind = 'upcoming' | 'live' | 'completed' | 'cancelled' | 'planning'

function getTripStatusKind(trip: TripSummary): StatusKind {
  const start = new Date(trip.startDate)
  const end   = new Date(trip.endDate)
  if (trip.status === 'cancelled') return 'cancelled'
  if (trip.status === 'completed') return 'completed'
  if (now >= start && now <= end) return 'live'
  if (now < start) return 'upcoming'
  return 'planning'
}

function getTripStatusLabel(kind: StatusKind): string {
  return { upcoming: 'Upcoming', live: 'In progress', completed: 'Completed', cancelled: 'Cancelled', planning: 'Planning' }[kind]
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
  if (s.toDateString() === e.toDateString()) return s.toLocaleDateString('en-AU', opts)
  return `${s.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('en-AU', opts)}`
}

function countDays(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1
}

function daysUntil(date: string): string {
  const diff = Math.round((new Date(date).getTime() - now.getTime()) / 86400000)
  if (diff < 0)  return `${Math.abs(diff)} d ago`
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return `in ${diff} days`
}

// ── Component ──────────────────────────────────────────────────────────────────

interface TripsClientProps {
  initialTrips: TripSummary[]
  currentUserId: string
}

export function TripsClient({ initialTrips }: TripsClientProps) {
  const router = useRouter()
  const [trips, setTrips] = useState<TripSummary[]>(initialTrips)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showTagManager, setShowTagManager]     = useState(false)

  async function handleDelete(id: string) {
    if (!confirm('Delete this trip?')) return
    const res = await fetch(`/api/trips/${id}`, { method: 'DELETE' })
    if (res.ok) setTrips((prev) => prev.filter((t) => t.id !== id))
  }

  const handleCreated = useCallback((trip: TripSummary) => {
    setTrips((prev) =>
      [...prev, trip].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    )
    setShowCreateDialog(false)
    router.refresh()
  }, [router])

  const activeTrips = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
  const pastTrips   = trips.filter((t) => t.status === 'completed' || t.status === 'cancelled')

  return (
    <div className="hb-trips flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="hb-page__header">
        <div>
          <h1 className="hb-page__title hb-display">Trips</h1>
          <p className="hb-page__subtitle">
            {activeTrips.length} active trip{activeTrips.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowTagManager(true)} className="hb-btn hb-btn--outline hb-btn--sm">
            <Tag size={14} />
            <span className="hidden sm:inline">Tags</span>
          </button>
          <button onClick={() => setShowCreateDialog(true)} className="hb-btn hb-btn--primary">
            <Plus size={16} />
            New Trip
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="hb-page__body space-y-8">
        {activeTrips.length === 0 && pastTrips.length === 0 && (
          <div className="hb-empty">
            <div className="hb-empty__icon"><Plane size={24} /></div>
            <p className="hb-empty__title">No trips yet</p>
            <p className="hb-empty__hint">Plan your next adventure!</p>
            <button className="hb-btn hb-btn--primary" onClick={() => setShowCreateDialog(true)}>
              <Plus size={16} /> New Trip
            </button>
          </div>
        )}

        {activeTrips.length > 0 && (
          <section>
            <div className="hb-section-head">
              <h2 className="hb-section-head__title">Upcoming &amp; Active</h2>
              <span className="hb-section-head__count">{activeTrips.length}</span>
            </div>
            <div className="hb-trips-grid">
              {activeTrips.map((trip) => (
                <HeroTripCard key={trip.id} trip={trip} onDelete={handleDelete} />
              ))}
            </div>
          </section>
        )}

        {pastTrips.length > 0 && (
          <section>
            <div className="hb-section-head">
              <h2 className="hb-section-head__title">Past Trips</h2>
              <span className="hb-section-head__count">{pastTrips.length}</span>
            </div>
            <div className="hb-trips-grid">
              {pastTrips.map((trip) => (
                <HeroTripCard key={trip.id} trip={trip} onDelete={handleDelete} />
              ))}
            </div>
          </section>
        )}
      </div>

      {showCreateDialog && (
        <CreateTripDialog onClose={() => setShowCreateDialog(false)} onCreated={handleCreated} />
      )}

      <TripTagsManager open={showTagManager} onClose={() => setShowTagManager(false)} />
    </div>
  )
}

// ── Hero Trip Card ─────────────────────────────────────────────────────────────

function HeroTripCard({ trip, onDelete }: { trip: TripSummary; onDelete: (id: string) => void }) {
  const kind  = getTripStatusKind(trip)
  const label = getTripStatusLabel(kind)
  const isPast = kind === 'completed' || kind === 'cancelled'
  const days = countDays(trip.startDate, trip.endDate)

  return (
    <article className="hb-trip-card" style={{ position: 'relative' }}>
      {/* Delete button in cover — appears on card hover */}
      <button
        className="hb-trip-card__menu"
        title="Delete trip"
        aria-label="Delete trip"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(trip.id) }}
      >
        <Trash2 size={14} />
      </button>

      <Link href={`/trips/${trip.id}`} style={{ display: 'contents', textDecoration: 'none', color: 'inherit' }}>
        {/* Cover */}
        <div className={`hb-trip-card__cover ${getCoverClass(trip.id)}`}>
          <div className="hb-trip-card__cover-meta">
            {trip.icon && (
              <span className="hb-trip-card__icon-tile" aria-hidden="true">{trip.icon}</span>
            )}
            <div className="hb-trip-card__cover-text">
              <p className="hb-trip-card__cover-destination">{trip.destination}</p>
              <h3 className="hb-trip-card__cover-title">{trip.title}</h3>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="hb-trip-card__body">
          <div className="hb-trip-card__row">
            <Calendar size={14} aria-hidden="true" />
            <span>
              <b>{formatDateRange(trip.startDate, trip.endDate)}</b>
              {' · '}{days} day{days !== 1 ? 's' : ''}
            </span>
          </div>
          {trip.accommodation && (
            <div className="hb-trip-card__row">
              <MapPin size={14} aria-hidden="true" />
              <span className="hb-trip-card__ellipsis">{trip.accommodation}</span>
            </div>
          )}

          <div className="hb-trip-card__footer">
            <div className="hb-trip-card__chips hb-trip-card__chips--left">
              <span className={`hb-status hb-status--${kind}`}>{label}</span>
              {!isPast && (
                <span className="hb-chip">{daysUntil(trip.startDate)}</span>
              )}
            </div>
            {trip.packingList && (
              <div className="hb-trip-card__chips hb-trip-card__chips--right">
                <span className="hb-chip hb-chip--ghost">
                  <Package size={10} />
                  {trip.packingList.pendingItems > 0
                    ? `${trip.packingList.pendingItems} to pack`
                    : 'All packed'}
                </span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </article>
  )
}

// ── Create Trip Dialog ─────────────────────────────────────────────────────────

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
      <div className="bg-popover border border-border rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-semibold">New Trip</h2>
          <button
            onClick={onClose}
            className="hb-drawer__close"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          {/* Title */}
          <div className="hb-field">
            <label className="hb-field__label">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Japan 2027"
              className="hb-input"
              required
            />
          </div>

          {/* Destination */}
          <div className="hb-field">
            <label className="hb-field__label">Destination *</label>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Tokyo, Japan"
              className="hb-input"
              required
            />
          </div>

          {/* Dates */}
          <div className="hb-row">
            <div className="hb-field">
              <label className="hb-field__label">Start Date *</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="hb-input" required />
            </div>
            <div className="hb-field">
              <label className="hb-field__label">End Date *</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="hb-input" required />
            </div>
          </div>

          {/* Accommodation & Transport */}
          <div className="hb-row">
            <div className="hb-field">
              <label className="hb-field__label">Accommodation</label>
              <input
                value={accommodation}
                onChange={(e) => setAccommodation(e.target.value)}
                placeholder="Hotel / booking ref"
                className="hb-input"
              />
            </div>
            <div className="hb-field">
              <label className="hb-field__label">Transport</label>
              <input
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
                placeholder="Flight / car rental"
                className="hb-input"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="hb-field">
            <label className="hb-field__label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes…"
              rows={3}
              className="hb-textarea"
            />
          </div>

          <div className="hb-drawer__foot" style={{ margin: '0 -20px -20px', borderRadius: '0 0 16px 16px' }}>
            <button type="button" onClick={onClose} className="hb-btn hb-btn--outline">Cancel</button>
            <button type="submit" disabled={saving} className="hb-btn hb-btn--primary" style={{ opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Trip'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
