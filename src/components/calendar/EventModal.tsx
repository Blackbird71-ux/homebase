'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CalendarEvent } from '@/types'
import { getEventId, isRecurringEvent } from '@/lib/event-helpers'
import {
  isTempEventId,
  queueEventCreate,
  queueEventUpdate,
  queueEventDelete,
  type OfflineEventOp,
} from '@/lib/calendar-offline'
import { EventAttendeePanel } from './EventAttendeePanel'
import { useFamilyTimezone } from '@/hooks/useFamilyTimezone'
import {
  toDateTimeLocalInTz,
  dateTimeLocalToUtc,
  dateStringInTz,
  localMidnightToUtc,
  endOfLocalDayUtc,
} from '@/lib/timezone'

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

const DAY_OPTIONS = [
  { label: 'Mon', value: 'MO' },
  { label: 'Tue', value: 'TU' },
  { label: 'Wed', value: 'WE' },
  { label: 'Thu', value: 'TH' },
  { label: 'Fri', value: 'FR' },
  { label: 'Sat', value: 'SA' },
  { label: 'Sun', value: 'SU' },
]

interface EventModalProps {
  event?: CalendarEvent | null
  defaultDate?: Date
  open: boolean
  currentUserId: string
  onClose: () => void
  onSave: () => Promise<void>
  /** Optimistic-display hook for offline saves — see applyOfflineEventOps. */
  onOfflineChange?: (op: OfflineEventOp) => void
}

