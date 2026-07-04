'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MapPin, Calendar, ArrowLeft, Pencil, Trash2,
  CheckCircle2, Clock, AlertTriangle,
  Hotel, Car, StickyNote, CalendarDays, Package,
  Cloud, Wallet, Map, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Route,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TripDetail, TripDayShape, TripPackingEntryShape } from '@/types'
import { PillNav } from '@/components/shared/PillNav'
import { ItinerarySection } from '@/components/trips/ItinerarySection'
import { TripBudgetSection } from '@/components/trips/TripBudgetSection'
import { TripWeatherSection } from '@/components/trips/TripWeatherSection'
import { TripAttachmentsSection } from '@/components/trips/TripAttachmentsSection'
import { TripPackingSection } from '@/components/trips/TripPackingSection'
import { TripMapSection } from '@/components/trips/TripMapSection'
import { APIProvider } from '@vis.gl/react-google-maps'

// Mobile-only tabs (desktop shows split pane)
type TripTab = 'overview' | 'itinerary' | 'packing' | 'weather' | 'budget' | 'maps'

const TABS: { id: TripTab; label: string; icon: LucideIcon }[] = [
  { id: 'overview',  label: 'Overview',  icon: LayoutDashboard },
  { id: 'itinerary', label: 'Itinerary', icon: CalendarDays },
  { id: 'packing',   label: 'Packing',   icon: Package },
  { id: 'weather',   label: 'Weather',   icon: Cloud },
  { id: 'budget',    label: 'Budget',    icon: Wallet },
  { id: 'maps',      label: 'Maps',      icon: Map },
]

interface TripDetailClientProps {
  trip: TripDetail
  currentUserId: string
}

