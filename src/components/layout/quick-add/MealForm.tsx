'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { todayAU } from '@/lib/utils'
import type { QuickAddFormProps } from './types'

const MEAL_TYPE_OPTIONS = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch',     label: 'Lunch' },
  { value: 'dinner',    label: 'Dinner' },
  { value: 'snacks',    label: 'Snacks' },
]

export function MealForm({ onSuccess, onBack }: QuickAddFormProps) {
  const [date, setDate] = useState(todayAU())
  const [mealType, setMealType] = useState('dinner')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date || !mealType) { toast.error('Date and meal type are required'); return }
    if (!note.trim()) { toast.error("Enter what you're having"); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, mealType, note: note.trim() }),
      })
      if (!res.ok) throw new Error('Failed to add meal')
      onSuccess('Meal added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="qa-meal-date">Date</Label>
        <Input id="qa-meal-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Meal</Label>
        <div className="grid grid-cols-4 gap-1">
          {MEAL_TYPE_OPTIONS.map(m => (
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
      <div className="space-y-2">
        <Label htmlFor="qa-meal-note">What&apos;s on the menu?</Label>
        <Input
          ref={inputRef}
          id="qa-meal-note"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g., Spaghetti Bolognese"
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
