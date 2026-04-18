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
import { toast } from 'sonner'

interface ShoppingListMeta {
  id: string
  name: string
  type: string
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
        setSelected(new Set(ingredients.map((_, i) => i)))
      })
      .catch(() => toast.error('Failed to load shopping lists.'))
      .finally(() => setFetching(false))
  }, [open, ingredients])

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
      const toAdd = ingredients.filter((_, i) => selected.has(i))
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
        toast.error(`${failed} item(s) failed to add.`)
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
              <label className="text-sm font-medium">Shopping list</label>
              <select
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Ingredients</label>
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