export function TripDetailClient({ trip: initialTrip, currentUserId }: TripDetailClientProps) {
  const router = useRouter()
  const [trip, setTrip] = useState<TripDetail>(initialTrip)
  const [isEditing, setIsEditing] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [days, setDays] = useState<TripDayShape[]>(initialTrip.days ?? [])
  const [packingEntries, setPackingEntries] = useState<TripPackingEntryShape[]>(initialTrip.packingEntries ?? [])
  const [activeTab, setActiveTab] = useState<TripTab>('overview')
  const [rightView, setRightView] = useState<'itinerary' | 'map'>('itinerary')
  const [leftPaneOpen, setLeftPaneOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('trip-left-pane') !== 'closed'
  })

  useEffect(() => {
    localStorage.setItem('trip-left-pane', leftPaneOpen ? 'open' : 'closed')
  }, [leftPaneOpen])

  const now   = new Date()
  const start = new Date(trip.startDate)
  const end   = new Date(trip.endDate)

  function getStatusInfo() {
    if (trip.status === 'cancelled') return { label: 'Cancelled', color: 'text-muted-foreground', icon: AlertTriangle }
    if (trip.status === 'completed') return { label: 'Completed', color: 'text-green-500', icon: CheckCircle2 }
    if (now >= start && now <= end) return { label: 'In Progress', color: 'text-blue-500', icon: Clock }
    return { label: 'Upcoming', color: 'text-amber-500', icon: Calendar }
  }

  const statusInfo = getStatusInfo()
  const StatusIcon = statusInfo.icon

  function formatDate(dateStr: string): string {
    // Trip dates are stored as UTC midnight of the calendar date; display in UTC.
    return new Date(dateStr).toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    })
  }

  function formatDateRange(): string {
    const s = new Date(trip.startDate)
    const e = new Date(trip.endDate)
    if (s.toDateString() === e.toDateString()) return formatDate(trip.startDate)
    return `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/trips')
    } else {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

  return (
    <APIProvider apiKey={mapsApiKey}>
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header — shared across mobile and desktop */}
      <div className="border-b border-border shrink-0">
        <div className="flex items-center justify-between p-4 md:px-6 md:py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/trips" className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="text-xl font-semibold truncate"
                  onDoubleClick={() => setIsEditing(true)}
                  title="Double-click to edit"
                  style={{ cursor: 'text' }}
                >{trip.title}</h1>
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.color} bg-muted shrink-0`}>
                  <StatusIcon className="h-3 w-3" />
                  {statusInfo.label}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5 flex-wrap">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {trip.destination}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDateRange()}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setLeftPaneOpen(v => !v)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-input hover:bg-accent transition-colors text-muted-foreground"
              title={leftPaneOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {leftPaneOpen
                ? <PanelLeftClose className="h-4 w-4" />
                : <PanelLeftOpen  className="h-4 w-4" />
              }
            </button>
            {/* Itinerary / Map toggle — desktop only */}
            <div className="hidden md:flex items-center rounded-md border border-input overflow-hidden">
              <button
                onClick={() => setRightView('itinerary')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
                  rightView === 'itinerary' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
                )}
              >
                <CalendarDays className="h-4 w-4" />
                <span className="hidden lg:inline">Itinerary</span>
              </button>
              <button
                onClick={() => setRightView('map')}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-input',
                  rightView === 'map' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50',
                )}
              >
                <Route className="h-4 w-4" />
                <span className="hidden lg:inline">Map</span>
              </button>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-input hover:bg-accent transition-colors"
            >
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── DESKTOP: two-pane split layout ── */}
      <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
        {/* Left pane — overview info, collapsible */}
        <div className={cn(
          'shrink-0 border-r border-border flex flex-col overflow-hidden transition-all duration-200',
          leftPaneOpen ? 'w-72 lg:w-80' : 'w-0 border-r-0',
        )}>
          <div className="overflow-y-auto flex-1 p-5 space-y-5">

            {/* Quick info cards */}
            {trip.accommodation && (
              <div className="p-3 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  <Hotel className="h-3.5 w-3.5" /> Accommodation
                </div>
                <p className="text-sm">{trip.accommodation}</p>
              </div>
            )}
            {trip.transport && (
              <div className="p-3 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  <Car className="h-3.5 w-3.5" /> Transport
                </div>
                <p className="text-sm">{trip.transport}</p>
              </div>
            )}
            {trip.notes && (
              <div className="p-3 rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  <StickyNote className="h-3.5 w-3.5" /> Notes
                </div>
                <p className="text-sm whitespace-pre-wrap">{trip.notes}</p>
              </div>
            )}

            {/* Additional tabs as sections below overview */}
            <div className="border-t border-border pt-4 space-y-4">
              {/* Packing */}
              <details className="group" open>
                <summary className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none list-none py-1">
                  <Package className="h-3.5 w-3.5" /> Packing
                  <svg className="h-3.5 w-3.5 ml-auto transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </summary>
                <div className="mt-3">
                  <TripPackingSection
                    tripId={trip.id}
                    entries={packingEntries}
                    currentUserId={currentUserId}
                    onEntriesUpdated={setPackingEntries}
                  />
                </div>
              </details>

              {/* Weather */}
              <details className="group border-t border-border pt-4">
                <summary className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none list-none py-1">
                  <Cloud className="h-3.5 w-3.5" /> Weather
                  <svg className="h-3.5 w-3.5 ml-auto transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </summary>
                <div className="mt-3">
                  <TripWeatherSection
                    destination={trip.destination}
                    startDate={trip.startDate}
                    endDate={trip.endDate}
                    startLocation={trip.departureLocation}
                  />
                </div>
              </details>

              {/* Budget */}
              <details className="group border-t border-border pt-4">
                <summary className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none list-none py-1">
                  <Wallet className="h-3.5 w-3.5" /> Budget
                  <svg className="h-3.5 w-3.5 ml-auto transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </summary>
                <div className="mt-3">
                  <TripBudgetSection
                    tripId={trip.id}
                    estimatedBudget={trip.estimatedBudget ?? null}
                    actualCost={trip.actualCost ?? null}
                    budgetBreakdown={trip.budgetBreakdown ?? null}
                    onBudgetUpdated={(estimatedBudget, actualCost, budgetBreakdown) => {
                      setTrip((prev) => ({ ...prev, estimatedBudget, actualCost, budgetBreakdown }))
                    }}
                  />
                </div>
              </details>

              {/* Documents */}
              <details className="group border-t border-border pt-4">
                <summary className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none list-none py-1">
                  <Map className="h-3.5 w-3.5" /> Documents
                  <svg className="h-3.5 w-3.5 ml-auto transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </summary>
                <div className="mt-3">
                  <TripAttachmentsSection tripId={trip.id} label="" />
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* Right pane — itinerary or map */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {rightView === 'itinerary' ? (
            <ItinerarySection
              days={days}
              tripId={trip.id}
              startDate={trip.startDate}
              endDate={trip.endDate}
              onDaysUpdated={setDays}
            />
          ) : (
            <TripMapSection
              destination={trip.destination}
              departureLocation={trip.departureLocation}
              days={days}
            />
          )}
        </div>
      </div>

      {/* ── MOBILE: pill nav + tab content ── */}
      <div className="flex md:hidden flex-col flex-1 min-h-0 overflow-hidden">
        {/* Pill nav bar */}
        <div className="border-b border-border shrink-0 px-4 py-2.5 overflow-x-auto">
          <PillNav
            items={TABS}
            active={activeTab}
            onChange={(id) => setActiveTab(id as TripTab)}
            size="sm"
          />
        </div>

        {/* Tab content */}
        <div className={cn(
          'flex-1 min-h-0',
          activeTab === 'maps' || activeTab === 'itinerary' ? 'overflow-hidden' : 'overflow-y-auto p-4',
        )}>

          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{formatDateRange()}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {trip.accommodation && (
                  <div className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                      <Hotel className="h-4 w-4" /> Accommodation
                    </div>
                    <p className="text-sm">{trip.accommodation}</p>
                  </div>
                )}
                {trip.transport && (
                  <div className="p-3 rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                      <Car className="h-4 w-4" /> Transport
                    </div>
                    <p className="text-sm">{trip.transport}</p>
                  </div>
                )}
              </div>
              {trip.notes && (
                <div className="p-3 rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                    <StickyNote className="h-4 w-4" /> Notes
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{trip.notes}</p>
                </div>
              )}
              <TripAttachmentsSection tripId={trip.id} label="Trip Documents" />
            </div>
          )}

          {/* Itinerary */}
          {activeTab === 'itinerary' && (
            <ItinerarySection
              days={days}
              tripId={trip.id}
              startDate={trip.startDate}
              endDate={trip.endDate}
              onDaysUpdated={setDays}
            />
          )}

          {/* Packing */}
          {activeTab === 'packing' && (
            <TripPackingSection
              tripId={trip.id}
              entries={packingEntries}
              currentUserId={currentUserId}
              onEntriesUpdated={setPackingEntries}
            />
          )}

          {/* Weather */}
          {activeTab === 'weather' && (
            <TripWeatherSection
              destination={trip.destination}
              startDate={trip.startDate}
              endDate={trip.endDate}
              startLocation={trip.departureLocation}
            />
          )}

          {/* Budget */}
          {activeTab === 'budget' && (
            <TripBudgetSection
              tripId={trip.id}
              estimatedBudget={trip.estimatedBudget ?? null}
              actualCost={trip.actualCost ?? null}
              budgetBreakdown={trip.budgetBreakdown ?? null}
              onBudgetUpdated={(estimatedBudget, actualCost, budgetBreakdown) => {
                setTrip((prev) => ({ ...prev, estimatedBudget, actualCost, budgetBreakdown }))
              }}
            />
          )}

          {/* Maps */}
          {activeTab === 'maps' && (
            <TripMapSection
              destination={trip.destination}
              departureLocation={trip.departureLocation}
              days={days}
            />
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <EditTripDialog
        open={isEditing}
        trip={trip}
        onClose={() => setIsEditing(false)}
        onUpdated={(updated) => {
          setTrip(updated)
          setIsEditing(false)
          router.refresh()
        }}
      />

      {/* Delete confirm */}
      <Dialog open={showDeleteConfirm} onOpenChange={(o) => { if (!o) setShowDeleteConfirm(false) }}>
        <DialogContent className="sm:max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>Delete Trip</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &ldquo;{trip.title}&rdquo;? This action cannot be undone.
          </p>
          <DialogFooter showCloseButton>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </APIProvider>
  )
}

