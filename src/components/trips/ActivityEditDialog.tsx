'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X, Loader2, MapPin, Clock, Tag, FileText, Settings2,
  Sun, UtensilsCrossed, Car, Hotel, Ticket,
} from 'lucide-react'
import { NoteEditorToolbar } from '@/components/notes/NoteEditorToolbar'
import { LocationAutocompleteInput } from '@/components/trips/LocationAutocompleteInput'
import type { TripActivityShape, TripTagShape } from '@/types'

// ── Category config ────────────────────────────────────────────────────────────

export const CATEGORIES = [
  { value: 'sightseeing',   label: 'Sightseeing',   icon: Sun,             color: 'text-amber-500  bg-amber-50  dark:bg-amber-950/30',  cssClass: 'hb-cat-sightseeing' },
  { value: 'meal',          label: 'Meal',           icon: UtensilsCrossed, color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/30', cssClass: 'hb-cat-meal' },
  { value: 'transport',     label: 'Transport',      icon: Car,             color: 'text-blue-500   bg-blue-50   dark:bg-blue-950/30',   cssClass: 'hb-cat-transport' },
  { value: 'accommodation', label: 'Stay',           icon: Hotel,           color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30', cssClass: 'hb-cat-stay' },
  { value: 'activity',      label: 'Activity',       icon: Ticket,          color: 'text-green-500  bg-green-50  dark:bg-green-950/30',  cssClass: 'hb-cat-activity-c' },
]

export function getCategoryMeta(value: string | null) {
  return CATEGORIES.find((c) => c.value === value) ?? null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeFromIso(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return '' }
}

function buildIsoDateTime(dayDate: string, timeStr: string): string | null {
  if (!timeStr) return null
  try {
    const [h, m] = timeStr.split(':').map(Number)
    const base = new Date(dayDate)
    if (isNaN(base.getTime())) return null
    base.setHours(h, m, 0, 0)
    return base.toISOString()
  } catch { return null }
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface ActivityEditDialogProps {
  activity: TripActivityShape
  dayDate: string
  tripId: string
  dayId: string
  onSave: (data: {
    title: string
    location: string | null
    locationLat: number | null
    locationLng: number | null
    startTime: string | null
    endTime: string | null
    notes: string | null
    category: string | null
  }) => Promise<void>
  onTagsChanged: (tags: TripActivityShape['tags']) => void
  onClose: () => void
  onOpenTagManager: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ActivityEditDialog({
  activity,
  dayDate,
  tripId,
  dayId,
  onSave,
  onTagsChanged,
  onClose,
  onOpenTagManager,
}: ActivityEditDialogProps) {
  const [title, setTitle]         = useState(activity.title)
  const [location, setLocation]       = useState(activity.location ?? '')
  const [locationLat, setLocationLat] = useState<number | null>(activity.locationLat ?? null)
  const [locationLng, setLocationLng] = useState<number | null>(activity.locationLng ?? null)
  const [category, setCategory]   = useState(activity.category ?? '')
  const [startTime, setStartTime] = useState(timeFromIso(activity.startTime))
  const [endTime, setEndTime]     = useState(timeFromIso(activity.endTime))
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Tags
  const [availableTags, setAvailableTags] = useState<TripTagShape[]>([])
  const [activityTags, setActivityTags]   = useState<TripActivityShape['tags']>(activity.tags ?? [])
  const [togglingTag, setTogglingTag]     = useState<string | null>(null)

  // Rich text editor refs
  const editorRef              = useRef<HTMLDivElement>(null)
  const textColorInputRef      = useRef<HTMLInputElement>(null)
  const highlightColorInputRef = useRef<HTMLInputElement>(null)
  const savedRangeRef          = useRef<Range | null>(null)
  const savedEditableRef       = useRef<HTMLDivElement | null>(null)
  const [textColor, setTextColor]           = useState('#e11d48')
  const [highlightColor, setHighlightColor] = useState('#fef08a')

  const editorCallbackRef = useCallback((el: HTMLDivElement | null) => {
    editorRef.current = el
    if (el) el.innerHTML = activity.notes ?? ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load available tags on mount
  useEffect(() => {
    fetch('/api/trips/tags')
      .then((r) => r.json())
      .then((data: TripTagShape[]) => setAvailableTags(data))
      .catch(() => {})
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
  }, [])

  const insertLink = () => {
    const url = prompt('Enter URL:', 'https://')
    if (url) exec('createLink', url)
  }
  const insertImage = () => {
    const url = prompt('Enter image URL:', 'https://')
    if (url) exec('insertImage', url)
  }
  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current    = sel.getRangeAt(0).cloneRange()
      savedEditableRef.current = editorRef.current
    }
  }
  const restoreSelection = () => {
    savedEditableRef.current?.focus()
    const sel = window.getSelection()
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
  }
  const applyTextColor = (color: string) => {
    setTextColor(color); restoreSelection()
    document.execCommand('foreColor', false, color)
    editorRef.current?.focus()
  }
  const applyHighlightColor = (color: string) => {
    setHighlightColor(color); restoreSelection()
    document.execCommand('hiliteColor', false, color)
    editorRef.current?.focus()
  }

  async function handleToggleTag(tagId: string) {
    setTogglingTag(tagId)
    try {
      const res = await fetch(
        `/api/trips/${tripId}/days/${dayId}/activities/${activity.id}/tags`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tagId }) },
      )
      if (res.ok) {
        const updatedTags = await res.json()
        setActivityTags(updatedTags)
        onTagsChanged(updatedTags)
      }
    } finally {
      setTogglingTag(null)
    }
  }

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({
        title:       title.trim(),
        location:    location.trim() || null,
        locationLat: location.trim() ? locationLat : null,
        locationLng: location.trim() ? locationLng : null,
        startTime:   buildIsoDateTime(dayDate, startTime),
        endTime:     buildIsoDateTime(dayDate, endTime),
        notes:       editorRef.current?.innerHTML?.trim() || null,
        category:    category || null,
      })
      onClose()
    } catch {
      setError('Failed to save — please try again')
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="hb-drawer-backdrop" onClick={onClose} role="presentation" />

      {/* Drawer panel */}
      <aside className="hb-drawer" role="dialog" aria-modal="true" aria-label="Edit Activity">
        {/* Header */}
        <div className="hb-drawer__head">
          <div>
            <p className="hb-drawer__eyebrow">Activity</p>
          </div>
          <div className="flex items-center gap-2">
            <FileText size={14} style={{ color: 'var(--muted-foreground)' }} aria-hidden />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Edit Activity</span>
            <button className="hb-drawer__close" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="hb-drawer__body">
          {error && (
            <div className="p-3 rounded-lg" style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', color: 'var(--destructive)', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Title */}
          <div className="hb-field">
            <label className="hb-field__label">Title *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editorRef.current?.focus() } }}
              disabled={saving}
              placeholder="What are you doing?"
              className="hb-input hb-input--title"
            />
          </div>

          {/* Location */}
          <div className="hb-field">
            <label className="hb-field__label"><MapPin size={12} /> Location</label>
            <LocationAutocompleteInput
              value={location}
              onChange={(text, lat, lng) => {
                setLocation(text)
                setLocationLat(lat ?? null)
                setLocationLng(lng ?? null)
              }}
              disabled={saving}
              placeholder="e.g. Eiffel Tower, Paris"
            />
          </div>

          {/* Category visual grid */}
          <div className="hb-field">
            <label className="hb-field__label"><Tag size={12} /> Type</label>
            <div className="hb-cat-grid">
              {CATEGORIES.map((c) => {
                const active = category === c.value
                const Icon = c.icon
                return (
                  <button
                    key={c.value}
                    type="button"
                    className={`hb-cat-tile ${c.cssClass}`}
                    aria-pressed={active}
                    onClick={() => setCategory(active ? '' : c.value)}
                    disabled={saving}
                  >
                    <span className="hb-cat-tile__icon"><Icon size={16} aria-hidden /></span>
                    <span className="hb-cat-tile__label">{c.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Time range */}
          <div className="hb-field">
            <label className="hb-field__label"><Clock size={12} /> Time</label>
            <div className="hb-time-range">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={saving}
                className="hb-input"
                aria-label="Start time"
              />
              <span className="hb-time-range__sep">–</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={saving}
                className="hb-input"
                aria-label="End time"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="hb-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="hb-field__label"><Tag size={12} /> Tags</label>
              <button
                type="button"
                onClick={onOpenTagManager}
                style={{ fontSize: 11, color: 'var(--muted-foreground)', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <Settings2 size={11} />
                Manage
              </button>
            </div>
            {availableTags.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', fontStyle: 'italic', margin: 0 }}>
                No tags yet —{' '}
                <button type="button" onClick={onOpenTagManager} style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit', fontSize: 'inherit', fontStyle: 'italic', padding: 0 }}>
                  create some in Tag Manager
                </button>
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableTags.map((tag) => {
                  const isActive  = activityTags.some((t) => t.id === tag.id)
                  const toggling  = togglingTag === tag.id
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleToggleTag(tag.id)}
                      disabled={toggling || saving}
                      className={`hb-chip ${isActive ? 'hb-chip--filled' : ''}`}
                      style={{
                        background: isActive ? (tag.color ?? '#64748b') : undefined,
                        borderColor: isActive ? 'transparent' : `color-mix(in srgb, ${tag.color ?? '#64748b'} 60%, transparent)`,
                        color: isActive ? 'white' : (tag.color ?? '#64748b'),
                        opacity: toggling ? 0.6 : 1,
                      }}
                    >
                      {tag.emoji && <span>{tag.emoji}</span>}
                      {tag.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Rich text notes */}
          <div className="hb-field">
            <label className="hb-field__label"><FileText size={12} /> Notes</label>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <NoteEditorToolbar
                exec={exec}
                insertLink={insertLink}
                insertImage={insertImage}
                saveSelection={saveSelection}
                applyTextColor={applyTextColor}
                applyHighlightColor={applyHighlightColor}
                textColorInputRef={textColorInputRef}
                highlightColorInputRef={highlightColorInputRef}
                textColor={textColor}
                highlightColor={highlightColor}
                isLoading={saving}
              />
              <div
                ref={editorCallbackRef}
                contentEditable={!saving}
                suppressContentEditableWarning
                data-placeholder="Add notes, links, tips, booking references…"
                className="min-h-[120px] max-h-[240px] overflow-y-auto p-3 text-sm outline-none focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 prose prose-sm max-w-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="hb-drawer__foot">
          <button type="button" className="hb-btn hb-btn--outline" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="hb-btn hb-btn--primary"
            onClick={handleSave}
            disabled={saving || !title.trim()}
            style={{ opacity: saving || !title.trim() ? 0.6 : 1 }}
          >
            {saving && <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />}
            Save
          </button>
        </div>
      </aside>
    </>
  )
}
