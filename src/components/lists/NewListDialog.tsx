'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface NewListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (list: { id: string; name: string; type: string }) => void
  members?: { id: string; name: string }[]
  currentUserId?: string
}

export function NewListDialog({ open, onOpenChange, onCreated, members, currentUserId }: NewListDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'SHOPPING' | 'TODO'>('SHOPPING')
  const [ownerId, setOwnerId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const body: Record<string, unknown> = { name: name.trim(), type }
      if (ownerId && ownerId !== currentUserId) {
        body.createdBy = ownerId
      }
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const list = await res.json()
        onCreated(list)
        setName('')
        setType('SHOPPING')
        setOwnerId('')
        onOpenChange(false)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => onOpenChange(isOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New list</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="list-name">Name</Label>
            <Input
              id="list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekly shop"
              autoFocus
            />
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium leading-none">Type</legend>
            <div className="flex gap-3">
              {(['SHOPPING', 'TODO'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    value={t}
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="accent-primary"
                  />
                  {t === 'SHOPPING' ? 'Shopping' : 'Todo'}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {type === 'SHOPPING'
                ? 'Shopping lists appear on the home dashboard.'
                : 'Todo lists are private task lists — they do not appear on the home dashboard.'}
            </p>
          </fieldset>
          {(members && members.length > 1) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="list-owner">Owner</Label>
              <select
                id="list-owner"
                value={ownerId || currentUserId || ''}
                onChange={(e) => setOwnerId(e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.id === currentUserId ? ' (me)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                The owner controls who sees this list in "My Lists" view
              </p>
            </div>
          )}
          <DialogFooter>
                <Button type="submit" disabled={loading || !name.trim()}>
                  {loading ? 'Creating...' : 'Create'}
                </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
