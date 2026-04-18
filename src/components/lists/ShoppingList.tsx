'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { groupByCategory, groupByRecipe, SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ListItemShape, ShoppingCategory } from '@/lib/list-helpers'
import { CategoryGroup } from './CategoryGroup'
import { DoneSection } from './DoneSection'
import { ListItemRow } from './ListItemRow'

interface ShoppingListProps {
  listId: string
  initialItems: ListItemShape[]
  initialCategoryOrder: string[] | null
}

type ViewMode = 'aisle' | 'recipe'

export function ShoppingList({ listId, initialItems, initialCategoryOrder }: ShoppingListProps) {
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  const [viewMode, setViewMode] = useState<ViewMode>('aisle')
  const [categoryOrder, setCategoryOrder] = useState<string[]>(
    initialCategoryOrder ?? [...SHOPPING_CATEGORIES]
  )
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<ShoppingCategory>('Other')
  const [, startTransition] = useTransition()

  const catSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const debouncedSaveCategoryOrder = useCallback(
    (order: string[]) => {
      if (catSaveTimer.current) clearTimeout(catSaveTimer.current)
      catSaveTimer.current = setTimeout(() => {
        fetch(`/api/lists/${listId}/category-order`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryOrder: order }),
        }).catch(() => toast.error('Failed to save category order.'))
      }, 500)
    },
    [listId]
  )

  const debouncedSaveItemOrder = useCallback(
    (updates: { id: string; sortOrder: number }[]) => {
      if (itemSaveTimer.current) clearTimeout(itemSaveTimer.current)
      itemSaveTimer.current = setTimeout(() => {
        fetch(`/api/lists/${listId}/items/reorder`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: updates }),
        }).catch(() => toast.error('Failed to save item order.'))
      }, 500)
    },
    [listId]
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeType = active.data.current?.type as string | undefined

    if (activeType === 'category') {
      const oldIndex = categoryOrder.indexOf(active.id as string)
      const newIndex = categoryOrder.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return
      const newOrder = arrayMove(categoryOrder, oldIndex, newIndex)
      setCategoryOrder(newOrder)
      debouncedSaveCategoryOrder(newOrder)
    } else if (activeType === 'item') {
      const activeCategory = active.data.current?.category as string | null | undefined
      const catItems = items.filter(
        (i) => !i.isCompleted && i.category === activeCategory
      )
      const oldIndex = catItems.findIndex((i) => i.id === active.id)
      const newIndex = catItems.findIndex((i) => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(catItems, oldIndex, newIndex)
      const updates = reordered.map((item, idx) => ({ id: item.id, sortOrder: idx }))
      setItems((prev) =>
        prev.map((i) => {
          const u = updates.find((x) => x.id === i.id)
          return u ? { ...i, sortOrder: u.sortOrder } : i
        })
      )
      debouncedSaveItemOrder(updates)
    }
  }

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
      setItems((prev) => [
        ...prev,
        {
          ...item,
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
          createdAt: new Date(item.createdAt),
          recipeId: item.recipeId ?? null,
          recipeName: item.recipeName ?? null,
        },
      ])
      setNewContent('')
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
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isCompleted } : i)))
      } else {
        toast.error('Failed to save. Please try again.')
      }
    })
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  async function clearCompleted() {
    const res = await fetch(`/api/lists/${listId}/clear-completed`, { method: 'POST' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => !i.isCompleted))
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  const completedItems = items.filter((i) => i.isCompleted)
  const grouped = groupByCategory(items)
  const recipeGroups = groupByRecipe(items)

  const activeCategoryOrder = categoryOrder.filter(
    (c) => SHOPPING_CATEGORIES.includes(c as ShoppingCategory)
  )

  return (
    <div className="flex flex-col gap-4">
      {/* View toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setViewMode('aisle')}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'aisle'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          By Aisle
        </button>
        <button
          onClick={() => setViewMode('recipe')}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'recipe'
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          By Recipe
        </button>
      </div>

      {/* Add item form */}
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

      {completedItems.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearCompleted}
          className="self-end text-muted-foreground"
        >
          Clear {completedItems.length} completed
        </Button>
      )}

      {/* Items */}
      {viewMode === 'aisle' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeCategoryOrder}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-4">
              {activeCategoryOrder.map((cat) => {
                const catItems = grouped[cat as ShoppingCategory] ?? []
                if (catItems.length === 0) return null
                return (
                  <CategoryGroup
                    key={cat}
                    category={cat}
                    items={catItems}
                    showDragHandle={true}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                  />
                )
              })}
            </div>
          </SortableContext>
          <DoneSection
            items={completedItems}
            listId={listId}
            onToggle={toggleItem}
            onDelete={deleteItem}
          />
        </DndContext>
      ) : (
        <div className="flex flex-col gap-4">
          {recipeGroups.map((group) => (
            <div key={group.name}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {group.name}
              </p>
              <div className="divide-y divide-border/50">
                {group.items.map((item) => (
                  <ListItemRow
                    key={item.id}
                    id={item.id}
                    content={item.content}
                    isCompleted={item.isCompleted}
                    recipeName={item.recipeName}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                  />
                ))}
              </div>
            </div>
          ))}
          <DoneSection
            items={completedItems}
            listId={listId}
            onToggle={toggleItem}
            onDelete={deleteItem}
          />
        </div>
      )}
    </div>
  )
}
