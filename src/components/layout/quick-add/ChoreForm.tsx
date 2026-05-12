'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { QuickAddFormProps } from './types'

export function ChoreForm({ onSuccess, onBack }: QuickAddFormProps) {
  const [title, setTitle] = useState('')
  const [frequency, setFrequency] = useState('weekly')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('Chore name is required'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), frequency }),
      })
      if (!res.ok) throw new Error('Failed to create chore')
      onSuccess('Chore created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="qa-chore-title">Chore Name</Label>
        <Input
          ref={inputRef}
          id="qa-chore-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g., Vacuum lounge"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-chore-freq">Frequency</Label>
        <Select value={frequency} onValueChange={v => v && setFrequency(v)}>
          <SelectTrigger id="qa-chore-freq"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="biweekly">Bi-weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
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
