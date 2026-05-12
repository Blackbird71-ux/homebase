'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { QuickAddFormProps } from './types'

export function TodoListForm({ onSuccess, onBack }: QuickAddFormProps) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('List name is required'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type: 'TODO' }),
      })
      if (!res.ok) throw new Error('Failed to create list')
      onSuccess('To-do list created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="qa-list-name">List Name</Label>
        <Input
          ref={inputRef}
          id="qa-list-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., Weekend tasks"
          required
        />
      </div>
      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        Creating a to-do list
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
