'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X, Loader2, MapPin, Clock, Tag, FileText,
  Sun, UtensilsCrossed, Car, Hotel, Ticket,
} from 'lucide-react'
import { NoteEditorToolbar } from '@/components/notes/NoteEditorToolbar'
import type { TripActivityShape } from '@/types'

// ── Category config ────────────────────────────────────────────────────────

export const CATEGORIES = [
  { value: 'sightseeing',    label: 'Sightseeing',    icon: Sun,            color: 'text-amber-500  bg-amber-50  dark:bg-amber-950/30'  },
  { value: 'meal',           label: 'Meal',           icon: UtensilsCrossed, color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/30' },
  { value: 'transport',      label: 'Transport',      icon: Car,            color: 'text-blue-500   bg-blue-50   dark:bg-blue-950/30'   },
  { value: 'accommodation',  label: 'Accommodation',  icon: Hotel,          color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30' },
  { value: 'activity',       label: 'Activity',       icon: Ticket,         color: 'text-green-500  bg-green-50  dark:bg-green-950/30'  },
]

export function getCategoryMeta(value: string | null) {
  return CATEGORIES.find((c) => c.value === value) ?? null
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Props ──────────────────────────────────────────────────────────────────

interface ActivityEditDialogProps {
  activity: TripActivityShape
  dayDate: string           // ISO date string for building datetime values
  onSave: (data: {
    title: string
    location: string | null
    startTime: string | null
    endTime: string | null
    notes: string | null
    category: string | null
  }) => Promise<void>
  onClose: () => void
}

// ── Component ──────────────────────────────────────────────────────────────

export function ActivityEditDialog({
  activity,
  dayDate,
  onSave,
  onClose,
}: ActivityEditDialogProps) {
  const [title, setTitle]         = useState(activity.title)
  const [location, setLocation]   = useState(activity.location ?? '')
  const [category, setCategory]   = useState(activity.category ?? '')
  const [startTime, setStartTime] = useState(timeFromIso(activity.startTime))
  const [endTime, setEndTime]     = useState(timeFromIso(activity.endTime))
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Rich text editor
  const editorRef              = useRef<HTMLDivElement>(null)
  const textColorInputRef      = useRef<HTMLInputElement>(null)
  const highlightColorInputRef = useRef<HTMLInputElement>(null)
  const savedRangeRef          = useRef<Range | null>(null)
  const savedEditableRef       = useRef<HTMLDivElement | null>(null)
  const [textColor, setTextColor]           = useState('#e11d48')
  const [highlightColor, setHighlightColor] = useState('#fef08a')

  // Seed editor content once on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = activity.notes ?? ''
    }
  }, [activity.notes])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
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
      savedRangeRef.current      = sel.getRangeAt(0).cloneRange()
      savedEditableRef.current   = editorRef.current
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
    setTextColor(color)
    restoreSelection()
    document.execCommand('foreColor', false, color)
    editorRef.current?.focus()
  }

  const applyHighlightColor = (color: string) => {
    setHighlightColor(color)
    restoreSelection()
    document.execCommand('hiliteColor', false, color)
    editorRef.current?.focus()
  }

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({
        title:     title.trim(),
        location:  location.trim() || null,
        startTime: buildIsoDateTime(dayDate, startTime),
        endTime:   buildIsoDateTime(dayDate, endTime),
        notes:     editorRef.current?.innerHTML?.trim() || null,
        category:  category || null,
      })
      onClose()
    } catch {
      setError('Failed to save — please try again')
      setSaving(false)
    }
  }

  const selectedCat = getCategoryMeta(category)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Edit Activity</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Fields section */}
          <div className="px-5 pt-4 pb-3 space-y-3">
            {error && (
              <div className="p-2.5 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
            )}

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Title <span className="text-destructive">*</span></label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                disabled={saving}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="What are you doing?"
              />
            </div>

            {/* Location + Category row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Location
                </label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={saving}
                  placeholder="e.g. Eiffel Tower"
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Type
                </label>
                <div className="flex items-center gap-2">
                  {selectedCat && (
                    <span className={`shrink-0 p-1.5 rounded-md ${selectedCat.color}`}>
                      <selectedCat.icon className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={saving}
                    className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">None</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Time row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Start time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> End time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Rich text notes section */}
          <div className="px-5 pb-4">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes</label>
            <div className="rounded-md border border-input overflow-hidden">
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
                ref={editorRef}
                contentEditable={!saving}
                suppressContentEditableWarning
                data-placeholder="Add notes, links, tips, booking references…"
                className="min-h-[140px] max-h-[260px] overflow-y-auto p-3 text-sm outline-none focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 prose prose-sm max-w-none"
              />
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0 bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium border border-input hover:bg-accent disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
