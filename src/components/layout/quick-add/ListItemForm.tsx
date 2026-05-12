'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { QuickAddFormProps, ListMeta } from './types'

export function ListItemForm({ onSuccess, onBack }: QuickAddFormProps) {
  const [content, setContent] = useState('')
  const [selectedListId, setSelectedListId] = useState('')
  const [lists, setLists] = useState<ListMeta[]>([])
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/lists')
      .then(r => r.json())
      .then((data: ListMeta[]) => {
        setLists(data)
        if (data.length > 0) setSelectedListId(data[0].id)
      })
      .catch(() => { /* silently fail */ })
      .finally(() => setTimeout(() => inputRef.current?.focus(), 100))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedListId) { toast.error('Select a list'); return }
    if (!content.trim()) { toast.error('Item content is required'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/lists/${selectedListId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })
      if (!res.ok) throw new Error('Failed to add item')
      onSuccess('Item added to list')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="qa-listitem-list">List</Label>
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lists found. Create one first.</p>
        ) : (
          <Select value={selectedListId} onValueChange={v => v && setSelectedListId(v)}>
            <SelectTrigger id="qa-listitem-list"><SelectValue /></SelectTrigger>
            <SelectContent>
              {lists.map(l => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} ({l.type === 'SHOPPING' ? 'Shopping' : 'To-Do'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-listitem-content">Item</Label>
        <Input
          ref={inputRef}
          id="qa-listitem-content"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="e.g., Milk, eggs, bread"
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
