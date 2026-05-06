'use client'

import { useState, useTransition, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ListItemRow } from './ListItemRow'
import { DoneSection } from './DoneSection'
import { EditItemDialog } from './EditItemDialog'
import { filterTodoItems } from '@/lib/list-helpers'
import type { ListItemShape, TodoFilter } from '@/lib/list-helpers'
import { listenAppEvent, AppEvents } from '@/lib/app-events'
import { PlusIcon, TagIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'

interface TodoListProps {
  listId: string
  initialItems: ListItemShape[]
  initialCategoryOrder: string[] | null
}

export function TodoList({ listId, initialItems, initialCategoryOrder }: TodoListProps) {
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  const [filter, setFilter] = useState<TodoFilter>('all')
  const [categories, setCategories] = useState<string[]>(initialCategoryOrder ?? [])
  const [newContent, setNewContent] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<string>('')
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [showCategoryInput, setShowCategoryInput] = useState(false)
  const [, startTransition] = useTransition()
  const [editItemId, setEditItemId] = useState<string | null>(null)

  // Listen for todo list updates from AI assistant or other sources
  useEffect(() => {
    const cleanup = listenAppEvent(AppEvents.TODO_LIST_UPDATED, () => {
      fetch(`/api/lists/${listId}/items`)
        .then((res) => res.ok ? res.json() : null)
        .then((serverItems) => {
          if (serverItems) {
            setItems(
              serverItems.map((i: Record<string, unknown>) => ({
                ...i,
                dueDate: i.dueDate ? new Date(i.dueDate as string) : null,
                createdAt: new Date(i.createdAt as string),
              }))
            )
          }
        })
        .catch(() => {})
    })
    return cleanup
  }, [listId])

  const [editItemContent, setEditItemContent] = useState('')
  const [editItemCategory, setEditItemCategory] = useState<string | null>(null)

  const filtered = filterTodoItems(items, filter)
  const activeItems = filtered.filter((i) => !i.isCompleted)
  const completedItems = filter === 'all' ? items.filter((i) => i.isCompleted) : []

  // Group active items by category when categories are defined
  const groupedItems = (() => {
    if (categories.length === 0) return null
    const groups: Record<string, ListItemShape[]> = {}
    for (const cat of categories) {
      groups[cat] = activeItems.filter((i) => i.category === cat)
    }
    const uncategorized = activeItems.filter(
      (i) => !i.category || !categories.includes(i.category)
    )
    if (uncategorized.length > 0) groups['Other'] = uncategorized
    return groups
  })()

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newContent.trim()) return
    const res = await fetch(`/api/lists/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: newContent.trim(),
        dueDate: newDueDate || null,
        category: newItemCategory || null,
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
    } else {
      toast.error('Failed to save. Please try again.')
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
      } else {
        toast.error('Failed to save. Please try again.')
      }
    })
  }

  function handleEditItem(id: string) {
    const item = items.find((i) => i.id === id)
    if (item) {
      setEditItemId(id)
      setEditItemContent(item.content)
      setEditItemCategory(item.category || null)
    }
  }

  function handleItemSaved(id: string, content: string, category: string | null) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, content, category } : i))
    )
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  async function toggleLock(id: string, isLocked: boolean) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isLocked }),
    })
    if (res.ok) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isLocked } : i)))
    } else {
      toast.error('Failed to update item.')
    }
  }

  async function saveCategoryOrder(cats: string[]) {
    const res = await fetch(`/api/lists/${listId}/category-order`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryOrder: cats }),
    })
    if (!res.ok) toast.error('Failed to save categories')
  }

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newCategoryInput.trim()
    if (!trimmed || categories.includes(trimmed)) return
    const updated = [...categories, trimmed]
    setCategories(updated)
    setNewCategoryInput('')
    setShowCategoryInput(false)
    saveCategoryOrder(updated)
  }

  function handleRemoveCategory(name: string) {
    const updated = categories.filter((c) => c !== name)
    setCategories(updated)
    saveCategoryOrder(updated)
  }

  async function handleEditDialogCategoryAdded(name: string) {
    const trimmed = name.trim()
    if (!trimmed || categories.includes(trimmed)) return
    const updated = [...categories, trimmed]
    setCategories(updated)
    await saveCategoryOrder(updated)
  }

  // For the edit dialog: user categories + 'Other' as "no category" fallback
  const editDialogCategories = categories.length > 0 ? [...categories, 'Other'] : []

  const filters: { label: string; value: TodoFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Due today', value: 'today' },
    { label: 'Overdue', value: 'overdue' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Add item form */}
      <form onSubmit={addItem} className="flex flex-col sm:flex-row gap-2">
        <Input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add task..."
          className="flex-1"
        />
        <div className="flex gap-2">
          {categories.length > 0 && (
            <select
              value={newItemCategory}
              onChange={(e) => setNewItemCategory(e.target.value)}
              className="flex-1 sm:flex-none h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
              aria-label="Category"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="flex-1 sm:flex-none h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
            aria-label="Due date"
          />
          <Button type="submit" size="sm" className="shrink-0">
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {/* Filters */}
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

      {/* Category management */}
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((cat) => (
          <span
            key={cat}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground"
          >
            {cat}
            <button
              type="button"
              onClick={() => handleRemoveCategory(cat)}
              className="hover:text-destructive transition-colors"
              aria-label={`Remove ${cat} category`}
            >
              <XIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        {showCategoryInput ? (
          <form onSubmit={handleAddCategory} className="flex items-center gap-1">
            <Input
              value={newCategoryInput}
              onChange={(e) => setNewCategoryInput(e.target.value)}
              placeholder="Category name"
              className="h-6 text-xs w-32"
              autoFocus
              onBlur={() => {
                if (!newCategoryInput.trim()) setShowCategoryInput(false)
              }}
            />
            <Button type="submit" size="icon-sm" className="h-6 w-6">
              <PlusIcon className="h-3 w-3" />
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground gap-1"
            onClick={() => setShowCategoryInput(true)}
            type="button"
          >
            <TagIcon className="h-3 w-3" />
            Add category
          </Button>
        )}
      </div>

      {/* Items */}
      <div className="flex flex-col gap-4">
        {groupedItems ? (
          <>
            {activeItems.length === 0 && completedItems.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No items</p>
            )}
            {activeItems.length === 0 && completedItems.length > 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">All done!</p>
            )}
            {Object.entries(groupedItems).map(([cat, catItems]) => {
              if (catItems.length === 0) return null
              return (
                <div key={cat} className="flex flex-col gap-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {cat}
                  </p>
                  <div className="divide-y divide-border/50">
                    {catItems.map((item) => (
                      <ListItemRow
                        key={item.id}
                        id={item.id}
                        content={item.content}
                        isCompleted={item.isCompleted}
                        isLocked={item.isLocked}
                        dueDate={item.dueDate?.toISOString() ?? null}
                        onToggle={toggleItem}
                        onDelete={deleteItem}
                        onToggleLock={toggleLock}
                        onEdit={handleEditItem}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </>
        ) : (
          <div className="divide-y divide-border/50">
            {activeItems.length === 0 && completedItems.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No items</p>
            )}
            {activeItems.length === 0 && completedItems.length > 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">All done!</p>
            )}
            {activeItems.map((item) => (
              <ListItemRow
                key={item.id}
                id={item.id}
                content={item.content}
                isCompleted={item.isCompleted}
                isLocked={item.isLocked}
                dueDate={item.dueDate?.toISOString() ?? null}
                onToggle={toggleItem}
                onDelete={deleteItem}
                onToggleLock={toggleLock}
                onEdit={handleEditItem}
              />
            ))}
          </div>
        )}

        {completedItems.length > 0 && (
          <DoneSection
            items={completedItems}
            listId={listId}
            onToggle={toggleItem}
            onDelete={deleteItem}
            onToggleLock={toggleLock}
            onEdit={handleEditItem}
          />
        )}
      </div>

      <EditItemDialog
        open={editItemId !== null}
        onOpenChange={(open) => {
          if (!open) setEditItemId(null)
        }}
        itemId={editItemId ?? ''}
        initialContent={editItemContent}
        initialCategory={editItemCategory}
        availableCategories={editDialogCategories}
        listId={listId}
        onSaved={handleItemSaved}
        onCategoryAdded={editDialogCategories.length > 0 ? handleEditDialogCategoryAdded : undefined}
      />
    </div>
  )
}