export function EventModal({ event, defaultDate, open, currentUserId, onClose, onSave, onOfflineChange }: EventModalProps) {
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
  const [emailReminder, setEmailReminder] = useState(false)
  const [emailReminderHours, setEmailReminderHours] = useState('24')
  const [emailReminderEmails, setEmailReminderEmails] = useState('')
  const [location, setLocation] = useState('')
  const [weeklyRepeatDays, setWeeklyRepeatDays] = useState<string[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timezone = useFamilyTimezone()


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
      setStart(toDateTimeLocalInTz(new Date(event.start), timezone))
      setEnd(toDateTimeLocalInTz(new Date(event.end), timezone))
      setIsAllDay(event.isAllDay)
      setCategory(event.category ?? 'Other')
      setColor(event.color ?? '')
      setDescription(event.description ?? '')
      setIsPersonal(event.isPersonal ?? false)
      setRecurrenceRule(event.recurrenceRule ?? '')
      setRecurrenceEndDate(event.recurrenceEndDate ? dateStringInTz(new Date(event.recurrenceEndDate), timezone) : '')
      // Parse existing BYDAY days from recurrence rule
      if (event.recurrenceRule) {
        const byDayMatch = event.recurrenceRule.match(/BYDAY=([A-Z,]+)/i)
        setWeeklyRepeatDays(byDayMatch ? byDayMatch[1].split(',') : [])
      } else {
        setWeeklyRepeatDays([])
      }
      const ev = event as unknown as Record<string, unknown>
      setEmailReminder((ev.emailReminder as boolean) ?? false)
      setEmailReminderHours(String((ev.emailReminderHours as number) ?? 24))
      const extraEmails = ev.emailReminderEmails as string | null
      setEmailReminderEmails(extraEmails ? (JSON.parse(extraEmails) as string[]).join(', ') : '')
      setLocation(event.location ?? '')
    } else {
      const d = defaultDate ?? new Date()
      const dateStr = dateStringInTz(d, timezone)
      setTitle('')
      setStart(`${dateStr}T09:00`)
      setEnd(`${dateStr}T10:00`)
      setIsAllDay(false)
      setCategory('Other')
      setColor('')
      setDescription('')
      setIsPersonal(false)
      setRecurrenceRule('')
      setRecurrenceEndDate('')
      setEmailReminder(false)
      setEmailReminderHours('24')
      setEmailReminderEmails('')
      setLocation('')
      setWeeklyRepeatDays([])
    }
    setError('')
  }, [event, defaultDate, open, timezone])


  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    setLoading(true)
    setError('')

    try {
      // If this is a recurring instance, save to the original event (seriesId)
      const eventId = event ? getEventId(event) : null
      const method = event ? 'PUT' : 'POST'
      const url = event ? `/api/events/${eventId}` : '/api/events'

      const body: Record<string, unknown> = {
        title,
        description,
        location: location || null,
        category,
        color: color || null,
        isPersonal,
        emailReminder,
        emailReminderHours: parseInt(emailReminderHours) || 24,
        emailReminderEmails: emailReminderEmails
          ? emailReminderEmails.split(',').map(e => e.trim()).filter(Boolean)
          : [],
      }

      // Only send start/end dates if this is NOT a recurring instance
      // (recurring instances are virtual - editing them should update the original event's metadata, not its dates)
      const isRecurringInstance = !!(event && event.seriesId)
      if (!isRecurringInstance) {
        const startDate = isAllDay ? localMidnightToUtc(start.split('T')[0], timezone).toISOString() : dateTimeLocalToUtc(start, timezone).toISOString()
        const endDate = isAllDay ? localMidnightToUtc(end.split('T')[0], timezone).toISOString() : dateTimeLocalToUtc(end, timezone).toISOString()
        body.start = startDate
        body.end = endDate
        body.isAllDay = isAllDay
      }

      // Build the final recurrence rule, appending BYDAY for weekly with day selections
      let finalRecurrenceRule = recurrenceRule
      if (recurrenceRule.startsWith('FREQ=WEEKLY') && weeklyRepeatDays.length > 0) {
        finalRecurrenceRule = recurrenceRule.replace(/;BYDAY=[A-Z,]+/i, '')
        finalRecurrenceRule += `;BYDAY=${weeklyRepeatDays.join(',')}`
      }

      // Only send recurrence fields if a rule is selected
      if (recurrenceRule) {
        body.recurrenceRule = finalRecurrenceRule
        body.isRecurring = true
        if (recurrenceEndDate) {
          body.recurrenceEndDate = endOfLocalDayUtc(recurrenceEndDate, timezone).toISOString()
        }
      } else {
        body.recurrenceRule = null
        body.isRecurring = false
        body.recurrenceEndDate = null
      }

      // Offline, or editing an offline-created event that hasn't synced yet:
      // queue the mutation and let the calendar update optimistically.
      if (!navigator.onLine || (eventId && isTempEventId(eventId))) {
        const patch: Partial<CalendarEvent> = {
          title,
          description: description || null,
          location: location || null,
          category,
          color: color || null,
          isPersonal,
          recurrenceRule: (body.recurrenceRule as string | null) ?? null,
          isRecurring: (body.isRecurring as boolean) ?? false,
          recurrenceEndDate: (body.recurrenceEndDate as string | undefined) ?? null,
        }
        if (!isRecurringInstance) {
          patch.start = body.start as string
          patch.end = body.end as string
          patch.isAllDay = isAllDay
        }
        try {
          if (eventId) {
            await queueEventUpdate(eventId, body)
            onOfflineChange?.({ type: 'update', id: eventId, patch })
          } else {
            const tempId = await queueEventCreate(body)
            onOfflineChange?.({
              type: 'create',
              event: { id: tempId, createdBy: currentUserId, isBusy: false, ...patch } as CalendarEvent,
            })
          }
          toast.success('Saved offline — will sync when you reconnect')
          setLoading(false)
          onClose()
        } catch {
          setLoading(false)
          setError('Failed to save offline — storage unavailable.')
        }
        return
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
        await onSave()
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

  async function handleDelete() {
    if (!event) return
    setLoading(true)

    try {
      if (isRecurringEvent(event) && !showDeleteConfirm) {
        // Show confirmation dialog first
        setShowDeleteConfirm(true)
        setLoading(false)
        return
      }

      const eventId = getEventId(event)
      if (!eventId) return

      // "Delete this event only" on a recurring series: the server records the
      // occurrence (this instance's start) as an exception — deleting the row
      // would delete the whole series, since every instance is a virtual
      // expansion of the one row.
      const wholeSeriesDelete = deleteAll && isRecurringEvent(event)
      const occurrence = !wholeSeriesDelete && isRecurringEvent(event)
        ? new Date(event.start).toISOString()
        : undefined

      // Offline, or an offline-created event not yet on the server: queue the
      // delete (tmp_ events just cancel their queued POST/PUTs).
      if (!navigator.onLine || isTempEventId(eventId)) {
        try {
          await queueEventDelete(eventId, wholeSeriesDelete, occurrence)
          onOfflineChange?.({ type: 'delete', id: eventId, occurrence })
          toast.success('Saved offline — will sync when you reconnect')
          setLoading(false)
          setShowDeleteConfirm(false)
          setDeleteAll(false)
          onClose()
        } catch {
          setLoading(false)
          setError('Failed to save offline — storage unavailable.')
        }
        return
      }

      const url = wholeSeriesDelete
        ? `/api/events/${eventId}?all=true`
        : occurrence
          ? `/api/events/${eventId}?occurrence=${encodeURIComponent(occurrence)}`
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
      await onSave()
      onClose()
    } catch (err) {
      setLoading(false)
      setError('Network error: Could not delete event')
      console.error('Event delete error:', err)
    }
  }

  return (
    <Drawer open={open} onOpenChange={open => !open && onClose()}>
      <DrawerContent className="sm:max-w-[720px] flex flex-col overflow-hidden p-0 gap-0" showCloseButton={true}>
        {showDeleteConfirm ? (
          <>
            <DrawerHeader className="px-6 pt-5 pb-4 shrink-0 border-b border-border">
              <DrawerTitle>Delete Recurring Event</DrawerTitle>
            </DrawerHeader>
            <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
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
            <DrawerFooter className="px-6 py-4 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteAll(false) }}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                {loading ? 'Deleting...' : 'Delete'}
              </Button>
            </DrawerFooter>
          </>
        ) : (
          <>
            <DrawerHeader className="px-6 pt-5 pb-4 shrink-0 border-b border-border">
              <DrawerTitle>{event ? 'Edit Event' : 'New Event'}</DrawerTitle>
            </DrawerHeader>
            <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" />
              </div>
              <div className="space-y-1">
                <Label>Location <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. 123 Main St or Zoom link" />
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
                  <Input type="date" value={start.split('T')[0]} onChange={e => { setStart(e.target.value + 'T00:00'); setEnd(e.target.value + 'T23:59') }} />
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
              {recurrenceRule && recurrenceRule.startsWith('FREQ=WEEKLY') && (
                <div className="space-y-1.5">
                  <Label>Repeat on days</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_OPTIONS.map(({ label, value }) => {
                      const isSelected = weeklyRepeatDays.includes(value)
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setWeeklyRepeatDays(prev =>
                              prev.includes(value)
                                ? prev.filter(d => d !== value)
                                : [...prev, value]
                            )
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:border-muted-foreground'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {weeklyRepeatDays.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No days selected — event repeats every 7 days from the start date
                    </p>
                  )}
                </div>
              )}
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
              {/* Email Reminder */}
              <div className="space-y-2 pt-1 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Reminder</Label>
                    <p className="text-xs text-muted-foreground">Notify the whole family before this event</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={emailReminder}
                    onChange={e => setEmailReminder(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                </div>
                {emailReminder && (
                  <div className="space-y-2 pl-1">
                    <div className="space-y-1">
                      <Label>Notify how long before?</Label>
                      <Select value={emailReminderHours} onValueChange={v => setEmailReminderHours(v ?? '24')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 hour before</SelectItem>
                          <SelectItem value="2">2 hours before</SelectItem>
                          <SelectItem value="6">6 hours before</SelectItem>
                          <SelectItem value="12">12 hours before</SelectItem>
                          <SelectItem value="24">24 hours before</SelectItem>
                          <SelectItem value="48">48 hours before</SelectItem>
                          <SelectItem value="168">1 week before</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Extra recipients (optional)</Label>
                      <Input
                        value={emailReminderEmails}
                        onChange={e => setEmailReminderEmails(e.target.value)}
                        placeholder="email1@example.com, email2@example.com"
                      />
                      <p className="text-xs text-muted-foreground">Comma-separated; in addition to all family members</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {event && (
                <EventAttendeePanel eventId={getEventId(event)} currentUserId={currentUserId} />
              )}
            </div>
            <DrawerFooter className="px-6 py-4 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
              {event && (
                <Button variant="destructive" className="w-full sm:w-auto" onClick={handleDelete} disabled={loading}>Delete</Button>
              )}
              <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Cancel</Button>
              <Button className="w-full sm:w-auto" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving...' : 'Save'}
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
