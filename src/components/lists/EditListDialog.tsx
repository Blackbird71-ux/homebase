'use client'

import { useState, useEffect } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface EditListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  list: { id: string; name: string; type: string; createdBy: string | null } | null
  members: { id: string; name: string }[]
  currentUserId: string
  onUpdated: (id: string, changes: { createdBy?: string; name?: string }) => void
}

export function EditListDialog({
  open,
  onOpenChange,
  list,
  members,
  currentUserId,
  onUpdated,
}: EditListDialogProps) {
  const [ownerId, setOwnerId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  // Sync state when the list changes
  useEffect(() => {
    if (list) {
      setOwnerId(list.createdBy || '')
    }
  }, [list])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!list) return
    setLoading(true)
    try {
      const res = await fetch(`/api/lists/${list.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy: ownerId }),
      })
      if (res.ok) {
        onUpdated(list.id, { createdBy: ownerId })
        toast.success(`"${list.name}" owner updated`)
        onOpenChange(false)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to update list')
      }
    } finally {
      setLoading(false)
    }
  }

  if (!list) return null

  const ownerName = members.find((m) => m.id === (ownerId || list.createdBy))?.name ?? 'Family'

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-[560px]" showCloseButton={true}>
        <DrawerHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <DrawerTitle>Edit list — {list.name}</DrawerTitle>
        </DrawerHeader>
        <form id="edit-list-form" onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 py-4 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-list-owner">Owner</Label>
            <select
              id="edit-list-owner"
              value={ownerId || ''}
              onChange={(e) => setOwnerId(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
            >
              <option value="">Family (visible to everyone)</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.id === currentUserId ? ' (me)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {ownerId
                ? `Only ${ownerName} will see this list in "Mine" view. Everyone sees it under "Family".`
                : 'This list is shared — it appears for everyone under "Mine" view.'}
            </p>
          </div>
        </form>
        <DrawerFooter className="px-4 py-3 border-t border-border shrink-0 flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="edit-list-form" disabled={loading}>
            {loading ? 'Saving…' : 'Save'}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
