'use client'

import { useState, useTransition, useCallback } from 'react'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { useMutationGuard } from '@/hooks/useMutationGuard'
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
import { AppEvents } from '@/lib/app-events'
import { useOfflineQueue } from '@/hooks/lists/useOfflineQueue'
import { toast } from 'sonner'

export function useTodoList(
  listId: string,
  initialItems: ListItemShape[],
  initialCategoryOrder: string[] | null,
  currentUserId: string,
  timezone: string,
) {
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  // Guards optimistic local state against stale background reads (poll / app-event).
  // Supersedes the old lastMutAt time-window ref. See QA.md §12.27.
  const guard = useMutationGuard()
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

  // ── Offline sync ────────────────────────────────────────────────────────────
  // Also covers the TODO_LIST_UPDATED refetch, the 30s poll, and the
  // refetch-after-flush — all previously inlined here.

  const { queueMutation, cancelTempItem } = useOfflineQueue(listId, setItems, guard, AppEvents.TODO_LIST_UPDATED)

  const debouncedSaveItemOrder = useDebouncedCallback(
    useCallback((updates: { id: string; sortOrder: number }[]) => {
      if (!navigator.onLine) {
        // No fixed id: each reorder covers only one category's items, so
        // collapsing would drop an earlier reorder of a different category.
        queueMutation({ endpoint: `/api/lists/${listId}/items/reorder`, method: 'PATCH', body: { items: updates } })
        return
      }
      fetch(`/api/lists/${listId}/items/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updates }),
      }).catch(() => toast.error('Failed to save item order.'))
    }, [listId, queueMutation]),
    500,
  )

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filtered = filterTodoItems(items, filter, undefined, currentUserId, timezone)
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
    guard.bump()

    const body = {
      content: newContent.trim(),
      dueDate: newDueDate || null,
      category: newItemCategory || null,
    }

    if (!navigator.onLine) {
      const tempId = `tmp_${crypto.randomUUID()}`
      const optimisticItem: ListItemShape = {
        id: tempId,
        content: body.content,
        category: body.category,
        isCompleted: false,
        isLocked: false,
        sortOrder: 0,
        dueDate: newDueDate ? new Date(newDueDate) : null,
        recipeId: null,
        recipeName: null,
        createdBy: '',
        listId,
        createdAt: new Date(),
        unitPrice: null,
        quantity: null,
        assignedToUserId: null,
      }
      setItems((prev) => [...prev, optimisticItem])
      setNewContent('')
      setNewDueDate('')
      // Carry the tempId as clientMutationId so a replayed POST (committed-but-lost
      // response on a flaky reconnect) is de-duped server-side instead of re-created.
      await queueMutation({ endpoint: `/api/lists/${listId}/items`, method: 'POST', body: { ...body, clientMutationId: tempId }, tempId })
      return
    }

    const res = await fetch(`/api/lists/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
    guard.bump()

    if (!navigator.onLine || id.startsWith('tmp_')) {
      // tmp_ endpoints are rewritten to the real id during flush, after the
      // item's queued POST replays — so toggles on offline-created items sync too.
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isCompleted } : i)))
      await queueMutation({ endpoint: `/api/lists/${listId}/items/${id}`, method: 'PATCH', body: { isCompleted } })
      return
    }

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
    guard.bump()
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

  // Backs EditItemDialog saves made offline (or on a not-yet-synced tmp_ item).
  async function queueItemEdit(id: string, body: Record<string, unknown>) {
    guard.bump()
    await queueMutation({ endpoint: `/api/lists/${listId}/items/${id}`, method: 'PATCH', body })
  }

  async function deleteItem(id: string) {
    guard.bump()
    if (!navigator.onLine || id.startsWith('tmp_')) {
      setItems((prev) => prev.filter((i) => i.id !== id))
      if (id.startsWith('tmp_')) {
        // Item never reached the server — cancel its queued POST (and any
        // follow-up mutations) instead of queueing a DELETE.
        await cancelTempItem(id)
      } else {
        await queueMutation({ endpoint: `/api/lists/${listId}/items/${id}`, method: 'DELETE' })
      }
      return
    }
    const res = await fetch(`/api/lists/${listId}/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  async function toggleLock(id: string, isLocked: boolean) {
    guard.bump()
    if (!navigator.onLine || id.startsWith('tmp_')) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isLocked } : i)))
      await queueMutation({ endpoint: `/api/lists/${listId}/items/${id}`, method: 'PATCH', body: { isLocked } })
      return
    }
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
    guard.bump()
    if (!navigator.onLine || id.startsWith('tmp_')) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, assignedToUserId } : i)))
      await queueMutation({ endpoint: `/api/lists/${listId}/items/${id}`, method: 'PATCH', body: { assignedToUserId } })
      return
    }
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
    guard.bump()

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
    if (!navigator.onLine) {
      // Fixed queue id — each save carries the whole order, so successive
      // offline edits collapse to the latest one.
      await queueMutation({ id: `catorder_${listId}`, endpoint: `/api/lists/${listId}/category-order`, method: 'PATCH', body: { categoryOrder: cats } })
      return
    }
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
    queueItemEdit,
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
