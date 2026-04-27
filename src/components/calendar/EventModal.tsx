'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import type { CalendarEvent } from '@/types'

interface CategoryOption {
  id: string
  name: string
  color: string | null
}

const REPEAT_OPTIONS = [
  { value: '', label: 'Does not repeat' },
  { value: 'FREQ=DAILY', label: 'Daily' },
  { value: 'FREQ=WEEKLY', label: 'Weekly' },
  { value: 'FREQ=WEEKLY;INTERVAL=2', label: 'Fortnightly' },
  { value: 'FREQ=MONTHLY', label: 'Monthly' },
  { value: 'FREQ=MONTHLY;INTERVAL=3', label: 'Quarterly' },
  { value: 'FREQ=MONTHLY;INTERVAL=6', label: 'Bi-annually' },
  { value: 'FREQ=YEARLY', label: 'Yearly' },
]

interface EventModalProps {
  event?: CalendarEvent | null
  defaultDate?: Date
  open: boolean
  onClose: () => void
  onSave: () => void
}

export function EventModal({ event, defaultDate, open, onClose, onSave }: EventModalProps) {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [isAllDay, setIsAllDay] = useState(false)
  const [category, setCategory] = useState('Other')
  const [color, setColor] = useState('')
  const [description, setDescription] = useState('')
  const [isPersonal, setIsPersonal] = useState(false)
  const [recurrenceRule, setRecurrenceRule] = useState('')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')


  // Load event categories when modal opens
  useEffect(() => {
    if (open) {
      fetch('/api/event-categories')
        .then(res => res.json())
        .then(data => setCategories(data))
        .catch(() => {})
    }
  }, [open])

  useEffect(() => {
    if (event) {
      setTitle(event.title)
      setStart(format(new Date(event.start), "yyyy-MM-dd'T'HH:mm"))
      setEnd(format(new Date(event.end), "yyyy-MM-dd'T'HH:mm"))
      setIsAllDay(event.isAllDay)
      setCategory(event.category ?? 'Other')
      setColor(event.color ?? '')
      setDescription(event.description ?? '')
      setIsPersonal(event.isPersonal ?? false)
      setRecurrenceRule(event.recurrenceRule ?? '')
      setRecurrenceEndDate(event.recurrenceEndDate ? format(new Date(event.recurrenceEndDate), "yyyy-MM-dd") : '')
    } else {
      const d = defaultDate ?? new Date()
      setTitle('')
      setStart(format(d, "yyyy-MM-dd'T'09:00"))
      setEnd(format(d, "yyyy-MM-dd'T'10:00"))
      setIsAllDay(false)
      setCategory('Other')
      setColor('')
      setDescription('')
      setIsPersonal(false)
      setRecurrenceRule('')
      setRecurrenceEndDate('')
    }
    setError('')
  }, [event, defaultDate, open])


  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    setLoading(true)
    setError('')

    try {
      // If this is a recurring instance, save to the original event (seriesId)
      const eventId = getEventId()
      const method = event ? 'PUT' : 'POST'
      const url = event ? `/api/events/${eventId}` : '/api/events'

      const body: Record<string, unknown> = {
        title,
        description,
        category,
        color: color || null,
        isPersonal,
      }

      // Only send start/end dates if this is NOT a recurring instance
      // (recurring instances are virtual - editing them should update the original event's metadata, not its dates)
      const isRecurringInstance = !!(event && (event as unknown as Record<string, unknown>).seriesId)
      if (!isRecurringInstance) {
        const startDate = isAllDay ? new Date(start.split('T')[0]).toISOString() : new Date(start).toISOString()
        const endDate = isAllDay ? new Date(end.split('T')[0]).toISOString() : new Date(end).toISOString()
        body.start = startDate
        body.end = endDate
        body.isAllDay = isAllDay
      }

      // Only send recurrence fields if a rule is selected
      if (recurrenceRule) {
        body.recurrenceRule = recurrenceRule
        body.isRecurring = true
        if (recurrenceEndDate) {
          body.recurrenceEndDate = new Date(recurrenceEndDate + 'T23:59:59').toISOString()
        }
      } else {
        body.recurrenceRule = null
        body.isRecurring = false
        body.recurrenceEndDate = null
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      setLoading(false)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to save event')
      } else {
        onSave()
        onClose()
      }
    } catch (err) {
      setLoading(false)
      setError('Network error: Could not save event')
      console.error('Event save error:', err)
    }
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteAll, setDeleteAll] = useState(false)

  // Get the actual event ID - if this is a recurring instance, use the seriesId
  function getEventId() {
    if (!event) return null
    const seriesId = (event as unknown as Record<string, unknown>).seriesId as string | undefined
    return seriesId || event.id
  }

  // Check if this event is part of a recurring series
  function isRecurringEvent() {
    if (!event) return false
    const seriesId = (event as unknown as Record<string, unknown>).seriesId as string | undefined
    // The original recurring event has recurrenceRule set
    // Recurring instances have seriesId set
    return !!(event.recurrenceRule || seriesId)
  }

  async function handleDelete() {
    if (!event) return
    setLoading(true)

    try {
      if (isRecurringEvent() && !showDeleteConfirm) {
        // Show confirmation dialog first
        setShowDeleteConfirm(true)
        setLoading(false)
        return
      }

      const eventId = getEventId()
      if (!eventId) return

      const url = deleteAll && isRecurringEvent()
        ? `/api/events/${eventId}?all=true`
        : `/api/events/${eventId}`
      const res = await fetch(url, { method: 'DELETE' })
      setLoading(false)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to delete event')
        return
      }
      setShowDeleteConfirm(false)
      setDeleteAll(false)
      onSave()
      onClose()
    } catch (err) {
      setLoading(false)
      setError('Network error: Could not delete event')
      console.error('Event delete error:', err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {showDeleteConfirm ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete Recurring Event</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                This event is part of a recurring series. What would you like to delete?
              </p>
              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-accent">
                  <input
                    type="radio"
                    name="deleteOption"
                    checked={!deleteAll}
                    onChange={() => setDeleteAll(false)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-sm">Delete this event only</p>
                    <p className="text-xs text-muted-foreground">Remove just this single occurrence. Other events in the series will remain.</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-accent">
                  <input
                    type="radio"
                    name="deleteOption"
                    checked={deleteAll}
                    onChange={() => setDeleteAll(true)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-sm">Delete all events in the series</p>
                    <p className="text-xs text-muted-foreground">Remove this event and all future occurrences.</p>
                  </div>
                </label>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteAll(false) }}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                {loading ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{event ? 'Edit Event' : 'New Event'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="allday" checked={isAllDay}
                  onChange={e => setIsAllDay(e.target.checked)} className="rounded" />
                <Label htmlFor="allday">All day</Label>
              </div>
              {!isAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Start</Label>
                    <Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>End</Label>
                    <Input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} />
                  </div>
                </div>
              )}
              {isAllDay && (
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={start.split('T')[0]} onChange={e => setStart(e.target.value + 'T00:00')} />
                </div>
              )}
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={category} onValueChange={v => setCategory(v ?? 'Other')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.name}>
                        <span className="flex items-center gap-2">
                          {cat.color && (
                            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: cat.color }} />
                          )}
                          {cat.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Color (optional)</Label>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {['#ef4444', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#6b7280'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setColor('')}
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${color === '' ? 'border-foreground' : 'border-border'}`}
                      title="Default color"
                    >
                      <span className="text-xs text-muted-foreground">D</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      value={color || '#6366f1'}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      placeholder="#hex or leave empty for default"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <span className="text-sm font-medium">Visibility</span>
                <div className="flex rounded-md border border-border overflow-hidden text-sm">
                  <button
                    type="button"
                    onClick={() => setIsPersonal(false)}
                    className={`px-3 py-1 transition-colors ${!isPersonal ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                  >
                    Family
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPersonal(true)}
                    className={`px-3 py-1 transition-colors ${isPersonal ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                  >
                    Personal
                  </button>
                </div>
              </div>
              {/* Recurrence / Repeat */}
              <div className="space-y-1">
                <Label>Repeat</Label>
                <Select value={recurrenceRule} onValueChange={v => setRecurrenceRule(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Does not repeat" /></SelectTrigger>
                  <SelectContent>
                    {REPEAT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {recurrenceRule && (
                <div className="space-y-1">
                  <Label>End repeat (optional)</Label>
                  <Input
                    type="date"
                    value={recurrenceEndDate}
                    onChange={e => setRecurrenceEndDate(e.target.value)}
                    placeholder="No end date"
                  />
                  <p className="text-xs text-muted-foreground">Leave empty to repeat indefinitely</p>
                </div>
              )}
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter className="gap-2">
              {event && (
                <Button variant="destructive" onClick={handleDelete} disabled={loading}>Delete</Button>
              )}
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
