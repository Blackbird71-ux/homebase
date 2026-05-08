'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

type QuickAddType = 'chore' | 'event' | 'meal' | 'todo-item'

interface CardQuickAddProps {
  type: QuickAddType
  listId?: string
}

const TITLES: Record<QuickAddType, string> = {
  chore: 'Add Chore',
  event: 'Add Event',
  meal: 'Add Meal',
  'todo-item': 'Add Task',
}

const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snacks', label: 'Snacks' },
]

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CardQuickAdd({ type, listId }: CardQuickAddProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [mealType, setMealType] = useState('dinner')
  const [mealNote, setMealNote] = useState('')
  const [content, setContent] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setDate(todayLocal())
      setTimeout(() => inputRef.current?.focus(), 80)
    } else {
      setTitle('')
      setContent('')
      setMealNote('')
      setMealType('dinner')
      setSubmitting(false)
      setSuccess(false)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      switch (type) {
        case 'chore': {
          if (!title.trim()) { toast.error('Title is required'); setSubmitting(false); return }
          const res = await fetch('/api/chores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title.trim(), frequency: 'weekly' }),
          })
          if (!res.ok) throw new Error('Failed to create chore')
          toast.success('Chore added')
          break
        }
        case 'event': {
          if (!title.trim() || !date) { toast.error('Title and date are required'); setSubmitting(false); return }
          const res = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title.trim(),
              start: new Date(date + 'T00:00:00').toISOString(),
              end: new Date(date + 'T23:59:00').toISOString(),
              isAllDay: true,
            }),
          })
          if (!res.ok) throw new Error('Failed to create event')
          toast.success('Event added')
          break
        }
        case 'meal': {
          if (!date || !mealType) { toast.error('Date and meal type are required'); setSubmitting(false); return }
          if (!mealNote.trim()) { toast.error('Enter what you\'re having'); setSubmitting(false); return }
          const res = await fetch('/api/meal-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, mealType, note: mealNote.trim() }),
          })
          if (!res.ok) throw new Error('Failed to add meal')
          toast.success('Meal added')
          break
        }
        case 'todo-item': {
          if (!listId) { toast.error('No list available'); setSubmitting(false); return }
          if (!content.trim()) { toast.error('Task content is required'); setSubmitting(false); return }
          const res = await fetch(`/api/lists/${listId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content.trim() }),
          })
          if (!res.ok) throw new Error('Failed to add task')
          toast.success('Task added')
          break
        }
      }
      setSuccess(true)
      setTimeout(() => { setOpen(false); router.refresh() }, 700)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true) }}
        className="flex items-center justify-center h-5 w-5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title={TITLES[type]}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>{TITLES[type]}</DialogTitle>
          </DialogHeader>

          {success ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="h-5 w-5 text-green-500" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Added!</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 py-1">
              {(type === 'chore' || type === 'event') && (
                <div className="space-y-1.5">
                  <Label htmlFor="qa-title">
                    {type === 'chore' ? 'Chore name' : 'Event title'}
                  </Label>
                  <Input
                    ref={inputRef}
                    id="qa-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={type === 'chore' ? 'e.g. Vacuum lounge' : 'e.g. Doctor appointment'}
                    required
                  />
                </div>
              )}

              {type === 'event' && (
                <div className="space-y-1.5">
                  <Label htmlFor="qa-date">Date</Label>
                  <Input
                    id="qa-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              )}

              {type === 'meal' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-meal-date">Date</Label>
                    <Input
                      id="qa-meal-date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Meal</Label>
                    <div className="grid grid-cols-4 gap-1">
                      {MEAL_TYPES.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setMealType(m.value)}
                          className={`px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                            mealType === m.value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:bg-accent'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="qa-meal-note">What&apos;s on the menu?</Label>
                    <Input
                      ref={inputRef}
                      id="qa-meal-note"
                      value={mealNote}
                      onChange={(e) => setMealNote(e.target.value)}
                      placeholder="e.g. Spaghetti Bolognese"
                      required
                    />
                  </div>
                </>
              )}

              {type === 'todo-item' && (
                <div className="space-y-1.5">
                  <Label htmlFor="qa-content">Task</Label>
                  <Input
                    ref={inputRef}
                    id="qa-content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="e.g. Pick up dry cleaning"
                    required
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
