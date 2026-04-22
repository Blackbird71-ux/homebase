'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

interface ShoppingListMeta {
  id: string
  name: string
  type: 'SHOPPING' | 'TODO'
}

interface AddToListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipeId: string
  recipeName: string
  ingredients: string[]
}

export function AddToListDialog({
  open,
  onOpenChange,
  recipeId,
  recipeName,
  ingredients,
}: AddToListDialogProps) {
  const [lists, setLists] = useState<ShoppingListMeta[]>([])
  const [selectedListId, setSelectedListId] = useState<string>('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (!open) return
    setFetching(true)
    fetch('/api/lists')
      .then((r) => r.json())
      .then((data: ShoppingListMeta[]) => {
        const shopping = data.filter((l) => l.type === 'SHOPPING')
        setLists(shopping)
        if (shopping.length > 0) setSelectedListId(shopping[0].id)
      })
      .catch(() => toast.error('Failed to load shopping lists.'))
      .finally(() => setFetching(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    // Filter out all-caps section headers (like "DRESSING", "SAUCE", etc.)
    const validIndices = ingredients
      .map((ing, idx) => ({ ing, idx }))
      .filter(({ ing }) => {
        // Check if line is ALL CAPS (section header)
        const trimmed = ing.trim()
        if (!trimmed) return false
        // If it contains any lowercase letters, it's a real ingredient
        // If it has NO lowercase letters, it's a section header
        return /[a-z]/.test(trimmed)
      })
      .map(({ idx }) => idx)
    
    setSelected(new Set(validIndices))
  }, [open])

  function toggleIngredient(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedListId || selected.size === 0) return
    setLoading(true)
    try {
      // Filter out all-caps section headers before adding
      const toAdd = ingredients
        .filter((_, i) => selected.has(i))
        .filter(ing => {
          // Skip all-caps section headers (no lowercase letters)
          const trimmed = ing.trim()
          if (!trimmed) return false
          return /[a-z]/.test(trimmed)
        })
      
      if (toAdd.length === 0) {
        toast.info('No valid ingredients to add (all were section headers).')
        return
      }
      
      const results = await Promise.all(
        toAdd.map((content) =>
          fetch(`/api/lists/${selectedListId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content,
              category: 'Other',
              recipeId,
              recipeName,
            }),
          })
        )
      )
      const failed = results.filter((r) => !r.ok).length
      if (failed > 0) {
        const succeeded = toAdd.length - failed
        if (succeeded > 0) {
          toast.warning(`${succeeded} added, ${failed} failed.`)
        } else {
          toast.error(`Failed to add items to the shopping list.`)
        }
      } else {
        toast.success(`${toAdd.length} ingredient(s) added to shopping list.`)
        onOpenChange(false)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to shopping list</DialogTitle>
        </DialogHeader>
        {fetching ? (
          <p className="text-sm text-muted-foreground py-4">Loading lists...</p>
        ) : lists.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No active shopping lists found. Create one on the Lists page first.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Shopping list</Label>
              <Select value={selectedListId} onValueChange={(v) => { if (v !== null) setSelectedListId(v) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Ingredients</Label>
              <div className="flex flex-col gap-1 max-h-60 overflow-y-auto border border-border rounded-md p-2">
                {ingredients.map((ing, idx) => (
                  <label key={idx} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={selected.has(idx)}
                      onChange={() => toggleIngredient(idx)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    {ing}
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading || selected.size === 0}>
                {loading ? 'Adding...' : `Add ${selected.size} item${selected.size !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
