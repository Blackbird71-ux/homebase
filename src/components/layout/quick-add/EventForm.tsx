'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { todayAU } from '@/lib/utils'
import { AppEvents, dispatchAppEvent } from '@/lib/app-events'
import type { QuickAddFormProps } from './types'

export function EventForm({ onSuccess, onBack }: QuickAddFormProps) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayAU())
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) { toast.error('Title and date are required'); return }
    setSubmitting(true)
    try {
      const start = new Date(date + 'T00:00:00')
      const end = new Date(date + 'T23:59:00')
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), start: start.toISOString(), end: end.toISOString(), isAllDay: true }),
      })
      if (!res.ok) throw new Error('Failed to create event')
      dispatchAppEvent(AppEvents.CALENDAR_UPDATED)
      onSuccess('Event created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="qa-event-title">Event Title</Label>
        <Input
          ref={inputRef}
          id="qa-event-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g., Doctor's appointment"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-event-date">Date</Label>
        <Input
          id="qa-event-date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          required
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Back</Button>
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Create
        </Button>
      </div>
    </form>
  )
}
