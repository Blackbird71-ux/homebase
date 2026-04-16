'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ListItemRow } from './ListItemRow'
import { filterTodoItems } from '@/lib/list-helpers'
import type { ListItemShape, TodoFilter } from '@/lib/list-helpers'
import { PlusIcon } from 'lucide-react'

interface TodoListProps {
  listId: string
  initialItems: ListItemShape[]
}

export function TodoList({ listId, initialItems }: TodoListProps) {
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  const [filter, setFilter] = useState<TodoFilter>('all')
  const [newContent, setNewContent] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [, startTransition] = useTransition()

  const filtered = filterTodoItems(items, filter)

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newContent.trim()) return
    const res = await fetch(`/api/lists/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: newContent.trim(),
        dueDate: newDueDate || null,
      }),
    })
    if (res.ok) {
      const item = await res.json()
      setItems((prev) => [
        ...prev,
        { ...item, dueDate: item.dueDate ? new Date(item.dueDate) : null, createdAt: new Date(item.createdAt) },
      ])
      setNewContent('')
      setNewDueDate('')
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

  const filters: { label: string; value: TodoFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Due today', value: 'today' },
    { label: 'Overdue', value: 'overdue' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={addItem} className="flex gap-2">
        <Input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add task..."
          className="flex-1"
        />
        <input
          type="date"
          value={newDueDate}
          onChange={(e) => setNewDueDate(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          aria-label="Due date"
        />
        <Button type="submit" size="sm">
          <PlusIcon className="h-4 w-4" />
        </Button>
      </form>

      <div className="flex gap-2">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="divide-y divide-border/50">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No items
          </p>
        )}
        {filtered.map((item) => (
          <ListItemRow
            key={item.id}
            id={item.id}
            content={item.content}
            isCompleted={item.isCompleted}
            dueDate={item.dueDate?.toISOString() ?? null}
            onToggle={toggleItem}
            onDelete={deleteItem}
          />
        ))}
      </div>
    </div>
  )
}
