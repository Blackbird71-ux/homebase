'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
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
import { toast } from 'sonner'
import { groupByCategory, groupByRecipe, DEFAULT_SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ListItemShape, ShoppingCategory } from '@/lib/list-helpers'
import { autoGuessCategory } from '@/lib/ingredient-helpers'
import { useOfflineQueue } from '@/hooks/lists/useOfflineQueue'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'

export function useShoppingList(
  listId: string,
  initialItems: ListItemShape[],
  initialCategoryOrder: string[] | null,
) {
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  const [viewMode, setViewMode] = useState<'aisle' | 'recipe'>('aisle')
  const [showRecipePills, setShowRecipePills] = useState(false)
  const [categories, setCategories] = useState<string[]>(DEFAULT_SHOPPING_CATEGORIES)
  const [categoryOrder, setCategoryOrder] = useState<string[]>(
    initialCategoryOrder ?? [...DEFAULT_SHOPPING_CATEGORIES]
  )
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<ShoppingCategory>('Other')
  const [categoryManuallySet, setCategoryManuallySet] = useState(false)
  const [, startTransition] = useTransition()
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [availableCategories, setAvailableCategories] = useState<Array<{ id: string; name: string; aisle?: string | null }>>([])
  const [aisleMap, setAisleMap] = useState<Record<string, string | null>>({})
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editItemContent, setEditItemContent] = useState('')
  const [editItemCategory, setEditItemCategory] = useState<string | null>(null)
  const [addingCategoryInline, setAddingCategoryInline] = useState(false)
  const [inlineCatName, setInlineCatName] = useState('')
  const [isSavingCat, setIsSavingCat] = useState(false)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // ── Offline sync ────────────────────────────────────────────────────────────

  const { registerBackgroundSync, broadcastQueueCount, enqueueMutation } =
    useOfflineQueue(listId, setItems)

  // ── Debounced saves ─────────────────────────────────────────────────────────

  const debouncedSaveCategoryOrder = useDebouncedCallback(
    useCallback((order: string[]) => {
      fetch(`/api/lists/${listId}/category-order`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryOrder: order }),
      }).catch(() => toast.error('Failed to save category order.'))
    }, [listId]),
    500,
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

  // ── Category auto-detect ────────────────────────────────────────────────────

  useEffect(() => {
    if (!categoryManuallySet && newContent.trim()) {
      const detected = autoGuessCategory(newContent.trim())
      if (detected && detected !== newCategory) setNewCategory(detected)
    }
  }, [newContent, categoryManuallySet]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch dynamic categories on mount ───────────────────────────────────────

  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch('/api/ingredient-categories')
        if (response.ok) {
          const data = await response.json()
          const rawNames = (data as Array<{ category: string }>).map(c => c.category)
          const categoryNames = [...new Set(rawNames)]
          if (!categoryNames.includes('Other')) categoryNames.push('Other')
          setCategories(categoryNames)
          setAvailableCategories(data)

          const aisleMapping: Record<string, string | null> = {}
          for (const cat of data) {
            if (cat.aisle) aisleMapping[cat.category] = cat.aisle
          }
          setAisleMap(aisleMapping)

          setCategoryOrder(current => {
            if (initialCategoryOrder === null) {
              // No saved per-list order — use the global sort order from the API
              return categoryNames
            }
            // Per-list order exists — append any newly added global categories
            const newCats = categoryNames.filter((c: string) => !current.includes(c))
            return newCats.length > 0 ? [...current, ...newCats] : current
          })
        }
      } catch {
        // Offline or network error — default categories already in state
      } finally {
        setLoadingCategories(false)
      }
    }
    fetchCategories()
  }, [])

  // ── Drag and drop ───────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
      const catItems = items.filter(i => !i.isCompleted && i.category === activeCategory)
      const oldIndex = catItems.findIndex(i => i.id === active.id)
      const newIndex = catItems.findIndex(i => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(catItems, oldIndex, newIndex)
      const updates = reordered.map((item, idx) => ({ id: item.id, sortOrder: idx }))
      setItems(prev => prev.map(i => {
        const u = updates.find(x => x.id === i.id)
        return u ? { ...i, sortOrder: u.sortOrder } : i
      }))
      debouncedSaveItemOrder(updates)
    }
  }

  // ── Item actions ────────────────────────────────────────────────────────────

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newContent.trim()) return

    const body = { content: newContent.trim(), category: newCategory }

    if (!navigator.onLine) {
      const tempId = `tmp_${crypto.randomUUID()}`
      const optimisticItem: ListItemShape = {
        id: tempId,
        content: body.content,
        category: body.category,
        isCompleted: false,
        isLocked: false,
        sortOrder: 0,
        dueDate: null,
        recipeId: null,
        recipeName: null,
        createdBy: '',
        listId,
        createdAt: new Date(),
        unitPrice: null,
        quantity: null,
        assignedToUserId: null,
      }
      setItems(prev => [...prev, optimisticItem])
      setNewContent('')
      setNewCategory('Other')
      setCategoryManuallySet(false)
      await enqueueMutation({ id: crypto.randomUUID(), endpoint: `/api/lists/${listId}/items`, method: 'POST', body, tempId, listId, queuedAt: Date.now() })
      await registerBackgroundSync()
      await broadcastQueueCount()
      return
    }

    const res = await fetch(`/api/lists/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const item = await res.json()
      setItems(prev => [...prev, {
        ...item,
        dueDate:    item.dueDate    ? new Date(item.dueDate)    : null,
        createdAt:  new Date(item.createdAt),
        recipeId:   item.recipeId   ?? null,
        recipeName: item.recipeName ?? null,
      }])
      setNewContent('')
      setNewCategory('Other')
      setCategoryManuallySet(false)
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  async function toggleItem(id: string, isCompleted: boolean) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, isCompleted } : i))

    if (!navigator.onLine || id.startsWith('tmp_')) {
      if (!id.startsWith('tmp_')) {
        await enqueueMutation({ id: crypto.randomUUID(), endpoint: `/api/lists/${listId}/items/${id}`, method: 'PATCH', body: { isCompleted }, listId, queuedAt: Date.now() })
        await registerBackgroundSync()
        await broadcastQueueCount()
      }
      return
    }

    startTransition(async () => {
      const res = await fetch(`/api/lists/${listId}/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted }),
      })
      if (!res.ok) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, isCompleted: !isCompleted } : i))
        toast.error('Failed to save. Please try again.')
      }
    })
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== id))
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
      setItems(prev => prev.map(i => i.id === id ? { ...i, isLocked } : i))
    } else {
      toast.error('Failed to update item.')
    }
  }

  async function changeItemCategory(id: string, newCat: string) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCat }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, category: newCat } : i))
      toast.success('Category updated')
    } else {
      toast.error('Failed to update category')
      throw new Error('Failed to update category')
    }
  }

  function handleEditItem(id: string) {
    const item = items.find(i => i.id === id)
    if (item) { setEditItemId(id); setEditItemContent(item.content); setEditItemCategory(item.category || null) }
  }

  function handleItemSaved(id: string, content: string, category: string | null) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, content, category } : i))
  }

  async function handleAddShoppingCategory(name: string) {
    const key = `custom_${name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}_${Date.now()}`
    const res = await fetch('/api/ingredient-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, category: name }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to create category')
    }
    const newCat = await res.json()
    setCategories(prev => [...prev, name])
    setAvailableCategories(prev => [...prev, { id: newCat.id, name }])
    setCategoryOrder(prev => [...prev, name])
  }

  async function handleCreateInlineCategory() {
    const trimmed = inlineCatName.trim()
    if (!trimmed || categories.includes(trimmed)) return
    setIsSavingCat(true)
    try {
      await handleAddShoppingCategory(trimmed)
      setNewCategory(trimmed as ShoppingCategory)
      setCategoryManuallySet(true)
      setInlineCatName('')
      setAddingCategoryInline(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create category')
    } finally {
      setIsSavingCat(false)
    }
  }

  async function clearCompleted() {
    const res = await fetch(`/api/lists/${listId}/clear-completed`, { method: 'POST' })
    if (res.ok) {
      setItems(prev => prev.filter(i => !(i.isCompleted && !i.isLocked)))
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const completedItems = items.filter(i => i.isCompleted)
  const grouped = groupByCategory(items, categoryOrder)
  const recipeGroups = groupByRecipe(items.filter(i => !i.isCompleted))
  const activeCategoryOrder = categoryOrder.filter(c => categories.includes(c))

  return {
    // State
    items,
    viewMode, setViewMode,
    showRecipePills, setShowRecipePills,
    categories,
    newContent, setNewContent,
    newCategory, setNewCategory,
    setCategoryManuallySet,
    loadingCategories,
    availableCategories,
    aisleMap,
    editItemId, setEditItemId,
    editItemContent,
    editItemCategory,
    addingCategoryInline, setAddingCategoryInline,
    inlineCatName, setInlineCatName,
    isSavingCat,
    showBarcodeScanner, setShowBarcodeScanner,
    showClearConfirm, setShowClearConfirm,
    // DnD
    sensors,
    handleDragEnd,
    // Actions
    addItem,
    toggleItem,
    deleteItem,
    toggleLock,
    changeItemCategory,
    handleEditItem,
    handleItemSaved,
    handleAddShoppingCategory,
    handleCreateInlineCategory,
    clearCompleted,
    // Derived
    completedItems,
    grouped,
    recipeGroups,
    activeCategoryOrder,
  }
}
