'use client'

import { useState } from 'react'
import {
  Plus, X, Loader2, Sun, MapPin, Clock, StickyNote,
  Pencil, Trash2, Hotel, Car, UtensilsCrossed,
} from 'lucide-react'
import type { TripDayShape, TripActivityShape } from '@/types'

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
                  <span className="text-[10px] uppercase leading-none">
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
                        tripId={tripId}
                        onDeleted={() => handleDeleteActivity(day.id, activity.id)}
                      />
                    ))}
                  </div>
                )}

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
    </section>
  )
}

// ── Activity Row ──────────────────────────────────────────────────────────────

function ActivityRow({
  activity,
  dayId,
  tripId,
  onDeleted,
}: {
  activity: TripActivityShape
  dayId: string
  tripId: string
  onDeleted: () => void
}) {
  const categoryColor = CATEGORY_COLORS[activity.category ?? ''] ?? 'text-gray-500 bg-gray-50 dark:bg-gray-950/30'

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 hover:bg-accent/30 group">
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
            <span className="flex items-center gap-1" title={activity.notes}>
              <StickyNote className="h-3 w-3" />
            </span>
          )}
          {activity.category && (
            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-medium bg-muted">
              {activity.category}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onDeleted}
        className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all"
        title="Delete activity"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function formatTimeDisplay(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit',
  })
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
        placeholder="Add activity..."
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
