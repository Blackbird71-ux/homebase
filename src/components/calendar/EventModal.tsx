'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import type { CalendarEvent } from '@/types'

const CATEGORIES = ['Medical', 'School', 'Social', 'Work', 'Other']

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
  const [description, setDescription] = useState('')
  const [isPersonal, setIsPersonal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (event) {
      setTitle(event.title)
      setStart(format(new Date(event.start), "yyyy-MM-dd'T'HH:mm"))
      setEnd(format(new Date(event.end), "yyyy-MM-dd'T'HH:mm"))
      setIsAllDay(event.isAllDay)
      setCategory(event.category ?? 'Other')
      setDescription(event.description ?? '')
      setIsPersonal(event.isPersonal ?? false)
    } else {
      const d = defaultDate ?? new Date()
      setTitle('')
      setStart(format(d, "yyyy-MM-dd'T'09:00"))
      setEnd(format(d, "yyyy-MM-dd'T'10:00"))
      setIsAllDay(false)
      setCategory('Other')
      setDescription('')
      setIsPersonal(false)
    }
    setError('')
  }, [event, defaultDate, open])

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    setLoading(true)
    setError('')

    const method = event ? 'PUT' : 'POST'
    const url = event ? `/api/events/${event.id}` : '/api/events'
    const startDate = isAllDay ? new Date(start.split('T')[0]).toISOString() : new Date(start).toISOString()
    const endDate = isAllDay ? new Date(end.split('T')[0]).toISOString() : new Date(end).toISOString()

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, start: startDate, end: endDate, isAllDay, category, isPersonal }),
    })

    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to save event')
    } else {
      onSave()
      onClose()
    }
  }

  async function handleDelete() {
    if (!event) return
    setLoading(true)
    await fetch(`/api/events/${event.id}`, { method: 'DELETE' })
    setLoading(false)
    onSave()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
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
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
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
      </DialogContent>
    </Dialog>
  )
}
