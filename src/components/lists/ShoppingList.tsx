'use client'

import { useState, useTransition, useRef, useCallback, useEffect } from 'react'
import { enqueueMutation, getAllMutations, removeMutation } from '@/lib/offline-queue'
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
import { groupByCategory, groupByRecipe, DEFAULT_SHOPPING_CATEGORIES } from '@/lib/list-helpers'
import type { ListItemShape, ShoppingCategory } from '@/lib/list-helpers'
import { autoGuessCategory } from '@/lib/ingredient-helpers'
import { CategoryGroup } from './CategoryGroup'
import { DoneSection } from './DoneSection'
import { ListItemRow } from './ListItemRow'
import { EditItemDialog } from './EditItemDialog'

interface ShoppingListProps {
  listId: string
  initialItems: ListItemShape[]
  initialCategoryOrder: string[] | null
}

type ViewMode = 'aisle' | 'recipe'

export function ShoppingList({ listId, initialItems, initialCategoryOrder }: ShoppingListProps) {
  const [items, setItems] = useState<ListItemShape[]>(initialItems)
  const [viewMode, setViewMode] = useState<ViewMode>('aisle')
  const [categories, setCategories] = useState<string[]>(DEFAULT_SHOPPING_CATEGORIES)
  const [categoryOrder, setCategoryOrder] = useState<string[]>(
    initialCategoryOrder ?? [...DEFAULT_SHOPPING_CATEGORIES]
  )
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<ShoppingCategory>('Other')
  const [categoryManuallySet, setCategoryManuallySet] = useState(false)
  const [newUnitPrice, setNewUnitPrice] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [, startTransition] = useTransition()
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [availableCategories, setAvailableCategories] = useState<Array<{id: string, name: string}>>([])
  const [editItemId, setEditItemId] = useState<string | null>(null)
  const [editItemContent, setEditItemContent] = useState('')
  const [editItemCategory, setEditItemCategory] = useState<string | null>(null)
  const [addingCategoryInline, setAddingCategoryInline] = useState(false)
  const [inlineCatName, setInlineCatName] = useState('')
  const [isSavingCat, setIsSavingCat] = useState(false)

  const catSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const itemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Offline sync ────────────────────────────────────────────────────────────

  /** Register a Background Sync tag so the SW can replay the queue when connectivity returns. */
  async function registerBackgroundSync() {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return
    try {
      const reg = await navigator.serviceWorker.ready
      await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register('homebase-list-sync')
    } catch {
      // Not supported or permission denied — the online/visibilitychange fallback covers this
    }
  }

  /** Broadcast current queue length so OfflineBanner can show the pending count. */
  const broadcastQueueCount = useCallback(async () => {
    try {
      const all = await getAllMutations()
      const count = all.filter((m) => m.listId === listId).length
      window.dispatchEvent(
        new CustomEvent('offline-queue-update', { detail: { count } })
      )
    } catch {
      // IndexedDB unavailable — ignore
    }
  }, [listId])

  /**
   * Replay any queued mutations for this list then refetch items from the
   * server. Called both from the `online` window event (iOS/Safari) and from
   * SW postMessages (Chrome/Android Background Sync).
   */
  const flushQueueAndRefetch = useCallback(async () => {
    let mutations: Awaited<ReturnType<typeof getAllMutations>>
    try {
      mutations = await getAllMutations()
    } catch {
      return
    }

    const mine = mutations
      .filter((m) => m.listId === listId)
      .sort((a, b) => a.queuedAt - b.queuedAt)

    if (mine.length === 0) return

    for (const mutation of mine) {
      try {
        const res = await fetch(mutation.endpoint, {
          method: mutation.method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mutation.body),
        })
        if (res.ok || res.status === 404) {
          await removeMutation(mutation.id)
        }
      } catch {
        // Still offline — stop and try again next time
        break
      }
    }

    // Refetch the authoritative list from the server to replace temp IDs
    try {
      const res = await fetch(`/api/lists/${listId}/items`)
      if (res.ok) {
        const serverItems = await res.json()
        setItems(
          serverItems.map((i: Record<string, unknown>) => ({
            ...i,
            dueDate: i.dueDate ? new Date(i.dueDate as string) : null,
            createdAt: new Date(i.createdAt as string),
            recipeId: (i.recipeId as string | null) ?? null,
            recipeName: (i.recipeName as string | null) ?? null,
          }))
        )
      }
    } catch {
      // Network gone again — leave optimistic state as-is
    }

    await broadcastQueueCount()
  }, [listId, broadcastQueueCount])

  // Flush on coming back online (iOS / Safari fallback path)
  useEffect(() => {
    window.addEventListener('online', flushQueueAndRefetch)
    return () => window.removeEventListener('online', flushQueueAndRefetch)
  }, [flushQueueAndRefetch])

  // Listen for SYNC_REQUESTED from the service worker Background Sync (Chrome/Android).
  // The SW fires this after a sync event — we then do the actual replay and refetch.
  // Also catches the case where the SW synced while the tab was backgrounded:
  // visibilitychange fires when the user returns to the tab.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    function handleSWMessage(event: MessageEvent) {
      if (event.data?.type === 'SYNC_REQUESTED') {
        flushQueueAndRefetch()
      }
    }
    navigator.serviceWorker.addEventListener('message', handleSWMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage)
  }, [flushQueueAndRefetch])

  // When the user returns to the tab (from background or another app), flush any
  // mutations that may have been queued while offline. Handles the gap between the
  // SW Background Sync firing with no open clients and the user re-opening the tab.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        flushQueueAndRefetch()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [flushQueueAndRefetch])

  // Broadcast initial queue count on mount
  useEffect(() => {
    broadcastQueueCount()
  }, [broadcastQueueCount])

  // ────────────────────────────────────────────────────────────────────────────

  // Auto-detect category when newContent changes, but not if user manually picked one
  useEffect(() => {
    if (!categoryManuallySet && newContent.trim()) {
      const detected = autoGuessCategory(newContent.trim())
      if (detected && detected !== newCategory) {
        setNewCategory(detected)
      }
    }
  }, [newContent, categoryManuallySet])

  // Fetch dynamic categories on mount
  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetch('/api/ingredient-categories')
        if (response.ok) {
          const data = await response.json()
          const categoryNames = (data as Array<{ category: string }>).map((cat) => cat.category)
          // Always include 'Other' category if not present
          if (!categoryNames.includes('Other')) {
            categoryNames.push('Other')
          }
          setCategories(categoryNames)
          setAvailableCategories(data)

          // Update category order to include new categories
          setCategoryOrder((currentOrder) => {
            const newCategories = categoryNames.filter((cat: string) => !currentOrder.includes(cat))
            return newCategories.length > 0 ? [...currentOrder, ...newCategories] : currentOrder
          })
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error)
        toast.error('Failed to load categories')
      } finally {
        setLoadingCategories(false)
      }
    }

    fetchCategories()
  }, [])

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

    const body = { content: newContent.trim(), category: newCategory }

    if (!navigator.onLine) {
      // Offline path — optimistic add with a temporary ID
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
      }
      setItems((prev) => [...prev, optimisticItem])
      setNewContent('')
      setNewCategory('Other')
      setCategoryManuallySet(false)

      await enqueueMutation({
        id: crypto.randomUUID(),
        endpoint: `/api/lists/${listId}/items`,
        method: 'POST',
        body,
        tempId,
        listId,
        queuedAt: Date.now(),
      })

      await registerBackgroundSync()
      await broadcastQueueCount()
      return
    }

    // Online path — existing behaviour unchanged
    const res = await fetch(`/api/lists/${listId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
      setNewCategory('Other')
      setCategoryManuallySet(false)
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  async function toggleItem(id: string, isCompleted: boolean) {
    // Optimistic update regardless of connectivity
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isCompleted } : i)))

    if (!navigator.onLine || id.startsWith('tmp_')) {
      // Offline, or item was added offline and hasn't been synced yet —
      // queue the toggle (for tmp_ items the sync will apply completion
      // to the real item after the POST is replayed first)
      if (!id.startsWith('tmp_')) {
        await enqueueMutation({
          id: crypto.randomUUID(),
          endpoint: `/api/lists/${listId}/items/${id}`,
          method: 'PATCH',
          body: { isCompleted },
          listId,
          queuedAt: Date.now(),
        })

        await registerBackgroundSync()
        await broadcastQueueCount()
      }
      return
    }

    // Online path — send to server
    startTransition(async () => {
      const res = await fetch(`/api/lists/${listId}/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted }),
      })
      if (!res.ok) {
        // Revert optimistic update
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isCompleted: !isCompleted } : i)))
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

  async function changeItemCategory(id: string, newCategory: string) {
    const res = await fetch(`/api/lists/${listId}/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCategory }),
    })
    if (res.ok) {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, category: newCategory } : i))
      )
      toast.success('Category updated')
    } else {
      toast.error('Failed to update category')
      throw new Error('Failed to update category')
    }
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
    setCategories((prev) => [...prev, name])
    setAvailableCategories((prev) => [...prev, { id: newCat.id, name }])
    setCategoryOrder((prev) => [...prev, name])
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
      // Keep locked completed items; the server only deletes unlocked ones
      setItems((prev) => prev.filter((i) => !(i.isCompleted && !i.isLocked)))
    } else {
      toast.error('Failed to save. Please try again.')
    }
  }

  const completedItems = items.filter((i) => i.isCompleted)
  const grouped = groupByCategory(items, categoryOrder)
  const recipeGroups = groupByRecipe(items.filter((i) => !i.isCompleted))

  const activeCategoryOrder = categoryOrder.filter(
    (c) => categories.includes(c)
  )

  return (
    <div className="flex flex-col gap-2 sm:gap-4">
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
      <div className="flex flex-col gap-2">
        <form onSubmit={addItem} className="flex gap-2 items-center">
          <Input
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Add item..."
            className="flex-1 min-w-0"
          />
          <select
            value={addingCategoryInline ? '__adding__' : newCategory}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                setAddingCategoryInline(true)
                setInlineCatName('')
              } else {
                setNewCategory(e.target.value as ShoppingCategory)
                setCategoryManuallySet(true)
              }
            }}
            className="w-24 sm:w-auto shrink-0 h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
            disabled={loadingCategories || addingCategoryInline}
          >
            {loadingCategories ? (
              <option value="Other">Loading...</option>
            ) : addingCategoryInline ? (
              <option value="__adding__">New cat...</option>
            ) : (
              <>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="__new__">+ New...</option>
              </>
            )}
          </select>
          <Button type="submit" size="sm" className="shrink-0">
            <PlusIcon className="h-4 w-4" />
          </Button>
        </form>
        {addingCategoryInline && (
          <div className="flex gap-2">
            <Input
              value={inlineCatName}
              onChange={(e) => setInlineCatName(e.target.value)}
              placeholder="Category name"
              className="flex-1 h-8 text-sm"
              autoFocus
              disabled={isSavingCat}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleCreateInlineCategory() }
                if (e.key === 'Escape') { setAddingCategoryInline(false); setInlineCatName('') }
              }}
            />
            <Button type="button" size="sm" onClick={handleCreateInlineCategory} disabled={isSavingCat || !inlineCatName.trim()}>
              {isSavingCat ? 'Adding...' : 'Add'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingCategoryInline(false); setInlineCatName('') }} disabled={isSavingCat}>
              Cancel
            </Button>
          </div>
        )}
      </div>

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
            <div className="flex flex-col gap-2 sm:gap-4">
              {activeCategoryOrder.map((cat) => {
                const catItems = grouped[cat] ?? []
                if (catItems.length === 0) return null
                return (
                  <CategoryGroup
                    key={cat}
                    category={cat}
                    items={catItems}
                    showDragHandle={true}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                    onToggleLock={toggleLock}
                    availableCategories={categories}
                    onCategoryChange={changeItemCategory}
                    onEdit={handleEditItem}
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
            onToggleLock={toggleLock}
            availableCategories={categories}
            onCategoryChange={changeItemCategory}
            onEdit={handleEditItem}
          />
        </DndContext>
      ) : (
        <div className="flex flex-col gap-2 sm:gap-4">
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
                    isLocked={item.isLocked}
                    recipeName={item.recipeName}
                    category={item.category || undefined}
                    availableCategories={categories}
                    onToggle={toggleItem}
                    onDelete={deleteItem}
                    onToggleLock={toggleLock}
                    onCategoryChange={changeItemCategory}
                    onEdit={handleEditItem}
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
            onToggleLock={toggleLock}
            availableCategories={categories}
            onCategoryChange={changeItemCategory}
            onEdit={handleEditItem}
          />
        </div>
      )}

      <EditItemDialog
        open={editItemId !== null}
        onOpenChange={(open) => {
          if (!open) setEditItemId(null)
        }}
        itemId={editItemId ?? ''}
        initialContent={editItemContent}
        initialCategory={editItemCategory}
        availableCategories={categories}
        listId={listId}
        onSaved={handleItemSaved}
        onCategoryAdded={handleAddShoppingCategory}
        initialUnitPrice={(() => {
          const item = items.find((i) => i.id === editItemId)
          return item?.unitPrice ?? null
        })()}
        initialQuantity={(() => {
          const item = items.find((i) => i.id === editItemId)
          return item?.quantity ?? null
        })()}
      />
    </div>
  )
}
