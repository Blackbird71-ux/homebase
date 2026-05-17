'use client'

import { useState } from 'react'
import {
  Plus, X, Loader2, Sun, MapPin, Clock, StickyNote,
  Pencil, Trash2,
} from 'lucide-react'
import type { TripDayShape, TripActivityShape } from '@/types'
import { ActivityEditDialog, getCategoryMeta, CATEGORIES } from './ActivityEditDialog'
import { TripAttachmentsSection } from './TripAttachmentsSection'

interface ItinerarySectionProps {
  days: TripDayShape[]
  tripId: string
  startDate: string
  endDate: string
  onDaysUpdated: (days: TripDayShape[]) => void
}

// ── Main section ───────────────────────────────────────────────────────────

export function ItinerarySection({ days, tripId, startDate, endDate, onDaysUpdated }: ItinerarySectionProps) {
  const [addingDay, setAddingDay]         = useState(false)
  const [newDayDate, setNewDayDate]       = useState('')
  const [newDayLabel, setNewDayLabel]     = useState('')
  const [savingDay, setSavingDay]         = useState(false)
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null)

  // Which activity is open in the edit modal — store dayDate so the dialog
  // can build correct ISO datetime values for start/end times.
  const [editDialog, setEditDialog] = useState<{
    dayId: string
    dayDate: string          // ISO date string of the parent day
    activity: TripActivityShape
  } | null>(null)

  const tripStart = new Date(startDate)
  const tripEnd   = new Date(endDate)

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  }

  // ── Day CRUD ──────────────────────────────────────────────────────────────

  async function handleAddDay() {
    if (!newDayDate) return
    setSavingDay(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/days`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newDayDate, label: newDayLabel.trim() || null }),
      })
      if (res.ok) {
        const day = await res.json()
        onDaysUpdated([...days, day].sort((a, b) => a.date.localeCompare(b.date)))
        setNewDayDate('')
        setNewDayLabel('')
        setAddingDay(false)
        setExpandedDayId(day.id)
      }
    } finally {
      setSavingDay(false)
    }
  }

  async function handleDeleteDay(dayId: string) {
    if (!confirm('Remove this day and all its activities?')) return
    const res = await fetch(`/api/trips/${tripId}/days/${dayId}`, { method: 'DELETE' })
    if (res.ok) {
      onDaysUpdated(days.filter((d) => d.id !== dayId))
      if (expandedDayId === dayId) setExpandedDayId(null)
    }
  }

  // ── Activity CRUD ─────────────────────────────────────────────────────────

  async function handleSaveActivity(
    dayId: string,
    activityId: string,
    data: {
      title: string
      location: string | null
      startTime: string | null
      endTime: string | null
      notes: string | null
      category: string | null
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
    if (!res.ok) throw new Error('Save failed')
    const updated = await res.json()
    onDaysUpdated(
      days.map((d) =>
        d.id === dayId
          ? {
              ...d,
              activities: d.activities.map((a) =>
                a.id === activityId ? { ...a, ...updated } : a,
              ),
            }
          : d,
      ),
    )
  }

  async function handleDeleteActivity(dayId: string, activityId: string) {
    if (!confirm('Delete this activity?')) return
    const res = await fetch(
      `/api/trips/${tripId}/days/${dayId}/activities/${activityId}`,
      { method: 'DELETE' },
    )
    if (res.ok) {
      onDaysUpdated(
        days.map((d) =>
          d.id === dayId
            ? { ...d, activities: d.activities.filter((a) => a.id !== activityId) }
            : d,
        ),
      )
    }
  }

  // ── Missing-day quick-add ─────────────────────────────────────────────────

  function generateMissingDays() {
    const existing = new Set(days.map((d) => d.date.slice(0, 10)))
    const missing: { date: string; label: string }[] = []
    const cur = new Date(tripStart)
    while (cur <= tripEnd) {
      const ds = cur.toISOString().slice(0, 10)
      if (!existing.has(ds)) {
        missing.push({ date: ds, label: `Day ${missing.length + days.length + 1}` })
      }
      cur.setDate(cur.getDate() + 1)
    }
    return missing
  }

  async function quickAddDay(date: string, label: string) {
    const res = await fetch(`/api/trips/${tripId}/days`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, label }),
    })
    if (res.ok) {
      const day = await res.json()
      onDaysUpdated([...days, day].sort((a, b) => a.date.localeCompare(b.date)))
    }
  }

  const missingDays = generateMissingDays()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section>
      {/* Section header */}
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
        <div className="mb-3 p-2.5 rounded-md bg-muted/30 border border-border">
          <p className="text-xs text-muted-foreground mb-2">
            {missingDays.length} day{missingDays.length !== 1 ? 's' : ''} in your trip range not yet added
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missingDays.map((m) => (
              <button
                key={m.date}
                onClick={() => quickAddDay(m.date, m.label)}
                className="px-2 py-1 rounded text-xs border border-input hover:bg-accent transition-colors"
              >
                + {formatDate(m.date)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add-day form */}
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

      {/* Empty state */}
      {days.length === 0 && !addingDay && (
        <div className="p-8 text-center text-muted-foreground rounded-lg border border-dashed border-border">
          <Sun className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No itinerary yet</p>
          <p className="text-xs mt-1">Add days to plan your trip activities</p>
        </div>
      )}

      {/* Days list */}
      <div className="space-y-3">
        {days.map((day) => {
          const isExpanded = expandedDayId === day.id
          return (
            <div key={day.id} className="rounded-lg border border-border bg-card overflow-hidden">

              {/* Day header — click to expand */}
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setExpandedDayId(isExpanded ? null : day.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
                    <span className="text-xs font-bold leading-none">{new Date(day.date).getDate()}</span>
                    <span className="text-[10px] uppercase leading-none mt-0.5">
                      {new Date(day.date).toLocaleDateString('en-AU', { month: 'short' })}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{day.label || formatDate(day.date)}</span>
                      {day.label && (
                        <span className="text-xs text-muted-foreground">{formatDate(day.date)}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {day.activities.length === 0
                        ? 'No activities yet'
                        : `${day.activities.length} activit${day.activities.length === 1 ? 'y' : 'ies'}`}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteDay(day.id) }}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive shrink-0"
                  title="Remove day"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-border">

                  {/* Activity rows */}
                  {day.activities.length > 0 && (
                    <div className="divide-y divide-border">
                      {day.activities.map((activity) => (
                        <ActivityRow
                          key={activity.id}
                          activity={activity}
                          onEdit={() => setEditDialog({ dayId: day.id, dayDate: day.date, activity })}
                          onDelete={() => handleDeleteActivity(day.id, activity.id)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Day attachments */}
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
                              : d,
                          ),
                        )
                        // Open the modal so the user can fill in all details straight away
                        setEditDialog({ dayId: day.id, dayDate: day.date, activity })
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Activity edit modal */}
      {editDialog && (
        <ActivityEditDialog
          activity={editDialog.activity}
          dayDate={editDialog.dayDate}
          onSave={(data) => handleSaveActivity(editDialog.dayId, editDialog.activity.id, data)}
          onClose={() => setEditDialog(null)}
        />
      )}
    </section>
  )
}

// ── Activity row — read-only display, double-click or pencil to edit ───────

function ActivityRow({
  activity,
  onEdit,
  onDelete,
}: {
  activity: TripActivityShape
  onEdit: () => void
  onDelete: () => void
}) {
  const cat = getCategoryMeta(activity.category)

  function formatTimeDisplay(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  }

  // Strip HTML tags for the notes preview shown inline under the title
  const notePreview = activity.notes
    ? (typeof window !== 'undefined'
        ? new DOMParser().parseFromString(activity.notes, 'text/html').body.textContent?.slice(0, 120) ?? ''
        : activity.notes.replace(/<[^>]+>/g, '').slice(0, 120))
    : ''

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 hover:bg-accent/30 group cursor-pointer"
      onDoubleClick={onEdit}
      title="Double-click to edit"
    >
      {/* Category icon */}
      {cat ? (
        <span className={`shrink-0 p-1 rounded mt-0.5 ${cat.color}`}>
          <cat.icon className="h-3.5 w-3.5" />
        </span>
      ) : (
        <span className="shrink-0 p-1 rounded mt-0.5 text-muted-foreground">
          <Sun className="h-3.5 w-3.5" />
        </span>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium leading-snug">{activity.title}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
          {activity.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              {activity.location}
            </span>
          )}
          {(activity.startTime || activity.endTime) && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {activity.startTime && formatTimeDisplay(activity.startTime)}
              {activity.startTime && activity.endTime && ' – '}
              {activity.endTime && formatTimeDisplay(activity.endTime)}
            </span>
          )}
          {notePreview && (
            <span className="flex items-center gap-1 text-muted-foreground/70">
              <StickyNote className="h-3 w-3 shrink-0" />
              <span className="italic truncate max-w-[220px]">{notePreview}</span>
            </span>
          )}
        </div>
      </div>

      {/* Action buttons — visible on row hover */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Edit activity"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
          title="Delete activity"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Activity quick-add form ────────────────────────────────────────────────
// Title + type only. After creation the edit modal opens so the user can
// fill in location, times, and rich-text notes without an extra click.

function ActivityForm({
  dayId,
  tripId,
  onCreated,
}: {
  dayId: string
  tripId: string
  onCreated: (activity: TripActivityShape) => void
}) {
  const [title, setTitle]       = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/days/${dayId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), category: category || null }),
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
        placeholder="Add activity — press Enter, then fill in details…"
        className="flex-1 px-2.5 py-1.5 rounded border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="px-2 py-1.5 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Type</option>
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={saving || !title.trim()}
        className="shrink-0 p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        title="Add activity"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      </button>
    </form>
  )
}
