'use client'

import { useState, useCallback } from 'react'
import {
  Plus, X, Loader2, Sun, MapPin, Clock, StickyNote,
  Pencil, Trash2, Hotel, Car, UtensilsCrossed, Check, FileText,
} from 'lucide-react'
import type { TripDayShape, TripActivityShape } from '@/types'
import { ActivityNoteDialog } from './ActivityNoteDialog'
import { TripAttachmentsSection } from './TripAttachmentsSection'

interface ItinerarySectionProps {
  days: TripDayShape[]
  tripId: string
  startDate: string
  endDate: string
  onDaysUpdated: (days: TripDayShape[]) => void
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  sightseeing: <Sun className="h-3.5 w-3.5" />,
  meal: <UtensilsCrossed className="h-3.5 w-3.5" />,
  transport: <Car className="h-3.5 w-3.5" />,
  accommodation: <Hotel className="h-3.5 w-3.5" />,
  activity: <Sun className="h-3.5 w-3.5" />,
}

const CATEGORY_COLORS: Record<string, string> = {
  sightseeing: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30',
  meal: 'text-orange-500 bg-orange-50 dark:bg-orange-950/30',
  transport: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30',
  accommodation: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30',
  activity: 'text-green-500 bg-green-50 dark:bg-green-950/30',
}

