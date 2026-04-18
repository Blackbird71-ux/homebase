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
}

export function NewListDialog({ open, onOpenChange, onCreated }: NewListDialogProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'SHOPPING' | 'TODO'>('SHOPPING')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type }),
      })
      if (res.ok) {
        const list = await res.json()
        onCreated(list)
        setName('')
        setType('SHOPPING')
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
            {type === 'SHOPPING' && (
              <p className="text-xs text-muted-foreground">Shopping lists appear on the home dashboard.</p>
            )}
          </fieldset>
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
