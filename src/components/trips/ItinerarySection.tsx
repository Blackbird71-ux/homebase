'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Plus, Loader2, Sun, MapPin, Clock, StickyNote,
  Pencil, Trash2, Check, Tag, Settings2, GripVertical, ArrowUpDown,
} from 'lucide-react'
import type { TripDayShape, TripActivityShape, TripTagShape } from '@/types'
import { ActivityEditDialog, getCategoryMeta } from './ActivityEditDialog'
import { TripTagsManager } from './TripTagsManager'
import { TripAttachmentsSection } from './TripAttachmentsSection'
import { useSortable } from '@/hooks/trips/useSortable'

// ── Category badge ─────────────────────────────────────────────────────────────
function CategoryBadge({ category, size = 36 }: { category: string | null; size?: number }) {
  const meta = getCategoryMeta(category)
  if (!meta) {
    return (
      <span className="hb-cat-badge hb-cat-default" style={{ width: size, height: size }}>
        <Sun size={size === 36 ? 18 : 14} />
      </span>
    )
  }
  const Icon = meta.icon
  return (
    <span className={`hb-cat-badge ${meta.cssClass}`} style={{ width: size, height: size }}>
      <Icon size={size === 36 ? 18 : 14} />
    </span>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface ItinerarySectionProps {
  days: TripDayShape[]
  tripId: string
  startDate: string
  endDate: string
  onDaysUpdated: (days: TripDayShape[]) => void
}

export function ItinerarySection({ days, tripId, startDate, endDate, onDaysUpdated }: ItinerarySectionProps) {
  const [selectedDayId, setSelectedDayId] = useState<string | null>(days[0]?.id ?? null)
  const [addingDay, setAddingDay]         = useState(false)
  const [newDayDate, setNewDayDate]       = useState('')
  const [newDayLabel, setNewDayLabel]     = useState('')
  const [savingDay, setSavingDay]         = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)

  const [editingDayId, setEditingDayId]   = useState<string | null>(null)
  const [editDayLabel, setEditDayLabel]   = useState('')
  const [editDayNotes, setEditDayNotes]   = useState('')
  const [savingDayEdit, setSavingDayEdit] = useState(false)

  const [editDialog, setEditDialog] = useState<{
    dayId: string
    dayDate: string
    activity: TripActivityShape
  } | null>(null)

  const [availableTags, setAvailableTags]   = useState<TripTagShape[]>([])
  const [togglingDayTag, setTogglingDayTag] = useState<string | null>(null)

  const [isDraggingActivity, setIsDraggingActivity] = useState(false)
  const [draggingOverDayId, setDraggingOverDayId]   = useState<string | null>(null)
  const [isReversingDays, setIsReversingDays]       = useState(false)

  // Local activity order for drag-reorder (resets on navigation/refresh — visual only)
  const [localActivities, setLocalActivities] = useState<TripActivityShape[]>([])

  useEffect(() => {
    fetch('/api/trips/tags')
      .then((r) => r.json())
      .then((data: TripTagShape[]) => setAvailableTags(data))
      .catch(() => {})
  }, [])

  // Sync local activities whenever selected day or days array changes
  useEffect(() => {
    const d = days.find((d) => d.id === selectedDayId)
    setLocalActivities(d?.activities ?? [])
  }, [selectedDayId, days])

  const activitySortable = useSortable(localActivities, setLocalActivities, {
    id: `activities-${selectedDayId ?? 'none'}`,
    handleOnly: true,
  })

  const tripStart = new Date(startDate)
  const tripEnd   = new Date(endDate)
  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null

  function formatDate(dateStr: string, opts?: Intl.DateTimeFormatOptions): string {
    return new Date(dateStr).toLocaleDateString('en-AU', opts ?? { weekday: 'short', day: 'numeric', month: 'short' })
  }

  // ── Day tag toggling ───────────────────────────────────────────────────────

  async function handleToggleDayTag(dayId: string, tagId: string) {
    setTogglingDayTag(tagId)
    try {
      const res = await fetch(`/api/trips/${tripId}/days/${dayId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      })
      if (res.ok) {
        const updatedTags = await res.json()
        onDaysUpdated(days.map((d) => d.id === dayId ? { ...d, tags: updatedTags } : d))
      }
    } finally {
      setTogglingDayTag(null)
    }
  }

  // ── Day CRUD ────────────────────────────────────────────────────────────────

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
        const updated = [...days, day].sort((a, b) => a.date.localeCompare(b.date))
        onDaysUpdated(updated)
        setNewDayDate('')
        setNewDayLabel('')
        setAddingDay(false)
        setSelectedDayId(day.id)
      }
    } finally {
      setSavingDay(false)
    }
  }

  async function handleDeleteDay(dayId: string) {
    if (!confirm('Remove this day and all its activities?')) return
    const res = await fetch(`/api/trips/${tripId}/days/${dayId}`, { method: 'DELETE' })
    if (res.ok) {
      const updated = days.filter((d) => d.id !== dayId)
      onDaysUpdated(updated)
      if (selectedDayId === dayId) setSelectedDayId(updated[0]?.id ?? null)
    }
  }

  function openEditDay(day: TripDayShape) {
    setEditingDayId(day.id)
    setEditDayLabel(day.label ?? '')
    setEditDayNotes(day.notes ?? '')
  }

  async function handleSaveDay(dayId: string) {
    setSavingDayEdit(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/days/${dayId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editDayLabel.trim() || null, notes: editDayNotes.trim() || null }),
      })
      if (res.ok) {
        const updated = await res.json()
        onDaysUpdated(days.map((d) => d.id === dayId ? { ...d, ...updated } : d))
        setEditingDayId(null)
      }
    } finally {
      setSavingDayEdit(false)
    }
  }

  // ── Activity CRUD ────────────────────────────────────────────────────────────

  async function handleSaveActivity(dayId: string, activityId: string, data: {
    title: string; location: string | null; locationLat: number | null; locationLng: number | null; startTime: string | null; endTime: string | null; notes: string | null; category: string | null
  }) {
    const res = await fetch(`/api/trips/${tripId}/days/${dayId}/activities/${activityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Save failed')
    const updated = await res.json()
    onDaysUpdated(days.map((d) =>
      d.id === dayId
        ? { ...d, activities: d.activities.map((a) => a.id === activityId ? { ...a, ...updated } : a) }
        : d,
    ))
  }

  function handleActivityTagsChanged(dayId: string, activityId: string, tags: TripActivityShape['tags']) {
    onDaysUpdated(days.map((d) =>
      d.id === dayId
        ? { ...d, activities: d.activities.map((a) => a.id === activityId ? { ...a, tags } : a) }
        : d,
    ))
    if (editDialog && editDialog.activity.id === activityId) {
      setEditDialog((prev) => prev ? { ...prev, activity: { ...prev.activity, tags } } : null)
    }
  }

  async function handleDeleteActivity(dayId: string, activityId: string) {
    if (!confirm('Delete this activity?')) return
    const res = await fetch(`/api/trips/${tripId}/days/${dayId}/activities/${activityId}`, { method: 'DELETE' })
    if (res.ok) {
      onDaysUpdated(days.map((d) =>
        d.id === dayId
          ? { ...d, activities: d.activities.filter((a) => a.id !== activityId) }
          : d,
      ))
    }
  }

  // ── Missing days ────────────────────────────────────────────────────────────

  function generateMissingDays() {
    const existing = new Set(days.map((d) => d.date.slice(0, 10)))
    const missing: { date: string; label: string }[] = []
    const cur = new Date(tripStart)
    while (cur <= tripEnd) {
      const ds = cur.toISOString().slice(0, 10)
      if (!existing.has(ds)) missing.push({ date: ds, label: `Day ${missing.length + days.length + 1}` })
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
      const updated = [...days, day].sort((a, b) => a.date.localeCompare(b.date))
      onDaysUpdated(updated)
      setSelectedDayId(day.id)
    }
  }

  async function refreshTags() {
    try {
      const res = await fetch('/api/trips/tags')
      if (res.ok) setAvailableTags(await res.json())
    } catch { /* ignore */ }
  }

  async function handleMoveActivity(activityId: string, sourceDayId: string, targetDayId: string) {
    const sourceDay = days.find((d) => d.id === sourceDayId)
    const activity  = sourceDay?.activities.find((a) => a.id === activityId)
    if (!activity) return

    onDaysUpdated(days.map((d) => {
      if (d.id === sourceDayId) return { ...d, activities: d.activities.filter((a) => a.id !== activityId) }
      if (d.id === targetDayId) return { ...d, activities: [...d.activities, { ...activity, dayId: targetDayId }] }
      return d
    }))
    setSelectedDayId(targetDayId)

    const res = await fetch(`/api/trips/${tripId}/days/${sourceDayId}/activities/${activityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDayId }),
    })
    if (!res.ok) {
      onDaysUpdated(days)
      setSelectedDayId(sourceDayId)
    }
  }

  async function handleReverseDays() {
    if (!confirm(`Reverse the order of all ${days.length} days? Activities and labels will swap between days (dates stay fixed).`)) return
    setIsReversingDays(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/days/reverse`, { method: 'POST' })
      if (res.ok) {
        onDaysUpdated(await res.json())
      }
    } finally {
      setIsReversingDays(false)
    }
  }

  const missingDays = generateMissingDays()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="hb-itinerary">
      {/* ── Left: Day Rail ── */}
      <div className="hb-day-rail">
        <div className="hb-day-rail__head">
          <span>Days</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {days.length >= 2 && (
              <button
                className="hb-btn hb-btn--ghost hb-btn--sm hb-btn--icon"
                title="Reverse day order"
                onClick={handleReverseDays}
                disabled={isReversingDays}
              >
                {isReversingDays ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpDown size={14} />}
              </button>
            )}
            <button
              className="hb-btn hb-btn--ghost hb-btn--sm hb-btn--icon"
              title="Add day"
              onClick={() => setAddingDay((v) => !v)}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Missing-days quick-add banner */}
        {missingDays.length > 0 && days.length > 0 && (
          <div style={{ padding: '6px 8px', marginBottom: 4, borderRadius: 8, background: 'color-mix(in srgb, var(--primary) 6%, transparent)', fontSize: 11, color: 'var(--muted-foreground)' }}>
            <p style={{ margin: '0 0 4px' }}>{missingDays.length} trip day{missingDays.length !== 1 ? 's' : ''} not yet added:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {missingDays.map((m) => (
                <button
                  key={m.date}
                  onClick={() => quickAddDay(m.date, m.label)}
                  className="hb-chip hb-chip--ghost"
                  style={{ fontSize: 10 }}
                >
                  + {formatDate(m.date, { day: 'numeric', month: 'short' })}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add-day form */}
        {addingDay && (
          <div style={{ padding: '8px', marginBottom: 4, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)' }}>
            <div className="hb-field" style={{ marginBottom: 6 }}>
              <label className="hb-field__label">Date *</label>
              <input
                type="date"
                value={newDayDate}
                onChange={(e) => setNewDayDate(e.target.value)}
                min={startDate.slice(0, 10)}
                max={endDate.slice(0, 10)}
                className="hb-input"
                style={{ fontSize: 12, padding: '6px 8px' }}
              />
            </div>
            <div className="hb-field" style={{ marginBottom: 8 }}>
              <label className="hb-field__label">Label</label>
              <input
                value={newDayLabel}
                onChange={(e) => setNewDayLabel(e.target.value)}
                placeholder="e.g. Travel Day"
                className="hb-input"
                style={{ fontSize: 12, padding: '6px 8px' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="hb-btn hb-btn--ghost hb-btn--sm" onClick={() => setAddingDay(false)}>Cancel</button>
              <button
                className="hb-btn hb-btn--primary hb-btn--sm"
                onClick={handleAddDay}
                disabled={!newDayDate || savingDay}
              >
                {savingDay ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
              </button>
            </div>
          </div>
        )}

        {/* Day chips */}
        {days.length === 0 && !addingDay && (
          <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
            <Sun size={20} style={{ margin: '0 auto 6px', opacity: 0.3, display: 'block' }} />
            No days yet
          </div>
        )}

        {days.map((day) => {
          const d = new Date(day.date)
          const dayNum = d.getDate()
          const monthStr = d.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase()
          const actCount = day.activities.length
          const tags = day.tags ?? []
          const isCurrentDay = selectedDayId === day.id
          const isDragOver  = draggingOverDayId === day.id
          return (
            <button
              key={day.id}
              className="hb-day-chip"
              aria-selected={isCurrentDay}
              onClick={() => setSelectedDayId(day.id)}
              onDoubleClick={() => { setSelectedDayId(day.id); openEditDay(day) }}
              title={formatDate(day.date) + (isDraggingActivity && !isCurrentDay ? ' — drop to move activity here' : ' — double-click to edit')}
              onDragOver={(e) => {
                if (!isDraggingActivity || isCurrentDay) return
                if (!e.dataTransfer.types.includes('text/x-trip-activity')) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (draggingOverDayId !== day.id) setDraggingOverDayId(day.id)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDraggingOverDayId(null)
              }}
              onDrop={async (e) => {
                e.preventDefault()
                setDraggingOverDayId(null)
                const raw = e.dataTransfer.getData('text/x-trip-activity')
                if (!raw) return
                try {
                  const { activityId, sourceDayId } = JSON.parse(raw) as { activityId: string; sourceDayId: string }
                  if (sourceDayId !== day.id) await handleMoveActivity(activityId, sourceDayId, day.id)
                } catch { /* ignore malformed data */ }
              }}
              style={
                isDragOver ? { outline: '2px solid var(--primary)', outlineOffset: '-2px', background: 'color-mix(in srgb, var(--primary) 12%, transparent)' }
                : isDraggingActivity && !isCurrentDay ? { outline: '1px dashed color-mix(in srgb, var(--primary) 45%, transparent)', outlineOffset: '-1px' }
                : undefined
              }
            >
              <div className="hb-day-chip__date">
                <span className="hb-day-chip__day-num">{dayNum}</span>
                <span className="hb-day-chip__month">{monthStr}</span>
              </div>
              <div className="hb-day-chip__body">
                <p className="hb-day-chip__label">{day.label || formatDate(day.date)}</p>
                <p className="hb-day-chip__count">
                  {actCount === 0 ? 'No activities' : `${actCount} activit${actCount === 1 ? 'y' : 'ies'}`}
                </p>
                {tags.length > 0 && (
                  <div className="hb-day-chip__tags">
                    {tags.map((tag) => (
                      <span
                        key={tag.id}
                        className="hb-day-chip__tag"
                        style={{ background: tag.color ?? '#64748b' }}
                      >
                        {tag.emoji && <span>{tag.emoji}</span>}
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Right: Timeline ── */}
      <div className="hb-timeline">
        {!selectedDay ? (
          <div className="hb-empty" style={{ maxWidth: 400, margin: '40px auto' }}>
            <div className="hb-empty__icon"><Sun size={24} /></div>
            <p className="hb-empty__title">No day selected</p>
            <p className="hb-empty__hint">Add a day on the left to start planning</p>
          </div>
        ) : (
          <>
            {/* Day head */}
            {editingDayId === selectedDay.id ? (
              <div style={{ marginBottom: 20, padding: '16px', border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)' }}>
                <div className="hb-field" style={{ marginBottom: 12 }}>
                  <label className="hb-field__label">Day label</label>
                  <input
                    value={editDayLabel}
                    onChange={(e) => setEditDayLabel(e.target.value)}
                    placeholder={`e.g. Travel Day — default: ${formatDate(selectedDay.date)}`}
                    className="hb-input"
                    autoFocus
                  />
                </div>
                <div className="hb-field" style={{ marginBottom: 12 }}>
                  <label className="hb-field__label">Day notes</label>
                  <textarea
                    value={editDayNotes}
                    onChange={(e) => setEditDayNotes(e.target.value)}
                    placeholder="Optional day notes…"
                    rows={2}
                    className="hb-textarea"
                    style={{ minHeight: 60 }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="hb-btn hb-btn--outline hb-btn--sm" onClick={() => setEditingDayId(null)}>Cancel</button>
                  <button
                    className="hb-btn hb-btn--primary hb-btn--sm"
                    onClick={() => handleSaveDay(selectedDay.id)}
                    disabled={savingDayEdit}
                  >
                    {savingDayEdit ? <Loader2 size={12} className="animate-spin" /> : <><Check size={12} /> Save</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="hb-timeline__day-head">
                <div>
                  <h2
                    className="hb-timeline__day-title"
                    onDoubleClick={() => openEditDay(selectedDay)}
                    title="Double-click to edit"
                    style={{ cursor: 'text' }}
                  >
                    {selectedDay.label || formatDate(selectedDay.date, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h2>
                  <p className="hb-timeline__day-date">
                    {formatDate(selectedDay.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    {selectedDay.notes && (
                      <span style={{ marginLeft: 8, fontStyle: 'italic', opacity: 0.7 }}> — {selectedDay.notes}</span>
                    )}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="hb-btn hb-btn--ghost hb-btn--sm hb-btn--icon" title="Edit day" onClick={() => openEditDay(selectedDay)}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="hb-btn hb-btn--ghost hb-btn--sm hb-btn--icon"
                    title="Delete day"
                    onClick={() => handleDeleteDay(selectedDay.id)}
                    style={{ color: 'var(--destructive)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Day tags */}
            <DayTagRow
              day={selectedDay}
              availableTags={availableTags}
              togglingTag={togglingDayTag}
              onToggle={(tagId) => handleToggleDayTag(selectedDay.id, tagId)}
              onOpenTagManager={() => setShowTagManager(true)}
            />

            {/* Activities */}
            {localActivities.length === 0 && (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>
                No activities yet — add one below
              </div>
            )}

            {localActivities.map((activity, i) => {
              const hp = activitySortable.handleProps(i)
              return (
                <div key={activity.id} {...activitySortable.itemProps(i)} style={{ position: 'relative' }}>
                  <span
                    className="hb-activity__handle"
                    {...hp}
                    onDragStart={(e) => {
                      hp.onDragStart?.(e as unknown as React.DragEvent<HTMLElement>)
                      try {
                        e.dataTransfer.setData('text/x-trip-activity', JSON.stringify({
                          activityId: activity.id,
                          sourceDayId: selectedDay.id,
                        }))
                      } catch { /* ignore */ }
                      setIsDraggingActivity(true)
                    }}
                    onDragEnd={(e) => {
                      hp.onDragEnd?.(e as unknown as React.DragEvent<HTMLElement>)
                      setIsDraggingActivity(false)
                      setDraggingOverDayId(null)
                    }}
                    title="Drag to reorder · drag to another day to move"
                  >
                    <GripVertical size={14} />
                  </span>
                  <ActivityCard
                    activity={activity}
                    onEdit={() => setEditDialog({ dayId: selectedDay.id, dayDate: selectedDay.date, activity })}
                    onDelete={() => handleDeleteActivity(selectedDay.id, activity.id)}
                  />
                </div>
              )
            })}

            {/* Quick-add row */}
            <ActivityForm
              dayId={selectedDay.id}
              tripId={tripId}
              onCreated={(activity) => {
                onDaysUpdated(days.map((d) =>
                  d.id === selectedDay.id
                    ? { ...d, activities: [...d.activities, activity] }
                    : d,
                ))
                setEditDialog({ dayId: selectedDay.id, dayDate: selectedDay.date, activity })
              }}
            />

            {/* Day attachments */}
            <div style={{ marginTop: 24 }}>
              <TripAttachmentsSection tripId={tripId} dayId={selectedDay.id} label="Day Attachments" />
            </div>
          </>
        )}
      </div>

      {/* Activity edit drawer */}
      {editDialog && (
        <ActivityEditDialog
          activity={editDialog.activity}
          dayDate={editDialog.dayDate}
          tripId={tripId}
          dayId={editDialog.dayId}
          onSave={(data) => handleSaveActivity(editDialog.dayId, editDialog.activity.id, data)}
          onTagsChanged={(tags) => handleActivityTagsChanged(editDialog.dayId, editDialog.activity.id, tags)}
          onClose={() => setEditDialog(null)}
          onOpenTagManager={() => { setEditDialog(null); setShowTagManager(true) }}
        />
      )}

      {/* Tag Manager */}
      <TripTagsManager
        open={showTagManager}
        onClose={() => { setShowTagManager(false); refreshTags() }}
      />
    </div>
  )
}

// ── Day tag row ────────────────────────────────────────────────────────────────

function DayTagRow({
  day,
  availableTags,
  togglingTag,
  onToggle,
  onOpenTagManager,
}: {
  day: TripDayShape
  availableTags: TripTagShape[]
  togglingTag: string | null
  onToggle: (tagId: string) => void
  onOpenTagManager: () => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const dayTagIds = new Set((day.tags ?? []).map((t) => t.id))

  useEffect(() => {
    if (!showPicker) return
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPicker])

  return (
    <div className="hb-tag-row">
      {(day.tags ?? []).map((tag) => (
        <span
          key={tag.id}
          className="hb-chip hb-chip--filled"
          style={{ background: tag.color ?? '#64748b' }}
        >
          {tag.emoji && <span>{tag.emoji}</span>}
          {tag.name}
        </span>
      ))}
      {/* Tag picker */}
      <div style={{ position: 'relative' }}>
        <button
          className="hb-chip hb-chip--ghost"
          onClick={() => setShowPicker((v) => !v)}
          title="Add / remove day tags"
        >
          <Tag size={10} />
          <Plus size={9} />
        </button>
        {showPicker && (
          <div ref={pickerRef} className="hb-popover" style={{ top: 'calc(100% + 6px)', left: 0 }}>
            <div className="hb-popover__head">
              <span>Day Tags</span>
              <button type="button" onClick={() => { setShowPicker(false); onOpenTagManager() }}>
                <Settings2 size={12} />Manage
              </button>
            </div>
            {availableTags.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', padding: '6px 8px', margin: 0 }}>
                No tags yet —{' '}
                <button type="button" onClick={() => { setShowPicker(false); onOpenTagManager() }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit', fontSize: 'inherit', padding: 0 }}>
                  create some
                </button>
              </p>
            ) : (
              availableTags.map((tag) => {
                const isActive = dayTagIds.has(tag.id)
                const toggling = togglingTag === tag.id
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className="hb-popover__row"
                    aria-pressed={isActive}
                    onClick={() => onToggle(tag.id)}
                    disabled={toggling}
                  >
                    {toggling
                      ? <Loader2 size={12} className="animate-spin" />
                      : <span className="hb-chip__dot" style={{ background: tag.color ?? '#64748b', width: 10, height: 10 }} />}
                    <span style={{ flex: 1 }}>
                      {tag.emoji && <span style={{ marginRight: 4 }}>{tag.emoji}</span>}
                      {tag.name}
                    </span>
                    {isActive && <Check size={13} style={{ color: 'var(--primary)' }} />}
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Activity card (timeline row) ───────────────────────────────────────────────

function ActivityCard({
  activity,
  onEdit,
  onDelete,
}: {
  activity: TripActivityShape
  onEdit: () => void
  onDelete: () => void
}) {
  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const noteText = activity.notes
    ? (typeof window !== 'undefined'
        ? new DOMParser().parseFromString(activity.notes, 'text/html').body.textContent?.trim() ?? ''
        : activity.notes.replace(/<[^>]+>/g, '').trim())
    : ''

  return (
    <div className="hb-activity" onDoubleClick={onEdit} title="Double-click to edit">
      {/* Time column */}
      <div className="hb-activity__time">
        {activity.startTime ? (
          <>
            <span className="hb-activity__time-start">{formatTime(activity.startTime)}</span>
            {activity.endTime && (
              <span className="hb-activity__time-end">{formatTime(activity.endTime)}</span>
            )}
          </>
        ) : (
          <span className="hb-activity__time--empty">
            <Clock size={12} />
          </span>
        )}
      </div>

      {/* Main content */}
      <div className="hb-activity__main">
        <div className="hb-activity__top">
          <CategoryBadge category={activity.category} size={32} />
          <h4 className="hb-activity__title">{activity.title}</h4>
        </div>
        {activity.location && (
          <p className="hb-activity__location">
            <MapPin size={12} aria-hidden />
            {activity.location}
          </p>
        )}
        {noteText && (
          <p className="hb-activity__note-text" style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '4px 0 0', lineHeight: 1.5 }}>
            <StickyNote size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-top' }} />
            {noteText}
          </p>
        )}
        {(activity.tags ?? []).length > 0 && (
          <div className="hb-activity__tags">
            {(activity.tags ?? []).map((tag) => (
              <span
                key={tag.id}
                className="hb-chip hb-chip--filled"
                style={{ background: tag.color ?? '#64748b', fontSize: 10, height: 18 }}
              >
                {tag.emoji && <span>{tag.emoji}</span>}
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions — shown on hover */}
      <div className="hb-activity__quick">
        <button
          className="hb-quick--edit"
          title="Edit"
          onClick={(e) => { e.stopPropagation(); onEdit() }}
        >
          <Pencil size={13} />
        </button>
        <button
          className="hb-quick--danger"
          title="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Quick-add form ─────────────────────────────────────────────────────────────

function ActivityForm({
  dayId,
  tripId,
  onCreated,
}: {
  dayId: string
  tripId: string
  onCreated: (activity: TripActivityShape) => void
}) {
  const [title, setTitle]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/trips/${tripId}/days/${dayId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      })
      if (res.ok) {
        const activity = await res.json()
        onCreated({ ...activity, tags: activity.tags ?? [] })
        setTitle('')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="hb-quickadd">
      <div className="hb-quickadd__icon">
        <Plus size={16} />
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add activity — press Enter, then fill in details…"
        disabled={saving}
      />
      <button
        type="submit"
        disabled={saving || !title.trim()}
        className="hb-btn hb-btn--primary hb-btn--sm hb-btn--icon"
        style={{ opacity: saving || !title.trim() ? 0.5 : 1 }}
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
      </button>
    </form>
  )
}

// Keep CollapsedDayTags for backward compat if anything imports it
export { }
