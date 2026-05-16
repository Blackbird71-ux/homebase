'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plane, MapPin, Calendar, ArrowLeft, Pencil, Trash2, Package,
  CheckCircle2, Clock, AlertTriangle, Plus, X, Loader2,
  Hotel, Car, StickyNote, CheckSquare, Square,
} from 'lucide-react'
import type { TripDetail, TripDayShape } from '@/types'
import { ItinerarySection } from '@/components/trips/ItinerarySection'
import { TripBudgetSection } from '@/components/trips/TripBudgetSection'
import { TripWeatherSection } from '@/components/trips/TripWeatherSection'

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
  const [showCreatePacking, setShowCreatePacking] = useState(false)
  const [days, setDays] = useState<TripDayShape[]>(initialTrip.days ?? [])

  // ── Status helpers ─────────────────────────────────────────────────

  const now = new Date()
  const start = new Date(trip.startDate)
  const end = new Date(trip.endDate)

  function getStatusInfo() {
    if (trip.status === 'cancelled') return { label: 'Cancelled', color: 'text-muted-foreground', icon: AlertTriangle }
    if (trip.status === 'completed') return { label: 'Completed', color: 'text-green-500', icon: CheckCircle2 }
    if (now >= start && now <= end) return { label: 'In Progress', color: 'text-blue-500', icon: Clock }
    return { label: 'Upcoming', color: 'text-amber-500', icon: Calendar }
  }

  const statusInfo = getStatusInfo()
  const StatusIcon = statusInfo.icon

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  function formatDateRange(): string {
    const s = new Date(trip.startDate)
    const e = new Date(trip.endDate)
    if (s.toDateString() === e.toDateString()) {
      return formatDate(trip.startDate)
    }
    return `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`
  }

  // ── Actions ────────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border shrink-0">
        <div className="flex items-center justify-between p-4 md:p-6">
          <div className="flex items-center gap-3">
            <Link
              href="/trips"
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{trip.title}</h1>
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.color} bg-muted`}>
                  <StatusIcon className="h-3 w-3" />
                  {statusInfo.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                <MapPin className="h-3.5 w-3.5" />
                {trip.destination}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-input hover:bg-accent transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {/* Date range */}
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{formatDateRange()}</span>
        </div>

        {/* Accommodation & Transport */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {trip.accommodation && (
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                <Hotel className="h-4 w-4" />
                Accommodation
              </div>
              <p className="text-sm">{trip.accommodation}</p>
            </div>
          )}
          {trip.transport && (
            <div className="p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                <Car className="h-4 w-4" />
                Transport
              </div>
              <p className="text-sm">{trip.transport}</p>
            </div>
          )}
        </div>

        {/* Notes */}
        {trip.notes && (
          <div className="p-3 rounded-lg border border-border bg-card">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
              <StickyNote className="h-4 w-4" />
              Notes
            </div>
            <p className="text-sm whitespace-pre-wrap">{trip.notes}</p>
          </div>
        )}

        {/* Packing List Section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Packing List
            </h2>
            {!trip.packingList && (
              <button
                onClick={() => setShowCreatePacking(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create Packing List
              </button>
            )}
          </div>

          {trip.packingList ? (
            <PackingListSection
              list={trip.packingList}
              currentUserId={currentUserId}
              tripId={trip.id}
              onListUpdated={(updatedList) => setTrip((prev) => ({ ...prev, packingList: updatedList }))}
              onUnlink={() => {
                setTrip((prev) => ({ ...prev, packingList: null }))
                router.refresh()
              }}
            />
          ) : (
            <div className="p-8 text-center text-muted-foreground rounded-lg border border-dashed border-border">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No packing list yet</p>
              <p className="text-xs mt-1">Create one to keep track of what to bring</p>
            </div>
          )}
        </section>

        {/* Weather */}
        <TripWeatherSection
          destination={trip.destination}
          startDate={trip.startDate}
          endDate={trip.endDate}
          startLocation={trip.departureLocation}
        />

        {/* Itinerary */}
        <ItinerarySection
          days={days}
          tripId={trip.id}
          startDate={trip.startDate}
          endDate={trip.endDate}
          onDaysUpdated={setDays}
        />

        {/* Budget */}
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

      {/* Edit Dialog */}
      {isEditing && (
        <EditTripDialog
          trip={trip}
          onClose={() => setIsEditing(false)}
          onUpdated={(updated) => {
            setTrip(updated)
            setIsEditing(false)
            router.refresh()
          }}
        />
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">Delete Trip</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete &ldquo;{trip.title}&rdquo;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-md text-sm font-medium border border-input hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Packing List Dialog */}
      {showCreatePacking && (
        <CreatePackingDialog
          tripId={trip.id}
          destination={trip.destination}
          onClose={() => setShowCreatePacking(false)}
          onCreated={(list) => {
            setTrip((prev) => ({ ...prev, packingList: list }))
            setShowCreatePacking(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// ── Packing List Section ────────────────────────────────────────────────────

function PackingListSection({
  list,
  currentUserId,
  tripId,
  onListUpdated,
  onUnlink,
}: {
  list: NonNullable<TripDetail['packingList']>
  currentUserId: string
  tripId: string
  onListUpdated: (list: NonNullable<TripDetail['packingList']>) => void
  onUnlink: () => void
}) {
  const [newItem, setNewItem] = useState('')
  const [adding, setAdding] = useState(false)
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const pendingItems = list.items.filter((i) => !i.isCompleted)
  const completedItems = list.items.filter((i) => i.isCompleted)

  function handleStartEdit(itemId: string, currentContent: string) {
    setEditingItemId(itemId)
    setEditValue(currentContent)
  }

  function handleCancelEdit() {
    setEditingItemId(null)
    setEditValue('')
  }

  async function handleSaveEdit(itemId: string) {
    if (!editValue.trim()) return
    setSavingEdit(true)
    const res = await fetch(`/api/lists/${list.id}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editValue.trim() }),
    })
    if (res.ok) {
      onListUpdated({
        ...list,
        items: list.items.map((i) =>
          i.id === itemId ? { ...i, content: editValue.trim() } : i
        ),
      })
      setEditingItemId(null)
      setEditValue('')
    }
    setSavingEdit(false)
  }

  async function handleToggle(itemId: string, isCompleted: boolean) {
    // Optimistic update
    onListUpdated({
      ...list,
      items: list.items.map((i) => (i.id === itemId ? { ...i, isCompleted: !isCompleted } : i)),
    })

    // We need to use the list's own API for toggling items
    // The existing List API handles this, so we just call it directly
    const res = await fetch(`/api/lists/${list.id}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCompleted: !isCompleted }),
    })

    if (!res.ok) {
      // Revert on failure
      onListUpdated({ ...list })
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    setAdding(true)

    const res = await fetch(`/api/lists/${list.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: newItem.trim(),
        createdBy: currentUserId,
      }),
    })

    if (res.ok) {
      const item = await res.json()
      onListUpdated({
        ...list,
        items: [...list.items, { ...item, dueDate: item.dueDate ?? null, createdAt: item.createdAt ?? new Date().toISOString() }],
      })
      setNewItem('')
    }

    setAdding(false)
  }

  async function handleDeleteItem(itemId: string) {
    const res = await fetch(`/api/lists/${list.id}/items/${itemId}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      onListUpdated({
        ...list,
        items: list.items.filter((i) => i.id !== itemId),
      })
    }
  }

  async function handleUnlinkPacking() {
    const res = await fetch(`/api/trips/${tripId}/packing?deleteList=false`, {
      method: 'DELETE',
    })
    if (res.ok) {
      onUnlink()
    }
    setShowUnlinkConfirm(false)
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* List header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Link
            href={`/lists`}
            className="text-sm font-medium hover:underline"
          >
            {list.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {pendingItems.length} item(s) remaining
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/lists`}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Open full list"
          >
            <CheckSquare className="h-4 w-4" />
          </Link>
          <button
            onClick={() => setShowUnlinkConfirm(true)}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Remove packing list"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Add item form */}
      <form onSubmit={handleAddItem} className="flex gap-2 p-3 border-b border-border">
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add item to packing list..."
          className="flex-1 px-3 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={adding || !newItem.trim()}
          className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </form>

      {/* Pending items */}
      {pendingItems.length > 0 && (
        <div className="divide-y divide-border">
          {pendingItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 group">
              <button
                onClick={() => handleToggle(item.id, item.isCompleted)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Square className="h-4 w-4" />
              </button>
              {editingItemId === item.id ? (
                <div className="flex-1 flex items-center gap-1.5">
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(item.id) }
                      if (e.key === 'Escape') { e.preventDefault(); handleCancelEdit() }
                    }}
                    className="flex-1 px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                    disabled={savingEdit}
                  />
                  <button
                    onClick={() => handleSaveEdit(item.id)}
                    disabled={savingEdit || !editValue.trim()}
                    className="p-1 rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50"
                    title="Save"
                  >
                    {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={savingEdit}
                    className="p-1 rounded text-muted-foreground hover:bg-accent"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <span
                    className="flex-1 text-sm cursor-pointer hover:text-primary transition-colors"
                    onClick={() => handleStartEdit(item.id, item.content)}
                    title="Click to edit"
                  >
                    {item.content}
                  </span>
                  {item.category && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {item.category}
                    </span>
                  )}
                  <button
                    onClick={() => handleStartEdit(item.id, item.content)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
                    title="Edit item"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Completed items */}
      {completedItems.length > 0 && (
        <details className="border-t border-border">
          <summary className="px-3 py-2 text-xs text-muted-foreground cursor-pointer hover:bg-accent/30">
            {completedItems.length} item(s) packed
          </summary>
          <div className="divide-y divide-border">
            {completedItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 opacity-60 group">
                <button
                  onClick={() => handleToggle(item.id, item.isCompleted)}
                  className="shrink-0 text-green-500"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
                {editingItemId === item.id ? (
                  <div className="flex-1 flex items-center gap-1.5">
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleSaveEdit(item.id) }
                        if (e.key === 'Escape') { e.preventDefault(); handleCancelEdit() }
                      }}
                      className="flex-1 px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                      disabled={savingEdit}
                    />
                    <button
                      onClick={() => handleSaveEdit(item.id)}
                      disabled={savingEdit || !editValue.trim()}
                      className="p-1 rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50"
                      title="Save"
                    >
                      {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={savingEdit}
                      className="p-1 rounded text-muted-foreground hover:bg-accent"
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span
                      className="flex-1 text-sm line-through cursor-pointer hover:text-primary transition-colors"
                      onClick={() => handleStartEdit(item.id, item.content)}
                      title="Click to edit"
                    >
                      {item.content}
                    </span>
                    <button
                      onClick={() => handleStartEdit(item.id, item.content)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
                      title="Edit item"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {list.items.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Packing list is empty. Add items above.
        </p>
      )}

      {/* Unlink confirm */}
      {showUnlinkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-2">Remove Packing List</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Unlink the packing list from this trip? The list itself will not be deleted.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowUnlinkConfirm(false)}
                className="px-4 py-2 rounded-md text-sm font-medium border border-input hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUnlinkPacking}
                className="px-4 py-2 rounded-md text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Edit Trip Dialog ────────────────────────────────────────────────────────

function EditTripDialog({
  trip,
  onClose,
  onUpdated,
}: {
  trip: TripDetail
  onClose: () => void
  onUpdated: (trip: TripDetail) => void
}) {
  const [title, setTitle] = useState(trip.title)
  const [destination, setDestination] = useState(trip.destination)
  const [startDate, setStartDate] = useState(trip.startDate.slice(0, 10))
  const [endDate, setEndDate] = useState(trip.endDate.slice(0, 10))
  const [accommodation, setAccommodation] = useState(trip.accommodation ?? '')
  const [transport, setTransport] = useState(trip.transport ?? '')
  const [notes, setNotes] = useState(trip.notes ?? '')
  const [status, setStatus] = useState(trip.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to update trip')
      }

      const updated = await res.json()
      onUpdated({ ...trip, ...updated, packingList: trip.packingList })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update trip')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Edit Trip</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
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
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Create Packing List Dialog ─────────────────────────────────────────────

function CreatePackingDialog({
  tripId,
  destination,
  onClose,
  onCreated,
}: {
  tripId: string
  destination: string
  onClose: () => void
  onCreated: (list: NonNullable<TripDetail['packingList']>) => void
}) {
  const [name, setName] = useState(`Packing: ${destination}`)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/trips/${tripId}/packing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to create packing list')
      }

      const list = await res.json()
      onCreated(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create packing list')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold">Create Packing List</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">List Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm font-medium border border-input hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
