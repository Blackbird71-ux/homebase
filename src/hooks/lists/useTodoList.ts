'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { useMutationGuard } from '@/hooks/useMutationGuard'
import { nextCategoryColor } from '@/lib/category-colors'
import { applyBulkChange, type BulkChange, parsePastedItems } from '@/lib/list-bulk-helpers'
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
  const [filter, setFilter] = useState<TodoFilter>('all')
  const [categories, setCategories] = useState<string[]>(initialCategoryOrder ?? [])
  // Family-wide list-category catalogue (Settings → List Categories); offered as one-tap suggestions
  const [catalogue, setCatalogue] = useState<{ name: string; color: string | null }[]>([])
  // Bulk-edit mode: tick several items, then move / lock / unlock / delete them together
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [catalogueLoaded, setCatalogueLoaded] = useState(false)
  const [pickedCategoryColor, setPickedCategoryColor] = useState<string | null>(null)
  const [newContent, setNewContent] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newItemCategory, setNewItemCategory] = useState<string>('')
  // Once the user picks a category by hand, stop auto-suggesting for this item
  const [categoryManuallySet, setCategoryManuallySet] = useState(false)
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

  useEffect(() => {
    if (!navigator.onLine) return
    fetch('/api/list-categories')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { name: string; color: string | null }[]) => {
        setCatalogue(rows.map((r) => ({ name: r.name, color: r.color })))
        setCatalogueLoaded(true)
      })
      .catch(() => {})
  }, [])

  // Categories that predate the catalogue (created on this list before it existed) join it,
  // so they get a colour and show up in Settings → Categories → Lists.
  useEffect(() => {
    if (!catalogueLoaded || !navigator.onLine) return
    const missing = categories.filter((n) => !catalogue.some((c) => c.name === n))
    if (missing.length === 0) return
    const used = catalogue.map((c) => c.color)
    const added = missing.map((name) => {
      const color = nextCategoryColor(used)
      used.push(color)
      return { name, color }
    })
    setCatalogue((prev) => [...prev, ...added])
    added.forEach((c) =>
      fetch('/api/list-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      }).catch(() => {}),
    )
  }, [catalogueLoaded, categories, catalogue])

  // Auto-suggest a category as the item is typed (online only), unless chosen by hand
  useEffect(() => {
    const q = newContent.trim()
    if (categoryManuallySet || !q || !navigator.onLine) return
    const t = setTimeout(() => {
      fetch(`/api/lists/${listId}/category-hint?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { category: string | null } | null) => {
          if (d?.category) setNewItemCategory(d.category)
        })
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [newContent, categoryManuallySet, listId])

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
    groups['Other'] = uncategorized
    return groups
  })()

  const suggestedCategories = catalogue.map((c) => c.name).filter((n) => !categories.includes(n))
  const categoryColors: Record<string, string> = Object.fromEntries(
    catalogue.filter((c) => c.color).map((c) => [c.name, c.color as string]),
  )

  // Catalogue categories are offered in the edit dialog too; choosing one adds it to this list on save
  const editDialogCategories = [...categories, ...suggestedCategories, 'Other']

  // ── Actions ─────────────────────────────────────────────────────────────────

  /** Creates one item (online POST, or optimistic + queued when offline). Returns false if the save failed. */
  async function createItem(body: { content: string; dueDate: string | null; category: string | null }): Promise<boolean> {
    const newDueDate = body.dueDate ?? ''
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
      // Carry the tempId as clientMutationId so a replayed POST (committed-but-lost
      // response on a flaky reconnect) is de-duped server-side instead of re-created.
      await queueMutation({ endpoint: `/api/lists/${listId}/items`, method: 'POST', body: { ...body, clientMutationId: tempId }, tempId })
      return true
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
      return true
    }
    return false
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newContent.trim()) return
    guard.bump()

    const body = {
      content: newContent.trim(),
      dueDate: newDueDate || null,
      category: newItemCategory || null,
    }
    if (body.category && !categories.includes(body.category)) void handleEditDialogCategoryAdded(body.category)

    if (await createItem(body)) {
      setNewContent('')
      setNewDueDate('')
      setNewItemCategory('')
      setCategoryManuallySet(false)
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  /** Maps a pasted heading to an existing list/catalogue category (case-insensitive); unknown headings become new categories. */
  function resolveHeading(heading: string | null): string | null {
    if (heading === null) return null
    const key = heading.toLowerCase()
    return [...categories, ...suggestedCategories].find((c) => c.toLowerCase() === key) ?? heading
  }

  /** Per-line categories for the paste dialog: how many items, and which categories they land in. */
  function previewPaste(text: string, defaultCategory: string | null) {
    const lines = parsePastedItems(text)
    const cats = new Set(lines.map((l) => (l.heading === undefined ? defaultCategory : resolveHeading(l.heading))))
    return { count: lines.length, categoryCount: [...cats].filter((c) => c).length }
  }

  /** Adds one item per pasted line. A "Heading:" line files the lines under it into that category; others use defaultCategory. Returns true when every line saved. */
  async function addMany(text: string, defaultCategory: string | null): Promise<boolean> {
    const lines = parsePastedItems(text).map((l) => ({
      content: l.content,
      category: l.heading === undefined ? defaultCategory : resolveHeading(l.heading),
    }))
    if (lines.length === 0) return false
    guard.bump()
    for (const cat of new Set(lines.map((l) => l.category))) {
      if (cat && !categories.includes(cat)) await handleEditDialogCategoryAdded(cat)
    }
    let failed = 0
    for (const { content, category } of lines) {
      if (!(await createItem({ content, dueDate: null, category }))) failed++
    }
    if (failed > 0) toast.error(`${failed} of ${lines.length} items failed to save.`)
    else toast.success(`Added ${lines.length} item${lines.length === 1 ? '' : 's'}.`)
    return failed === 0
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
    if (category && !categories.includes(category)) void handleEditDialogCategoryAdded(category)
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

  function toggleSelectMode() {
    setSelectMode((on) => !on)
    setSelectedIds(new Set())
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Select every id given, or clear them all if they are already all selected. */
  function toggleSelectMany(ids: string[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allIn = ids.length > 0 && ids.every((id) => next.has(id))
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)))
      return next
    })
  }

  /** Applies one change to the given items (tmp_ ids skipped — not on the server yet). Returns true if applied or queued. */
  async function applyBulk(allIds: string[], change: BulkChange, newColor?: string): Promise<boolean> {
    const ids = allIds.filter((id) => !id.startsWith('tmp_'))
    if (ids.length === 0) return false
    guard.bump()
    if (change.type === 'category' && change.category && !categories.includes(change.category)) {
      await handleEditDialogCategoryAdded(change.category, newColor)
    }
    const endpoint = `/api/lists/${listId}/items/bulk`
    if (!navigator.onLine) {
      setItems((prev) => applyBulkChange(prev, ids, change))
      await queueMutation({ endpoint, method: 'POST', body: { ids, change } })
      return true
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, change }),
    })
    if (!res.ok) {
      toast.error('Failed to update items.')
      return false
    }
    const { skipped } = (await res.json()) as { skipped: number }
    setItems((prev) => applyBulkChange(prev, ids, change))
    if (skipped > 0) toast.info(`${skipped} locked item${skipped === 1 ? ' was' : 's were'} kept.`)
    return true
  }

  async function bulkApply(change: BulkChange, newColor?: string) {
    if (await applyBulk([...selectedIds], change, newColor)) setSelectedIds(new Set())
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

  /** Group an item is shown in: its category if this list uses it, else "Other". */
  function groupOf(item: ListItemShape): string {
    return item.category && categories.includes(item.category) ? item.category : 'Other'
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    guard.bump()

    if (categories.length > 0) {
      const dragged = items.find((i) => i.id === active.id)
      if (!dragged) return
      const fromGroup = groupOf(dragged)
      // Dropped on a group (header / empty placeholder) or on an item inside one
      const overGroup =
        (over.data.current?.group as string | undefined) ??
        (() => {
          const overItem = items.find((i) => i.id === over.id)
          return overItem ? groupOf(overItem) : undefined
        })()
      if (!overGroup) return
      if (overGroup !== fromGroup) {
        void applyBulk([dragged.id], { type: 'category', category: overGroup === 'Other' ? null : overGroup })
        return
      }
      const catItems = activeItems.filter((i) => groupOf(i) === fromGroup)
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

  // A category created on a list joins the family catalogue so other lists can reuse it.
  function registerInCatalogue(name: string, color?: string) {
    if (!navigator.onLine || catalogue.some((c) => c.name === name)) return
    const chosen = color ?? nextCategoryColor(catalogue.map((c) => c.color))
    setCatalogue((prev) => [...prev, { name, color: chosen }])
    fetch('/api/list-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: chosen }),
    }).catch(() => {})
  }

  // Colour shown in the add-category picker: the user's pick, else the next unused palette colour
  const newCategoryColor = pickedCategoryColor ?? nextCategoryColor(catalogue.map((c) => c.color))

  function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newCategoryInput.trim()
    if (!trimmed || categories.includes(trimmed)) return
    const updated = [...categories, trimmed]
    setCategories(updated)
    setNewCategoryInput('')
    setShowCategoryInput(false)
    saveCategoryOrder(updated)
    registerInCatalogue(trimmed, newCategoryColor)
    setPickedCategoryColor(null)
  }

  /** Removes a category from this list; its items (done ones too) move to Other. */
  async function handleRemoveCategory(name: string) {
    const ids = items.filter((i) => i.category === name).map((i) => i.id)
    if (ids.length > 0) await applyBulk(ids, { type: 'category', category: null })
    const updated = categories.filter((c) => c !== name)
    setCategories(updated)
    saveCategoryOrder(updated)
  }

  /** Renames a category on this list, moving its items; merges if the new name already exists. The old colour carries over. */
  async function handleRenameCategory(oldName: string, rawNew: string) {
    const newName = rawNew.trim()
    if (!newName || newName === oldName) return
    const clash = categories.find((c) => c !== oldName && c.toLowerCase() === newName.toLowerCase())
    const target = clash ?? newName
    const ids = items.filter((i) => i.category === oldName).map((i) => i.id)
    const oldColor = catalogue.find((c) => c.name === oldName)?.color ?? undefined
    if (ids.length > 0) await applyBulk(ids, { type: 'category', category: target })
    const updated = clash
      ? categories.filter((c) => c !== oldName)
      : categories.map((c) => (c === oldName ? target : c))
    setCategories(updated)
    saveCategoryOrder(updated)
    registerInCatalogue(target, oldColor)
  }

  /** Moves a category one place earlier (-1) or later (+1) in this list's order. */
  function handleMoveCategory(name: string, dir: -1 | 1) {
    const from = categories.indexOf(name)
    const to = from + dir
    if (from === -1 || to < 0 || to >= categories.length) return
    const updated = arrayMove(categories, from, to)
    setCategories(updated)
    saveCategoryOrder(updated)
  }

  async function handleEditDialogCategoryAdded(name: string, color?: string) {
    const trimmed = name.trim()
    if (!trimmed || categories.includes(trimmed)) return
    const updated = [...categories, trimmed]
    setCategories(updated)
    await saveCategoryOrder(updated)
    registerInCatalogue(trimmed, color)
  }

  // Reset for re-use: clears completion only — locked items and categories are kept.
  async function uncheckAll() {
    guard.bump()
    const endpoint = `/api/lists/${listId}/uncheck-all`
    if (!navigator.onLine) {
      setItems((prev) => prev.map((i) => ({ ...i, isCompleted: false })))
      await queueMutation({ id: `uncheckall_${listId}`, endpoint, method: 'POST', body: {} })
      return
    }
    const res = await fetch(endpoint, { method: 'POST' })
    if (res.ok) {
      setItems((prev) => prev.map((i) => ({ ...i, isCompleted: false })))
    } else {
      toast.error('Failed to uncheck items.')
    }
  }

  return {
    // State
    items,
    filter, setFilter,
    categories,
    newContent, setNewContent,
    newDueDate, setNewDueDate,
    newItemCategory,
    setNewItemCategory: (c: string) => { setNewItemCategory(c); setCategoryManuallySet(true) },
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
    handleRenameCategory,
    handleMoveCategory,
    previewPaste,
    handleEditDialogCategoryAdded,
    uncheckAll,
    // Derived
    activeItems,
    completedItems,
    groupedItems,
    editDialogCategories,
    suggestedCategories,
    addMany,
    selectMode,
    selectedIds,
    toggleSelectMode,
    toggleSelected,
    toggleSelectMany,
    bulkApply,
    categoryColors,
    newCategoryColor,
    setPickedCategoryColor,
    nextColor: () => nextCategoryColor(catalogue.map((c) => c.color)),
  }
}
