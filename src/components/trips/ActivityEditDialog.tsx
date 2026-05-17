'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X, Loader2, MapPin, Clock, Tag, FileText,
  Sun, UtensilsCrossed, Car, Hotel, Ticket, Settings2,
} from 'lucide-react'
import {
  Dialog,
  WideDialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { NoteEditorToolbar } from '@/components/notes/NoteEditorToolbar'
import type { TripActivityShape, TripTagShape } from '@/types'

// ── Category config ────────────────────────────────────────────────────────

export const CATEGORIES = [
  { value: 'sightseeing',    label: 'Sightseeing',    icon: Sun,             color: 'text-amber-500  bg-amber-50  dark:bg-amber-950/30'  },
  { value: 'meal',           label: 'Meal',           icon: UtensilsCrossed, color: 'text-orange-500 bg-orange-50 dark:bg-orange-950/30' },
  { value: 'transport',      label: 'Transport',      icon: Car,             color: 'text-blue-500   bg-blue-50   dark:bg-blue-950/30'   },
  { value: 'accommodation',  label: 'Accommodation',  icon: Hotel,           color: 'text-purple-500 bg-purple-50 dark:bg-purple-950/30' },
  { value: 'activity',       label: 'Activity',       icon: Ticket,          color: 'text-green-500  bg-green-50  dark:bg-green-950/30'  },
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
  dayDate: string
  tripId: string
  dayId: string
  onSave: (data: {
    title: string
    location: string | null
    startTime: string | null
    endTime: string | null
    notes: string | null
    category: string | null
  }) => Promise<void>
  onTagsChanged: (tags: TripActivityShape['tags']) => void
  onClose: () => void
  onOpenTagManager: () => void
}

// ── Component ──────────────────────────────────────────────────────────────

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
  const [location, setLocation]   = useState(activity.location ?? '')
  const [category, setCategory]   = useState(activity.category ?? '')
  const [startTime, setStartTime] = useState(timeFromIso(activity.startTime))
  const [endTime, setEndTime]     = useState(timeFromIso(activity.endTime))
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Tags
  const [availableTags, setAvailableTags] = useState<TripTagShape[]>([])
  const [activityTags, setActivityTags]   = useState<TripActivityShape['tags']>(activity.tags ?? [])
  const [togglingTag, setTogglingTag]     = useState<string | null>(null)

  // Rich text editor
  const editorRef              = useRef<HTMLDivElement>(null)
  const textColorInputRef      = useRef<HTMLInputElement>(null)
  const highlightColorInputRef = useRef<HTMLInputElement>(null)
  const savedRangeRef          = useRef<Range | null>(null)
  const savedEditableRef       = useRef<HTMLDivElement | null>(null)
  const [textColor, setTextColor]           = useState('#e11d48')
  const [highlightColor, setHighlightColor] = useState('#fef08a')
  const notesInitialisedRef = useRef(false)

  // Initialise editor content exactly once on mount — do NOT focus the editor.
  // The title field is the natural first focus target (user just quick-added
  // the activity and may want to edit the title). Stealing focus to the editor
  // caused keystrokes to be swallowed into the notes div instead of the title.
  useEffect(() => {
    if (editorRef.current && !notesInitialisedRef.current) {
      editorRef.current.innerHTML = activity.notes ?? ''
      notesInitialisedRef.current = true
    }
    // Load available tags in parallel
    fetch('/api/trips/tags')
      .then((r) => r.json())
      .then((data: TripTagShape[]) => setAvailableTags(data))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagId }),
        },
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <WideDialogContent showCloseButton={false}>

        {/* Header */}
        <DialogHeader className="flex-row items-center justify-between px-5 py-4 border-b border-border shrink-0 gap-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Edit Activity
          </DialogTitle>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* Fields */}
          <div className="px-5 pt-4 pb-3 space-y-3">
            {error && (
              <div className="p-2.5 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
            )}

            {/* Title — natural first focus target */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editorRef.current?.focus() } }}
                disabled={saving}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="What are you doing?"
              />
            </div>

            {/* Location + Category */}
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

            {/* Times */}
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

            {/* Tags */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Tags
                </label>
                <button
                  type="button"
                  onClick={onOpenTagManager}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <Settings2 className="h-3 w-3" />
                  Manage tags
                </button>
              </div>
              {availableTags.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No tags yet —{' '}
                  <button type="button" onClick={onOpenTagManager} className="underline hover:text-foreground">
                    create some in Tag Manager
                  </button>
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => {
                    const isActive = activityTags.some((t) => t.id === tag.id)
                    const toggling = togglingTag === tag.id
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => handleToggleTag(tag.id)}
                        disabled={toggling || saving}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all disabled:opacity-60"
                        style={{
                          backgroundColor: isActive ? (tag.color ?? '#64748b') : 'transparent',
                          color: isActive ? 'white' : (tag.color ?? '#64748b'),
                          border: `1.5px solid ${tag.color ?? '#64748b'}`,
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
          </div>

          {/* Rich text notes */}
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

        {/* Footer */}
        <DialogFooter className="px-5 py-3 shrink-0">
          <Button variant="outline" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !title.trim()}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Save
          </Button>
        </DialogFooter>

      </WideDialogContent>
    </Dialog>
  )
}