export function ItinerarySection({ days, tripId, startDate, endDate, onDaysUpdated }: ItinerarySectionProps) {
  const [addingDay, setAddingDay] = useState(false)
  const [newDayDate, setNewDayDate] = useState('')
  const [newDayLabel, setNewDayLabel] = useState('')
  const [savingDay, setSavingDay] = useState(false)

  const [expandedDayId, setExpandedDayId] = useState<string | null>(null)
  const [addingActivityDayId, setAddingActivityDayId] = useState<string | null>(null)

  // Note dialog state
  const [noteDialog, setNoteDialog] = useState<{
    dayId: string
    activityId: string
    activity: TripActivityShape
  } | null>(null)

  const tripStart = new Date(startDate)
  const tripEnd = new Date(endDate)

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  }

  function formatTime(dateStr: string | null): string {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleTimeString('en-AU', {
      hour: '2-digit', minute: '2-digit',
    })
  }

  async function handleAddDay() {
    if (!newDayDate) return
    setSavingDay(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newDayDate,
          label: newDayLabel.trim() || null,
        }),
      })
      if (res.ok) {
        const day = await res.json()
        onDaysUpdated([...days, day].sort((a, b) => a.date.localeCompare(b.date)))
        setNewDayDate('')
        setNewDayLabel('')
        setAddingDay(false)
      }
    } finally {
      setSavingDay(false)
    }
  }

  async function handleDeleteDay(dayId: string) {
    const res = await fetch(`/api/trips/${tripId}/days/${dayId}`, { method: 'DELETE' })
    if (res.ok) {
      onDaysUpdated(days.filter((d) => d.id !== dayId))
    }
  }

  async function handleAddActivity(dayId: string, title: string, category?: string) {
    const res = await fetch(`/api/trips/${tripId}/days/${dayId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category: category ?? null }),
    })
    if (res.ok) {
      const activity = await res.json()
      onDaysUpdated(
        days.map((d) =>
          d.id === dayId ? { ...d, activities: [...d.activities, activity] } : d
        )
      )
    }
  }

  async function handleUpdateActivity(
    dayId: string,
    activityId: string,
    data: {
      title?: string
      location?: string | null
      startTime?: string | null
      endTime?: string | null
      notes?: string | null
      category?: string | null
    },
  ) {
    const res = await fetch(
      `/api/trips/${tripId}/days/${dayId}/activities/${activityId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    )
    if (res.ok) {
      const updated = await res.json()
      onDaysUpdated(
        days.map((d) =>
          d.id === dayId
            ? {
                ...d,
                activities: d.activities.map((a) =>
                  a.id === activityId
                    ? {
                        ...a,
                        title: updated.title ?? a.title,
                        location: updated.location ?? a.location,
                        startTime: updated.startTime ?? a.startTime,
                        endTime: updated.endTime ?? a.endTime,
                        notes: updated.notes ?? a.notes,
                        category: updated.category ?? a.category,
                      }
                    : a,
                ),
              }
            : d,
        ),
      )
    }
  }

  async function handleSaveNotes(dayId: string, activityId: string, htmlContent: string) {
    await handleUpdateActivity(dayId, activityId, { notes: htmlContent })
  }

  async function handleDeleteActivity(dayId: string, activityId: string) {
    const res = await fetch(`/api/trips/${tripId}/days/${dayId}/activities/${activityId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      onDaysUpdated(
        days.map((d) =>
          d.id === dayId
            ? { ...d, activities: d.activities.filter((a) => a.id !== activityId) }
            : d
        )
      )
    }
  }

  function generateMissingDays() {
    const existingDates = new Set(days.map((d) => d.date.slice(0, 10)))
    const missing: { date: string; label: string }[] = []
    const current = new Date(tripStart)
    while (current <= tripEnd) {
      const dateStr = current.toISOString().slice(0, 10)
      if (!existingDates.has(dateStr)) {
        const dayNum = missing.length + days.length + 1
        missing.push({ date: dateStr, label: `Day ${dayNum}` })
      }
      current.setDate(current.getDate() + 1)
    }
    return missing
  }

  const missingDays = generateMissingDays()

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Sun className="h-4 w-4" />
          Itinerary
        </h2>
        <button
          onClick={() => setAddingDay(!addingDay)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Day
        </button>
      </div>

      {/* Quick-add missing days */}
      {missingDays.length > 0 && days.length > 0 && (
        <div className="mb-3 p-2 rounded-md bg-muted/30 border border-border">
          <p className="text-xs text-muted-foreground mb-2">
            {missingDays.length} day(s) not yet added
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missingDays.map((m) => (
              <button
                key={m.date}
                onClick={async () => {
                  const res = await fetch(`/api/trips/${tripId}/days`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: m.date, label: m.label }),
                  })
                  if (res.ok) {
                    const day = await res.json()
                    onDaysUpdated([...days, day].sort((a, b) => a.date.localeCompare(b.date)))
                  }
                }}
                className="px-2 py-1 rounded text-xs border border-input hover:bg-accent transition-colors"
              >
                + {formatDate(m.date)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add day form */}
      {addingDay && (
        <div className="mb-3 p-3 rounded-lg border border-border bg-card space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Date *</label>
              <input
                type="date"
                value={newDayDate}
                onChange={(e) => setNewDayDate(e.target.value)}
                min={startDate.slice(0, 10)}
                max={endDate.slice(0, 10)}
                className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Label</label>
              <input
                value={newDayLabel}
                onChange={(e) => setNewDayLabel(e.target.value)}
                placeholder="e.g. Travel Day"
                className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setAddingDay(false)}
              className="px-3 py-1.5 rounded text-sm font-medium border border-input hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddDay}
              disabled={!newDayDate || savingDay}
              className="px-3 py-1.5 rounded text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {savingDay ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Day'}
            </button>
          </div>
        </div>
      )}

      {/* No days state */}
      {days.length === 0 && !addingDay && (
        <div className="p-8 text-center text-muted-foreground rounded-lg border border-dashed border-border">
          <Sun className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No itinerary yet</p>
          <p className="text-xs mt-1">Add days to plan your trip activities</p>
        </div>
      )}

      {/* Days list */}
      <div className="space-y-3">
        {days.map((day) => (
          <div
            key={day.id}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            {/* Day header */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => setExpandedDayId(expandedDayId === day.id ? null : day.id)}
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                  <span className="text-xs font-bold">{new Date(day.date).getDate()}</span>
                  <span className="text-xs uppercase leading-none">
                    {new Date(day.date).toLocaleDateString('en-AU', { month: 'short' })}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{day.label || formatDate(day.date)}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(day.date)}</span>
                  </div>
                  {day.activities.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {day.activities.length} activity(ies)
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteDay(day.id)
                }}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                title="Remove day"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Expanded content */}
            {expandedDayId === day.id && (
              <div className="border-t border-border">
                {/* Activities */}
                {day.activities.length > 0 && (
                  <div className="divide-y divide-border">
                    {day.activities.map((activity) => (
                      <ActivityRow
                        key={activity.id}
                        activity={activity}
                        dayId={day.id}
                        dayDate={day.date}
                        tripId={tripId}
                        onUpdated={(data) => handleUpdateActivity(day.id, activity.id, data)}
                        onEditNotes={() =>
                          setNoteDialog({ dayId: day.id, activityId: activity.id, activity })
                        }
                        onDeleted={() => handleDeleteActivity(day.id, activity.id)}
                      />
                    ))}
                  </div>
                )}

                {/* Day-level Attachments */}
                <TripAttachmentsSection tripId={tripId} dayId={day.id} label="Day Attachments" />

                {/* Add activity */}
                <div className="p-3 border-t border-border">
                  <ActivityForm
                    dayId={day.id}
                    tripId={tripId}
                    onCreated={(activity) => {
                      onDaysUpdated(
                        days.map((d) =>
                          d.id === day.id
                            ? { ...d, activities: [...d.activities, activity] }
                            : d
                        )
                      )
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Rich Text Notes Dialog */}
      {noteDialog && (
        <ActivityNoteDialog
          open={!!noteDialog}
          onOpenChange={(open) => {
            if (!open) setNoteDialog(null)
          }}
          activityTitle={noteDialog.activity.title}
          initialContent={noteDialog.activity.notes}
          onSave={(html) => handleSaveNotes(noteDialog.dayId, noteDialog.activityId, html)}
        />
      )}
    </section>
  )
}

// ── Activity Row ──────────────────────────────────────────────────────────────

function ActivityRow({
  activity,
  dayId,
  dayDate,
  tripId,
  onUpdated,
  onEditNotes,
  onDeleted,
}: {
  activity: TripActivityShape
  dayId: string
  dayDate: string
  tripId: string
  onUpdated: (data: {
    title?: string
    location?: string | null
    startTime?: string | null
    endTime?: string | null
    category?: string | null
  }) => void
  onEditNotes: () => void
  onDeleted: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(activity.title)
  const [editLocation, setEditLocation] = useState(activity.location ?? '')
  const [editCategory, setEditCategory] = useState(activity.category ?? '')

  // Time inputs: extract HH:MM from ISO datetime strings
  const timeFromIso = (iso: string | null): string => {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    } catch { return '' }
  }

  const [editStartTime, setEditStartTime] = useState(timeFromIso(activity.startTime))
  const [editEndTime, setEditEndTime] = useState(timeFromIso(activity.endTime))

  const categoryColor = CATEGORY_COLORS[activity.category ?? ''] ?? 'text-gray-500 bg-gray-50 dark:bg-gray-950/30'

  function buildIsoDateTime(timeStr: string): string | null {
    if (!timeStr) return null
    try {
      const [h, m] = timeStr.split(':').map(Number)
      // Use the day date as base
      const base = new Date(dayDate)
      if (isNaN(base.getTime())) return null
      base.setHours(h, m, 0, 0)
      return base.toISOString()
    } catch { return null }
  }

  function handleSave() {
    if (!editTitle.trim()) return
    onUpdated({
      title: editTitle.trim(),
      location: editLocation.trim() || null,
      startTime: buildIsoDateTime(editStartTime),
      endTime: buildIsoDateTime(editEndTime),
      category: editCategory || null,
    })
    setIsEditing(false)
  }

  function handleCancel() {
    setEditTitle(activity.title)
    setEditLocation(activity.location ?? '')
    setEditCategory(activity.category ?? '')
    setEditStartTime(timeFromIso(activity.startTime))
    setEditEndTime(timeFromIso(activity.endTime))
    setIsEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      handleCancel()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }

  // Strip HTML for StickyNote tooltip preview
  const notePreview = activity.notes
    ? new DOMParser().parseFromString(activity.notes, 'text/html').body.textContent?.slice(0, 100) ?? ''
    : ''

  function formatTimeDisplay(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-AU', {
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (isEditing) {
    return (
      <div className="px-3 py-2.5 space-y-2 bg-accent/20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-0.5">Title</label>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-full px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-0.5">Location</label>
            <input
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Eiffel Tower"
              className="w-full px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-0.5">Type</label>
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="w-full px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">None</option>
              <option value="sightseeing">Sightseeing</option>
              <option value="meal">Meal</option>
              <option value="transport">Transport</option>
              <option value="accommodation">Accommodation</option>
              <option value="activity">Activity</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-0.5">Start</label>
            <input
              type="time"
              value={editStartTime}
              onChange={(e) => setEditStartTime(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-0.5">End</label>
            <input
              type="time"
              value={editEndTime}
              onChange={(e) => setEditEndTime(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-2 py-1 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onEditNotes}
            className="px-2 py-1 rounded text-xs font-medium border border-input hover:bg-accent transition-colors flex items-center gap-1"
          >
            <FileText className="h-3 w-3" />
            Notes
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-2 py-1 rounded text-xs font-medium border border-input hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!editTitle.trim()}
            className="px-2 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            <Check className="h-3 w-3" />
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 hover:bg-accent/30 group cursor-pointer"
      onDoubleClick={() => setIsEditing(true)}
      title="Double-click to edit"
    >
      {activity.category && CATEGORY_ICONS[activity.category] ? (
        <span className={`shrink-0 p-1 rounded ${categoryColor}`}>
          {CATEGORY_ICONS[activity.category]}
        </span>
      ) : (
        <span className="shrink-0 p-1 rounded text-muted-foreground">
          <Sun className="h-3.5 w-3.5" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{activity.title}</span>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
          {activity.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {activity.location}
            </span>
          )}
          {(activity.startTime || activity.endTime) && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {activity.startTime && formatTimeDisplay(activity.startTime)}
              {activity.startTime && activity.endTime && ' – '}
              {activity.endTime && formatTimeDisplay(activity.endTime)}
            </span>
          )}
          {activity.notes && (
            <span
              className="flex items-center gap-1 cursor-help"
              title={notePreview}
            >
              <StickyNote className="h-3 w-3" />
            </span>
          )}
          {activity.category && (
            <span className="px-1.5 py-0.5 rounded text-xs uppercase font-medium bg-muted">
              {activity.category}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setIsEditing(true)
          }}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Edit activity"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDeleted()
          }}
          className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
          title="Delete activity"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Activity Form ─────────────────────────────────────────────────────────────

function ActivityForm({
  dayId,
  tripId,
  onCreated,
}: {
  dayId: string
  tripId: string
  onCreated: (activity: TripActivityShape) => void
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/days/${dayId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category: category || null,
        }),
      })
      if (res.ok) {
        const activity = await res.json()
        onCreated(activity)
        setTitle('')
        setCategory('')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add Activity and Press Enter to Save..."
        className="flex-1 px-2.5 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="px-2 py-1.5 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Type</option>
        <option value="sightseeing">Sightseeing</option>
        <option value="meal">Meal</option>
        <option value="transport">Transport</option>
        <option value="accommodation">Accommodation</option>
        <option value="activity">Activity</option>
      </select>
      <button
        type="submit"
        disabled={saving || !title.trim()}
        className="shrink-0 p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </button>
    </form>
  )
}
