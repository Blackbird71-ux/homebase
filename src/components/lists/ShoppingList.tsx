'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ListItemRow } from './ListItemRow'
import { groupByCategory, SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ListItemShape, ShoppingCategory } from '@/lib/list-helpers'
import { PlusIcon } from 'lucide-react'

interface ShoppingListProps {
  listId: string
  initialItems: ListItemShape[]
}

export function ShoppingList({ listId, initialItems }: ShoppingListProps) {
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<ShoppingCategory>('Other')
  const [, startTransition] = useTransition()

  const grouped = groupByCategory(items)

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newContent.trim()) return
    const res = await fetch(`/api/lists/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newContent.trim(), category: newCategory }),
    })
    if (res.ok) {
      const item = await res.json()
      setItems((prev) => [...prev, { ...item, dueDate: item.dueDate ? new Date(item.dueDate) : null, createdAt: new Date(item.createdAt) }])
      setNewContent('')
    }
  }

  async function toggleItem(id: string, isCompleted: boolean) {
    startTransition(async () => {
      const res = await fetch(`/api/lists/${listId}/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted }),
      })
      if (res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, isCompleted } : i))
        )
      }
    })
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }
  }

  async function clearCompleted() {
    const res = await fetch(`/api/lists/${listId}/clear-completed`, { method: 'POST' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => !i.isCompleted))
    }
  }

  const completedCount = items.filter((i) => i.isCompleted).length

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={addItem} className="flex gap-2">
        <Input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add item..."
          className="flex-1"
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as ShoppingCategory)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {SHOPPING_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <Button type="submit" size="sm">
          <PlusIcon className="h-4 w-4" />
        </Button>
      </form>

      {completedCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearCompleted}
          className="self-end text-muted-foreground"
        >
          Clear {completedCount} completed
        </Button>
      )}

      <div className="flex flex-col gap-4">
        {SHOPPING_CATEGORIES.map((cat) => {
          const catItems = grouped[cat]
          if (catItems.length === 0) return null
          return (
            <div key={cat}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {cat}
              </p>
              <div className="divide-y divide-border/50">
                {catItems.map((item) => (
                  <ListItemRow
                    key={item.id}
                    id={item.id}
                    content={item.content}
                    isCompleted={item.isCompleted}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
