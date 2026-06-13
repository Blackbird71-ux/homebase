'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PantryLocation, PantryStatus } from '@/lib/pantry-helpers'
import type { QuickAddFormProps } from './types'

export function PantryItemForm({ onSuccess, onBack }: QuickAddFormProps) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState<PantryLocation>('pantry')
  const [status, setStatus] = useState<PantryStatus>('stocked')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Item name is required'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), location, status }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to add pantry item')
      }
      onSuccess('Pantry item added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="qa-pantry-name">Item Name</Label>
        <Input
          ref={inputRef}
          id="qa-pantry-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., Milk"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-pantry-location">Location</Label>
        <Select value={location} onValueChange={v => v && setLocation(v as PantryLocation)}>
          <SelectTrigger id="qa-pantry-location"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pantry">Pantry</SelectItem>
            <SelectItem value="fridge">Fridge</SelectItem>
            <SelectItem value="freezer">Freezer</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="qa-pantry-status">Status</Label>
        <Select value={status} onValueChange={v => v && setStatus(v as PantryStatus)}>
          <SelectTrigger id="qa-pantry-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="stocked">Stocked</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="out">Out</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1">Back</Button>
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Add
        </Button>
      </div>
    </form>
  )
}
