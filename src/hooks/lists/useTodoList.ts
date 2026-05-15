'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import {
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { filterTodoItems } from '@/lib/list-helpers'
import type { ListItemShape, TodoFilter } from '@/lib/list-helpers'
import { listenAppEvent, AppEvents } from '@/lib/app-events'
import { toast } from 'sonner'

export function useTodoList(
  listId: string,
  initialItems: ListItemShape[],
  initialCategoryOrder: string[] | null,
  currentUserId: string,
) {
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  const [filter, setFilter] = useState<TodoFilter>('mine')
  const [categories, setCategories] = useState<string[]>(initialCategoryOrder ?? [])
  const [newContent, setNewContent] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<string>('')
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [showCategoryInput, setShowCategoryInput] = useState(false)
  const [, startTransition] = useTransition()
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editItemContent, setEditItemContent] = useState('')
  const [editItemCategory, setEditItemCategory] = useState<string | null>(null)
  const [editItemDueDate, setEditItemDueDate] = useState<string | null>(null)
  const [editItemAssignedToUserId, setEditItemAssignedToUserId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const debouncedSaveItemOrder = useDebouncedCallback(
    useCallback((updates: { id: string; sortOrder: number }[]) => {
      fetch(`/api/lists/${listId}/items/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updates }),
      }).catch(() => toast.error('Failed to save item order.'))
    }, [listId]),
    500,
  )

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

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filtered = filterTodoItems(items, filter, undefined, currentUserId)
  const activeItems = filtered.filter((i) => !i.isCompleted)
  const completedItems = (filter === 'all' || filter === 'mine') ? items.filter((i) => i.isCompleted) : []

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

  const editDialogCategories = categories.length > 0 ? [...categories, 'Other'] : []

  // ── Actions ─────────────────────────────────────────────────────────────────

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
      setEditItemDueDate(item.dueDate ? item.dueDate.toISOString() : null)
      setEditItemAssignedToUserId(item.assignedToUserId ?? null)
    }
  }

  function handleItemSaved(id: string, content: string, category: string | null, dueDate?: string | null, assignedToUserId?: string | null) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? {
        ...i,
        content,
        category,
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(assignedToUserId !== undefined && { assignedToUserId }),
      } : i))
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

  async function assignItem(id: string, assignedToUserId: string | null) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedToUserId }),
    })
    if (res.ok) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, assignedToUserId } : i)))
    } else {
      toast.error('Failed to assign item.')
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const isGrouped = categories.length > 0
    if (isGrouped) {
      const activeCategory = active.data.current?.category as string | null | undefined
      const catItems = activeItems.filter((i) => i.category === activeCategory)
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
    } else {
      const oldIndex = activeItems.findIndex((i) => i.id === active.id)
      const newIndex = activeItems.findIndex((i) => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(activeItems, oldIndex, newIndex)
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

  return {
    // State
    items,
    filter, setFilter,
    categories,
    newContent, setNewContent,
    newDueDate, setNewDueDate,
    newItemCategory, setNewItemCategory,
    newCategoryInput, setNewCategoryInput,
    showCategoryInput, setShowCategoryInput,
    editItemId, setEditItemId,
    editItemContent,
    editItemCategory,
    editItemDueDate,
    editItemAssignedToUserId,
    // DnD
    sensors,
    handleDragEnd,
    // Actions
    addItem,
    toggleItem,
    handleEditItem,
    handleItemSaved,
    deleteItem,
    toggleLock,
    assignItem,
    handleAddCategory,
    handleRemoveCategory,
    handleEditDialogCategoryAdded,
    // Derived
    activeItems,
    completedItems,
    groupedItems,
    editDialogCategories,
  }
}