// ── Edit Trip Dialog ────────────────────────────────────────────────────────

function EditTripDialog({
  open,
  trip,
  onClose,
  onUpdated,
}: {
  open: boolean
  trip: TripDetail
  onClose: () => void
  onUpdated: (trip: TripDetail) => void
}) {
  const [title, setTitle]               = useState(trip.title)
  const [destination, setDestination]   = useState(trip.destination)
  const [startDate, setStartDate]       = useState(trip.startDate.slice(0, 10))
  const [endDate, setEndDate]           = useState(trip.endDate.slice(0, 10))
  const [accommodation, setAccommodation] = useState(trip.accommodation ?? '')
  const [transport, setTransport]       = useState(trip.transport ?? '')
  const [notes, setNotes]               = useState(trip.notes ?? '')
  const [status, setStatus]             = useState(trip.status)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')

  // Reset form when trip changes
  useState(() => {
    setTitle(trip.title)
    setDestination(trip.destination)
    setStartDate(trip.startDate.slice(0, 10))
    setEndDate(trip.endDate.slice(0, 10))
    setAccommodation(trip.accommodation ?? '')
    setTransport(trip.transport ?? '')
    setNotes(trip.notes ?? '')
    setStatus(trip.status)
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !destination.trim() || !startDate || !endDate) {
      setError('Title, destination, and dates are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          destination: destination.trim(),
          startDate,
          endDate,
          accommodation: accommodation.trim() || null,
          transport: transport.trim() || null,
          notes: notes.trim() || null,
          status,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to update trip')
      }
      const updated = await res.json()
      onUpdated({ ...trip, ...updated, packingList: trip.packingList, packingEntries: trip.packingEntries })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update trip')
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DrawerContent className="sm:max-w-[560px]" showCloseButton={true}>
        <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>Edit Trip</DrawerTitle>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-4 flex-1 overflow-y-auto" id="edit-trip-form">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Destination *</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
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
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Transport</label>
              <input
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="planning">Planning</option>
                <option value="confirmed">Confirmed</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          </div>
        </form>
        <DrawerFooter className="px-4 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-trip-form" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
